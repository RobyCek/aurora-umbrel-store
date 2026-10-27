let adminToken = '';

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
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function statusLabel(status) {
  return { available: 'Disponibile', active: 'Attiva', revoked: 'Revocata' }[status] ?? status;
}

function createAction(label, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `action-button ${className}`.trim();
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

async function loadCodes() {
  const error = byId('dashboard-error');
  error.textContent = '';
  try {
    const { codes } = await api('/api/admin/codes');
    const body = byId('license-list');
    body.replaceChildren();
    byId('empty-list').hidden = codes.length > 0;
    for (const license of codes) {
      const row = document.createElement('tr');
      const label = document.createElement('td');
      label.textContent = license.label || 'Senza riferimento';
      const status = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `status status-${license.status}`;
      badge.textContent = statusLabel(license.status);
      status.append(badge);
      const device = document.createElement('td');
      device.textContent = license.maxDevices > 1
        ? `${license.activationCount} / ${license.maxDevices}`
        : (license.deviceLabel || '—');
      const activated = document.createElement('td');
      activated.textContent = formatDate(license.activatedAt);
      const actions = document.createElement('td');
      actions.className = 'actions';
      if (license.status === 'active') {
        actions.append(createAction('Revoca', 'danger', async () => {
          if (!confirm(`Revocare la licenza di ${license.label || 'questo utente'}?`)) return;
          await api(`/api/admin/codes/${encodeURIComponent(license.id)}/revoke`, { method: 'POST' });
          await loadCodes();
        }));
      }
      if (license.status !== 'available') {
        actions.append(createAction('Trasferisci', '', async () => {
          if (!confirm('Liberare il codice per associarlo a un nuovo dispositivo?')) return;
          await api(`/api/admin/codes/${encodeURIComponent(license.id)}/reset`, { method: 'POST' });
          await loadCodes();
        }));
      }
      row.append(label, status, device, activated, actions);
      body.append(row);
    }
  } catch (loadError) {
    error.textContent = loadError.message;
    if (/credenziale/i.test(loadError.message)) logout();
  }
}

function showCreatedCodes(codes) {
  const container = byId('new-codes');
  container.replaceChildren();
  for (const item of codes) {
    const row = document.createElement('div');
    row.className = 'new-code';
    const code = document.createElement('code');
    code.textContent = item.code;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy-button';
    copy.textContent = 'Copia';
    copy.addEventListener('click', async () => {
      await navigator.clipboard.writeText(item.code);
      copy.textContent = 'Copiato ✓';
      setTimeout(() => { copy.textContent = 'Copia'; }, 1400);
    });
    row.append(code, copy);
    container.append(row);
  }
  container.hidden = false;
}

function logout() {
  adminToken = '';
  byId('admin-token').value = '';
  byId('dashboard').hidden = true;
  byId('logout').hidden = true;
  byId('login-card').hidden = false;
}

byId('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  adminToken = byId('admin-token').value.trim();
  byId('login-error').textContent = '';
  try {
    await loadCodes();
    if (!adminToken) throw new Error('Inserisci il token amministrativo.');
    byId('login-card').hidden = true;
    byId('dashboard').hidden = false;
    byId('logout').hidden = false;
  } catch (error) {
    byId('login-error').textContent = error.message;
    adminToken = '';
  }
});

byId('create-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    const result = await api('/api/admin/codes', {
      method: 'POST',
      body: {
        label: byId('code-label').value,
        count: Number(byId('code-count').value),
        maxDevices: Number(byId('max-devices').value),
      },
    });
    showCreatedCodes(result.codes);
    await loadCodes();
  } catch (error) {
    byId('dashboard-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

byId('refresh').addEventListener('click', loadCodes);
byId('logout').addEventListener('click', logout);
