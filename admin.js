const loginPanel = document.querySelector('#login-panel');
const dashboard = document.querySelector('#dashboard');
const loginForm = document.querySelector('#login-form');
const loginMessage = document.querySelector('#login-message');
const dashboardMessage = document.querySelector('#dashboard-message');
const applicationsBody = document.querySelector('#applications-body');
let csrfToken = '';
let knownApplicationIds = null;
let notificationTimer = null;

async function api(url, options = {}, retryExpiredCsrf = true) {
  const headers = new Headers(options.headers || {});
  if (csrfToken && options.method && options.method !== 'GET') {
    headers.set('X-CSRF-Token', csrfToken);
  }
  const response = await fetch(url, { ...options, headers, cache: 'no-store', credentials: 'same-origin' });
  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 403 && retryExpiredCsrf && result.error?.startsWith('Requête expirée')) {
      await loadCsrfToken();
      return api(url, options, false);
    }
    const error = new Error(result.error || 'Une erreur est survenue.');
    error.status = response.status;
    throw error;
  }
  return result;
}

async function loadCsrfToken() {
  const result = await api('/api/csrf');
  csrfToken = result.csrfToken;
}

function setMessage(element, text, kind = 'error') {
  element.textContent = text;
  element.className = `notice notice-${kind}`;
  element.hidden = false;
}

function appendDetail(list, label, value) {
  const term = document.createElement('dt');
  term.textContent = label;
  const description = document.createElement('dd');
  description.textContent = value || 'Non renseigné';
  list.append(term, description);
}

function appendPhotoLinks(list, application) {
  const term = document.createElement('dt');
  term.textContent = 'Photos';
  const description = document.createElement('dd');
  const links = [
    ['Portrait', 'portrait'],
    ['Photo en pied', 'pied'],
    ...(application.a_photo_artistique ? [['Photo artistique', 'artistique']] : []),
  ];
  for (const [label, type] of links) {
    const link = document.createElement('a');
    link.href = `/api/admin/applications/${encodeURIComponent(application.id)}/photos/${type}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = label;
    description.append(link);
  }
  list.append(term, description);
}

function createApplicationRow(application) {
  const row = document.createElement('tr');
  const candidateCell = document.createElement('td');
  const name = document.createElement('strong');
  name.textContent = `${application.prenom} ${application.nom} ${application.postnom || ''}`.trim();
  candidateCell.append(name);

  const details = document.createElement('details');
  details.className = 'application-details';
  const summary = document.createElement('summary');
  summary.textContent = 'Voir le dossier';
  const list = document.createElement('dl');
  details.append(summary, list);
  appendDetail(list, 'Nom de scène', application.nom_scene);
  appendDetail(list, 'Sexe', application.sexe);
  appendDetail(list, 'Date de naissance', application.date_naissance);
  appendDetail(list, 'Taille', `${application.taille} cm`);
  appendDetail(list, 'Profession', application.profession);
  appendDetail(list, 'Expérience', application.experience);
  appendDetail(list, 'Types de modèle', Array.isArray(application.type_modele) ? application.type_modele.join(', ') : '');
  appendDetail(list, 'Motivation', application.motivation);
  appendDetail(list, 'Qualités', application.qualites);
  appendDetail(list, 'Signature', `${application.signature} · ${application.date_soumission}`);
  appendPhotoLinks(list, application);
  candidateCell.append(details);

  const contactCell = document.createElement('td');
  const email = document.createElement('a');
  email.href = `mailto:${application.email}`;
  email.textContent = application.email;
  contactCell.append(email, document.createElement('br'), document.createTextNode(application.telephone));

  const cityCell = document.createElement('td');
  cityCell.textContent = application.ville;
  const dateCell = document.createElement('td');
  dateCell.textContent = `${application.cree_le} UTC`;

  const statusCell = document.createElement('td');
  const statusForm = document.createElement('form');
  statusForm.className = 'status-form';
  const label = document.createElement('label');
  label.className = 'visually-hidden';
  label.textContent = `Statut de ${name.textContent}`;
  label.htmlFor = `status-${application.id}`;
  const select = document.createElement('select');
  select.id = label.htmlFor;
  select.name = 'statut';
  for (const status of ['Reçue', 'En cours', 'Acceptée', 'Refusée']) {
    const option = document.createElement('option');
    option.value = status;
    option.textContent = status;
    option.selected = application.statut === status;
    select.append(option);
  }
  const save = document.createElement('button');
  save.type = 'submit';
  save.setAttribute('aria-label', 'Enregistrer le statut');
  save.textContent = 'OK';
  statusForm.append(label, select, save);
  statusForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    save.disabled = true;
    try {
      await api(`/api/admin/applications/${encodeURIComponent(application.id)}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: select.value }),
      });
      setMessage(dashboardMessage, 'Le statut a été mis à jour.', 'success');
      await loadApplications();
    } catch (error) {
      setMessage(dashboardMessage, error.message);
    } finally {
      save.disabled = false;
    }
  });
  statusCell.append(statusForm);
  row.append(candidateCell, contactCell, cityCell, dateCell, statusCell);
  return row;
}

