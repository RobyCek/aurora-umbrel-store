const APP_STORE_URL = 'https://apps.apple.com/app/id6825358622';

let adminToken = '';
let licenses = [];
let generatedCodes = [];
let toastTimer;

const byId = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Richiesta non riuscita (${response.status}).`);
  return result;
}

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusLabel(status) {
  return {
    available: 'Disponibile',
    active: 'Attiva',
    revoked: 'Revocata',
  }[status] ?? status;
}

function showToast(message) {
  const toast = byId('toast');
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2300);
}

async function copyText(text, successMessage = 'Copiato negli appunti') {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const temporary = document.createElement('textarea');
      temporary.value = text;
      temporary.setAttribute('readonly', '');
      temporary.style.position = 'fixed';
      temporary.style.opacity = '0';
      document.body.append(temporary);
      temporary.select();
      if (!document.execCommand('copy')) throw new Error('Copia non disponibile');
      temporary.remove();
    }
    showToast(successMessage);
    return true;
  } catch {
    showToast('Copia non riuscita: seleziona il testo manualmente');
    return false;
  }
}

function deliveryMessage(code, label = '') {
  const firstName = label.trim().split(/\s+/)[0];
  const greeting = firstName ? `Ciao ${firstName},` : 'Ciao,';
  return `${greeting}

puoi installare NumerologApp da questo link:
${APP_STORE_URL}

Dopo l’installazione, apri l’app e inserisci questo codice personale:
${code}

