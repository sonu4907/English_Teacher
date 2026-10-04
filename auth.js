'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const argon2 = require('argon2');
const nodemailer = require('nodemailer');
const OTPAuth = require('otpauth');
const QRCode = require('qrcode');
const { Pool } = require('pg');

const SESSION_COOKIE = 'verba_session';
const CSRF_COOKIE = 'verba_csrf';
const SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'disable' ? false : undefined })
  : null;

let sessionSecret;
let encryptionKey;
let mailer;
let appBaseUrl;
let cleanupCounter = 0;

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function cookieValue(req, name) {
  const cookies = (req.headers.cookie || '').split(';');
  const item = cookies.find(cookie => cookie.trim().startsWith(`${name}=`));
  if (!item) return '';
  try {
    return decodeURIComponent(item.trim().slice(name.length + 1));
  } catch {
    return '';
  }
}

function setCookie(res, name, value, maxAge, httpOnly) {
  const flags = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAge / 1000))}`
  ];
  if (httpOnly) flags.push('HttpOnly');
  if (process.env.NODE_ENV === 'production' || appBaseUrl?.startsWith('https://')) flags.push('Secure');
  res.append('Set-Cookie', flags.join('; '));
}

function clearCookie(res, name, httpOnly) {
  setCookie(res, name, '', 0, httpOnly);
}

function csrfToken() {
  const nonce = crypto.randomBytes(24).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret).update(nonce).digest('base64url');
  return `${nonce}.${signature}`;
}

function csrfTokenIsValid(token) {
  if (!sessionSecret || typeof token !== 'string' || token.length > 100) return false;
  const [nonce, signature, extra] = token.split('.');
  if (!nonce || nonce.length > 40 || !signature || signature.length > 50 || extra !== undefined) return false;
  const expected = crypto.createHmac('sha256', sessionSecret).update(nonce).digest('base64url');
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function emailRateLimitIdentity(req) {
  const email = req.body?.email;
  return typeof email === 'string' ? email.slice(0, 254).trim().toLowerCase() : '';
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64')).join('.');
}

function decrypt(value) {
  const [iv, tag, encrypted] = value.split('.').map(part => Buffer.from(part, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function authError(res, status, message) {
  return res.status(status).json({ error: message });
}

async function rollback(client, label) {
  if (!client) return;
  try {
    await client.query('ROLLBACK');
  } catch (err) {
    console.error(`${label} rollback failed:`, err.message);
  }
}

function requireCsrf(req, res, next) {
  const cookie = cookieValue(req, CSRF_COOKIE);
  const header = req.get('x-csrf-token');
  const cookieBuffer = Buffer.from(cookie);
  const headerBuffer = Buffer.from(header || '');
  if (!cookie || !header || cookieBuffer.length !== headerBuffer.length ||
      !crypto.timingSafeEqual(cookieBuffer, headerBuffer) || !csrfTokenIsValid(cookie)) {
    return authError(res, 403, 'Security token expired. Refresh the page and try again.');
  }
  const origin = req.get('origin');
  if (origin && appBaseUrl && origin !== new URL(appBaseUrl).origin) {
    return authError(res, 403, 'Cross-origin request blocked.');
  }
  next();
}

async function consumeLimit(req, key, max, windowMs, identityForRequest) {
  const identity = crypto.createHmac('sha256', sessionSecret)
    .update(`${key}:${identityForRequest(req)}`)
    .digest('hex');
  const result = await pool.query(
    `INSERT INTO request_limits (bucket, count, resets_at)
     VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 millisecond'))
     ON CONFLICT (bucket) DO UPDATE SET
       count = CASE WHEN request_limits.resets_at <= NOW() THEN 1 ELSE request_limits.count + 1 END,
       resets_at = CASE WHEN request_limits.resets_at <= NOW()
         THEN NOW() + ($3 * INTERVAL '1 millisecond') ELSE request_limits.resets_at END
     RETURNING count, resets_at`,
    [identity, 1, windowMs]
  );
  const row = result.rows[0];
  cleanupCounter++;
  if (cleanupCounter % 500 === 0) {
    try {
      await Promise.all([
        pool.query('DELETE FROM auth_sessions WHERE expires_at <= NOW()'),
        pool.query('DELETE FROM auth_tokens WHERE expires_at <= NOW()'),
        pool.query('DELETE FROM mfa_challenges WHERE expires_at <= NOW()'),
        pool.query('DELETE FROM request_limits WHERE resets_at < NOW() - INTERVAL \'1 day\'')
      ]);
    } catch (err) {
      console.error('Expired authentication data cleanup failed:', err.message);
    }
  }
  return { allowed: row.count <= max, retryAfter: Math.max(1, Math.ceil((new Date(row.resets_at) - Date.now()) / 1000)) };
}

function rateLimit(key, max, windowMs, identityForRequest = req => req.user?.id || req.ip) {
  return async (req, res, next) => {
    if (!pool) return next();
    try {
      const limit = await consumeLimit(req, key, max, windowMs, identityForRequest);
      if (!limit.allowed) {
        res.set('Retry-After', String(limit.retryAfter));
        return authError(res, 429, 'Too many attempts. Wait a moment and try again.');
      }
      next();
    } catch (err) {
      console.error('Request rate limiter failed:', err.message);
      authError(res, 503, 'Security checks are temporarily unavailable.');
    }
  };
}

async function sendTokenEmail(user, kind, token) {
  const subject = kind === 'verify' ? 'Verify your VerbaAI account' : 'Reset your VerbaAI password';
  const action = kind === 'verify' ? 'verify your email address' : 'reset your password';
  const link = `${appBaseUrl}/#${kind === 'verify' ? 'verify' : 'reset'}=${encodeURIComponent(token)}`;
  await mailer.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: user.email,
    subject,
    text: `Use this link to ${action} (it expires in 30 minutes):\n\n${link}\n\nIf you did not request this, you can ignore this email.`
  });
}

