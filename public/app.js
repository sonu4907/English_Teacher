/**
 * VerbaAI Pro - Multilingual Writing & Grammar Assistant
 * Client Application Logic
 */

(function () {
  'use strict';

  // --- Constants & Config ---
  const STORAGE_KEYS = {
    HISTORY: 'verba_history_v1',
    API_KEY: 'verba_gemini_api_key',
    THEME: 'verba_theme_preference',
    AI_LANG: 'verba_ai_language',
    VOICE_LANG: 'verba_voice_language',
    TONE: 'verba_writing_tone',
    AUTO_CHECK: 'verba_auto_check'
  };

  const VOICE_LANG_MAP = {
    'Auto Detect': 'en-IN',
    'English': 'en-IN',
    'Hindi': 'hi-IN',
    'Marathi': 'mr-IN',
    'Spanish': 'es-ES',
    'French': 'fr-FR',
    'German': 'de-DE',
    'Portuguese': 'pt-BR',
    'Japanese': 'ja-JP',
    'Chinese': 'zh-CN'
  };

  // --- Application State ---
  const state = {
    mode: 'grammar', // 'grammar' | 'improve' | 'simple'
    tone: localStorage.getItem(STORAGE_KEYS.TONE) || 'standard',
    autoCheck: localStorage.getItem(STORAGE_KEYS.AUTO_CHECK) === 'true',
    activeChangeFilter: 'all',
    aiLanguage: 'English',   // English-first default
    voiceLanguage: 'en-IN',
    diffViewMode: 'inline', // 'inline' | 'split'
    undoStack: [],
    history: [],
    lastResult: null,
    isListening: false,
    recognition: null,
    mediaRecorder: null,
    audioChunks: [],
    audioCapturePromise: null,
    isTranscribingVoice: false,
    voiceTranscript: '',
    voiceBaseText: '',
    audioContext: null,
    analyser: null,
    microphoneStream: null,
    animFrameId: null,
    apiKey: localStorage.getItem(STORAGE_KEYS.API_KEY) || '',
    activeAppTab: 'editor',
    authEnabled: false,
    authenticated: false,
    csrfToken: '',
    authMode: 'login',
    mfaChallenge: '',
    hasSavedApiKey: false,
    legacyApiKey: ''
  };
  let switchAppTab;

  // --- DOM Elements ---
  const els = {
    authGate: document.getElementById('authGate'),
    authForm: document.getElementById('authForm'),
    authTitle: document.getElementById('authTitle'),
    authMessage: document.getElementById('authMessage'),
    authEmail: document.getElementById('authEmail'),
    authPassword: document.getElementById('authPassword'),
    authPasswordGroup: document.getElementById('authPasswordGroup'),
    authCode: document.getElementById('authCode'),
    authCodeGroup: document.getElementById('authCodeGroup'),
    authSubmitBtn: document.getElementById('authSubmitBtn'),
    authRegisterBtn: document.getElementById('authRegisterBtn'),
    authForgotBtn: document.getElementById('authForgotBtn'),
    authResendBtn: document.getElementById('authResendBtn'),
    authStatusMsg: document.getElementById('authStatusMsg'),
    accountMenuBtn: document.getElementById('accountMenuBtn'),
    accountEmailLabel: document.getElementById('accountEmailLabel'),
    accountSecuritySection: document.getElementById('accountSecuritySection'),
    accountSecurityStatus: document.getElementById('accountSecurityStatus'),
    mfaSetupBtn: document.getElementById('mfaSetupBtn'),
    mfaSetupPanel: document.getElementById('mfaSetupPanel'),
    mfaQrCode: document.getElementById('mfaQrCode'),
    mfaSecret: document.getElementById('mfaSecret'),
    mfaEnableCode: document.getElementById('mfaEnableCode'),
    mfaEnableBtn: document.getElementById('mfaEnableBtn'),
    mfaRecoveryPanel: document.getElementById('mfaRecoveryPanel'),
    mfaRecoveryCodes: document.getElementById('mfaRecoveryCodes'),
    copyMfaRecoveryCodesBtn: document.getElementById('copyMfaRecoveryCodesBtn'),
    mfaDisablePanel: document.getElementById('mfaDisablePanel'),
    mfaDisablePassword: document.getElementById('mfaDisablePassword'),
    mfaDisableCode: document.getElementById('mfaDisableCode'),
    mfaDisableBtn: document.getElementById('mfaDisableBtn'),
    mfaStatusMsg: document.getElementById('mfaStatusMsg'),
    legacyApiKeyNotice: document.getElementById('legacyApiKeyNotice'),
    // Inputs & Dropzone
    inputText: document.getElementById('inputText'),
    dropZone: document.getElementById('dropZone'),
    fileUploadInput: document.getElementById('fileUploadInput'),
    uploadDocBtn: document.getElementById('uploadDocBtn'),

    // Counters & Analytics
    charCount: document.getElementById('charCount'),
    wordCount: document.getElementById('wordCount'),
    sentenceCount: document.getElementById('sentenceCount'),
    readabilityScore: document.getElementById('readabilityScore'),
    readingTime: document.getElementById('readingTime'),
    gradeLevel: document.getElementById('gradeLevel'),
    formalityScore: document.getElementById('formalityScore'),
    detectedTone: document.getElementById('detectedTone'),
    longSentenceNotice: document.getElementById('longSentenceNotice'),

    // Tone & Live Controls
    tonePills: document.querySelectorAll('.tone-pill'),
    autoCheckToggle: document.getElementById('autoCheckToggle'),
    changesFilterPills: document.querySelectorAll('.change-filter-pill'),

    // Synonym Popover
    synonymPopover: document.getElementById('synonymPopover'),
    synonymWord: document.getElementById('synonymWord'),
    synonymChips: document.getElementById('synonymChips'),
    closeSynonymBtn: document.getElementById('closeSynonymBtn'),

    // Buttons & Actions
    submitBtn: document.getElementById('submitBtn'),
    submitBtnLabel: document.getElementById('submitBtnLabel'),
    submitSpinner: document.getElementById('submitSpinner'),
    micBtn: document.getElementById('micBtn'),
    bottomNavVoiceBtn: document.getElementById('bNavVoice'),
    stopVoiceBtn: document.getElementById('stopVoiceBtn'),
    completeTextBtn: document.getElementById('completeTextBtn'),
    summarizeTextBtn: document.getElementById('summarizeTextBtn'),
    rewriteTextBtn: document.getElementById('rewriteTextBtn'),
    rewriteStyleSelect: document.getElementById('rewriteStyleSelect'),
    writingToolResult: document.getElementById('writingToolResult'),
    writingToolOutput: document.getElementById('writingToolOutput'),
    copyWritingToolBtn: document.getElementById('copyWritingToolBtn'),
    insertWritingToolBtn: document.getElementById('insertWritingToolBtn'),
    shareCorrectedBtn: document.getElementById('shareCorrectedBtn'),
    clearBtn: document.getElementById('clearBtn'),
    undoBtn: document.getElementById('undoBtn'),
    copyInputBtn: document.getElementById('copyInputBtn'),
    openTranslateTabBtn: document.getElementById('openTranslateTabBtn'),

    // Language Selects
    aiLanguageSelect: document.getElementById('aiLanguageSelect'),
    voiceLanguageSelect: document.getElementById('voiceLanguageSelect'),

    // Mode Tabs
    modeTabs: document.querySelectorAll('.mode-tab'),
    activeModeBadge: document.getElementById('activeModeBadge'),
    sourceEngineBadge: document.getElementById('sourceEngineBadge'),

    // Results Display
    resultsEmptyState: document.getElementById('resultsEmptyState'),
    resultsContent: document.getElementById('resultsContent'),
    correctedTextDisplay: document.getElementById('correctedTextDisplay'),
    visualDiffContainer: document.getElementById('visualDiffContainer'),
    splitDiffContainer: document.getElementById('splitDiffContainer'),
    splitDiffOriginal: document.getElementById('splitDiffOriginal'),
    splitDiffCorrected: document.getElementById('splitDiffCorrected'),
    diffModeInline: document.getElementById('diffModeInline'),
    diffModeSplit: document.getElementById('diffModeSplit'),

    changesList: document.getElementById('changesList'),
    changesCountBadge: document.getElementById('changesCountBadge'),
    acceptAllChangesBtn: document.getElementById('acceptAllChangesBtn'),
    explanationText: document.getElementById('explanationText'),
    betterVersionCard: document.getElementById('betterVersionCard'),
    betterVersionsList: document.getElementById('betterVersionsList'),
    betterVersionText: document.getElementById('betterVersionText'),
    useBetterVersionBtn: document.getElementById('useBetterVersionBtn'),
    rawOutputBlock: document.getElementById('rawOutputBlock'),

    // Card Actions
    speakCorrectedBtn: document.getElementById('speakCorrectedBtn'),
    speakBtnText: document.getElementById('speakBtnText'),
    ttsSpeedSelect: document.getElementById('ttsSpeedSelect'),
    copyCorrectedBtn: document.getElementById('copyCorrectedBtn'),
    replaceWithCorrectedBtn: document.getElementById('replaceWithCorrectedBtn'),
    exportDropdownBtn: document.getElementById('exportDropdownBtn'),
    exportDropdownMenu: document.getElementById('exportDropdownMenu'),
    exportTxtBtn: document.getElementById('exportTxtBtn'),
    exportMdBtn: document.getElementById('exportMdBtn'),
    exportPrintBtn: document.getElementById('exportPrintBtn'),

    // Banners & Notifications
    voiceStatusBanner: document.getElementById('voiceStatusBanner'),
    voiceStatusText: document.getElementById('voiceStatusText'),
    voiceCanvas: document.getElementById('voiceCanvas'),
    alertBanner: document.getElementById('alertBanner'),
    alertMessage: document.getElementById('alertMessage'),
    closeAlertBtn: document.getElementById('closeAlertBtn'),
    toastNotification: document.getElementById('toastNotification'),
    toastMessage: document.getElementById('toastMessage'),

    // History Drawer
    historyDrawerBtn: document.getElementById('historyDrawerBtn'),
    historyDrawer: document.getElementById('historyDrawer'),
    historyStorageNotice: document.getElementById('historyStorageNotice'),
    drawerOverlay: document.getElementById('drawerOverlay'),
    closeHistoryBtn: document.getElementById('closeHistoryBtn'),
    clearHistoryBtn: document.getElementById('clearHistoryBtn'),
    historyList: document.getElementById('historyList'),
    historyBadge: document.getElementById('historyBadge'),

    // Shortcuts Modal
    shortcutsBtn: document.getElementById('shortcutsBtn'),
    shortcutsModal: document.getElementById('shortcutsModal'),
    closeShortcutsBtn: document.getElementById('closeShortcutsBtn'),

    // Settings Modal
    settingsModalBtn: document.getElementById('settingsModalBtn'),
    settingsModal: document.getElementById('settingsModal'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    geminiApiKeyInput: document.getElementById('geminiApiKeyInput'),
    toggleApiKeyVisibility: document.getElementById('toggleApiKeyVisibility'),
    saveApiKeyBtn: document.getElementById('saveApiKeyBtn'),
    testApiBtn: document.getElementById('testApiBtn'),
    apiKeyStatusMsg: document.getElementById('apiKeyStatusMsg'),

    // Theme & Status
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    systemStatusText: document.getElementById('systemStatusText'),
    exampleChips: document.querySelectorAll('.chip-btn'),

    // App Navigation & Android Bottom Nav Tabs
    tabNavItems: document.querySelectorAll('.tab-nav-item'),
    bottomNavItems: document.querySelectorAll('.bottom-nav-item'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    topNavResultsBadge: document.getElementById('topNavResultsBadge'),
    bNavResultsBadge: document.getElementById('bNavResultsBadge'),
    bNavHistoryBadge: document.getElementById('bNavHistoryBadge'),
    workspaceContainer: document.getElementById('workspaceContainer'),

    // Mobile Results Toolbar
    backToEditorBtn: document.getElementById('backToEditorBtn'),
    quickReplaceBtn: document.getElementById('quickReplaceBtn'),

    // Dedicated Tab Translator
    tabTranslateFromLang: document.getElementById('tabTranslateFromLang'),
    tabTranslateToLang: document.getElementById('tabTranslateToLang'),
    tabSwapLangBtn: document.getElementById('tabSwapLangBtn'),
    tabTranslateInput: document.getElementById('tabTranslateInput'),
    tabTranslateOutput: document.getElementById('tabTranslateOutput'),
    tabTranslateCharCount: document.getElementById('tabTranslateCharCount'),
    tabTranslateClearBtn: document.getElementById('tabTranslateClearBtn'),
    tabDoTranslateBtn: document.getElementById('tabDoTranslateBtn'),
    tabTranslateSpinner: document.getElementById('tabTranslateSpinner'),
    tabTranslatePasteBtn: document.getElementById('tabTranslatePasteBtn'),
    tabCopyTranslationBtn: document.getElementById('tabCopyTranslationBtn'),
    tabSpeakTranslationBtn: document.getElementById('tabSpeakTranslationBtn'),
    tabInsertEditorBtn: document.getElementById('tabInsertEditorBtn'),
    phraseChips: document.querySelectorAll('.phrase-chip'),

    // Dedicated Tab Daily Words
    tabWodDate: document.getElementById('tabWodDate'),
    tabWodCounterBadge: document.getElementById('tabWodCounterBadge'),
    tabWodProgressFill: document.getElementById('tabWodProgressFill'),
    tabWodCardContainer: document.getElementById('tabWodCardContainer'),
    tabWodSkipBtn: document.getElementById('tabWodSkipBtn'),
    tabWodPronounceBtn: document.getElementById('tabWodPronounceBtn'),
    tabWodNextBtn: document.getElementById('tabWodNextBtn'),

    // Dedicated Tab History & Tools
    tabHistoryList: document.getElementById('tabHistoryList'),
    dashboardChecks: document.getElementById('dashboardChecks'),
    dashboardWords: document.getElementById('dashboardWords'),
    dashboardEdits: document.getElementById('dashboardEdits'),
    dashboardScore: document.getElementById('dashboardScore'),
    dashboardCategories: document.getElementById('dashboardCategories'),
    similarityText: document.getElementById('similarityText'),
    similaritySources: document.getElementById('similaritySources'),
    runSimilarityCheckBtn: document.getElementById('runSimilarityCheckBtn'),
    similarityResults: document.getElementById('similarityResults'),
    tabClearHistoryBtn: document.getElementById('tabClearHistoryBtn'),
    tabThemeToggleBtn: document.getElementById('tabThemeToggleBtn'),
    tabOpenApiKeyBtn: document.getElementById('tabOpenApiKeyBtn'),
    tabOpenShortcutsBtn: document.getElementById('tabOpenShortcutsBtn'),

    // Translator Modal (preserved)
    translatorModal: document.getElementById('translatorModal'),
    openTranslatorBtn: document.getElementById('openTranslatorBtn'),
    closeTranslatorBtn: document.getElementById('closeTranslatorBtn'),
    translateFromLang: document.getElementById('translateFromLang'),
    translateToLang: document.getElementById('translateToLang'),
    swapLangBtn: document.getElementById('swapLangBtn'),
    translateInput: document.getElementById('translateInput'),
    translateOutput: document.getElementById('translateOutput'),
    translateCharCount: document.getElementById('translateCharCount'),
    translatePasteBtn: document.getElementById('translatePasteBtn'),
    copyTranslationBtn: document.getElementById('copyTranslationBtn'),
    translateClearBtn: document.getElementById('translateClearBtn'),
    translateBtn: document.getElementById('translateBtn'),
    translateSpinner: document.getElementById('translateSpinner'),

    // Word of the Day Modal (preserved)
    wordOfDayModal: document.getElementById('wordOfDayModal'),
    openWodBtn: document.getElementById('openWodBtn'),
    closeWodBtn: document.getElementById('closeWodBtn'),
    wodDate: document.getElementById('wodDate'),
    wodProgress: document.getElementById('wodProgress'),
    wodProgressFill: document.getElementById('wodProgressFill'),
    wodCards: document.getElementById('wodCards'),
    wodCounter: document.getElementById('wodCounter'),
    wodSkipBtn: document.getElementById('wodSkipBtn'),
    wodNextBtn: document.getElementById('wodNextBtn')
  };

  // --- Initialization ---
  function init() {
    loadSavedSettings();
    setupSpeechRecognition();
    setupEventListeners();
    setupAuthHandlers();
    setupDragAndDrop();
    updateCountersAndAnalytics();
    initializeAuth();
  }

  async function apiFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    const method = (options.method || 'GET').toUpperCase();
    if (state.csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      headers.set('x-csrf-token', state.csrfToken);
    }
    const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
    if (state.authEnabled && response.status === 401 && !String(url).startsWith('/api/auth/')) {
      window.location.reload();
    }
    return response;
  }

  async function authJson(url, body) {
    const response = await apiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }

  function setAuthMessage(message, type = '') {
    els.authStatusMsg.textContent = message;
    els.authStatusMsg.className = `auth-status${type ? ` ${type}` : ''}`;
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    els.authStatusMsg.classList.add('hidden');
    els.authEmail.classList.toggle('hidden', mode === 'mfa' || mode === 'reset');
    els.authPasswordGroup.classList.toggle('hidden', mode === 'mfa');
    els.authCodeGroup.classList.toggle('hidden', mode !== 'mfa');
    els.authRegisterBtn.classList.remove('hidden');
    els.authForgotBtn.classList.toggle('hidden', mode !== 'login');
    els.authResendBtn.classList.toggle('hidden', !['login', 'register'].includes(mode));
    if (mode === 'register') {
      els.authTitle.textContent = 'Create your account';
      els.authMessage.textContent = 'We’ll email you a verification link. Use a password with at least 7 characters.';
      els.authSubmitBtn.textContent = 'Create account';
      els.authRegisterBtn.classList.remove('hidden');
      els.authRegisterBtn.textContent = 'Back to sign in';
      els.authPassword.autocomplete = 'new-password';
      els.authPassword.required = true;
      els.authPassword.minLength = 7;
    } else if (mode === 'mfa') {
      els.authTitle.textContent = 'Authenticator check';
      els.authMessage.textContent = 'Enter the current code from your authenticator app.';
      els.authSubmitBtn.textContent = 'Verify code';
      els.authRegisterBtn.textContent = 'Back to sign in';
      els.authCode.required = true;
      els.authEmail.required = false;
      els.authPassword.required = false;
      els.authCode.focus();
    } else if (mode === 'forgot') {
      els.authTitle.textContent = 'Reset your password';
      els.authMessage.textContent = 'We’ll email a reset link if the account exists.';
      els.authSubmitBtn.textContent = 'Send reset link';
      els.authEmail.classList.remove('hidden');
      els.authEmail.required = true;
      els.authPasswordGroup.classList.add('hidden');
      els.authPassword.required = false;
      els.authCode.required = false;
      els.authRegisterBtn.textContent = 'Back to sign in';
      els.authResendBtn.classList.add('hidden');
      els.authForgotBtn.classList.add('hidden');
    } else if (mode === 'reset') {
      els.authTitle.textContent = 'Choose a new password';
      els.authMessage.textContent = 'Use a password between 7 and 128 characters.';
      els.authSubmitBtn.textContent = 'Save password';
      els.authEmail.required = false;
      els.authPassword.required = true;
      els.authPassword.autocomplete = 'new-password';
      els.authPassword.minLength = 7;
      els.authRegisterBtn.textContent = 'Back to sign in';
      els.authResendBtn.classList.add('hidden');
      els.authForgotBtn.classList.add('hidden');
    } else {
      els.authTitle.textContent = 'Your writing space';
      els.authMessage.textContent = 'Sign in or create an account to continue.';
      els.authSubmitBtn.textContent = 'Sign in';
      els.authEmail.classList.remove('hidden');
      els.authEmail.required = true;
      els.authPasswordGroup.classList.remove('hidden');
      els.authPassword.required = true;
      els.authPassword.autocomplete = 'current-password';
      els.authCode.required = false;
      els.authRegisterBtn.classList.remove('hidden');
      els.authRegisterBtn.textContent = 'Create account';
      els.authForgotBtn.classList.remove('hidden');
      els.authResendBtn.classList.remove('hidden');
    }
  }

  async function refreshAuthStatus() {
    const response = await fetch('/api/auth/status', { credentials: 'same-origin' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not check account status.');
    state.csrfToken = data.csrfToken || '';
    state.authEnabled = Boolean(data.enabled);
    state.authenticated = !state.authEnabled || Boolean(data.authenticated);
    return data;
  }

  async function initializeAuth() {
    try {
      const url = new URL(window.location.href);
      const fragment = new URLSearchParams(url.hash.slice(1));
      const verificationToken = url.searchParams.get('verify') || fragment.get('verify');
      const resetToken = url.searchParams.get('reset') || fragment.get('reset');
      const status = await refreshAuthStatus();
      let verificationMessage = '';
      if (verificationToken && state.authEnabled) {
        const result = await authJson('/api/auth/verify-email', { token: verificationToken });
        verificationMessage = result.message;
        url.searchParams.delete('verify');
        fragment.delete('verify');
        url.hash = fragment.toString();
        history.replaceState(null, '', url);
      } else if (resetToken && state.authEnabled) {
        state.resetToken = resetToken;
        setAuthMode('reset');
        url.searchParams.delete('reset');
        fragment.delete('reset');
        url.hash = fragment.toString();
        history.replaceState(null, '', url);
      }
      if (state.authEnabled) {
        state.legacyApiKey = state.apiKey;
        state.apiKey = '';
        localStorage.removeItem(STORAGE_KEYS.API_KEY);
      }
      if (!state.authenticated) {
        document.body.classList.add('auth-locked');
        els.authGate.classList.remove('hidden');
        if (state.authMode !== 'reset') setAuthMode('login');
        if (verificationMessage) setAuthMessage(verificationMessage, 'success');
        return;
      }
      await unlockApp(status);
    } catch (err) {
      document.body.classList.add('auth-locked');
      els.authGate.classList.remove('hidden');
      setAuthMessage(err.message || 'Account service is unavailable. Try refreshing.', 'error');
    }
  }

  async function unlockApp(status) {
    state.authenticated = true;
    document.body.classList.remove('auth-locked');
    els.authGate.classList.add('hidden');
    els.historyStorageNotice.textContent = state.authEnabled
      ? 'Last 20 corrections saved to your account'
      : 'Last 20 corrections saved in this browser';
    if (state.authEnabled) {
      els.accountMenuBtn.classList.remove('hidden');
      els.accountEmailLabel.textContent = status.user?.email || 'Account';
      els.accountSecurityStatus.textContent = status.user?.mfaEnabled
        ? `Signed in as ${status.user.email}. Authenticator MFA is on.`
        : `Signed in as ${status.user?.email || 'your account'}. Authenticator MFA is optional.`;
      els.mfaSetupBtn.classList.toggle('hidden', Boolean(status.user?.mfaEnabled));
      els.mfaDisablePanel.classList.toggle('hidden', !status.user?.mfaEnabled);
      els.geminiApiKeyInput.value = '';
      const accountResponse = await apiFetch('/api/account');
      if (!accountResponse.ok) throw new Error('Could not load your account settings.');
      const account = await accountResponse.json();
      state.hasSavedApiKey = Boolean(account.hasGeminiKey);
      if (state.legacyApiKey && !account.hasGeminiKey) {
        els.geminiApiKeyInput.value = state.legacyApiKey;
        els.legacyApiKeyNotice.classList.remove('hidden');
      } else {
        state.legacyApiKey = '';
        els.geminiApiKeyInput.placeholder = account.hasGeminiKey ? 'Saved securely to your account' : 'AIzaSy...';
      }
      els.accountSecuritySection.classList.remove('hidden');
      els.sourceEngineBadge.textContent = account.hasGeminiKey ? 'Gemini Pro' : 'Built-in Engine';
      els.mfaSetupBtn.classList.toggle('hidden', Boolean(account.mfaEnabled));
      els.mfaDisablePanel.classList.toggle('hidden', !account.mfaEnabled);
    } else {
      els.accountMenuBtn.classList.add('hidden');
      els.accountSecuritySection.classList.add('hidden');
    }
    await loadHistory();
    checkEngineHealth();
  }

  async function submitAuth(event) {
    event.preventDefault();
    const email = els.authEmail.value.trim();
    const password = els.authPassword.value;
    els.authSubmitBtn.disabled = true;
    try {
      if (state.authMode === 'register') {
        const data = await authJson('/api/auth/register', { email, password });
        setAuthMode('login');
        setAuthMessage(data.message, 'success');
      } else if (state.authMode === 'forgot') {
        const data = await authJson('/api/auth/forgot-password', { email });
        setAuthMessage(data.message, 'success');
      } else if (state.authMode === 'reset') {
        const data = await authJson('/api/auth/reset-password', { token: state.resetToken, password });
        state.resetToken = '';
        setAuthMode('login');
        setAuthMessage(data.message, 'success');
      } else if (state.authMode === 'mfa') {
        await authJson('/api/auth/mfa/login', { challenge: state.mfaChallenge, code: els.authCode.value });
        const status = await refreshAuthStatus();
        await unlockApp(status);
      } else {
        const data = await authJson('/api/auth/login', { email, password });
        if (data.status === 'mfa_required') {
          state.mfaChallenge = data.challenge;
          setAuthMode('mfa');
          return;
        }
        const status = await refreshAuthStatus();
        await unlockApp(status);
      }
    } catch (err) {
      setAuthMessage(err.message || 'Account request failed.', 'error');
    } finally {
      els.authSubmitBtn.disabled = false;
    }
  }

  function setupAuthHandlers() {
    els.authForm.addEventListener('submit', submitAuth);
    els.authRegisterBtn.addEventListener('click', () => {
      setAuthMode(state.authMode === 'login' ? 'register' : 'login');
    });
    els.authForgotBtn.addEventListener('click', () => setAuthMode('forgot'));
    els.authResendBtn.addEventListener('click', async () => {
      try {
        const data = await authJson('/api/auth/resend-verification', { email: els.authEmail.value.trim() });
        setAuthMessage(data.message, 'success');
      } catch (err) {
        setAuthMessage(err.message, 'error');
      }
    });
    els.accountMenuBtn.addEventListener('click', async () => {
      try {
        await authJson('/api/auth/logout');
        window.location.reload();
      } catch (err) {
        showAlert(err.message || 'Could not sign out.', 'error');
      }
    });
    els.mfaSetupBtn.addEventListener('click', async () => {
      try {
        const setup = await authJson('/api/account/mfa/setup');
        els.mfaQrCode.src = setup.qrCode;
        els.mfaSecret.textContent = setup.secret;
        els.mfaSetupPanel.classList.remove('hidden');
      } catch (err) {
        els.mfaStatusMsg.textContent = err.message;
        els.mfaStatusMsg.className = 'auth-status error';
      }
    });
    els.mfaEnableBtn.addEventListener('click', async () => {
      try {
        const result = await authJson('/api/account/mfa/enable', { code: els.mfaEnableCode.value });
        els.mfaSetupPanel.classList.add('hidden');
        els.mfaRecoveryCodes.textContent = result.recoveryCodes.join('\n');
        els.mfaRecoveryPanel.classList.remove('hidden');
        els.mfaSetupBtn.classList.add('hidden');
        els.mfaDisablePanel.classList.remove('hidden');
        els.accountSecurityStatus.textContent = 'Authenticator MFA is on.';
        els.mfaStatusMsg.textContent = 'Authenticator MFA enabled.';
        els.mfaStatusMsg.className = 'auth-status success';
      } catch (err) {
        els.mfaStatusMsg.textContent = err.message;
        els.mfaStatusMsg.className = 'auth-status error';
      }
    });
    els.copyMfaRecoveryCodesBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(els.mfaRecoveryCodes.textContent);
        showToast('Recovery codes copied.');
      } catch {
        els.mfaStatusMsg.textContent = 'Could not copy the codes. Select and copy them manually.';
        els.mfaStatusMsg.className = 'auth-status error';
      }
    });
    els.mfaDisableBtn.addEventListener('click', async () => {
      try {
        await authJson('/api/account/mfa/disable', {
          password: els.mfaDisablePassword.value,
          code: els.mfaDisableCode.value
        });
        els.mfaDisablePanel.classList.add('hidden');
        els.mfaSetupBtn.classList.remove('hidden');
        els.accountSecurityStatus.textContent = 'Authenticator MFA is off.';
        els.mfaStatusMsg.textContent = 'Authenticator MFA disabled.';
        els.mfaStatusMsg.className = 'auth-status success';
      } catch (err) {
        els.mfaStatusMsg.textContent = err.message;
        els.mfaStatusMsg.className = 'auth-status error';
      }
    });
  }

  // --- Settings & LocalStorage ---
  function loadSavedSettings() {
    // Theme
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
    if (savedTheme === 'light') {
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
    }

    // AI Language
    const savedAiLang = localStorage.getItem(STORAGE_KEYS.AI_LANG);
    if (savedAiLang && els.aiLanguageSelect.querySelector(`option[value="${savedAiLang}"]`)) {
      els.aiLanguageSelect.value = savedAiLang;
      state.aiLanguage = savedAiLang;
    }

    // Voice Language
    const savedVoiceLang = localStorage.getItem(STORAGE_KEYS.VOICE_LANG);
    if (savedVoiceLang && els.voiceLanguageSelect.querySelector(`option[value="${savedVoiceLang}"]`)) {
      els.voiceLanguageSelect.value = savedVoiceLang;
      state.voiceLanguage = savedVoiceLang;
    }

    // API Key
    if (state.apiKey) {
      els.geminiApiKeyInput.value = state.apiKey;
      els.sourceEngineBadge.textContent = 'Gemini Pro';
      els.sourceEngineBadge.style.color = '#38bdf8';
    }
  }

  // --- Speech Recognition & Audio Visualizer ---
  function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('SpeechRecognition is not supported in this browser.');
      return;
    }

    try {
      state.recognition = new SpeechRecognition();
      state.recognition.continuous = true;
      state.recognition.interimResults = true;
      state.recognition.maxAlternatives = 1;

      state.recognition.onstart = function () {
        state.isListening = true;
        state.isTranscribingVoice = false;
        els.micBtn.classList.add('recording');
        updateVoiceButtonState();
        els.voiceStatusBanner.classList.remove('hidden');
        els.voiceStatusText.textContent = `Listening (${state.voiceLanguage})... speech appears as you speak. Tap Stop when done.`;
        state.audioCapturePromise = startAudioVisualizer();
      };

      state.recognition.onresult = function (event) {
        const finalSegments = [];
        const interimSegments = [];
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          const alternative = result[0];
          const segment = alternative.transcript.trim();
          if (!segment) continue;

          if (result.isFinal) {
            if (Number.isFinite(alternative.confidence) &&
                alternative.confidence > 0 &&
                alternative.confidence < 0.35) continue;
            finalSegments.push(segment);
          } else {
            interimSegments.push(segment);
          }
        }

        state.voiceTranscript = joinVoiceSegments(finalSegments);
        renderVoiceTranscript(joinVoiceSegments([...finalSegments, ...interimSegments]));
      };

      state.recognition.onerror = function (event) {
        console.error('Speech recognition error:', event.error);

        if (event.error === 'not-allowed') {
          stopListening();
          showAlert('Microphone permission denied. Please enable it in your browser.', 'error');
        } else if (event.error === 'no-speech') {
          stopListening();
        } else if (event.error === 'network') {
          if (state.voiceTranscript) {
            stopListening();
          } else {
            void transcribeVoiceCapture();
          }
        } else {
          stopListening();
          showAlert(`Voice input error: ${event.error}`, 'error');
        }
      };

      state.recognition.onend = function () {
        if (!state.isTranscribingVoice) stopListening();
      };
    } catch (e) {
      console.error('Error initializing speech recognition:', e);
    }
  }

  function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition || !state.recognition) {
      showAlert('Voice input is not supported in this browser.', 'error');
      return;
    }

    try {
      state.audioCapturePromise = null;
      state.audioChunks = [];
      state.voiceTranscript = '';
      state.voiceBaseText = els.inputText.value;
      state.recognition.lang = state.voiceLanguage || 'en-IN';
      state.recognition.start();
    } catch (err) {
      try {
        state.recognition.stop();
        setTimeout(() => state.recognition.start(), 200);
      } catch (e) {
        console.error('Failed to start speech recognition:', e);
      }
    }
  }

  function stopListening() {
    renderVoiceTranscript(state.voiceTranscript);
    state.isListening = false;
    state.isTranscribingVoice = false;
    els.micBtn.classList.remove('recording');
    updateVoiceButtonState();
    els.voiceStatusBanner.classList.add('hidden');
    stopAudioRecording(true);
    stopAudioVisualizer();
    if (state.recognition) {
      try { state.recognition.stop(); } catch (e) {}
    }
  }

  function updateVoiceButtonState() {
    const listening = state.isListening || state.isTranscribingVoice;
    if (els.bottomNavVoiceBtn) {
      els.bottomNavVoiceBtn.classList.toggle('recording', listening);
      els.bottomNavVoiceBtn.setAttribute('aria-pressed', String(listening));
      els.bottomNavVoiceBtn.setAttribute('aria-label', listening ? 'Stop voice input' : 'Start voice input');
      els.bottomNavVoiceBtn.title = listening ? 'Stop voice input' : 'Voice input';
    }
  }

  function toggleVoiceInput() {
    if (state.isTranscribingVoice) return;
    if (state.isListening) {
      stopListening();
    } else {
      startListening();
    }
  }

  // Audio Canvas Visualizer
  async function startAudioVisualizer() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (!state.isListening) {
        stream.getTracks().forEach(track => track.stop());
        return null;
      }

      state.microphoneStream = stream;
      state.audioChunks = [];
      if (window.MediaRecorder) {
        const recorderOptions = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
        const mimeType = recorderOptions.find(type => MediaRecorder.isTypeSupported(type));
        state.mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        state.mediaRecorder.addEventListener('dataavailable', event => {
          if (event.data.size > 0) state.audioChunks.push(event.data);
        });
        state.mediaRecorder.start(1000);
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return stream;

      state.audioContext = new AudioCtx();
      const source = state.audioContext.createMediaStreamSource(stream);
      state.analyser = state.audioContext.createAnalyser();
      state.analyser.fftSize = 64;
      source.connect(state.analyser);

      const canvas = els.voiceCanvas;
      if (!canvas) return stream;
      const ctx = canvas.getContext('2d');
      const bufferLength = state.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      function draw() {
        state.animFrameId = requestAnimationFrame(draw);
        state.analyser.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = (canvas.width / bufferLength) * 1.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height;
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
          x += barWidth;
        }
      }

      draw();
      return stream;
    } catch (err) {
      console.warn('Microphone stream for voice capture unavailable:', err.message);
      return null;
    }
  }

  function joinVoiceSegments(segments) {
    return segments.reduce((transcript, segment) => {
      if (!transcript) return segment;
      return `${transcript}${/^[,.;!?]/.test(segment) ? '' : ' '}${segment}`;
    }, '');
  }

  function renderVoiceTranscript(transcript) {
    const base = state.voiceBaseText;
    const separator = base && transcript && !/\s$/.test(base) ? ' ' : '';
    els.inputText.value = transcript ? `${base}${separator}${transcript}` : base;
    updateCountersAndAnalytics();
  }

  function transcribeVoiceCapture() {
    if (state.isTranscribingVoice) return;
    state.isTranscribingVoice = true;
    updateVoiceButtonState();
    els.voiceStatusBanner.classList.remove('hidden');
    els.voiceStatusText.textContent = 'Speech service unavailable. Sending audio to Gemini...';
    void transcribeVoiceCaptureAsync();
  }

  async function transcribeVoiceCaptureAsync() {
    try {
      await state.audioCapturePromise;
      renderVoiceTranscript('');
      const audioBlob = await stopAudioRecording(false);
      if (!audioBlob || audioBlob.size === 0) {
        throw new Error('No audio was captured. Check microphone access and try again.');
      }
      if (audioBlob.size > 7 * 1024 * 1024) {
        throw new Error('Voice clip is too large. Stop sooner and try again.');
      }

      const bytes = new Uint8Array(await audioBlob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      const headers = { 'Content-Type': 'application/json' };
      if (state.apiKey) headers['x-api-key'] = state.apiKey;

      const response = await apiFetch('/api/transcribe', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          audio: btoa(binary),
          mimeType: audioBlob.type || 'audio/webm',
          language: state.voiceLanguage
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Gemini could not transcribe this clip.');
      const transcript = typeof result.transcript === 'string' ? result.transcript.trim() : '';
      if (!transcript) throw new Error('No speech was detected. Please try again.');

      state.voiceTranscript = transcript;
      renderVoiceTranscript(transcript);
      showToast('Voice transcript inserted!');
    } catch (err) {
      console.error('Voice transcription fallback failed:', err);
      renderVoiceTranscript(state.voiceTranscript);
      showAlert(err.message || 'Voice transcription failed. Please try again.', 'error');
    } finally {
      state.audioChunks = [];
      state.isTranscribingVoice = false;
      stopListening();
    }
  }

  function stopAudioRecording(discard) {
    const recorder = state.mediaRecorder;
    if (!recorder) {
      if (discard) state.audioChunks = [];
      return Promise.resolve(null);
    }

    if (recorder.state === 'inactive') {
      state.mediaRecorder = null;
      const blob = new Blob(state.audioChunks, { type: recorder.mimeType || 'audio/webm' });
      if (discard) state.audioChunks = [];
      return Promise.resolve(discard ? null : blob);
    }

    return new Promise(resolve => {
      recorder.addEventListener('stop', () => {
        state.mediaRecorder = null;
        const blob = new Blob(state.audioChunks, { type: recorder.mimeType || 'audio/webm' });
        if (discard) state.audioChunks = [];
        resolve(discard ? null : blob);
      }, { once: true });
      recorder.stop();
    });
  }

  function stopAudioVisualizer() {
    if (state.animFrameId) {
      cancelAnimationFrame(state.animFrameId);
      state.animFrameId = null;
    }
    if (state.microphoneStream) {
      state.microphoneStream.getTracks().forEach(track => track.stop());
      state.microphoneStream = null;
    }
    if (state.audioContext) {
      state.audioContext.close();
      state.audioContext = null;
    }
  }

  // --- Drag and Drop File Upload ---
  function setupDragAndDrop() {
    const dropZone = els.dropZone;

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        readFileIntoEditor(files[0]);
      }
    });

    els.uploadDocBtn.addEventListener('click', () => {
      els.fileUploadInput.click();
    });

    els.fileUploadInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        readFileIntoEditor(e.target.files[0]);
      }
    });
  }

  async function readFileIntoEditor(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    const supportedExtensions = ['txt', 'md', 'text', 'pdf', 'docx', 'pptx'];
    if (!supportedExtensions.includes(extension)) {
      showAlert('Supported files: TXT, PDF, Word (.docx), PowerPoint (.pptx), Markdown. Save older .doc/.ppt files in a newer format.', 'error');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      showAlert('Files must be 25 MB or smaller.', 'error');
      return;
    }

    try {
      let text;
      let pageCount = 0;
      if (['txt', 'md', 'text'].includes(extension)) {
        text = await file.text();
      } else if (extension === 'pdf') {
        const pdfText = await extractPdfText(file);
        text = pdfText.text;
        pageCount = pdfText.pageCount;
      } else if (extension === 'docx') {
        text = await extractDocxText(file);
      } else {
        text = await extractPptxText(file);
      }

      text = text.replace(/\r\n?/g, '\n').trim();
      if (!text) {
        throw new Error('No text was found. Scanned PDFs need OCR before they can be imported.');
      }
      els.inputText.value = text;
      updateCountersAndAnalytics();
      const wordCount = (text.match(/\S+/g) || []).length;
      const details = pageCount ? `${pageCount} pages • ${wordCount} words` : `${wordCount} words`;
      showToast(`Imported ${file.name} • ${details}`);
    } catch (err) {
      console.error(`Could not import ${file.name}:`, err);
      showAlert(err.message || `Could not read ${file.name}. Check that the file is valid and try again.`, 'error');
    } finally {
      els.fileUploadInput.value = '';
    }
  }

  async function extractPdfText(file) {
    const pdfjs = await import('/vendor/pdfjs/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.mjs';
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => 'str' in item ? item.str : '').filter(Boolean).join(' '));
    }
    return { text: pages.join('\n\n'), pageCount: pdf.numPages };
  }

  async function extractDocxText(file) {
    if (!window.mammoth) throw new Error('Word document support could not be loaded. Refresh and try again.');
    await validateOfficeArchive(file);
    const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value;
  }

  async function validateOfficeArchive(file) {
    if (!window.JSZip) throw new Error('Office document support could not be loaded. Refresh and try again.');
    const zip = await window.JSZip.loadAsync(file);
    const entries = Object.values(zip.files);
    const expandedSize = entries.reduce((total, entry) => {
      return total + (entry._data ? entry._data.uncompressedSize : 0);
    }, 0);
    if (entries.length > 2000 || expandedSize > 100 * 1024 * 1024) {
      throw new Error('This Office file expands beyond the supported size. Try a smaller document.');
    }
    return zip;
  }

  async function extractPptxText(file) {
    if (!window.JSZip) throw new Error('PowerPoint document support could not be loaded. Refresh and try again.');
    const zip = await validateOfficeArchive(file);
    const slides = Object.keys(zip.files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => {
        const first = Number(a.match(/slide(\d+)\.xml/i)[1]);
        const second = Number(b.match(/slide(\d+)\.xml/i)[1]);
        return first - second;
      });
    if (!slides.length) throw new Error('No presentation slides were found in this PowerPoint file.');

    const parser = new DOMParser();
    const slideTexts = [];
    for (const slidePath of slides) {
      const xml = await zip.file(slidePath).async('string');
      const document = parser.parseFromString(xml, 'application/xml');
      if (document.querySelector('parsererror')) {
        throw new Error('The PowerPoint file contains an unreadable slide.');
      }
      const paragraphs = [...document.getElementsByTagName('a:p')].map(paragraph =>
        [...paragraph.getElementsByTagName('a:t')].map(run => run.textContent || '').join('')
      ).filter(Boolean);
      slideTexts.push(paragraphs.join('\n'));
    }
    return slideTexts.join('\n\n');
  }

  // --- Grammar Category Badge ───────────────────────────────────────────────
  // Detects the type of error from the reason text and returns a badge label + CSS class
  function getGrammarCategory(reason) {
    const r = reason.toLowerCase();
    if (r.includes('contraction') || r.includes('apostrophe')) return { label: 'Contraction', cls: 'cat-contraction' };
    if (r.includes('homophone') || r.includes('there') || r.includes('their') || r.includes('your') || r.includes("you're") || r.includes('too/two') || r.includes("it's")) return { label: 'Homophone', cls: 'cat-homophone' };
    if (r.includes('modal') || r.includes('should have') || r.includes('could have') || r.includes('would have')) return { label: 'Modal Verb', cls: 'cat-modal' };
    if (r.includes('agreement') || r.includes('subject-verb') || r.includes('plural') || r.includes('singular') || r.includes('third-person') || r.includes('requires')) return { label: 'Agreement', cls: 'cat-agreement' };
    if (r.includes('article') || r.includes('"an"') || r.includes('"a"') || r.includes('vowel sound')) return { label: 'Article', cls: 'cat-article' };
    if (r.includes('double negative')) return { label: 'Double Neg', cls: 'cat-double-neg' };
    if (r.includes('spelling') || r.includes('typo') || r.includes('misspelling')) return { label: 'Spelling', cls: 'cat-spelling' };
    if (r.includes('punctuation') || r.includes('comma') || r.includes('period') || r.includes('space before') || r.includes('capitalise') || r.includes('capitalize')) return { label: 'Punctuation', cls: 'cat-punctuation' };
    if (r.includes('simplified') || r.includes('plain') || r.includes('plain english')) return { label: 'Simplify', cls: 'cat-other' };
    if (r.includes('professional') || r.includes('enhanced') || r.includes('refined')) return { label: 'Style', cls: 'cat-other' };
    return { label: 'Grammar', cls: 'cat-other' };
  }

  // --- Readability & Analytics ---
  function countSyllables(word) {
    word = word.toLowerCase().trim();
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]|ed|es|e)$/, '');
    word = word.replace(/^y/, '');
    const syllables = word.match(/[aeiouy]{1,2}/g);
    return syllables ? syllables.length : 1;
  }

  function calculateFleschScore(totalWords, totalSentences, totalSyllables) {
    if (totalWords === 0 || totalSentences === 0) return 100;
    const score = 206.835 - 1.015 * (totalWords / totalSentences) - 84.6 * (totalSyllables / totalWords);
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function updateCountersAndAnalytics() {
    const text = els.inputText.value;
    const chars = text.length;

    // Word & sentence tokens
    const wordsArray = text.trim() ? text.trim().split(/\s+/) : [];
    const words = wordsArray.length;
    const sentences = text.trim() ? text.split(/[.!?।]+/).filter(s => s.trim().length > 0).length : 0;
    const longSentences = text.split(/[.!?।]+/)
      .map(sentence => sentence.trim())
      .map(sentence => ({ sentence, words: (sentence.match(/\S+/g) || []).length }))
      .filter(item => item.words > 25)
      .slice(0, 2);

    els.charCount.textContent = chars;
    els.wordCount.textContent = words;
    els.sentenceCount.textContent = sentences;
    if (els.longSentenceNotice) {
      els.longSentenceNotice.classList.toggle('hidden', longSentences.length === 0);
      els.longSentenceNotice.textContent = longSentences.length
        ? `Long sentence${longSentences.length > 1 ? 's' : ''} to review: ${longSentences.map(item => `${item.words} words`).join(', ')}. Try splitting for easier reading.`
        : '';
    }

    if (words === 0) {
      updateWritingInsights('');
      els.readabilityScore.textContent = '--';
      els.readingTime.textContent = '0s';
      els.gradeLevel.textContent = 'Standard';
      return;
    }

    updateWritingInsights(text);

    // Reading time (average 200 words per minute)
    const seconds = Math.round((words / 200) * 60);
    els.readingTime.textContent = seconds < 60 ? `${Math.max(1, seconds)}s` : `${Math.ceil(seconds / 60)}m`;

    // Flesch Reading Ease
    let syllables = 0;
    wordsArray.forEach(w => syllables += countSyllables(w));
    const score = calculateFleschScore(words, Math.max(1, sentences), syllables);

    els.readabilityScore.textContent = `${score}/100`;

    if (score >= 80) {
      els.gradeLevel.textContent = 'Easy to read';
      els.readabilityScore.style.color = '#10b981';
    } else if (score >= 60) {
      els.gradeLevel.textContent = 'Standard';
      els.readabilityScore.style.color = '#38bdf8';
    } else if (score >= 40) {
      els.gradeLevel.textContent = 'Advanced';
      els.readabilityScore.style.color = '#f59e0b';
    } else {
      els.gradeLevel.textContent = 'Academic / Dense';
      els.readabilityScore.style.color = '#ef4444';
    }
  }

  function updateWritingInsights(text) {
    const panel = document.getElementById('writingInsights');
    const list = document.getElementById('writingInsightList');
    if (!panel || !list) return;
    const insights = [];
    const words = (text.toLowerCase().match(/[a-z']+/g) || []);
    const ignored = new Set(['that', 'this', 'with', 'from', 'have', 'were', 'there', 'their', 'your', 'will', 'would', 'about', 'they', 'them', 'then', 'when', 'what', 'which', 'into', 'because', 'just', 'also', 'some', 'more', 'very']);
    const frequencies = new Map();
    words.forEach(word => { if (word.length > 3 && !ignored.has(word)) frequencies.set(word, (frequencies.get(word) || 0) + 1); });
    [...frequencies.entries()].filter(([, count]) => count >= 3).slice(0, 3).forEach(([word, count]) => insights.push(`${word} appears ${count} times; consider varying it.`));
    const fillers = [...new Set(words.filter(word => ['actually', 'basically', 'really', 'very', 'literally', 'just'].includes(word)))];
    if (fillers.length) insights.push(`Possible filler words: ${fillers.join(', ')}.`);
    const passive = text.match(/\b(?:am|is|are|was|were|be|been|being)\s+(?:\w+ed|known|made|built|written|taken|given|seen|found|done)\b/gi) || [];
    if (passive.length) insights.push(`Possible passive voice (${passive.length}); use an active subject when it improves clarity.`);
    const inclusivePairs = [[/\bmankind\b/gi, 'humanity'], [/\bchairman\b/gi, 'chair or chairperson'], [/\bman-made\b/gi, 'artificial or human-made'], [/\bhe\/she\b/gi, 'they']];
    inclusivePairs.forEach(([pattern, replacement]) => { if (pattern.test(text)) insights.push(`Consider inclusive wording: “${replacement}”.`); });
    list.replaceChildren();
    insights.forEach(message => { const item = document.createElement('p'); item.textContent = `• ${message}`; list.appendChild(item); });
    panel.classList.toggle('hidden', insights.length === 0);
  }

  // --- Mode Handling ---
  function setMode(newMode) {
    state.mode = newMode;

    els.modeTabs.forEach(tab => {
      const isCurrent = tab.dataset.mode === newMode;
      tab.classList.toggle('active', isCurrent);
      tab.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
    });

    if (newMode === 'grammar') {
      els.submitBtnLabel.textContent = 'Check';
      els.activeModeBadge.textContent = 'Grammar';
      els.submitBtn.querySelector('.btn-icon').textContent = '⚡';
    } else if (newMode === 'improve') {
      els.submitBtnLabel.textContent = 'Improve';
      els.activeModeBadge.textContent = 'Improve';
      els.submitBtn.querySelector('.btn-icon').textContent = '✨';
    } else if (newMode === 'simple') {
      els.submitBtnLabel.textContent = 'Simple';
      els.activeModeBadge.textContent = 'Simple English';
      els.submitBtn.querySelector('.btn-icon').textContent = '💡';
    }
  }

  // --- API Execution ---
  async function executeCheck() {
    const text = els.inputText.value.trim();
    if (!text) {
      showAlert('Please enter or speak a sentence first.');
      els.inputText.focus();
      return;
    }

    setLoading(true);

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (state.apiKey) {
        headers['x-api-key'] = state.apiKey;
      }

      const payload = {
        text: text,
        language: state.aiLanguage,
        mode: state.mode,
        tone: state.tone,
        writingContext: document.getElementById('writingContext')?.value || 'general'
      };

      const res = await apiFetch('/api/check', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with status ${res.status}`);
      }

      const data = await res.json();
      state.lastResult = data;
      renderResults(data);
      saveToHistory(data);
      showToast('Sentence analyzed successfully!');
      // On mobile or tabbed mode, automatically show the Results tab
      if (window.innerWidth <= 900 || state.activeAppTab !== 'split') {
        switchAppTab('results');
      }
    } catch (err) {
      console.error('Grammar check failed:', err);
      showAlert(`Analysis failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function runWritingTool(task, style) {
    const text = els.inputText.value.trim();
    if (!text) {
      showAlert('Enter text in the editor first.', 'warning');
      els.inputText.focus();
      return;
    }

    const buttons = [els.completeTextBtn, els.summarizeTextBtn, els.rewriteTextBtn];
    buttons.forEach(button => { button.disabled = true; });
    els.writingToolResult.classList.remove('hidden');
    els.writingToolOutput.textContent = 'Working…';

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (state.apiKey) headers['x-api-key'] = state.apiKey;
      const response = await apiFetch('/api/writing-tools', {
        method: 'POST',
        headers,
        body: JSON.stringify({ task, text, style })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Writing tool failed (${response.status}).`);
      if (typeof result.output !== 'string' || !result.output.trim()) {
        throw new Error('The writing tool returned no text.');
      }
      els.writingToolOutput.textContent = result.output.trim();
      els.writingToolResult.dataset.output = result.output.trim();
    } catch (err) {
      console.error('Writing tool failed:', err);
      els.writingToolOutput.textContent = '';
      els.writingToolResult.classList.add('hidden');
      showAlert(err.message || 'Writing tool failed. Please try again.', 'error');
    } finally {
      buttons.forEach(button => { button.disabled = false; });
    }
  }

  async function compareReferenceTexts() {
    const text = (els.similarityText.value || els.inputText.value).trim();
    const sourceTexts = els.similaritySources.value
      .split(/^\s*---\s*$/m)
      .map(value => value.trim())
      .filter(Boolean);
    if (!text || sourceTexts.length === 0) {
      showAlert('Enter your text and at least one reference text.', 'warning');
      return;
    }

    els.runSimilarityCheckBtn.disabled = true;
    els.similarityResults.classList.remove('hidden');
    els.similarityResults.textContent = 'Comparing supplied text…';
    try {
      const response = await apiFetch('/api/similarity-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          sources: sourceTexts.map((source, index) => ({ label: `Source ${index + 1}`, text: source }))
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Comparison failed (${response.status}).`);

      els.similarityResults.innerHTML = '';
      result.sources.forEach(source => {
        const card = document.createElement('div');
        card.className = 'similarity-result-item';
        const heading = document.createElement('strong');
        heading.textContent = `${source.label}: ${source.similarityPercent}% exact phrase overlap`;
        const details = document.createElement('p');
        details.textContent = source.matchedPhrases.length
          ? `Matching phrases: ${source.matchedPhrases.join(' • ')}`
          : 'No matching phrases found at this phrase length.';
        card.append(heading, details);
        els.similarityResults.appendChild(card);
      });
      const note = document.createElement('p');
      note.className = 'similarity-disclaimer';
      note.textContent = 'This compares only the reference text you supplied. It is not an internet search or a plagiarism verdict.';
      els.similarityResults.appendChild(note);
    } catch (err) {
      console.error('Reference comparison failed:', err);
      els.similarityResults.textContent = err.message || 'Comparison failed.';
      showAlert(err.message || 'Comparison failed.', 'error');
    } finally {
      els.runSimilarityCheckBtn.disabled = false;
    }
  }

  async function shareCorrectedText() {
    if (!state.lastResult || !state.lastResult.corrected) {
      showAlert('Run a check before sharing corrected text.', 'warning');
      return;
    }
    const shareData = {
      title: 'Corrected with VerbaAI',
      text: state.lastResult.corrected
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('Native sharing unavailable:', err);
      }
    }
    copyTextToClipboard(shareData.text, 'Corrected text copied; you can share it from your clipboard.');
  }

  function setLoading(isLoading) {
    els.submitBtn.disabled = isLoading;
    if (isLoading) {
      els.submitSpinner.classList.remove('hidden');
      els.submitBtnLabel.textContent = 'Analyzing...';
      els.systemStatusText.textContent = 'Processing...';
    } else {
      els.submitSpinner.classList.add('hidden');
      setMode(state.mode);
      els.systemStatusText.textContent = 'Engine ready';
    }
  }

  function updateResultsBadge(count) {
    const label = count > 0 ? count.toString() : '✓';
    if (els.topNavResultsBadge) {
      els.topNavResultsBadge.textContent = label;
      els.topNavResultsBadge.classList.remove('hidden');
    }
    if (els.bNavResultsBadge) {
      els.bNavResultsBadge.textContent = label;
      els.bNavResultsBadge.classList.remove('hidden');
    }
  }

  // --- Render Results ---
  function renderResults(data) {
    els.resultsEmptyState.classList.add('hidden');
    els.resultsContent.classList.remove('hidden');

    // Engine badge
    if (data.source === 'gemini') {
      els.sourceEngineBadge.textContent = 'Gemini Pro';
      els.sourceEngineBadge.style.color = '#38bdf8';
    } else {
      els.sourceEngineBadge.textContent = 'Built-in Engine';
      els.sourceEngineBadge.style.color = '#10b981';
    }

    // Metrics update
    if (data.metrics) {
      if (els.formalityScore) els.formalityScore.textContent = `${data.metrics.formality}%`;
      if (els.detectedTone) els.detectedTone.textContent = data.metrics.tone || 'Balanced';
    }

    // 1. Corrected Sentence
    els.correctedTextDisplay.textContent = data.corrected;

    // Diff updates
    updateDiffViews(data.original, data.corrected);

    // 2. Interactive Changes List
    if (data.processedSections) {
      els.changesCountBadge.textContent = 'Full document';
      els.acceptAllChangesBtn.classList.add('hidden');
      els.changesList.innerHTML = `<div class="changes-none">The full document was processed in ${Number(data.processedSections)} sections. Individual change annotations are not shown for long documents.</div>`;
    } else {
      renderChangesList(data.changes || []);
    }

    // 3. Explanation
    els.explanationText.textContent = data.explanation || 'Your sentence is correct.';

    // 4. Better Version(s) — Render 2-3 alternatives
    let bvs = [];
    if (Array.isArray(data.betterVersions) && data.betterVersions.length > 0) {
      bvs = data.betterVersions;
    } else if (data.betterVersion && data.betterVersion.trim()) {
      bvs = [data.betterVersion];
    }

    if (bvs.length > 0) {
      els.betterVersionCard.classList.remove('hidden');
      renderBetterVersions(bvs);
      els.betterVersionText.textContent = bvs[0];
    } else {
      els.betterVersionCard.classList.add('hidden');
    }

    // 5. Raw Output Verbatim Contract
    els.rawOutputBlock.textContent = data.rawOutput || JSON.stringify(data, null, 2);

    // Update notification badges on Results tabs
    const changesCount = (data.changes && data.changes.length) || 0;
    updateResultsBadge(changesCount);
  }

  // --- Render Interactive Changes List with Category Filtering ---
  function renderChangesList(changes) {
    els.changesList.innerHTML = '';
    const isClean = changes.length === 0 || (changes.length === 1 && changes[0].text && changes[0].text.toLowerCase() === 'none');

    if (isClean) {
      els.changesCountBadge.textContent = '0 modifications';
      els.acceptAllChangesBtn.classList.add('hidden');
      els.changesList.innerHTML = `
        <div class="changes-none">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          No mistakes found. Your sentence is already correct!
        </div>
      `;
      return;
    }

    // Filter changes if filter active
    let filteredChanges = changes;
    if (state.activeChangeFilter === 'grammar') {
      filteredChanges = changes.filter(c => {
        const cat = getGrammarCategory(c.reason || '').label.toLowerCase();
        return ['grammar', 'agreement', 'modal verb', 'contraction', 'double neg'].includes(cat);
      });
    } else if (state.activeChangeFilter === 'spelling') {
      filteredChanges = changes.filter(c => {
        const cat = getGrammarCategory(c.reason || '').label.toLowerCase();
        return ['spelling', 'homophone'].includes(cat);
      });
    } else if (state.activeChangeFilter === 'style') {
      filteredChanges = changes.filter(c => {
        const cat = getGrammarCategory(c.reason || '').label.toLowerCase();
        return ['style', 'simplify', 'article', 'punctuation'].includes(cat);
      });
    }

    els.changesCountBadge.textContent = `${changes.length} change${changes.length > 1 ? 's' : ''}`;
    els.acceptAllChangesBtn.classList.remove('hidden');

    if (filteredChanges.length === 0) {
      els.changesList.innerHTML = `<div class="changes-none">No changes under "${state.activeChangeFilter}" filter.</div>`;
      return;
    }

    filteredChanges.forEach((c) => {
      const item = document.createElement('div');
      item.className = 'change-item';

      const content = document.createElement('div');
      content.className = 'change-content';

      if (c.original && c.corrected) {
        const { label, cls } = getGrammarCategory(c.reason || '');
        content.innerHTML = `
          <div class="change-transition">
            <span class="change-from">${escapeHtml(c.original)}</span>
            <span class="change-arrow">→</span>
            <span class="change-to">${escapeHtml(c.corrected)}</span>
            <span class="change-category ${cls}">${label}</span>
          </div>
          ${c.reason ? `<div class="change-reason">${escapeHtml(c.reason)}</div>` : ''}
        `;

        const applyBtn = document.createElement('button');
        applyBtn.className = 'btn-apply-change';
        applyBtn.textContent = 'Apply';
        applyBtn.title = `Apply "${c.corrected}" in editor`;
        applyBtn.addEventListener('click', () => {
          applySingleChange(c.original, c.corrected, applyBtn);
        });

        item.appendChild(content);
        item.appendChild(applyBtn);
      } else {
        content.innerHTML = `
          <div class="change-transition">
            <span class="change-to">${escapeHtml(c.text || '')}</span>
          </div>
        `;
        item.appendChild(content);
      }

      els.changesList.appendChild(item);
    });
  }

  // --- Render Better Versions (2-3 Alternatives) ---
  const STYLE_LABELS = [
    { label: 'Option 1: Polished & Natural', tag: 'Polished', cls: 'badge-bv-polished' },
    { label: 'Option 2: Concise & Direct', tag: 'Concise', cls: 'badge-bv-concise' },
    { label: 'Option 3: Professional & Formal', tag: 'Formal', cls: 'badge-bv-formal' }
  ];

  function renderBetterVersions(versions) {
    if (!els.betterVersionsList) return;
    els.betterVersionsList.innerHTML = '';

    versions.slice(0, 3).forEach((ver, index) => {
      const meta = STYLE_LABELS[index] || { label: `Option ${index + 1}`, tag: `Option ${index + 1}`, cls: 'badge-bv-polished' };
      const item = document.createElement('div');
      item.className = 'better-version-item';

      item.innerHTML = `
        <div class="better-version-header">
          <span class="better-version-badge ${meta.cls}">${meta.label}</span>
          <div class="better-version-actions">
            <button class="bv-btn-listen card-action-btn" title="Listen to this version">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
              Listen
            </button>
            <button class="bv-btn-copy card-action-btn" title="Copy this version">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy
            </button>
            <button class="bv-btn-use card-action-btn highlight" title="Replace editor text with this version">
              ✓ Use This
            </button>
          </div>
        </div>
        <p class="better-version-sentence">${escapeHtml(ver)}</p>
      `;

      item.querySelector('.bv-btn-listen').addEventListener('click', () => speakSentence(ver));
      item.querySelector('.bv-btn-copy').addEventListener('click', () => copyTextToClipboard(ver, `Copied ${meta.tag} version!`));
      item.querySelector('.bv-btn-use').addEventListener('click', () => replaceOriginalWithCorrected(ver));

      els.betterVersionsList.appendChild(item);
    });
  }

  // --- Interactive Single Change Application ---
  function applySingleChange(orig, corr, btn) {
    const current = els.inputText.value;
    if (current.includes(orig)) {
      state.undoStack.push(current);
      els.inputText.value = current.replace(orig, corr);
      els.undoBtn.disabled = false;
      updateCountersAndAnalytics();
      btn.textContent = '✓ Applied';
      btn.classList.add('applied');
      showToast(`Applied: ${orig} → ${corr}`);
    } else {
      showToast(`Original phrase "${orig}" not found in editor.`);
    }
  }

  function applyAllChanges() {
    if (!state.lastResult || !state.lastResult.changes) return;
    replaceOriginalWithCorrected(state.lastResult.corrected);
    document.querySelectorAll('.btn-apply-change').forEach(b => {
      b.textContent = '✓ Applied';
      b.classList.add('applied');
    });
  }

  // --- Visual Diff Views ---
  function updateDiffViews(original, corrected) {
    if (!original || !corrected) return;

    // Inline Diff
    if (original.trim() === corrected.trim()) {
      els.visualDiffContainer.innerHTML = `<span style="color: var(--success-color); font-weight: 500;">✓ Sentence perfectly matches.</span>`;
    } else {
      const origTokens = tokenize(original);
      const corrTokens = tokenize(corrected);
      els.visualDiffContainer.innerHTML = computeWordDiffHtml(origTokens, corrTokens);
    }

    // Split Diff (Side-by-Side)
    els.splitDiffOriginal.textContent = original;
    els.splitDiffCorrected.textContent = corrected;
  }

  function setDiffViewMode(mode) {
    state.diffViewMode = mode;
    els.diffModeInline.classList.toggle('active', mode === 'inline');
    els.diffModeSplit.classList.toggle('active', mode === 'split');

    if (mode === 'split') {
      els.visualDiffContainer.classList.add('hidden');
      els.splitDiffContainer.classList.remove('hidden');
    } else {
      els.visualDiffContainer.classList.remove('hidden');
      els.splitDiffContainer.classList.add('hidden');
    }
  }

  function tokenize(str) {
    return str.match(/[\w\u0900-\u097F\u00C0-\u024F]+|[^\w\s\u0900-\u097F\u00C0-\u024F]+|\s+/g) || [str];
  }

  function computeWordDiffHtml(orig, corr) {
    const matrix = Array(orig.length + 1).fill(null).map(() => Array(corr.length + 1).fill(0));

    for (let i = 0; i < orig.length; i++) {
      for (let j = 0; j < corr.length; j++) {
        if (orig[i].toLowerCase() === corr[j].toLowerCase()) {
          matrix[i + 1][j + 1] = matrix[i][j] + 1;
        } else {
          matrix[i + 1][j + 1] = Math.max(matrix[i + 1][j], matrix[i][j + 1]);
        }
      }
    }

    let i = orig.length;
    let j = corr.length;
    const pieces = [];

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && orig[i - 1].toLowerCase() === corr[j - 1].toLowerCase()) {
        pieces.unshift(escapeHtml(corr[j - 1]));
        i--;
        j--;
      } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
        pieces.unshift(`<span class="diff-ins">${escapeHtml(corr[j - 1])}</span>`);
        j--;
      } else if (i > 0 && (j === 0 || matrix[i][j - 1] < matrix[i - 1][j])) {
        pieces.unshift(`<span class="diff-del">${escapeHtml(orig[i - 1])}</span>`);
        i--;
      }
    }

    return pieces.join('');
  }

  // --- Text-to-Speech (TTS) with Speed Control ---
  function speakSentence(text) {
    if (!('speechSynthesis' in window)) {
      showAlert('Speech synthesis is not supported in this browser.');
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = state.voiceLanguage || 'en-IN';
    utterance.rate = parseFloat(els.ttsSpeedSelect.value) || 1.0;

    els.speakBtnText.textContent = 'Speaking...';

    utterance.onend = () => {
      els.speakBtnText.textContent = 'Listen';
    };

    utterance.onerror = () => {
      els.speakBtnText.textContent = 'Listen';
    };

    window.speechSynthesis.speak(utterance);
    showToast(`🔊 Reading sentence (${utterance.rate}x)...`);
  }

  // --- Replace and Undo ---
  function replaceOriginalWithCorrected(newText) {
    if (!newText) return;
    state.undoStack.push(els.inputText.value);
    els.inputText.value = newText;
    els.undoBtn.disabled = false;
    updateCountersAndAnalytics();
    showToast('Replaced original text with correction!');
  }

  function undoLastReplacement() {
    if (state.undoStack.length === 0) return;
    const previousText = state.undoStack.pop();
    els.inputText.value = previousText;
    updateCountersAndAnalytics();
    els.undoBtn.disabled = state.undoStack.length === 0;
    showToast('Restored previous text.');
  }

  // --- History Management ---
  function saveToHistory(resultItem) {
    try {
      const historyItem = {
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode: resultItem.mode || state.mode,
        language: resultItem.language || state.aiLanguage,
        original: resultItem.original,
        corrected: resultItem.corrected,
        explanation: resultItem.explanation,
        changes: resultItem.changes || [],
        metrics: resultItem.metrics || null,
        betterVersion: resultItem.betterVersion || '',
        betterVersions: resultItem.betterVersions || (resultItem.betterVersion ? [resultItem.betterVersion] : []),
        rawOutput: resultItem.rawOutput || ''
      };

      state.history.unshift(historyItem);
      if (state.history.length > 20) {
        state.history = state.history.slice(0, 20);
      }

      if (!state.authEnabled) localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(state.history));
      renderHistoryList();
    } catch (e) {
      console.warn('Could not save history to localStorage:', e);
    }
  }

  async function loadHistory() {
    if (state.authEnabled) {
      const response = await apiFetch('/api/history');
      if (!response.ok) throw new Error('Could not load your saved correction history.');
      const data = await response.json();
      state.history = Array.isArray(data.history) ? data.history : [];
      renderHistoryList();
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
      if (raw) {
        state.history = JSON.parse(raw);
        renderHistoryList();
      }
    } catch (e) {
      state.history = [];
    }
  }

  function renderHistoryList() {
    if (els.historyBadge) els.historyBadge.textContent = state.history.length;
    if (els.bNavHistoryBadge) {
      els.bNavHistoryBadge.textContent = state.history.length;
      els.bNavHistoryBadge.classList.toggle('hidden', state.history.length === 0);
    }

    const renderToContainer = (container) => {
      if (!container) return;
      if (state.history.length === 0) {
        container.innerHTML = `<p class="history-empty">No history recorded yet.</p>`;
        return;
      }
      container.innerHTML = '';
      state.history.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.setAttribute('tabindex', '0');
        div.setAttribute('role', 'button');

        div.innerHTML = `
          <div class="history-meta">
            <span class="badge-mini" style="text-transform: capitalize;">${escapeHtml(item.mode)} • ${escapeHtml(item.language)}</span>
            <span class="history-time">${escapeHtml(item.timestamp)}</span>
          </div>
          <div class="history-original">Original: ${escapeHtml(item.original)}</div>
          <div class="history-corrected">✓ ${escapeHtml(item.corrected)}</div>
        `;

        div.addEventListener('click', () => {
          els.inputText.value = item.original;
          setMode(item.mode || 'grammar');
          if (item.language && els.aiLanguageSelect.querySelector(`option[value="${item.language}"]`)) {
            els.aiLanguageSelect.value = item.language;
            state.aiLanguage = item.language;
          }
          updateCountersAndAnalytics();
          renderResults(item);
          closeHistoryDrawer();
          switchAppTab('results');
          showToast('Restored from history');
        });

        container.appendChild(div);
      });
    };

    renderToContainer(els.historyList);
    renderToContainer(els.tabHistoryList);
    renderLearningDashboard();
  }

  function renderLearningDashboard() {
    if (!els.dashboardChecks) return;
    const edits = state.history.reduce((total, item) => {
      const changes = Array.isArray(item.changes) ? item.changes : [];
      return total + changes.filter(change => change && (change.original || change.corrected)).length;
    }, 0);
    const words = state.history.reduce((total, item) => {
      return total + ((item.original || '').trim().match(/\S+/g) || []).length;
    }, 0);
    const estimatedScore = words > 0 ? Math.max(0, Math.round(100 - (edits / words) * 100)) : null;
    const categoryCounts = new Map();
    state.history.forEach(item => {
      (Array.isArray(item.changes) ? item.changes : []).forEach(change => {
        if (!change || (!change.original && !change.corrected)) return;
        const category = getGrammarCategory(change.reason || '').label;
        categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
      });
    });

    els.dashboardChecks.textContent = String(state.history.length);
    els.dashboardWords.textContent = String(words);
    els.dashboardEdits.textContent = String(edits);
    els.dashboardScore.textContent = estimatedScore === null ? '--' : `${estimatedScore}/100`;
    els.dashboardCategories.innerHTML = '';

    if (categoryCounts.size === 0) {
      els.dashboardCategories.innerHTML = '<p class="dashboard-empty">Run a grammar check to see your patterns.</p>';
      return;
    }

    const sorted = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]);
    const highest = sorted[0][1];
    sorted.forEach(([category, count]) => {
      const row = document.createElement('div');
      row.className = 'dashboard-category';
      const label = document.createElement('span');
      label.textContent = category;
      const bar = document.createElement('span');
      bar.className = 'dashboard-category-bar';
      bar.setAttribute('aria-hidden', 'true');
      const fill = document.createElement('span');
      fill.style.width = `${Math.max(8, Math.round((count / highest) * 100))}%`;
      bar.appendChild(fill);
      const value = document.createElement('strong');
      value.textContent = String(count);
      row.append(label, bar, value);
      els.dashboardCategories.appendChild(row);
    });
  }

  async function clearHistory() {
    if (state.authEnabled) {
      try {
        const response = await apiFetch('/api/history', { method: 'DELETE' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Could not clear saved history.');
      } catch (err) {
        showAlert(err.message, 'error');
        return;
      }
    }
    state.history = [];
    localStorage.removeItem(STORAGE_KEYS.HISTORY);
    renderHistoryList();
    showToast('History cleared.');
  }

  function openHistoryDrawer() {
    els.historyDrawer.classList.add('open');
    els.drawerOverlay.classList.add('active');
    els.historyDrawer.setAttribute('aria-hidden', 'false');
  }

  function closeHistoryDrawer() {
    els.historyDrawer.classList.remove('open');
    els.drawerOverlay.classList.remove('active');
    els.historyDrawer.setAttribute('aria-hidden', 'true');
  }

  // --- Export Utilities (.txt, .md, print) ---
  function exportFile(format) {
    if (!state.lastResult) return;
    const data = state.lastResult;
    let content = '';
    let filename = `verba_correction_${Date.now()}`;
    let mimeType = 'text/plain';

    if (format === 'txt') {
      content = [
        `======================================================`,
        `VerbaAI Pro - Grammar Correction Report`,
        `Date: ${new Date().toLocaleString()}`,
        `Mode: ${data.mode.toUpperCase()} | Language: ${data.language}`,
        `======================================================\n`,
        `ORIGINAL INPUT:`,
        data.original,
        `\nCORRECTED:`,
        data.corrected,
        `\nEXPLANATION:`,
        data.explanation,
        `\nCHANGES:`,
        (data.changes && data.changes.length > 0)
          ? data.changes.map(c => `- ${c.text || `${c.original} → ${c.corrected} : ${c.reason}`}`).join('\n')
          : 'none',
        (data.betterVersions && data.betterVersions.length > 0)
          ? `\nBETTER VERSIONS:\n${data.betterVersions.map((v, i) => `${i + 1}. ${v}`).join('\n')}`
          : (data.betterVersion ? `\nBETTER VERSION:\n${data.betterVersion}` : ''),
        `\n======================================================`
      ].filter(Boolean).join('\n');
      filename += '.txt';
    } else if (format === 'md') {
      content = [
        `# VerbaAI Correction Report`,
        `*Date: ${new Date().toLocaleString()}* | **Mode:** \`${data.mode}\` | **Language:** \`${data.language}\``,
        ``,
        `### Original Input`,
        `> ${data.original}`,
        ``,
        `### Corrected Sentence`,
        `> **${data.corrected}**`,
        ``,
        `### Explanation`,
        `${data.explanation}`,
        ``,
        `### Changes`,
        (data.changes && data.changes.length > 0)
          ? data.changes.map(c => `- **${c.original}** → **${c.corrected}**: *${c.reason}*`).join('\n')
          : '- *none (sentence is already correct)*',
        (data.betterVersions && data.betterVersions.length > 0)
          ? `\n### Better Versions\n${data.betterVersions.map((v, i) => `${i + 1}. > ${v}`).join('\n')}`
          : (data.betterVersion ? `\n### Better Version\n> ${data.betterVersion}` : '')
      ].filter(Boolean).join('\n');
      filename += '.md';
      mimeType = 'text/markdown';
    } else if (format === 'print') {
      window.print();
      return;
    }

    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${filename}!`);
    els.exportDropdownMenu.classList.add('hidden');
  }

  // --- Health Check ---
  async function checkEngineHealth() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        if (data.hasEnvApiKey) {
          els.sourceEngineBadge.textContent = 'Gemini Pro';
          els.sourceEngineBadge.style.color = '#38bdf8';
        }
      }
    } catch (e) {
      console.warn('Backend health check skipped.');
    }
  }

  // --- UI Notifications & Helpers ---
  function showToast(msg) {
    els.toastMessage.textContent = msg;
    els.toastNotification.classList.remove('hidden');

    clearTimeout(els.toastTimer);
    els.toastTimer = setTimeout(() => {
      els.toastNotification.classList.add('hidden');
    }, 2400);
  }

  function showAlert(msg, type = 'warning') {
    els.alertMessage.textContent = msg;
    els.alertBanner.className = `alert-banner ${type}`;
    els.alertBanner.classList.remove('hidden');
  }

  function copyTextToClipboard(text, successMsg = 'Copied to clipboard!') {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(successMsg);
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- Event Listeners Setup ---
  function setupEventListeners() {
    // Mode tabs
    els.modeTabs.forEach(tab => {
      tab.addEventListener('click', () => setMode(tab.dataset.mode));
    });

    // Check Grammar Submit Button
    els.submitBtn.addEventListener('click', executeCheck);
    els.completeTextBtn.addEventListener('click', () => runWritingTool('complete'));
    els.summarizeTextBtn.addEventListener('click', () => runWritingTool('summarize'));
    els.rewriteTextBtn.addEventListener('click', () => {
      runWritingTool('rephrase', els.rewriteStyleSelect.value);
    });
    els.copyWritingToolBtn.addEventListener('click', () => {
      copyTextToClipboard(els.writingToolResult.dataset.output || '', 'Writing result copied!');
    });
    els.insertWritingToolBtn.addEventListener('click', () => {
      const output = els.writingToolResult.dataset.output;
      if (!output) return;
      state.undoStack.push(els.inputText.value);
      els.undoBtn.disabled = false;
      els.inputText.value = output;
      updateCountersAndAnalytics();
      els.inputText.focus();
      showToast('Writing result added to the editor.');
    });
    els.runSimilarityCheckBtn.addEventListener('click', compareReferenceTexts);

    // Mic Voice Button
    els.micBtn.addEventListener('click', toggleVoiceInput);
    if (els.bottomNavVoiceBtn) els.bottomNavVoiceBtn.addEventListener('click', toggleVoiceInput);
    if (els.openTranslateTabBtn) {
      els.openTranslateTabBtn.addEventListener('click', () => switchAppTab('translate'));
    }

    els.stopVoiceBtn.addEventListener('click', stopListening);

    // Utility buttons
    els.clearBtn.addEventListener('click', () => {
      if (!els.inputText.value) return;
      state.undoStack.push(els.inputText.value);
      els.inputText.value = '';
      updateCountersAndAnalytics();
      els.undoBtn.disabled = false;
      els.inputText.focus();
    });

    els.undoBtn.addEventListener('click', undoLastReplacement);

    els.copyInputBtn.addEventListener('click', () => {
      copyTextToClipboard(els.inputText.value, 'Input sentence copied!');
    });

    // Language Selectors
    els.aiLanguageSelect.addEventListener('change', (e) => {
      state.aiLanguage = e.target.value;
      localStorage.setItem(STORAGE_KEYS.AI_LANG, e.target.value);
      const suggestedVoice = VOICE_LANG_MAP[e.target.value];
      if (suggestedVoice && els.voiceLanguageSelect.querySelector(`option[value="${suggestedVoice}"]`)) {
        els.voiceLanguageSelect.value = suggestedVoice;
        state.voiceLanguage = suggestedVoice;
        localStorage.setItem(STORAGE_KEYS.VOICE_LANG, suggestedVoice);
      }
    });

    els.voiceLanguageSelect.addEventListener('change', (e) => {
      state.voiceLanguage = e.target.value;
      localStorage.setItem(STORAGE_KEYS.VOICE_LANG, e.target.value);
    });

    // Example Chips
    els.exampleChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const text = chip.dataset.text;
        const lang = chip.dataset.lang;
        const mode = chip.dataset.mode;

        els.inputText.value = text;
        updateCountersAndAnalytics();

        if (mode) setMode(mode);
        if (lang && els.aiLanguageSelect.querySelector(`option[value="${lang}"]`)) {
          els.aiLanguageSelect.value = lang;
          state.aiLanguage = lang;
          const suggestedVoice = VOICE_LANG_MAP[lang];
          if (suggestedVoice) {
            els.voiceLanguageSelect.value = suggestedVoice;
            state.voiceLanguage = suggestedVoice;
          }
        }

        executeCheck();
      });
    });

    // Card Actions
    els.copyCorrectedBtn.addEventListener('click', () => {
      if (state.lastResult && state.lastResult.corrected) {
        copyTextToClipboard(state.lastResult.corrected, 'Corrected text copied!');
      }
    });
    els.shareCorrectedBtn.addEventListener('click', shareCorrectedText);

    els.replaceWithCorrectedBtn.addEventListener('click', () => {
      if (state.lastResult && state.lastResult.corrected) {
        replaceOriginalWithCorrected(state.lastResult.corrected);
      }
    });

    els.speakCorrectedBtn.addEventListener('click', () => {
      if (state.lastResult && state.lastResult.corrected) {
        speakSentence(state.lastResult.corrected);
      }
    });

    els.acceptAllChangesBtn.addEventListener('click', applyAllChanges);

    els.useBetterVersionBtn.addEventListener('click', () => {
      if (state.lastResult && state.lastResult.betterVersion) {
        replaceOriginalWithCorrected(state.lastResult.betterVersion);
      }
    });

    // Diff mode buttons
    els.diffModeInline.addEventListener('click', () => setDiffViewMode('inline'));
    els.diffModeSplit.addEventListener('click', () => setDiffViewMode('split'));

    // Export Dropdown
    els.exportDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      els.exportDropdownMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      els.exportDropdownMenu.classList.add('hidden');
    });

    els.exportTxtBtn.addEventListener('click', () => exportFile('txt'));
    els.exportMdBtn.addEventListener('click', () => exportFile('md'));
    els.exportPrintBtn.addEventListener('click', () => exportFile('print'));

    // Alert banner close
    els.closeAlertBtn.addEventListener('click', () => {
      els.alertBanner.classList.add('hidden');
    });

    // Theme Toggle
    els.themeToggleBtn.addEventListener('click', () => {
      const isLight = document.body.classList.toggle('light-theme');
      if (isLight) {
        document.body.classList.remove('dark-theme');
        localStorage.setItem(STORAGE_KEYS.THEME, 'light');
      } else {
        document.body.classList.add('dark-theme');
        localStorage.setItem(STORAGE_KEYS.THEME, 'dark');
      }
    });

    // History Drawer
    els.historyDrawerBtn.addEventListener('click', openHistoryDrawer);
    els.closeHistoryBtn.addEventListener('click', closeHistoryDrawer);
    els.drawerOverlay.addEventListener('click', closeHistoryDrawer);
    els.clearHistoryBtn.addEventListener('click', clearHistory);

    // Shortcuts Modal
    els.shortcutsBtn.addEventListener('click', () => {
      els.shortcutsModal.classList.remove('hidden');
    });
    els.closeShortcutsBtn.addEventListener('click', () => {
      els.shortcutsModal.classList.add('hidden');
    });

    // Settings Modal
    els.settingsModalBtn.addEventListener('click', () => {
      els.settingsModal.classList.remove('hidden');
      els.apiKeyStatusMsg.classList.add('hidden');
    });

    els.closeSettingsBtn.addEventListener('click', () => {
      els.settingsModal.classList.add('hidden');
    });

    els.toggleApiKeyVisibility.addEventListener('click', () => {
      if (els.geminiApiKeyInput.type === 'password') {
        els.geminiApiKeyInput.type = 'text';
        els.toggleApiKeyVisibility.textContent = 'Hide';
      } else {
        els.geminiApiKeyInput.type = 'password';
        els.toggleApiKeyVisibility.textContent = 'Show';
      }
    });

    els.saveApiKeyBtn.addEventListener('click', async () => {
      const key = els.geminiApiKeyInput.value.trim();
      try {
        if (state.authEnabled) {
          const response = await apiFetch('/api/account/gemini-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: key })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Could not save the Gemini key.');
          state.hasSavedApiKey = data.hasGeminiKey;
          state.apiKey = '';
          state.legacyApiKey = '';
          localStorage.removeItem(STORAGE_KEYS.API_KEY);
          els.legacyApiKeyNotice.classList.add('hidden');
          els.geminiApiKeyInput.value = '';
          els.geminiApiKeyInput.placeholder = data.hasGeminiKey ? 'Saved securely to your account' : 'AIzaSy...';
          els.sourceEngineBadge.textContent = data.hasGeminiKey ? 'Gemini Pro' : 'Built-in Engine';
        } else {
          state.apiKey = key;
          if (key) {
            localStorage.setItem(STORAGE_KEYS.API_KEY, key);
            els.sourceEngineBadge.textContent = 'Gemini Pro';
            els.sourceEngineBadge.style.color = '#38bdf8';
          } else {
            localStorage.removeItem(STORAGE_KEYS.API_KEY);
            els.sourceEngineBadge.textContent = 'Built-in Engine';
            els.sourceEngineBadge.style.color = '#10b981';
          }
        }
        showToast(key ? 'Gemini API key saved securely.' : 'Gemini API key cleared.');
        els.settingsModal.classList.add('hidden');
      } catch (err) {
        showAlert(err.message || 'Could not save the Gemini key.', 'error');
      }
    });

    els.testApiBtn.addEventListener('click', async () => {
      const key = els.geminiApiKeyInput.value.trim();
      if (!key && !state.hasSavedApiKey) {
        els.apiKeyStatusMsg.className = 'api-status-msg error';
        els.apiKeyStatusMsg.textContent = 'Please enter an API key to test.';
        els.apiKeyStatusMsg.classList.remove('hidden');
        return;
      }

      els.testApiBtn.disabled = true;
      els.testApiBtn.textContent = 'Testing...';

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (key) headers['x-api-key'] = key;
        const testRes = await apiFetch('/api/check', {
          method: 'POST',
          headers,
          body: JSON.stringify({ text: 'This is a test.', language: 'English', mode: 'grammar', validateOnly: true })
        });
        const testData = await testRes.json();
        if (testRes.ok && testData.source === 'gemini') {
          els.apiKeyStatusMsg.className = 'api-status-msg success';
          els.apiKeyStatusMsg.textContent = '✓ Gemini API key connected.';
        } else {
          els.apiKeyStatusMsg.className = 'api-status-msg error';
          els.apiKeyStatusMsg.textContent = testData.error || testData.note || 'Could not verify key with Gemini API.';
        }
      } catch (err) {
        els.apiKeyStatusMsg.className = 'api-status-msg error';
        els.apiKeyStatusMsg.textContent = `Test failed: ${err.message}`;
      } finally {
        els.apiKeyStatusMsg.classList.remove('hidden');
        els.testApiBtn.disabled = false;
        els.testApiBtn.textContent = 'Test Connection';
      }
    });

    // Global Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      // Ctrl + Enter or Cmd + Enter -> Check Grammar
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        executeCheck();
      }

      // Ctrl + Shift + C -> Copy Correction
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        if (state.lastResult && state.lastResult.corrected) {
          copyTextToClipboard(state.lastResult.corrected, 'Corrected text copied!');
        }
      }

      // ? key -> Open shortcuts cheatsheet (when not focused in textarea)
      if (e.key === '?' && document.activeElement !== els.inputText) {
        e.preventDefault();
        els.shortcutsModal.classList.toggle('hidden');
      }

      // Escape -> close drawer, modals, and synonym popover
      if (e.key === 'Escape') {
        closeHistoryDrawer();
        els.settingsModal.classList.add('hidden');
        els.shortcutsModal.classList.add('hidden');
        els.exportDropdownMenu.classList.add('hidden');
        if (els.synonymPopover) els.synonymPopover.classList.add('hidden');
      }
    });

    // --- Tone Pills ---
    els.tonePills.forEach(pill => {
      pill.addEventListener('click', () => {
        els.tonePills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.tone = pill.dataset.tone;
        localStorage.setItem(STORAGE_KEYS.TONE, state.tone);
        showToast(`Tone set to: ${pill.textContent.trim()}`);
      });
    });

    // Restore saved tone on init
    const savedTone = state.tone;
    els.tonePills.forEach(p => {
      p.classList.toggle('active', p.dataset.tone === savedTone);
    });

    // --- Auto-Check Toggle (1-second debounce) ---
    let autoCheckTimer = null;
    if (els.autoCheckToggle) {
      els.autoCheckToggle.checked = state.autoCheck;
      els.autoCheckToggle.addEventListener('change', (e) => {
        state.autoCheck = e.target.checked;
        localStorage.setItem(STORAGE_KEYS.AUTO_CHECK, state.autoCheck);
        showToast(state.autoCheck ? '⚡ Auto-Check enabled' : 'Auto-Check disabled');
      });
    }

    els.inputText.addEventListener('input', () => {
      updateCountersAndAnalytics();
      if (state.autoCheck) {
        clearTimeout(autoCheckTimer);
        autoCheckTimer = setTimeout(() => {
          if (els.inputText.value.trim().length > 5) {
            executeCheck();
          }
        }, 1200);
      }
    });

    // --- Changes Category Filter Pills ---
    els.changesFilterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        els.changesFilterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.activeChangeFilter = pill.dataset.filter;
        if (state.lastResult) {
          renderChangesList(state.lastResult.changes || []);
        }
      });
    });

    // --- Synonym Popover (double-click any word in the textarea) ---
    if (els.synonymPopover) {
      els.inputText.addEventListener('dblclick', async (e) => {
        const text = els.inputText.value;
        const pos = els.inputText.selectionStart;

        // Extract the word at double-click position
        const before = text.slice(0, pos).match(/\w+$/);
        const after = text.slice(pos).match(/^\w+/);
        const word = ((before ? before[0] : '') + (after ? after[0] : '')).toLowerCase().replace(/[^a-z]/g, '');

        if (!word || word.length < 2) return;

        try {
          const res = await fetch(`/api/thesaurus/${encodeURIComponent(word)}`);
          const data = await res.json();

          if (!data.synonyms || data.synonyms.length === 0) return;

          // Position popover near caret
          const rect = els.inputText.getBoundingClientRect();
          els.synonymPopover.style.top = `${rect.top + window.scrollY - 130}px`;
          els.synonymPopover.style.left = `${Math.min(e.clientX, window.innerWidth - 340)}px`;

          els.synonymWord.textContent = word;
          els.synonymChips.innerHTML = '';

          data.synonyms.forEach(syn => {
            const chip = document.createElement('button');
            chip.className = 'synonym-chip';
            chip.textContent = syn;
            chip.title = `Replace "${word}" with "${syn}"`;
            chip.addEventListener('click', () => {
              // Replace the word in the textarea
              const val = els.inputText.value;
              const re = new RegExp(`\\b${word}\\b`, 'i');
              const match = val.match(re);
              if (match) {
                const preserved = match[0][0] === match[0][0].toUpperCase()
                  ? syn.charAt(0).toUpperCase() + syn.slice(1)
                  : syn;
                els.inputText.value = val.replace(re, preserved);
                state.undoStack.push(val);
                els.undoBtn.disabled = false;
                updateCountersAndAnalytics();
              }
              els.synonymPopover.classList.add('hidden');
              showToast(`Replaced with "${syn}"`);
            });
            els.synonymChips.appendChild(chip);
          });

          els.synonymPopover.classList.remove('hidden');
        } catch (err) {
          // Silently ignore thesaurus errors
        }
      });

      els.closeSynonymBtn.addEventListener('click', () => {
        els.synonymPopover.classList.add('hidden');
      });

      // Close on outside click
      document.addEventListener('click', (e) => {
        if (!els.synonymPopover.contains(e.target) && e.target !== els.inputText) {
          els.synonymPopover.classList.add('hidden');
        }
      });
    }

    // ===================================================================
    //  TAB NAVIGATION SYSTEM & ANDROID PHONE CONTROLLER
    // ===================================================================
    switchAppTab = function (tabName) {
      if (tabName === 'split') {
        // Desktop Split Studio Mode
        state.activeAppTab = 'split';
        document.body.classList.add('split-studio-active');
        els.tabNavItems.forEach(item => {
          item.classList.toggle('active', item.dataset.tab === 'split');
          if (item.dataset.tab === 'split') {
            item.setAttribute('aria-current', 'page');
          } else {
            item.removeAttribute('aria-current');
          };
        });
        showToast('🖥️ Split Studio Mode enabled');
        return;
      }

      document.body.classList.remove('split-studio-active');
      state.activeAppTab = tabName;

      // Update top nav tabs
      els.tabNavItems.forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tabName);
        if (item.dataset.tab === tabName) {
          item.setAttribute('aria-current', 'page');
        } else {
          item.removeAttribute('aria-current');
        }
      });

      // Update Android bottom navigation tabs
      els.bottomNavItems.forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tabName);
        if (item.dataset.tab === tabName) {
          item.setAttribute('aria-current', 'page');
        } else {
          item.removeAttribute('aria-current');
        }
      });

      // Update tab views
      els.tabPanes.forEach(pane => {
        const isMatch = pane.dataset.pane === tabName;
        pane.classList.toggle('active', isMatch);
      });

      // Smooth scroll to top of workspace
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Haptic touch feedback on Android devices if supported
      if ('vibrate' in navigator) {
        try { navigator.vibrate(10); } catch(e) {}
      }

      // Tab activation callbacks
      if (tabName === 'translate') {
        if (els.tabTranslateInput && !els.tabTranslateInput.value && els.inputText.value) {
          els.tabTranslateInput.value = els.inputText.value;
          updateTranslateCharCounts();
        }
      } else if (tabName === 'daily-words') {
        if (wodWords.length === 0) {
          loadWodWords();
        } else {
          renderWodCard();
        }
      } else if (tabName === 'history') {
        renderHistoryList();
      }
    }

    // Top tab clicks
    els.tabNavItems.forEach(btn => {
      btn.addEventListener('click', () => {
        switchAppTab(btn.dataset.tab);
      });
    });

    // Android bottom nav clicks
    els.bottomNavItems.forEach(btn => {
      btn.addEventListener('click', () => {
        switchAppTab(btn.dataset.tab);
      });
    });

    // Mobile Results Toolbar
    if (els.backToEditorBtn) {
      els.backToEditorBtn.addEventListener('click', () => {
        switchAppTab('editor');
        els.inputText.focus();
      });
    }

    if (els.quickReplaceBtn) {
      els.quickReplaceBtn.addEventListener('click', () => {
        if (state.lastResult && state.lastResult.corrected) {
          replaceOriginalWithCorrected(state.lastResult.corrected);
          switchAppTab('editor');
          els.inputText.focus();
        } else {
          showToast('No correction available yet.');
        }
      });
    }

    // Floating action buttons (redirects directly to tab views)
    if (els.openTranslatorBtn) {
      els.openTranslatorBtn.addEventListener('click', () => {
        switchAppTab('translate');
      });
    }

    if (els.openWodBtn) {
      els.openWodBtn.addEventListener('click', () => {
        switchAppTab('daily-words');
      });
    }

    // ===================================================================
    //  TRANSLATOR MODULE (Powers both Tab 3 and Modal)
    // ===================================================================
    function updateTranslateCharCounts() {
      if (els.tabTranslateInput && els.tabTranslateCharCount) {
        els.tabTranslateCharCount.textContent = `${els.tabTranslateInput.value.length} chars`;
      }
      if (els.translateInput && els.translateCharCount) {
        els.translateCharCount.textContent = `${els.translateInput.value.length} chars`;
      }
    }

    // Tab Translator input counter
    if (els.tabTranslateInput) {
      els.tabTranslateInput.addEventListener('input', updateTranslateCharCounts);
    }
    if (els.translateInput) els.translateInput.addEventListener('input', updateTranslateCharCounts);
    updateTranslateCharCounts();

    // Tab Swap languages
    if (els.tabSwapLangBtn && els.tabTranslateFromLang && els.tabTranslateToLang) {
      els.tabSwapLangBtn.addEventListener('click', () => {
        const fromVal = els.tabTranslateFromLang.value;
        els.tabTranslateFromLang.value = els.tabTranslateToLang.value;
        els.tabTranslateToLang.value = fromVal;

        const outText = els.tabTranslateOutput.textContent.trim();
        if (outText && !outText.startsWith('Translation')) {
          els.tabTranslateInput.value = outText;
          els.tabTranslateOutput.innerHTML = '<span class="placeholder-text">Translation will appear here…</span>';
          updateTranslateCharCounts();
        }
      });
    }

    // Tab Paste from editor
    if (els.tabTranslatePasteBtn) {
      els.tabTranslatePasteBtn.addEventListener('click', () => {
        const ed = els.inputText.value.trim();
        if (ed) {
          els.tabTranslateInput.value = ed;
          updateTranslateCharCounts();
          showToast('📋 Pasted editor text into translator');
        } else {
          showToast('Editor is empty');
        }
      });
    }

    // Tab Clear
    if (els.tabTranslateClearBtn) {
      els.tabTranslateClearBtn.addEventListener('click', () => {
        els.tabTranslateInput.value = '';
        els.tabTranslateOutput.innerHTML = '<span class="placeholder-text">Translation will appear here…</span>';
        updateTranslateCharCounts();
      });
    }

    // Tab Copy translation
    if (els.tabCopyTranslationBtn) {
      els.tabCopyTranslationBtn.addEventListener('click', () => {
        const txt = els.tabTranslateOutput.textContent.trim();
        if (txt && !txt.startsWith('Translation') && !txt.startsWith('⚠️')) {
          copyTextToClipboard(txt, '📋 Translation copied!');
        }
      });
    }

    // Tab Speak translation
    if (els.tabSpeakTranslationBtn) {
      els.tabSpeakTranslationBtn.addEventListener('click', () => {
        const txt = els.tabTranslateOutput.textContent.trim();
        if (txt && !txt.startsWith('Translation') && !txt.startsWith('⚠️')) {
          if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(txt);
            const targetLang = els.tabTranslateToLang.value;
            u.lang = targetLang === 'mr' ? 'mr-IN' : (targetLang === 'hi' ? 'hi-IN' : 'en-US');
            u.rate = 0.9;
            window.speechSynthesis.speak(u);
          } else {
            showToast('Speech not supported on this browser');
          }
        }
      });
    }

    // Tab Insert into Editor
    if (els.tabInsertEditorBtn) {
      els.tabInsertEditorBtn.addEventListener('click', () => {
        const txt = els.tabTranslateOutput.textContent.trim();
        if (txt && !txt.startsWith('Translation') && !txt.startsWith('⚠️')) {
          state.undoStack.push(els.inputText.value);
          els.inputText.value = txt;
          updateCountersAndAnalytics();
          els.undoBtn.disabled = false;
          switchAppTab('editor');
          showToast('✍️ Translation inserted into Editor!');
        }
      });
    }

    // Tab Translate button action
    async function performTabTranslation() {
      const text = els.tabTranslateInput.value.trim();
      if (!text) { showToast('Please enter text to translate'); return; }

      const from = els.tabTranslateFromLang.value;
      const to = els.tabTranslateToLang.value;
      if (from === to) { showToast('Source and target language are the same'); return; }

      els.tabTranslateSpinner.classList.remove('hidden');
      els.tabDoTranslateBtn.disabled = true;
      els.tabTranslateOutput.innerHTML = '<span class="placeholder-text">Translating…</span>';

      try {
        const res = await apiFetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, from, to })
        });
        const data = await res.json();
        if (data.translated) {
          els.tabTranslateOutput.textContent = data.translated;
        } else {
          els.tabTranslateOutput.innerHTML = `<span class="placeholder-text">⚠️ ${data.error || 'Translation failed'}</span>`;
        }
      } catch (err) {
        els.tabTranslateOutput.innerHTML = '<span class="placeholder-text">⚠️ Network error. Try again.</span>';
      } finally {
        els.tabTranslateSpinner.classList.add('hidden');
        els.tabDoTranslateBtn.disabled = false;
      }
    }

    if (els.tabDoTranslateBtn) {
      els.tabDoTranslateBtn.addEventListener('click', performTabTranslation);
    }

    // Phrase chips
    if (els.phraseChips) {
      els.phraseChips.forEach(chip => {
        chip.addEventListener('click', () => {
          const phrase = chip.dataset.phrase;
          if (phrase && els.tabTranslateInput) {
            els.tabTranslateInput.value = phrase;
            updateTranslateCharCounts();
            performTabTranslation();
          }
        });
      });
    }

    // Modal Translator Listeners (preserved for backwards compatibility)
    if (els.translatorModal) {
      els.closeTranslatorBtn.addEventListener('click', () => els.translatorModal.classList.add('hidden'));
      els.translatorModal.addEventListener('click', (e) => {
        if (e.target === els.translatorModal) els.translatorModal.classList.add('hidden');
      });
      if (els.swapLangBtn) {
        els.swapLangBtn.addEventListener('click', () => {
          const f = els.translateFromLang.value;
          els.translateFromLang.value = els.translateToLang.value;
          els.translateToLang.value = f;
        });
      }
      if (els.translatePasteBtn) {
        els.translatePasteBtn.addEventListener('click', () => {
          if (els.inputText.value) {
            els.translateInput.value = els.inputText.value;
            updateTranslateCharCounts();
            showToast('📋 Pasted from editor');
          }
        });
      }
      if (els.translateClearBtn) {
        els.translateClearBtn.addEventListener('click', () => {
          els.translateInput.value = '';
          els.translateOutput.innerHTML = '<span class="placeholder-text">Translation will appear here…</span>';
        });
      }
      if (els.copyTranslationBtn) {
        els.copyTranslationBtn.addEventListener('click', () => {
          const txt = els.translateOutput.textContent.trim();
          if (txt && !txt.startsWith('Translation')) copyTextToClipboard(txt, '📋 Translation copied!');
        });
      }
      if (els.translateBtn) {
        els.translateBtn.addEventListener('click', async () => {
          const text = els.translateInput.value.trim();
          if (!text) return;
          const from = els.translateFromLang.value;
          const to = els.translateToLang.value;
          els.translateSpinner.classList.remove('hidden');
          els.translateBtn.disabled = true;
          try {
            const res = await apiFetch('/api/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text, from, to })
            });
            const data = await res.json();
            els.translateOutput.textContent = data.translated || data.error || 'Failed';
          } catch(e) {
            els.translateOutput.textContent = 'Network error.';
          } finally {
            els.translateSpinner.classList.add('hidden');
            els.translateBtn.disabled = false;
          }
        });
      }
    }

    // ===================================================================
    //  WORD OF THE DAY MODULE (Powers both Tab 4 and Modal)
    // ===================================================================
    let wodWords = [];
    let wodIndex = 0;
    let wodSkipCount = parseInt(localStorage.getItem('verba_wod_skip') || '0', 10);

    const CLIENT_FALLBACK_WORDS = [
      { word: 'Gratitude', marathi: 'कृतज्ञता', pronunciation: 'grat-i-tood', meaning: 'The feeling of being thankful and appreciative', example: 'She expressed deep gratitude for their support.' },
      { word: 'Diligent', marathi: 'परिश्रमी', pronunciation: 'dil-i-jent', meaning: 'Hardworking and showing care in one’s duties', example: 'He is a diligent and honest student.' },
      { word: 'Sincere', marathi: 'प्रामाणिक', pronunciation: 'sin-seer', meaning: 'Genuine, authentic and truthful', example: 'Please accept my sincere apology.' },
      { word: 'Courage', marathi: 'धैर्य', pronunciation: 'kur-ij', meaning: 'Bravery to face difficult or painful situations', example: 'It takes courage to stand up for the truth.' },
      { word: 'Patience', marathi: 'संयम / धीर', pronunciation: 'pay-shens', meaning: 'The capacity to accept delay without becoming upset', example: 'Patience is essential for achieving success.' },
      { word: 'Polite', marathi: 'नम्र', pronunciation: 'poh-lite', meaning: 'Respectful, courteous and well-mannered', example: 'Always be polite when addressing others.' },
      { word: 'Honest', marathi: 'प्रामाणिक', pronunciation: 'on-ist', meaning: 'Free of deceit and truthful and sincere', example: 'He is known as an honest and fair leader.' },
      { word: 'Respect', marathi: 'आदर', pronunciation: 'ri-spekt', meaning: 'Regard for the feelings or rights of others', example: 'Mutual respect builds lifelong trust.' },
      { word: 'Confident', marathi: 'आत्मविश्वासू', pronunciation: 'kon-fi-dent', meaning: 'Feeling or showing certainty about oneself', example: 'She gave a very confident presentation.' },
      { word: 'Humble', marathi: 'नम्र / विनम्र', pronunciation: 'hum-bul', meaning: 'Having a modest estimate of one’s own importance', example: 'Despite immense success, he remained humble.' }
    ];

    function pronounceCurrentWord() {
      const w = wodWords[wodIndex];
      if (!w) return;
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(w.word);
        u.lang = 'en-US';
        u.rate = 0.85;
        window.speechSynthesis.speak(u);
      } else {
        showToast('Speech audio not supported on this browser.');
      }
    }

    function renderWodCard() {
      const renderContent = (container) => {
        if (!container) return;
        if (wodIndex >= wodWords.length) {
          container.innerHTML = `
            <div class="wod-complete">
              <div class="wod-complete-emoji">🎉</div>
              <h3>All words completed for today!</h3>
              <p>Excellent progress. Come back tomorrow for 5 fresh conversation words.</p>
            </div>`;
          return;
        }

        const w = wodWords[wodIndex];
        container.innerHTML = `
          <div class="wod-card">
            <div class="wod-word-header">
              <span class="wod-english">${escapeHtml(w.word)}</span>
              <span class="wod-pronunciation">/${escapeHtml(w.pronunciation)}/</span>
              <button class="icon-btn wod-inline-speak" title="Listen to pronunciation" onclick="window.__verbaPronounceWord && window.__verbaPronounceWord('${escapeHtml(w.word)}')">🔊</button>
            </div>
            <div class="wod-marathi-meaning">मराठी: ${escapeHtml(w.marathi)}</div>
            <div class="wod-meaning">${escapeHtml(w.meaning)}</div>
            <div class="wod-example">"${escapeHtml(w.example)}"</div>
          </div>`;
      };

      // Render into both containers
      renderContent(els.wodCards);
      renderContent(els.tabWodCardContainer);

      const isCompleted = wodIndex >= wodWords.length;
      const progressPercent = isCompleted ? 100 : Math.round(((wodIndex + 1) / (wodWords.length || 5)) * 100);
      const counterText = isCompleted ? 'Completed!' : `Word ${wodIndex + 1} of ${wodWords.length || 5}`;

      if (els.wodProgressFill) els.wodProgressFill.style.width = `${progressPercent}%`;
      if (els.tabWodProgressFill) els.tabWodProgressFill.style.width = `${progressPercent}%`;

      if (els.wodCounter) els.wodCounter.textContent = counterText;
      if (els.tabWodCounterBadge) els.tabWodCounterBadge.textContent = counterText;

      const nextLabel = wodIndex === wodWords.length - 1 ? 'Finish ✓' : 'Next Word →';
      if (els.wodNextBtn) {
        els.wodNextBtn.textContent = nextLabel;
        els.wodNextBtn.disabled = isCompleted;
      }
      if (els.tabWodNextBtn) {
        els.tabWodNextBtn.textContent = nextLabel;
        els.tabWodNextBtn.disabled = isCompleted;
      }

      if (els.wodSkipBtn) els.wodSkipBtn.disabled = isCompleted;
      if (els.tabWodSkipBtn) els.tabWodSkipBtn.disabled = isCompleted;
    }

    // Expose pronunciation helper globally for inline buttons
    window.__verbaPronounceWord = function(word) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(word);
        u.lang = 'en-US';
        u.rate = 0.85;
        window.speechSynthesis.speak(u);
      }
    };

    async function loadWodWords() {
      if (els.wodCards) els.wodCards.innerHTML = '<div class="wod-loading">⏳ Loading today\'s words...</div>';
      if (els.tabWodCardContainer) els.tabWodCardContainer.innerHTML = '<div class="wod-loading">⏳ Loading today\'s words...</div>';

      try {
        const res = await fetch(`/api/word-of-day?skip=${wodSkipCount}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        wodWords = (data.words && data.words.length > 0) ? data.words : CLIENT_FALLBACK_WORDS.slice(0, 5);
        wodIndex = 0;
        const dateLabel = `📅 ${data.date || new Date().toISOString().slice(0, 10)} — Learn 5 English words daily`;
        if (els.wodDate) els.wodDate.textContent = dateLabel;
        if (els.tabWodDate) els.tabWodDate.textContent = dateLabel;
        renderWodCard();
      } catch (err) {
        console.warn('Could not fetch daily words from server, using local fallback:', err);
        wodWords = CLIENT_FALLBACK_WORDS.slice(0, 5);
        wodIndex = 0;
        const dateLabel = `📅 ${new Date().toISOString().slice(0, 10)} — Learn 5 English words daily`;
        if (els.wodDate) els.wodDate.textContent = dateLabel;
        if (els.tabWodDate) els.tabWodDate.textContent = dateLabel;
        renderWodCard();
      }
    }

    async function handleWodSkip() {
      wodSkipCount++;
      localStorage.setItem('verba_wod_skip', wodSkipCount.toString());
      showToast('⏭ Skipped — fetching a new word');
      try {
        const res = await fetch(`/api/word-of-day?skip=${wodSkipCount}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.words && data.words.length > 0) {
          const replacement = data.words[0];
          if (wodIndex < wodWords.length) {
            wodWords[wodIndex] = replacement;
          }
          renderWodCard();
          return;
        }
      } catch (err) {
        console.warn('Server fetch replacement failed, using client pool:', err);
      }
      const fallbackWord = CLIENT_FALLBACK_WORDS[(wodIndex + wodSkipCount) % CLIENT_FALLBACK_WORDS.length];
      if (wodIndex < wodWords.length && fallbackWord) {
        wodWords[wodIndex] = fallbackWord;
        renderWodCard();
      }
    }

    function handleWodNext() {
      if (wodIndex < wodWords.length) {
        wodIndex++;
        renderWodCard();
      }
    }

    // Wire Modal WOD buttons
    if (els.wodNextBtn) els.wodNextBtn.addEventListener('click', handleWodNext);
    if (els.wodSkipBtn) els.wodSkipBtn.addEventListener('click', handleWodSkip);
    if (els.closeWodBtn) els.closeWodBtn.addEventListener('click', () => els.wordOfDayModal.classList.add('hidden'));

    // Wire Tab 4 WOD buttons
    if (els.tabWodNextBtn) els.tabWodNextBtn.addEventListener('click', handleWodNext);
    if (els.tabWodSkipBtn) els.tabWodSkipBtn.addEventListener('click', handleWodSkip);
    if (els.tabWodPronounceBtn) els.tabWodPronounceBtn.addEventListener('click', pronounceCurrentWord);

    // Wire Tab 5 History & Tools buttons
    if (els.tabClearHistoryBtn) {
      els.tabClearHistoryBtn.addEventListener('click', clearHistory);
    }
    if (els.tabThemeToggleBtn) {
      els.tabThemeToggleBtn.addEventListener('click', () => {
        const isLight = document.body.classList.toggle('light-theme');
        if (isLight) {
          document.body.classList.remove('dark-theme');
          localStorage.setItem(STORAGE_KEYS.THEME, 'light');
        } else {
          document.body.classList.add('dark-theme');
          localStorage.setItem(STORAGE_KEYS.THEME, 'dark');
        }
        showToast(`Theme switched to ${isLight ? 'Light' : 'Dark'}!`);
      });
    }
    if (els.tabOpenApiKeyBtn) {
      els.tabOpenApiKeyBtn.addEventListener('click', () => {
        els.settingsModal.classList.remove('hidden');
      });
    }
    if (els.tabOpenShortcutsBtn) {
      els.tabOpenShortcutsBtn.addEventListener('click', () => {
        els.shortcutsModal.classList.remove('hidden');
      });
    }

    // Preload words in background so Tab 4 is ready immediately
    loadWodWords();
  }

  // Run init on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
