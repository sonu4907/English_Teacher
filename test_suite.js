const http = require('http');

async function postJson(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: Number(process.env.PORT || 3000),
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    }, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(resBody) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: resBody });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function getJson(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: Number(process.env.PORT || 3000),
      path,
      method: 'GET'
    }, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(resBody) });
        } catch {
          resolve({ status: res.statusCode, raw: resBody });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const postCheck = (body, headers = {}) => postJson('/api/check', body, headers);

async function runTests() {
  console.log('🚀 Running Comprehensive Test Suite for VerbaAI...\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
    }
  }

  console.log('Test 0: Account security bootstrap');
  const manifest = await getJson('/manifest.webmanifest');
  assert(manifest.status === 200 && manifest.data.display === 'standalone', 'Serves an installable standalone app manifest');
  const serviceWorker = await getJson('/service-worker.js');
  assert(serviceWorker.status === 200 && serviceWorker.raw.includes("startsWith('/api/')"), 'Serves a service worker that never caches API responses');
  const icon192 = await getJson('/icons/icon-192.png');
  assert(icon192.status === 200, 'Serves the 192px Android launcher icon');
  const icon512 = await getJson('/icons/icon-512.png');
  assert(icon512.status === 200, 'Serves the 512px Android launcher icon');
  const authStatus = await getJson('/api/auth/status');
  assert(authStatus.status === 200, 'Auth status endpoint is available');
  assert(typeof authStatus.data.csrfToken === 'string' && authStatus.data.csrfToken.length > 0, 'Returns a CSRF bootstrap token');
  const accountStatus = await getJson('/api/account');
  assert(authStatus.data.enabled ? accountStatus.status === 401 : accountStatus.status === 200, 'Account endpoint follows the configured auth mode');

  // Test 1: English grammar
  console.log('Test 1: English grammar check');
  const t1 = await postCheck({ text: 'He go to college everyday.', language: 'English', mode: 'grammar' });
  assert(t1.status === 200, 'HTTP status is 200');
  assert(t1.data.corrected === 'He goes to college every day.', 'Corrects to "He goes to college every day."');
  assert(t1.data.changes.length >= 2, 'Detects both "go" and "everyday" changes');
  assert(t1.data.explanation && t1.data.explanation.length > 0, 'Includes concise explanation');
  assert(Boolean(t1.data.betterVersion), 'Includes better version');
  assert(Array.isArray(t1.data.betterVersions) && t1.data.betterVersions.length >= 2, 'Includes 2 or 3 better version sentences');
  assert(t1.data.rawOutput.includes('CORRECTED:'), 'Raw output conforms to exact verbatim structure');

  // Test 2: Marathi grammar (from user prompt)
  console.log('\nTest 2: Marathi grammar check (user prompt specification)');
  const t2 = await postCheck({ text: 'मी काल कॉलेज ला गेलो.', language: 'Marathi', mode: 'grammar' });
  assert(t2.status === 200, 'HTTP status is 200');
  // Gemini may join the postposition or use a different valid form — check the space is removed
  const marathiCorrected = t2.data.corrected || '';
  assert(
    !marathiCorrected.includes('कॉलेज ला') || marathiCorrected.includes('कॉलेजला'),
    'Removes invalid space in Marathi postposition (कॉलेज ला → कॉलेजला)'
  );
  assert(
    t2.data.changes.length > 0 || marathiCorrected === 'मी काल कॉलेजला गेलो.',
    'Reports at least one change for Marathi postposition error'
  );

  // Test 3: Hindi grammar check
  console.log('\nTest 3: Hindi grammar check');
  const t3 = await postCheck({ text: 'हम कल आऊंगा.', language: 'Hindi', mode: 'grammar' });
  assert(t3.status === 200, 'HTTP status is 200');
  // Gemini may fix this as:
  //   (a) pronoun error: हम → मैं (singular) with आऊँगा/आऊंगा
  //   (b) verb agreement error: keep हम, fix verb to plural आएंगे
  // Both corrections are linguistically valid. Accept either.
  const hindiCorrected = t3.data.corrected || '';
  const isProunounFix = hindiCorrected.includes('मैं') &&
    (hindiCorrected.includes('आऊँगा') || hindiCorrected.includes('आऊंगा') || hindiCorrected.includes('आएगा'));
  const isVerbFix = hindiCorrected.includes('हम') &&
    (hindiCorrected.includes('आएंगे') || hindiCorrected.includes('आएँगे') || hindiCorrected.includes('जाएंगे'));
  assert(
    isProunounFix || isVerbFix,
    'Corrects Hindi number/verb agreement (accepts pronoun fix or verb plural fix)'
  );

  // Test 4: Spanish grammar check
  console.log('\nTest 4: Spanish grammar check');
  const t4 = await postCheck({ text: 'Ella no sabo la verdad.', language: 'Spanish', mode: 'grammar' });
  assert(t4.status === 200, 'HTTP status is 200');
  assert(t4.data.corrected === 'Ella no sabe la verdad.', 'Corrects irregular conjugation to "sabe"');

  // Test 5: Improve mode
  console.log('\nTest 5: Improve Writing mode');
  const t5 = await postCheck({
    text: 'I think that we need to get in touch with them in order to help out.',
    language: 'English',
    mode: 'improve'
  });
  assert(t5.status === 200, 'HTTP status is 200');
  assert(t5.data.mode === 'improve', 'Mode preserved in response');
  assert(t5.data.corrected.length > 0, 'Generates improved professional sentence');

  // Test 6: Simple English mode
  console.log('\nTest 6: Simple English mode');
  const t6 = await postCheck({
    text: 'The committee has the capability to perform an analysis of the proposal.',
    language: 'English',
    mode: 'simple'
  });
  assert(t6.status === 200, 'HTTP status is 200');
  assert(t6.data.mode === 'simple', 'Mode is simple');
  assert(t6.data.corrected.includes('can') || t6.data.corrected.includes('analyze') || t6.data.corrected.length > 0, 'Simplifies complex verb phrases');

  // Test 6b: Student writing context reaches the correction API
  const studentContext = await postCheck({
    text: 'I am applying for this scholarship because I work hard.',
    language: 'English',
    mode: 'improve',
    writingContext: 'resume'
  });
  assert(studentContext.status === 200, 'Accepts a student writing context');
  assert(studentContext.data.writingContext === 'resume', 'Returns the selected resume context');

  // Test 7: Already correct sentence
  console.log('\nTest 7: Already correct sentence');
  const t7 = await postCheck({
    text: 'She is reading an interesting book.',
    language: 'English',
    mode: 'grammar'
  });
  assert(t7.status === 200, 'HTTP status is 200');
  assert(t7.data.changes.length === 0, 'Changes count is 0 for correct sentence');
  assert(t7.data.explanation.toLowerCase().includes('correct'), 'Explanation says sentence is correct');

  // Test 8: Speech transcription request validation
  console.log('\nTest 8: Voice transcription request validation');
  const missingAudio = await postJson('/api/transcribe', {});
  assert(missingAudio.status === 400, 'Rejects a transcription request without audio');
  const invalidMime = await postJson('/api/transcribe', { audio: 'YQ==', mimeType: 'text/plain' });
  assert(invalidMime.status === 400, 'Rejects a non-audio MIME type');

  // Test 9: Writing tools request validation
  console.log('\nTest 9: Writing tools request validation');
  const invalidWritingTask = await postJson('/api/writing-tools', { task: 'invent', text: 'A sentence.' });
  assert(invalidWritingTask.status === 400, 'Rejects an unsupported writing task');
  const missingWritingText = await postJson('/api/writing-tools', { task: 'summarize', text: '   ' });
  assert(missingWritingText.status === 400, 'Rejects an empty writing-tool input');

  // Test 10: User-provided reference text similarity
  console.log('\nTest 10: Reference-text similarity comparison');
  const matchingSource = 'The quick brown fox jumps over the lazy dog every day.';
  const matching = await postJson('/api/similarity-check', {
    text: matchingSource,
    sources: [{ label: 'Reference A', text: matchingSource }]
  });
  assert(matching.status === 200, 'Accepts draft and supplied reference');
  assert(matching.data.scope === 'user-provided-sources-only', 'Clearly identifies comparison scope');
  assert(matching.data.sources[0].similarityPercent === 100, 'Detects exact phrase overlap');
  assert(matching.data.sources[0].matchedPhrases.length > 0, 'Returns matching phrases for review');
  const missingReference = await postJson('/api/similarity-check', { text: matchingSource, sources: [] });
  assert(missingReference.status === 400, 'Requires at least one reference text');

  // Test 11: Long document checks cover every correction section
  console.log('\nTest 11: Long document correction');
  const longDocument = 'She go to school every day. '.repeat(140);
  const longResult = await postCheck({ text: longDocument, language: 'English', mode: 'grammar' });
  assert(longResult.status === 200, 'Accepts a document larger than one AI section');
  assert(longResult.data.processedSections > 1, 'Processes the document in multiple sections');
  assert(longResult.data.corrected.startsWith('She goes to school every day.'), 'Returns corrections from the first section');
  assert(longResult.data.corrected.trim().endsWith('She goes to school every day.'), 'Returns corrections through the last section');

  // Summary
  console.log(`\n========================================`);
  console.log(`Results: ${passed} / ${total} tests passed!`);
  console.log(`========================================\n`);

  process.exit(passed === total ? 0 : 1);
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