Il codice viene associato al primo dispositivo sul quale viene attivato.`;
}

function createAction(label, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `action-button ${className}`.trim();
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function updateMetrics() {
  byId('metric-total').textContent = licenses.length;
  byId('metric-active').textContent = licenses.filter((item) => item.status === 'active').length;
  byId('metric-available').textContent = licenses.filter((item) => item.status === 'available').length;
  byId('metric-revoked').textContent = licenses.filter((item) => item.status === 'revoked').length;
}

function deviceDescription(license) {
  const maxDevices = license.maxDevices ?? 1;
  if (maxDevices > 1) return `${license.activationCount ?? 0} di ${maxDevices} dispositivi`;
  return license.deviceLabel || 'Non ancora associato';
}

function filteredLicenses() {
  const query = byId('license-search').value.trim().toLocaleLowerCase('it');
  const status = byId('status-filter').value;
  return licenses.filter((license) => {
    const matchesStatus = status === 'all' || license.status === status;
    const haystack = `${license.label ?? ''} ${deviceDescription(license)}`.toLocaleLowerCase('it');
    return matchesStatus && (!query || haystack.includes(query));
  });
}

function appendCell(row, className, label, content) {
  const cell = document.createElement('td');
  cell.className = className;
  cell.dataset.label = label;
  if (typeof content === 'string') cell.textContent = content;
  else cell.append(content);
  row.append(cell);
  return cell;
}

function renderLicenses() {
  const visibleLicenses = filteredLicenses();
  const body = byId('license-list');
  body.replaceChildren();
  byId('empty-list').hidden = visibleLicenses.length > 0;

  for (const license of visibleLicenses) {
    const row = document.createElement('tr');

    const client = document.createElement('div');
    const clientName = document.createElement('strong');
    clientName.textContent = license.label || 'Senza riferimento';
    const clientType = document.createElement('small');
    clientType.textContent = (license.maxDevices ?? 1) > 1 ? 'Codice multidispositivo' : 'Licenza personale';
    client.append(clientName, clientType);
    appendCell(row, 'client-cell', 'Cliente', client);

    const badge = document.createElement('span');
    badge.className = `status status-${license.status}`;
    badge.textContent = statusLabel(license.status);
    appendCell(row, '', 'Stato', badge);

    appendCell(row, 'device-cell', 'Dispositivo', deviceDescription(license));
    appendCell(row, 'date-cell', 'Attivazione', formatDate(license.activatedAt));

    const actions = appendCell(row, 'actions', 'Azioni', document.createDocumentFragment());
    if (license.status === 'active') {
      actions.append(createAction('Revoca', 'danger', async () => {
        const confirmed = confirm(`Revocare la licenza di ${license.label || 'questo cliente'}? Il dispositivo non potrà più rinnovarla.`);
        if (!confirmed) return;
        await updateLicense(`/api/admin/codes/${encodeURIComponent(license.id)}/revoke`, 'Licenza revocata');
      }));
    }
    if (license.status !== 'available') {
      actions.append(createAction('Trasferisci', '', async () => {
        const confirmed = confirm(`Liberare il codice di ${license.label || 'questo cliente'} per associarlo a un nuovo dispositivo?`);
        if (!confirmed) return;
        await updateLicense(`/api/admin/codes/${encodeURIComponent(license.id)}/reset`, 'Codice pronto per un nuovo dispositivo');
      }));
    }
    actions.append(createAction('Elimina', 'danger', async () => {
      const customer = license.label || 'questa licenza';
      const confirmed = confirm(`Eliminare definitivamente ${customer}? Il nominativo sparirà dall’archivio e il codice non potrà più essere usato. L’operazione non si può annullare.`);
      if (!confirmed) return;
      await updateLicense(`/api/admin/codes/${encodeURIComponent(license.id)}`, 'Licenza eliminata', 'DELETE');
    }));

    body.append(row);
  }
}

async function updateLicense(path, successMessage, method = 'POST') {
  byId('dashboard-error').textContent = '';
  try {
    await api(path, { method });
    await loadCodes();
    showToast(successMessage);
  } catch (error) {
    byId('dashboard-error').textContent = error.message;
  }
}

async function loadCodes() {
  const error = byId('dashboard-error');
  const refresh = byId('refresh');
  error.textContent = '';
  refresh.classList.add('loading');
  refresh.disabled = true;
  try {
    const result = await api('/api/admin/codes');
    licenses = result.codes ?? [];
    updateMetrics();
    renderLicenses();
  } catch (loadError) {
    error.textContent = loadError.message;
    if (/credenziale|token|autorizz/i.test(loadError.message)) logout();
    throw loadError;
  } finally {
    refresh.classList.remove('loading');
    refresh.disabled = false;
  }
}

function showCreatedCodes(codes, label) {
  generatedCodes = codes.map((item) => ({ ...item, label }));
  byId('copy-all-codes').textContent = generatedCodes.length === 1
    ? 'Copia messaggio completo'
    : 'Copia tutti i messaggi';
  const list = byId('new-code-list');
  list.replaceChildren();

  for (const item of generatedCodes) {
    const row = document.createElement('div');
    row.className = 'new-code';

    const meta = document.createElement('div');
    meta.className = 'new-code-meta';
    const name = document.createElement('span');
    name.className = 'new-code-label';
    name.textContent = item.label || 'Nuovo cliente';
    const code = document.createElement('code');
    code.textContent = item.code;
    meta.append(name, code);

    const actions = document.createElement('div');
    actions.className = 'new-code-actions';
    const copyCode = document.createElement('button');
    copyCode.type = 'button';
    copyCode.className = 'copy-button';
    copyCode.textContent = 'Copia codice';
    copyCode.addEventListener('click', () => copyText(item.code, 'Codice copiato'));

    const copyMessage = document.createElement('button');
    copyMessage.type = 'button';
    copyMessage.className = 'copy-button primary';
    copyMessage.textContent = 'Copia messaggio completo';
    copyMessage.setAttribute('aria-label', `Copia messaggio completo per ${item.label || 'il cliente'}`);
    copyMessage.addEventListener('click', () => copyText(deliveryMessage(item.code, item.label), 'Messaggio completo pronto da inviare'));
    actions.append(copyCode, copyMessage);

    row.append(meta, actions);
    list.append(row);
  }

  const container = byId('new-codes');
  container.hidden = false;
  container.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function logout() {
  adminToken = '';
  licenses = [];
  generatedCodes = [];
  byId('admin-token').value = '';
  byId('dashboard').hidden = true;
  byId('logout').hidden = true;
  byId('connection-status').hidden = true;
  byId('login-card').hidden = false;
  byId('new-codes').hidden = true;
  byId('metric-total').textContent = '0';
  byId('metric-active').textContent = '0';
  byId('metric-available').textContent = '0';
  byId('metric-revoked').textContent = '0';
  byId('admin-token').focus();
}

byId('toggle-token').addEventListener('click', () => {
  const input = byId('admin-token');
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  byId('toggle-token').textContent = showing ? 'Mostra' : 'Nascondi';
  byId('toggle-token').setAttribute('aria-label', showing ? 'Mostra token' : 'Nascondi token');
});

byId('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  const error = byId('login-error');
  adminToken = byId('admin-token').value.trim();
  error.textContent = '';
  if (!adminToken) {
    error.textContent = 'Inserisci il token amministrativo.';
    return;
  }

  button.disabled = true;
  try {
    await loadCodes();
    byId('login-card').hidden = true;
    byId('dashboard').hidden = false;
    byId('logout').hidden = false;
    byId('connection-status').hidden = false;
  } catch (loginError) {
    error.textContent = loginError.message;
    adminToken = '';
  } finally {
    button.disabled = false;
  }
});

byId('create-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  const error = byId('create-error');
  const label = byId('code-label').value.trim();
  error.textContent = '';
  button.disabled = true;
  try {
    const result = await api('/api/admin/codes', {
      method: 'POST',
      body: {
        label,
        count: Number(byId('code-count').value),
        maxDevices: Number(byId('max-devices').value),
      },
    });
    showCreatedCodes(result.codes, label);
    byId('code-label').value = '';
    await loadCodes();
    showToast(result.codes.length === 1 ? 'Codice creato' : `${result.codes.length} codici creati`);
  } catch (createError) {
    error.textContent = createError.message;
  } finally {
    button.disabled = false;
  }
});

byId('copy-all-codes').addEventListener('click', () => {
  const text = generatedCodes
    .map((item) => deliveryMessage(item.code, item.label))
    .join('\n\n———\n\n');
  copyText(text, generatedCodes.length === 1
    ? 'Messaggio completo pronto da inviare'
    : 'Tutti i messaggi sono stati copiati');
});

byId('license-search').addEventListener('input', renderLicenses);
byId('status-filter').addEventListener('change', renderLicenses);
byId('refresh').addEventListener('click', async () => {
  try {
    await loadCodes();
    showToast('Elenco aggiornato');
  } catch {
    // L'errore è già mostrato nel pannello.
  }
});
byId('hero-create').addEventListener('click', () => {
  byId('create-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
  byId('code-label').focus({ preventScroll: true });
});
byId('logout').addEventListener('click', logout);
