# VerbaAI — Multilingual AI Grammar Checker & Writing Assistant

A modern, fast, responsive web application that checks grammar, improves writing, and simplifies English with **text input** and **voice input**, supporting **multiple languages**.

---

## ⚡ Core Loop

```
Input → Correct → Explain briefly (≤ 15 words) → Give improved sentence
```

1. **Corrected Sentence**: High-contrast, one-click copy, text-to-speech pronunciation, and one-click editor replacement.
2. **Visual Diff**: Real-time inline word diffing with insertions (green highlight) and deletions (struck red).
3. **Changes List**: `original → corrected : reason` (max 3 most important changes).
4. **Explanation**: One short sentence (≤ 15 words).
5. **Better Version**: Natural rewrite card with one-click "Use This".

---

## 🚀 Quick Start

### 1. Install & Run
```bash
npm install
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.
Without `DATABASE_URL`, local development runs without accounts. Production requires PostgreSQL and the account/email secrets below.

### 2. Run Test Suite
```bash
npm test
```

### Install on Android
- Deploy the app to a public HTTPS address. In Chrome on Android, open that address, tap the menu, and choose **Install app** or **Add to Home screen**.
- The installed app keeps its interface available offline; sign-in, Gemini tools, correction requests, and other server-backed features still need an internet connection.

---

## 🛠 Features

### 1. Text Input & Counter
- Large, comfortable textarea with live character, word, and sentence counters.
- Import extracts text from TXT/Markdown, text-based PDF, Word `.docx`, and PowerPoint `.pptx` files up to 25 MB. Legacy `.doc`/`.ppt` formats and scanned PDFs require conversion/OCR first. Documents are parsed in the browser and are not uploaded for import.
- PDF import reads every page with selectable text. Long imported text from PDF, Word, PowerPoint, TXT, and Markdown is checked in sequential sections and the corrected sections are reassembled; individual change annotations are omitted for long-document checks. The AI provider's quota and service limits still apply.
- Action Buttons:
  - **Check Grammar** (`Ctrl + Enter`)
  - **Improve Writing**
  - **Simplify English**
- Utility Toolbar:
  - 🧹 **Clear**: Clears input with undo protection
  - 📋 **Copy**: Copies input or corrected text (`Ctrl + Shift + C`)
  - 🔄 **Replace Original**: Replaces input text with corrected sentence
  - ↩️ **Undo**: Restores previous input before replacement (`Ctrl + Z`)
  - 💾 **Download TXT**: Exports structured report as `.txt`

### 2. Voice Input (Speech-to-Text)
- Accessible 🎤 microphone button with pulsing soundwave animation.
- Uses standard Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`).
- Shows interim speech in the editor as you speak, then replaces it with finalized recognition text; very low-confidence results are ignored.
- If browser speech recognition reports a network error before returning finalized text, records the session and sends it to Gemini for transcription using the configured API key.
- Voice fallback requires microphone permission, a Gemini API key, and outbound server access to Google's Gemini API; audio clips up to 7 MB are sent to Google Gemini for transcription.
- Gracefully handles unsupported browsers and microphone permission denials with clear alerts.

### 3. Gemini API Key
- Add `GEMINI_API_KEY` to `.env`, or enter a key in Settings and choose **Test Connection**.
- Uses Gemini 3.5 Flash-Lite with a Gemini 3.8 Flash fallback. Gemini requests retry once on network failures and report DNS, outbound HTTPS, timeout, or proxy/firewall troubleshooting hints.
- The Editor's optional writing tools can continue an unfinished sentence, summarize text, or rephrase in professional, academic, friendly, or casual styles.
- On supported phones and browsers, Share opens the native share sheet; otherwise it copies corrected text.
- Double-click a word in the editor to view thesaurus alternatives. Tone detection and readability scores are heuristic estimates, not formal assessments.
- The Learning Dashboard counts corrections by category from the latest 20 saved checks for the signed-in account (or local browser history in development).
- The dashboard's estimated score is a simple correction-rate indicator, not an official grammar or proficiency score; long sentences are flagged by a 25-word heuristic.
- Reference comparison reports exact phrase overlap only against text the user supplies (up to 10 references). It does not search the internet and is not a plagiarism verdict.

