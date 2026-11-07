const form = document.querySelector('#application-form');
const message = document.querySelector('#form-message');
const submitButton = form.querySelector('button[type="submit"]');
let csrfToken = '';

function showMessage(text, kind) {
  message.textContent = text;
  message.className = `notice notice-${kind}`;
  message.hidden = false;
}

async function refreshCsrfToken() {
  const response = await fetch('/api/csrf', { cache: 'no-store' });
  if (!response.ok) throw new Error('Le formulaire ne peut pas être chargé.');
  const result = await response.json();
  csrfToken = result.csrfToken;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.hidden = true;
  submitButton.disabled = true;

  try {
    if (!csrfToken) await refreshCsrfToken();
    const response = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken },
      body: new FormData(form),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'La candidature n’a pas pu être envoyée.');

    form.reset();
    showMessage(result.message, 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    submitButton.disabled = false;
  }
});

refreshCsrfToken().catch((error) => showMessage(error.message, 'error'));