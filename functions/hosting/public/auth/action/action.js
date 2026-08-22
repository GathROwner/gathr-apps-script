const firebaseConfig = {
  apiKey: 'AIzaSyDlTVz1oAxaYgBQVupUFmhgWd1CLAmu2Xs',
};

const DEFAULT_APP_URL = 'https://www.gathrapp.ca/app?source=account-email';
const params = new URLSearchParams(window.location.search);
const mode = params.get('mode') || '';
const actionCode = params.get('oobCode') || '';
const continueUrl = safeContinueUrl(params.get('continueUrl'));

const elements = {
  card: document.getElementById('card'),
  statusIcon: document.getElementById('status-icon'),
  eyebrow: document.getElementById('eyebrow'),
  title: document.getElementById('title'),
  message: document.getElementById('message'),
  actions: document.getElementById('actions'),
  primaryAction: document.getElementById('primary-action'),
  retryAction: document.getElementById('retry-action'),
  help: document.getElementById('help'),
  passwordForm: document.getElementById('password-form'),
  newPassword: document.getElementById('new-password'),
  showPassword: document.getElementById('show-password'),
  savePassword: document.getElementById('save-password'),
};

async function authRequest(endpoint, body) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  let response;
  try {
    response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );
  } finally {
    window.clearTimeout(timeout);
  }
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data?.error?.message || 'Account action failed');
    error.code = String(data?.error?.message || '').split(/\s|:/)[0];
    throw error;
  }
  return data;
}

function checkActionCode(actionCodeValue) {
  return authRequest('accounts:resetPassword', { oobCode: actionCodeValue });
}

function applyActionCode(actionCodeValue) {
  return authRequest('accounts:update', { oobCode: actionCodeValue });
}

async function verifyPasswordResetCode(actionCodeValue) {
  const result = await checkActionCode(actionCodeValue);
  if (result.requestType !== 'PASSWORD_RESET') throw new Error('Unexpected account action');
  return result.email;
}

function confirmPasswordReset(actionCodeValue, newPassword) {
  return authRequest('accounts:resetPassword', { oobCode: actionCodeValue, newPassword });
}

const icons = {
  success: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="m13 25 7 7 15-17" /></svg>',
  error: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 15v11" /><path d="M24 33h.01" /><circle cx="24" cy="24" r="17" /></svg>',
  form: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="11" y="21" width="26" height="18" rx="5" /><path d="M17 21v-5a7 7 0 0 1 14 0v5" /></svg>',
};

function safeContinueUrl(value) {
  if (!value) return DEFAULT_APP_URL;
  try {
    const url = new URL(value);
    const trustedWeb = url.protocol === 'https:' && ['gathrapp.ca', 'www.gathrapp.ca', 'link.gathrapp.ca'].includes(url.hostname);
    const trustedApp = url.protocol === 'gathr:';
    return trustedWeb || trustedApp ? url.toString() : DEFAULT_APP_URL;
  } catch {
    return DEFAULT_APP_URL;
  }
}

function setState({ kind, eyebrow, title, message, showActions = true, showHelp = false, primaryLabel = 'Open GathR' }) {
  elements.card.setAttribute('aria-busy', 'false');
  elements.statusIcon.className = `status-icon status-icon--${kind}`;
  elements.statusIcon.innerHTML = icons[kind] || icons.error;
  elements.eyebrow.textContent = eyebrow;
  elements.title.textContent = title;
  elements.message.textContent = message;
  elements.actions.hidden = !showActions;
  elements.primaryAction.href = continueUrl;
  elements.primaryAction.textContent = primaryLabel;
  elements.help.hidden = !showHelp;
}

function showInvalidLink() {
  setState({
    kind: 'error',
    eyebrow: 'Link unavailable',
    title: 'This link is no longer valid.',
    message: 'It may have expired or already been used. Your account may already be updated.',
    showHelp: true,
  });
}

async function handleVerifyEmail() {
  try {
    await checkActionCode(actionCode);
    await applyActionCode(actionCode);
    setState({
      kind: 'success',
      eyebrow: 'Email confirmed',
      title: 'You’re all set.',
      message: 'Your email is verified. Return to GathR and continue sharing what’s happening nearby.',
    });
  } catch {
    showInvalidLink();
  }
}

async function handleResetPassword() {
  try {
    await verifyPasswordResetCode(actionCode);
    setState({
      kind: 'form',
      eyebrow: 'Password reset',
      title: 'Choose a new password.',
      message: 'Enter a new password for your GathR account.',
      showActions: false,
    });
    elements.passwordForm.hidden = false;
    elements.newPassword.focus();
  } catch {
    showInvalidLink();
  }
}

async function handleRecoverEmail() {
  try {
    await checkActionCode(actionCode);
    await applyActionCode(actionCode);
    setState({
      kind: 'success',
      eyebrow: 'Email restored',
      title: 'Your sign-in email is restored.',
      message: 'The email change was reversed. If you did not request the change, reset your password from the GathR sign-in screen.',
    });
  } catch {
    showInvalidLink();
  }
}

elements.passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!elements.passwordForm.reportValidity()) return;
  elements.savePassword.disabled = true;
  elements.savePassword.textContent = 'Saving…';
  try {
    await confirmPasswordReset(actionCode, elements.newPassword.value);
    elements.passwordForm.hidden = true;
    setState({
      kind: 'success',
      eyebrow: 'Password updated',
      title: 'Your new password is ready.',
      message: 'Return to GathR and sign in with your new password.',
    });
  } catch (error) {
    elements.savePassword.disabled = false;
    elements.savePassword.textContent = 'Save new password';
    elements.message.textContent = ['WEAK_PASSWORD', 'PASSWORD_DOES_NOT_MEET_REQUIREMENTS'].includes(error?.code)
      ? 'Choose a stronger password and try again.'
      : 'We could not update your password. This link may no longer be valid.';
  }
});

elements.showPassword.addEventListener('click', () => {
  const showing = elements.newPassword.type === 'text';
  elements.newPassword.type = showing ? 'password' : 'text';
  elements.showPassword.textContent = showing ? 'Show' : 'Hide';
  elements.showPassword.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
});

if (!actionCode) {
  showInvalidLink();
} else if (mode === 'verifyEmail') {
  handleVerifyEmail();
} else if (mode === 'resetPassword') {
  handleResetPassword();
} else if (mode === 'recoverEmail') {
  handleRecoverEmail();
} else {
  setState({
    kind: 'error',
    eyebrow: 'Unsupported request',
    title: 'We can’t open this account link.',
    message: 'Return to GathR and repeat the account action to receive a fresh link.',
    showHelp: true,
  });
}