### Deployment Notes
- Use Node.js 20 or newer and PostgreSQL. Set `NODE_ENV=production`, `DATABASE_URL`, `APP_BASE_URL` (HTTPS), `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SESSION_SECRET` (at least 32 random bytes), and `DATA_ENCRYPTION_KEY` (base64-encoded 32 random bytes) in the hosting provider's secret/environment settings. The server applies all SQL files in `migrations/` at startup.
- The HTTPS deployment is also the Android installable PWA; Android installation is not a separate native APK.
- Set `GEMINI_API_KEY` only for a shared server-side Gemini key; each account can instead save an encrypted key in Settings. Back up `DATA_ENCRYPTION_KEY` securely: changing or losing it prevents decrypting saved user keys and MFA secrets.
- Use a PostgreSQL account limited to the app database, enforce encrypted database connections with your provider, and back up the database securely.
- Configure SMTP delivery and verify account emails before opening registration.
- Do not commit `.env`; `.gitignore` excludes it. `.env.example` contains placeholders only.
- Deploy behind HTTPS. Production startup fails closed if database, mail, or key configuration is missing.
- For Render, connect this repository and create a Blueprint from `render.yaml`. It provisions the web service and PostgreSQL database, generates the session/encryption secrets, and prompts for SMTP host/user/password. Render supplies the HTTPS service URL, which the app uses for verification and reset links.

### 4. Unlimited Text Entry
- The editor and translation fields have no app-imposed character counter cap or truncation.
- Long translation requests are split into smaller service requests. Gemini and translation providers may still enforce their own usage, quota, and request limits.

### 5. Three Writing Modes
1. **Grammar Check** — Grammar, spelling, punctuation, and structural agreement.
2. **Improve** — Makes sentences clearer, more natural, and professional.
3. **Simple English** — Converts text to short, easy English (translates if input isn't English).

### 6. Multilingual Support
- **AI Language Selector**:
  - `Auto Detect`, `English`, `Hindi`, `Marathi`, `Spanish`, `French`, `German`, `Portuguese`, `Japanese`, `Chinese`.
- **Voice STT Selector (BCP-47)**:
  - `en-IN`, `en-US`, `hi-IN`, `mr-IN`, `es-ES`, `fr-FR`, `de-DE`, `pt-BR`, `ja-JP`, `zh-CN`.

### 7. Accounts & Private Data
- Production accounts require verified email addresses. Passwords use Argon2id; login sessions are random, database-backed, and held in `HttpOnly`, `SameSite=Strict` cookies.
- New and reset passwords must be 7–128 characters.
- Optional authenticator-app MFA (TOTP) can be enabled or disabled in Settings. Setup provides one-time recovery codes; save them securely. Password reset links are single-use and expire after 30 minutes.
- Correction history is scoped to the signed-in account and stores the latest 20 checks in PostgreSQL.
- Gemini API keys and TOTP secrets are encrypted at rest using AES-256-GCM. State-changing API requests use CSRF tokens; auth and AI routes use PostgreSQL-backed rate limits.

### 8. Backend API Contract
`POST /api/check`
```json
{
  "text": "He go to college everyday.",
  "language": "English",
  "mode": "grammar"
}
```
Response:
```json
{
  "status": "success",
  "original": "He go to college everyday.",
  "corrected": "He goes to college every day.",
  "changes": [
    {
      "original": "go",
      "corrected": "goes",
      "reason": "Subject-verb agreement with third-person singular"
    },
    {
      "original": "everyday",
      "corrected": "every day",
      "reason": "Adverbial time phrase should be two words"
    }
  ],
  "explanation": "Fixed subject-verb agreement and separated the adverb 'every day'.",
  "betterVersion": "He attends college every day.",
  "rawOutput": "CORRECTED:\nHe goes to college every day.\n\nCHANGES:\n- go → goes : Subject-verb agreement with third-person singular\n- everyday → every day : Adverbial time phrase should be two words\n\nEXPLANATION:\nFixed subject-verb agreement and separated the adverb 'every day'.\n\nBETTER VERSION:\nHe attends college every day."
}
```