function renderCounts(counts) {
  document.querySelector('#count-total').textContent = counts.total;
  document.querySelector('#count-received').textContent = counts['Reçue'];
  document.querySelector('#count-progress').textContent = counts['En cours'];
  document.querySelector('#count-accepted').textContent = counts['Acceptée'];
  document.querySelector('#count-rejected').textContent = counts['Refusée'];
}

async function loadApplications({ notifyNew = false } = {}) {
  const result = await api('/api/admin/applications');
  const newApplications = knownApplicationIds === null
    ? []
    : result.applications.filter((application) => !knownApplicationIds.has(String(application.id)));
  knownApplicationIds = new Set(result.applications.map((application) => String(application.id)));
  renderCounts(result.counts);
  document.querySelector('#result-count').textContent = `${result.applications.length} résultat(s)`;
  applicationsBody.replaceChildren(...result.applications.map(createApplicationRow));
  const hasApplications = result.applications.length > 0;
  document.querySelector('#empty-state').hidden = hasApplications;
  document.querySelector('#table-scroll').hidden = !hasApplications;

  if (notifyNew && newApplications.length > 0) {
    const count = newApplications.length;
    const text = `${count} nouvelle${count > 1 ? 's' : ''} candidature${count > 1 ? 's' : ''} reçue${count > 1 ? 's' : ''}.`;
    setMessage(dashboardMessage, text, 'success');
    document.title = `(${count}) Nouvelle candidature - The Face of Congo`;
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Nouvelle candidature', { body: text, icon: '/icons/app-icon.svg' });
    }
  }
}

function showDashboard() {
  loginPanel.hidden = true;
  dashboard.hidden = false;
}

function startNotificationPolling() {
  clearInterval(notificationTimer);
  notificationTimer = setInterval(() => {
    loadApplications({ notifyNew: true }).catch((error) => {
      if (error.status !== 401) setMessage(dashboardMessage, error.message);
    });
  }, 30000);
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginMessage.hidden = true;
  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const result = await api('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: loginForm.elements.username.value,
        password: loginForm.elements.password.value,
      }),
    });
    csrfToken = result.csrfToken;
    loginForm.reset();
    showDashboard();
    await loadApplications();
    startNotificationPolling();
  } catch (error) {
    setMessage(loginMessage, error.message);
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector('#logout-button').addEventListener('click', async () => {
  try {
    await api('/api/admin/logout', { method: 'POST' });
    clearInterval(notificationTimer);
    csrfToken = '';
    knownApplicationIds = null;
    dashboard.hidden = true;
    loginPanel.hidden = false;
    await loadCsrfToken();
  } catch (error) {
    setMessage(dashboardMessage, error.message);
  }
});

document.querySelector('#enable-notifications').addEventListener('click', async () => {
  if (!('Notification' in window)) {
    setMessage(dashboardMessage, 'Les notifications navigateur ne sont pas disponibles sur cet appareil.');
    return;
  }
  const permission = await Notification.requestPermission();
  setMessage(
    dashboardMessage,
    permission === 'granted'
      ? 'Les notifications navigateur sont activées.'
      : 'Les notifications navigateur ne sont pas autorisées.',
    permission === 'granted' ? 'success' : 'error',
  );
});

async function initialize() {
  try {
    await loadCsrfToken();
    await loadApplications();
    showDashboard();
    startNotificationPolling();
  } catch (error) {
    if (error.status !== 401) setMessage(loginMessage, error.message);
  }
}

initialize();