async function issueToken(userId, email, kind) {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query('DELETE FROM auth_tokens WHERE user_id = $1 AND kind = $2', [userId, kind]);
  await pool.query(
    `INSERT INTO auth_tokens (token_hash, user_id, kind, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '30 minutes')
     ON CONFLICT (token_hash) DO NOTHING`,
    [hash(token), userId, kind]
  );
  await sendTokenEmail({ email }, kind, token);
}

async function startSession(userId, res) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_AGE_MS);
  await pool.query(
    'INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [hash(token), userId, expiresAt]
  );
  setCookie(res, SESSION_COOKIE, token, SESSION_AGE_MS, true);
}

async function verifyTotp(user, code, pending = false) {
  const encrypted = pending ? user.pending_totp_secret_encrypted : user.totp_secret_encrypted;
  if (!encrypted) return false;
  const secret = decrypt(encrypted);
  const totp = new OTPAuth.TOTP({
    issuer: 'VerbaAI',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret)
  });
  return totp.validate({ token: String(code || '').replace(/\s/g, ''), window: 1 }) !== null;
}

async function consumeRecoveryCode(client, user, code) {
  const provided = hash(String(code || '').trim().toUpperCase());
  const hashes = user.totp_recovery_hashes || [];
  const index = hashes.findIndex(saved => {
    const savedBuffer = Buffer.from(saved);
    const providedBuffer = Buffer.from(provided);
    return savedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(savedBuffer, providedBuffer);
  });
  if (index < 0) return false;
  const remaining = hashes.filter((_, hashIndex) => hashIndex !== index);
  await client.query('UPDATE users SET totp_recovery_hashes = $1 WHERE id = $2', [remaining, user.id]);
  user.totp_recovery_hashes = remaining;
  return true;
}

