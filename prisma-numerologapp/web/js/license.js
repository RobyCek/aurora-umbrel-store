import { LICENSE_API_URL } from './license-config.js?v=1.1.0';
import {
  bytesToBase64url,
  normalizeActivationCode,
  refreshMessage,
  stableDeviceJwk,
  verifyLicenseToken,
} from './license-core.js?v=1.1.0';

const DATABASE_NAME = 'numerologapp-license-v1';
const STORE_NAME = 'secure-state';
const DEVICE_KEY = 'device-key';
const LICENSE_KEY = 'license';
const LOCAL_PREVIEW_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const encoder = new TextEncoder();
let onlineMonitorStarted = false;

function isNativePlatform() {
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

function shouldEnforceLicense() {
  if (isNativePlatform()) return true;
  const parameters = new URLSearchParams(location.search);
  return LOCAL_PREVIEW_HOSTS.has(location.hostname) && parameters.get('license-test') === '1';
}

function apiBaseUrl() {
  const parameters = new URLSearchParams(location.search);
  const localOverride = LOCAL_PREVIEW_HOSTS.has(location.hostname) ? parameters.get('licenseApi') : '';
  const configured = String(localOverride || LICENSE_API_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  if (!isNativePlatform()) return location.origin;
  throw new Error('Il server di attivazione non è ancora configurato.');
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

async function databaseGet(key) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.addEventListener('success', () => resolve(request.result));
      request.addEventListener('error', () => reject(request.error));
    });
  } finally {
    database.close();
  }
}

async function databasePut(key, value) {
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(value, key);
      transaction.addEventListener('complete', resolve);
      transaction.addEventListener('error', () => reject(transaction.error));
    });
  } finally {
    database.close();
  }
}

async function databaseDelete(key) {
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(key);
      transaction.addEventListener('complete', resolve);
      transaction.addEventListener('error', () => reject(transaction.error));
    });
  } finally {
    database.close();
  }
}

async function loadOrCreateDeviceIdentity() {
  const saved = await databaseGet(DEVICE_KEY);
  if (saved?.privateKey && saved?.publicJwk) return saved;
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify'],
  );
  const identity = {
    privateKey: pair.privateKey,
    publicJwk: stableDeviceJwk(await crypto.subtle.exportKey('jwk', pair.publicKey)),
    createdAt: new Date().toISOString(),
  };
  await databasePut(DEVICE_KEY, identity);
  return identity;
}