function createAuth(app) {
  const enabled = Boolean(pool);

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), geolocation=()'
    });
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    if (process.env.NODE_ENV === 'production' || appBaseUrl?.startsWith('https://')) {
      res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.get('/api/auth/status', rateLimit('auth-status', 120, 60 * 1000), async (req, res) => {
    let csrf = cookieValue(req, CSRF_COOKIE);
    if (!csrfTokenIsValid(csrf)) {
      csrf = enabled ? csrfToken() : crypto.randomBytes(24).toString('base64url');
      setCookie(res, CSRF_COOKIE, csrf, SESSION_AGE_MS, false);
    }
    if (!enabled) return res.json({ enabled: false, authenticated: true, csrfToken: csrf });
    try {
      const token = cookieValue(req, SESSION_COOKIE);
      const result = token
        ? await pool.query(
          `SELECT u.id, u.email, u.totp_secret_encrypted IS NOT NULL AS mfa_enabled
           FROM auth_sessions s JOIN users u ON u.id = s.user_id
           WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.email_verified_at IS NOT NULL`,
          [hash(token)]
        )
        : { rows: [] };
      const user = result.rows[0] || null;
      res.json({ enabled: true, authenticated: Boolean(user), user: user && { email: user.email, mfaEnabled: user.mfa_enabled }, csrfToken: csrf });
    } catch (err) {
      console.error('Auth status lookup failed:', err.message);
      authError(res, 503, 'Account service is temporarily unavailable.');
    }
  });

  app.post('/api/auth/register',
    requireCsrf,
    rateLimit('register', 5, 60 * 60 * 1000, req => req.ip),
    rateLimit('register-email', 5, 60 * 60 * 1000, emailRateLimitIdentity),
    async (req, res) => {
    const body = req.body || {};
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = body.password;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return authError(res, 400, 'Enter a valid email address.');
    if (typeof password !== 'string' || password.length < 7 || password.length > 128) {
      return authError(res, 400, 'Use a password between 7 and 128 characters.');
    }
    try {
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
      const result = await pool.query(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id',
        [email, passwordHash]
      );
      if (result.rows[0]) await issueToken(result.rows[0].id, email, 'verify');
      return res.status(202).json({ status: 'accepted', message: 'If this address can be registered, a verification link has been sent.' });
    } catch (err) {
      console.error('Account registration failed:', err.message);
      authError(res, 503, 'Could not send the verification email. Check mail settings or try again later.');
    }
    });

  app.post('/api/auth/verify-email', requireCsrf, rateLimit('verify', 10, 15 * 60 * 1000), async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    if (!token || token.length > 100) return authError(res, 400, 'Verification link is invalid or expired.');
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT user_id FROM auth_tokens
         WHERE token_hash = $1 AND kind = 'verify' AND expires_at > NOW() FOR UPDATE`,
        [hash(token)]
      );
      if (!result.rows[0]) {
        await client.query('ROLLBACK');
        return authError(res, 400, 'Verification link is invalid or expired.');
      }
      await client.query('UPDATE users SET email_verified_at = NOW() WHERE id = $1', [result.rows[0].user_id]);
      await client.query('DELETE FROM auth_tokens WHERE user_id = $1 AND kind = $2', [result.rows[0].user_id, 'verify']);
      await client.query('COMMIT');
      res.json({ status: 'success', message: 'Email verified. You can now sign in.' });
    } catch (err) {
      await rollback(client, 'Email verification');
      console.error('Email verification failed:', err.message);
      authError(res, 503, 'Email verification is temporarily unavailable.');
    } finally {
      client?.release();
    }
  });

  app.post('/api/auth/resend-verification',
    requireCsrf,
    rateLimit('resend-verification', 5, 60 * 60 * 1000, req => req.ip),
    rateLimit('resend-verification-email', 3, 60 * 60 * 1000, emailRateLimitIdentity),
    async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    try {
      const result = await pool.query('SELECT id, email FROM users WHERE email = $1 AND email_verified_at IS NULL', [email]);
      if (result.rows[0]) await issueToken(result.rows[0].id, result.rows[0].email, 'verify');
      res.json({ status: 'accepted', message: 'If the account needs verification, a new link has been sent.' });
    } catch (err) {
      console.error('Verification email resend failed:', err.message);
      authError(res, 503, 'Could not send the verification email.');
    }
    });

  app.post('/api/auth/login',
    requireCsrf,
    rateLimit('login', 10, 15 * 60 * 1000, req => req.ip),
    rateLimit('login-email', 10, 15 * 60 * 1000, emailRateLimitIdentity),
    async (req, res) => {
    const body = req.body || {};
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    try {
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      const user = result.rows[0];
      const valid = user && password.length <= 128 && await argon2.verify(user.password_hash, password).catch(() => false);
      if (!valid) return authError(res, 401, 'Email or password is incorrect.');
      if (!user.email_verified_at) return authError(res, 403, 'Verify your email before signing in.');
      if (user.totp_secret_encrypted) {
        const challenge = crypto.randomBytes(32).toString('base64url');
        await pool.query(
          'INSERT INTO mfa_challenges (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'5 minutes\')',
          [hash(challenge), user.id]
        );
        return res.json({ status: 'mfa_required', challenge });
      }
      await startSession(user.id, res);
      res.json({ status: 'success', user: { email: user.email, mfaEnabled: false } });
    } catch (err) {
      console.error('Sign-in failed:', err.message);
      authError(res, 503, 'Sign-in is temporarily unavailable.');
    }
    });

  app.post('/api/auth/mfa/login', requireCsrf, rateLimit('mfa-login', 10, 15 * 60 * 1000), async (req, res) => {
    const challenge = typeof req.body?.challenge === 'string' ? req.body.challenge : '';
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT c.token_hash, u.* FROM mfa_challenges c JOIN users u ON u.id = c.user_id
         WHERE c.token_hash = $1 AND c.expires_at > NOW() FOR UPDATE`,
        [hash(challenge)]
      );
      const user = result.rows[0];
      const validTotp = user && await verifyTotp(user, req.body?.code);
      const validRecoveryCode = user && !validTotp &&
        await consumeRecoveryCode(client, user, req.body?.code);
      if (!user || (!validTotp && !validRecoveryCode)) {
        await client.query('ROLLBACK');
        return authError(res, 401, 'Authenticator code is invalid or expired.');
      }
      await client.query('DELETE FROM mfa_challenges WHERE token_hash = $1', [user.token_hash]);
      await client.query('COMMIT');
      await startSession(user.id, res);
      res.json({ status: 'success', user: { email: user.email, mfaEnabled: true } });
    } catch (err) {
      await rollback(client, 'Authenticator sign-in');
      console.error('Authenticator sign-in failed:', err.message);
      authError(res, 503, 'Authenticator sign-in is temporarily unavailable.');
    } finally {
      client?.release();
    }
  });

  app.post('/api/auth/logout', requireCsrf, rateLimit('logout', 30, 60 * 1000), async (req, res) => {
    const token = cookieValue(req, SESSION_COOKIE);
    if (token && pool) await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [hash(token)]);
    clearCookie(res, SESSION_COOKIE, true);
    res.json({ status: 'success' });
  });

  app.post('/api/auth/forgot-password',
    requireCsrf,
    rateLimit('forgot-password', 5, 60 * 60 * 1000, req => req.ip),
    rateLimit('forgot-password-email', 3, 60 * 60 * 1000, emailRateLimitIdentity),
    async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    try {
      const result = await pool.query('SELECT id, email FROM users WHERE email = $1 AND email_verified_at IS NOT NULL', [email]);
      if (result.rows[0]) await issueToken(result.rows[0].id, result.rows[0].email, 'reset');
      res.json({ status: 'accepted', message: 'If a verified account exists, a password reset link has been sent.' });
    } catch (err) {
      console.error('Password reset email failed:', err.message);
      authError(res, 503, 'Could not send the reset email.');
    }
    });

  app.post('/api/auth/reset-password', requireCsrf, rateLimit('reset-password', 10, 15 * 60 * 1000), async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const password = req.body?.password;
    if (!token || token.length > 100 || typeof password !== 'string' || password.length < 7 || password.length > 128) {
      return authError(res, 400, 'Use a valid reset link and a 7–128 character password.');
    }
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT user_id FROM auth_tokens WHERE token_hash = $1 AND kind = 'reset'
         AND expires_at > NOW() FOR UPDATE`,
        [hash(token)]
      );
      if (!result.rows[0]) {
        await client.query('ROLLBACK');
        return authError(res, 400, 'Password reset link is invalid or expired.');
      }
      const userId = result.rows[0].user_id;
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
      await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
      await client.query('DELETE FROM auth_tokens WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM auth_sessions WHERE user_id = $1', [userId]);
      await client.query('COMMIT');
      clearCookie(res, SESSION_COOKIE, true);
      res.json({ status: 'success', message: 'Password updated. Sign in with your new password.' });
    } catch (err) {
      await rollback(client, 'Password reset');
      console.error('Password reset failed:', err.message);
      authError(res, 503, 'Password reset is temporarily unavailable.');
    } finally {
      client?.release();
    }
  });

  app.use('/api', async (req, res, next) => {
    if (!enabled) return next();
    if (req.path === '/health') return next();
    const token = cookieValue(req, SESSION_COOKIE);
    if (!token) return authError(res, 401, 'Sign in to use this feature.');
    try {
      const result = await pool.query(
        `SELECT u.id, u.email, u.totp_secret_encrypted IS NOT NULL AS mfa_enabled
         FROM auth_sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.email_verified_at IS NOT NULL`,
        [hash(token)]
      );
      if (!result.rows[0]) return authError(res, 401, 'Your session expired. Sign in again.');
      req.user = result.rows[0];
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return requireCsrf(req, res, next);
      next();
    } catch (err) {
      console.error('Session validation failed:', err.message);
      authError(res, 503, 'Account service is temporarily unavailable.');
    }
  });

  app.get('/api/account', async (req, res) => {
    if (!enabled) return res.json({ enabled: false });
    try {
      const result = await pool.query('SELECT gemini_api_key_encrypted IS NOT NULL AS has_gemini_key FROM user_settings WHERE user_id = $1', [req.user.id]);
      res.json({ enabled: true, email: req.user.email, mfaEnabled: req.user.mfa_enabled, hasGeminiKey: Boolean(result.rows[0]?.has_gemini_key) });
    } catch (err) {
      console.error('Account details lookup failed:', err.message);
      authError(res, 503, 'Could not load account settings.');
    }
  });

  app.post('/api/account/gemini-key', async (req, res) => {
    const key = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
    if (key.length > 512) return authError(res, 400, 'API key is too long.');
    try {
      await pool.query(
        `INSERT INTO user_settings (user_id, gemini_api_key_encrypted)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET gemini_api_key_encrypted = $2, updated_at = NOW()`,
        [req.user.id, key ? encrypt(key) : null]
      );
      res.json({ status: 'success', hasGeminiKey: Boolean(key) });
    } catch (err) {
      console.error('Gemini key save failed:', err.message);
      authError(res, 503, 'Could not save the API key securely.');
    }
  });

  app.get('/api/history', async (req, res) => {
    if (!enabled) return res.json({ history: [] });
    try {
      const result = await pool.query(
        `SELECT id, created_at AS "createdAt", result FROM correction_history
         WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [req.user.id]
      );
      res.json({ history: result.rows.map(row => ({ ...row.result, id: row.id, timestamp: row.createdAt })) });
    } catch (err) {
      console.error('History load failed:', err.message);
      authError(res, 503, 'Could not load correction history.');
    }
  });

  app.delete('/api/history', async (req, res) => {
    if (!enabled) return res.json({ status: 'success' });
    try {
      await pool.query('DELETE FROM correction_history WHERE user_id = $1', [req.user.id]);
      res.json({ status: 'success' });
    } catch (err) {
      console.error('History deletion failed:', err.message);
      authError(res, 503, 'Could not clear correction history.');
    }
  });

  app.get('/api/account/mfa', async (req, res) => {
    if (!enabled) return res.json({ enabled: false });
    res.json({ enabled: Boolean(req.user.mfa_enabled) });
  });

  app.post('/api/account/mfa/setup', rateLimit('mfa-setup', 5, 60 * 60 * 1000), async (req, res) => {
    if (!enabled) return authError(res, 503, 'Account storage is not configured.');
    if (req.user.mfa_enabled) return authError(res, 409, 'Authenticator MFA is already enabled.');
    try {
      const secret = new OTPAuth.Secret({ size: 20 });
      const totp = new OTPAuth.TOTP({ issuer: 'VerbaAI', label: req.user.email, algorithm: 'SHA1', digits: 6, period: 30, secret });
      await pool.query('UPDATE users SET pending_totp_secret_encrypted = $1 WHERE id = $2', [encrypt(secret.base32), req.user.id]);
      res.json({ secret: secret.base32, qrCode: await QRCode.toDataURL(totp.toString()) });
    } catch (err) {
      console.error('MFA setup failed:', err.message);
      authError(res, 503, 'Could not start authenticator setup.');
    }
  });

  app.post('/api/account/mfa/enable', rateLimit('mfa-enable', 10, 15 * 60 * 1000), async (req, res) => {
    if (!enabled) return authError(res, 503, 'Account storage is not configured.');
    try {
      const result = await pool.query('SELECT pending_totp_secret_encrypted FROM users WHERE id = $1', [req.user.id]);
      const user = { ...req.user, pending_totp_secret_encrypted: result.rows[0]?.pending_totp_secret_encrypted };
      if (!(await verifyTotp(user, req.body?.code, true))) return authError(res, 400, 'Authenticator code is invalid.');
      const recoveryCodes = Array.from({ length: 10 }, () => crypto.randomBytes(12).toString('hex').toUpperCase());
      await pool.query(
        `UPDATE users SET totp_secret_encrypted = pending_totp_secret_encrypted,
         pending_totp_secret_encrypted = NULL, totp_recovery_hashes = $1 WHERE id = $2`,
        [recoveryCodes.map(hash), req.user.id]
      );
      res.json({ status: 'success', mfaEnabled: true, recoveryCodes });
    } catch (err) {
      console.error('MFA activation failed:', err.message);
      authError(res, 503, 'Could not enable authenticator MFA.');
    }
  });

  app.post('/api/account/mfa/disable', rateLimit('mfa-disable', 5, 60 * 60 * 1000), async (req, res) => {
    if (!enabled) return authError(res, 503, 'Account storage is not configured.');
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const result = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
      const user = result.rows[0];
      const passwordOkay = await argon2.verify(user.password_hash, String(req.body?.password || '')).catch(() => false);
      const validTotp = passwordOkay && await verifyTotp(user, req.body?.code);
      const validRecoveryCode = passwordOkay && !validTotp &&
        await consumeRecoveryCode(client, user, req.body?.code);
      if (!passwordOkay || (!validTotp && !validRecoveryCode)) {
        await client.query('ROLLBACK');
        return authError(res, 401, 'Password or authenticator code is incorrect.');
      }
      await client.query(
        `UPDATE users SET totp_secret_encrypted = NULL, pending_totp_secret_encrypted = NULL,
         totp_recovery_hashes = '{}' WHERE id = $1`,
        [req.user.id]
      );
      await client.query('COMMIT');
      res.json({ status: 'success', mfaEnabled: false });
    } catch (err) {
      await rollback(client, 'MFA disable');
      console.error('MFA disable failed:', err.message);
      authError(res, 503, 'Could not disable authenticator MFA.');
    } finally {
      client?.release();
    }
  });

  async function resolveGeminiKey(userId, suppliedKey) {
    if (typeof suppliedKey === 'string' && suppliedKey.trim()) return suppliedKey.trim();
    if (!enabled) return process.env.GEMINI_API_KEY || '';
    const result = await pool.query('SELECT gemini_api_key_encrypted FROM user_settings WHERE user_id = $1', [userId]);
    return result.rows[0]?.gemini_api_key_encrypted
      ? decrypt(result.rows[0].gemini_api_key_encrypted)
      : process.env.GEMINI_API_KEY || '';
  }

  async function saveHistory(userId, result) {
    if (!enabled) return;
    await pool.query(
      `INSERT INTO correction_history (user_id, original, corrected, result)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [userId, result.original, result.corrected, JSON.stringify(result)]
    );
    await pool.query(
      `DELETE FROM correction_history WHERE user_id = $1 AND id NOT IN
       (SELECT id FROM correction_history WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 20)`,
      [userId]
    );
  }

  async function initialize() {
    if (!enabled) {
      console.warn('Account authentication is disabled because DATABASE_URL is not configured.');
      
      return;
    }
    const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SESSION_SECRET', 'DATA_ENCRYPTION_KEY'];
    const missing = required.filter(name => !process.env[name]);
    const configuredBaseUrl = process.env.APP_BASE_URL || process.env.RENDER_EXTERNAL_URL;
    if (!configuredBaseUrl) missing.push('APP_BASE_URL (or RENDER_EXTERNAL_URL)');
    if (missing.length) throw new Error(`Missing required auth configuration: ${missing.join(', ')}`);
    if (Buffer.byteLength(process.env.SESSION_SECRET) < 32) throw new Error('SESSION_SECRET must contain at least 32 bytes.');
    const decodedKey = Buffer.from(process.env.DATA_ENCRYPTION_KEY, 'base64');
    if (decodedKey.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
    appBaseUrl = configuredBaseUrl.replace(/\/+$/, '');
    const base = new URL(appBaseUrl);
    if (base.username || base.password) throw new Error('APP_BASE_URL must not contain credentials.');
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('APP_BASE_URL must use HTTP or HTTPS.');
    if (process.env.NODE_ENV === 'production' && base.protocol !== 'https:') throw new Error('APP_BASE_URL must use HTTPS in production.');
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) throw new Error('SMTP_PORT must be a valid TCP port.');
    sessionSecret = process.env.SESSION_SECRET;
    encryptionKey = decodedKey;
    mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: smtpPort,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    await pool.query('SELECT 1');
    const migrationsPath = path.join(__dirname, 'migrations');
    const migrations = fs.readdirSync(migrationsPath).filter(file => file.endsWith('.sql')).sort();
    for (const migration of migrations) {
      await pool.query(fs.readFileSync(path.join(migrationsPath, migration), 'utf8'));
    }
    await mailer.verify();
    await pool.query('DELETE FROM auth_sessions WHERE expires_at <= NOW()');
    await pool.query('DELETE FROM auth_tokens WHERE expires_at <= NOW()');
    await pool.query('DELETE FROM mfa_challenges WHERE expires_at <= NOW()');
  }

  return { enabled, initialize, resolveGeminiKey, saveHistory, rateLimit };
}

module.exports = { createAuth };