async function requestJson(path, body) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error || `Servizio non disponibile (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return result;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function activate(code, identity) {
  const result = await requestJson('/api/license/activate', {
    code,
    devicePublicKey: identity.publicJwk,
    deviceLabel: `${navigator.platform || 'Dispositivo'} · NumerologApp`,
  });
  const payload = await verifyLicenseToken(result.token, result.serverPublicKey, identity.publicJwk);
  const record = {
    token: result.token,
    serverPublicKey: result.serverPublicKey,
    savedAt: Date.now(),
  };
  await databasePut(LICENSE_KEY, record);
  return payload;
}

async function refreshLicense(record, identity) {
  const current = await verifyLicenseToken(record.token, record.serverPublicKey, identity.publicJwk, Date.now(), true);
  const challenge = await requestJson('/api/license/challenge', { licenseId: current.licenseId });
  const message = refreshMessage(current.licenseId, challenge.nonce);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    identity.privateKey,
    encoder.encode(message),
  );
  const result = await requestJson('/api/license/refresh', {
    licenseId: current.licenseId,
    nonce: challenge.nonce,
    signature: bytesToBase64url(signature),
  });
  const payload = await verifyLicenseToken(result.token, result.serverPublicKey, identity.publicJwk);
  await databasePut(LICENSE_KEY, {
    token: result.token,
    serverPublicKey: result.serverPublicKey,
    savedAt: Date.now(),
  });
  return payload;
}

function startOnlineLicenseMonitor(identity) {
  if (onlineMonitorStarted) return;
  onlineMonitorStarted = true;
  window.addEventListener('online', async () => {
    const record = await databaseGet(LICENSE_KEY);
    if (!record) return;
    try {
      await refreshLicense(record, identity);
    } catch (error) {
      if (error.status === 403) {
        await databaseDelete(LICENSE_KEY);
        location.reload();
      }
    }
  });
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'long' }).format(new Date(timestamp));
}

function renderActivationGate(identity, reason = '') {
  document.body.classList.add('license-locked');
  const overlay = document.createElement('div');
  overlay.className = 'license-gate';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'license-title');
  overlay.innerHTML = `
    <section class="license-card">
      <div class="license-mark" aria-hidden="true">N</div>
      <p class="eyebrow">Attivazione personale</p>
      <h1 id="license-title">Abilita NumerologApp</h1>
      <p class="license-description">Inserisci il codice ricevuto. Il codice verrà associato in modo sicuro a questo dispositivo.</p>
      <form id="license-form" novalidate>
        <label for="license-code">Codice di abilitazione</label>
        <input id="license-code" name="licenseCode" type="text" inputmode="text" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="NUME-XXXX-XXXX-XXXX" maxlength="19" required>
        <p id="license-error" class="license-error" role="alert" aria-live="polite">${reason}</p>
        <button id="license-submit" class="button button-primary button-full" type="submit">Attiva su questo dispositivo</button>
      </form>
      <p class="license-help">È necessaria una connessione soltanto per l’attivazione e per i rinnovi periodici.</p>
    </section>`;
  document.body.append(overlay);

  const form = overlay.querySelector('#license-form');
  const input = overlay.querySelector('#license-code');
  const error = overlay.querySelector('#license-error');
  const submit = overlay.querySelector('#license-submit');
  input.addEventListener('input', () => {
    input.value = normalizeActivationCode(input.value);
    error.textContent = '';
  });

  return new Promise((resolve) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const code = normalizeActivationCode(input.value);
      if (!/^NUME(?:-[A-Z0-9]{4}){3}$/.test(code)) {
        error.textContent = 'Controlla il codice: deve avere il formato NUME-XXXX-XXXX-XXXX.';
        return;
      }
      submit.disabled = true;
      submit.textContent = 'Attivazione in corso…';
      try {
        const payload = await activate(code, identity);
        overlay.remove();
        document.body.classList.remove('license-locked');
        startOnlineLicenseMonitor(identity);
        resolve(payload);
      } catch (activationError) {
        error.textContent = activationError.name === 'AbortError'
          ? 'Il server non risponde. Controlla la connessione e riprova.'
          : activationError.message;
        submit.disabled = false;
        submit.textContent = 'Attiva su questo dispositivo';
      }
    });
    window.setTimeout(() => input.focus(), 50);
  });
}

export async function ensureDeviceLicense() {
  if (!shouldEnforceLicense()) return null;
  const identity = await loadOrCreateDeviceIdentity();
  const record = await databaseGet(LICENSE_KEY);
  if (!record) return renderActivationGate(identity);

  try {
    let payload = await verifyLicenseToken(record.token, record.serverPublicKey, identity.publicJwk);
    if (navigator.onLine) {
      try {
        payload = await refreshLicense(record, identity);
      } catch (error) {
        if (error.status === 403) {
          await databaseDelete(LICENSE_KEY);
          return renderActivationGate(identity, 'La licenza è stata disattivata o trasferita.');
        }
      }
    }
    document.documentElement.dataset.license = 'active';
    document.documentElement.dataset.licenseValidUntil = new Date(payload.validUntil).toISOString();
    startOnlineLicenseMonitor(identity);
    return payload;
  } catch (error) {
    if (navigator.onLine && record.token) {
      try {
        const payload = await refreshLicense(record, identity);
        document.documentElement.dataset.license = 'active';
        startOnlineLicenseMonitor(identity);
        return payload;
      } catch (refreshError) {
        if (refreshError.status !== 403) {
          return renderActivationGate(identity, 'La licenza è scaduta. Collegati a Internet per rinnovarla.');
        }
      }
    }
    await databaseDelete(LICENSE_KEY);
    return renderActivationGate(identity, error.message);
  }
}

export async function currentLicenseSummary() {
  const identity = await loadOrCreateDeviceIdentity();
  const record = await databaseGet(LICENSE_KEY);
  if (!record) return null;
  const payload = await verifyLicenseToken(record.token, record.serverPublicKey, identity.publicJwk);
  return { ...payload, validUntilLabel: formatDate(payload.validUntil) };
}
