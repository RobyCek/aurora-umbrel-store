import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  timingSafeEqual,
  verify,
} from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_WEB_DIR = resolve(SERVER_DIR, '..', 'web');
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_BODY_BYTES = 16 * 1024;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const ACTIVATION_WINDOW_MS = 15 * 60 * 1000;
const ACTIVATION_LIMIT = 20;

const MIME_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
});

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('base64url');
}

function normalizeCode(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function codeHash(value) {
  return sha256(normalizeCode(value));
}

function stableDeviceJwk(jwk) {
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) {
    throw new Error('Chiave del dispositivo non valida.');
  }
  return { crv: 'P-256', kty: 'EC', x: String(jwk.x), y: String(jwk.y) };
}

function deviceThumbprint(jwk) {
  return sha256(JSON.stringify(stableDeviceJwk(jwk)));
}

function randomCode() {
  const bytes = randomBytes(12);
  const characters = Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]);
  return `NUME-${characters.slice(0, 4).join('')}-${characters.slice(4, 8).join('')}-${characters.slice(8).join('')}`;
}

function jsonResponse(response, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers,
  });
  response.end(body);
}

function securityHeaders() {
  return {
    'Content-Security-Policy': "default-src 'self' data: blob: capacitor:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https: http://127.0.0.1:* http://localhost:* capacitor:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'",
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('Richiesta troppo grande.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('JSON non valido.');
    error.statusCode = 400;
    throw error;
  }
}

function bearerToken(request) {
  const authorization = request.headers.authorization ?? '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function writeJsonAtomic(path, value) {
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, path);
}

class LicenseStore {
  constructor(dataDir, configuredAdminToken) {
    this.dataDir = dataDir;
    this.statePath = join(dataDir, 'licenses.json');
    this.privateKeyPath = join(dataDir, 'signing-private.pem');
    this.publicKeyPath = join(dataDir, 'signing-public.pem');
    this.adminTokenPath = join(dataDir, 'admin-token.txt');
    this.configuredAdminToken = configuredAdminToken;
    this.state = { version: 1, codes: [] };
    this.privateKey = null;
    this.publicKey = null;
    this.adminToken = '';
  }

  async initialize() {
    await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    try {
      this.state = JSON.parse(await readFile(this.statePath, 'utf8'));
      if (!Array.isArray(this.state.codes)) throw new Error('Archivio licenze non valido.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.persist();
    }

    try {
      this.privateKey = createPrivateKey(await readFile(this.privateKeyPath, 'utf8'));
      this.publicKey = createPublicKey(await readFile(this.publicKeyPath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      this.privateKey = pair.privateKey;
      this.publicKey = pair.publicKey;
      await writeFile(this.privateKeyPath, pair.privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
      await writeFile(this.publicKeyPath, pair.publicKey.export({ format: 'pem', type: 'spki' }), { mode: 0o644 });
    }

    if (this.configuredAdminToken) {
      this.adminToken = this.configuredAdminToken;
    } else {
      try {
        this.adminToken = (await readFile(this.adminTokenPath, 'utf8')).trim();
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        this.adminToken = randomBytes(24).toString('base64url');
        await writeFile(this.adminTokenPath, `${this.adminToken}\n`, { mode: 0o600 });
      }
    }
  }

  async persist() {
    await writeJsonAtomic(this.statePath, this.state);
  }

  publicJwk() {
    return this.publicKey.export({ format: 'jwk' });
  }

  findByCode(code) {
    const hash = codeHash(code);
    return this.state.codes.find((entry) => safeEqual(entry.codeHash, hash));
  }

  findById(id) {
    return this.state.codes.find((entry) => entry.id === id);
  }
}

function publicCode(entry) {
  return {
    id: entry.id,
    label: entry.label,
    status: entry.status,
    createdAt: entry.createdAt,
    activatedAt: entry.activatedAt ?? null,
    lastRefreshAt: entry.lastRefreshAt ?? null,
    deviceLabel: entry.deviceLabel ?? null,
  };
}

function createLicenseToken(store, entry, offlineDays) {
  const issuedAt = Date.now();
  const payload = {
    version: 1,
    licenseId: entry.id,
    deviceThumbprint: entry.deviceThumbprint,
    issuedAt,
    validUntil: issuedAt + offlineDays * 24 * 60 * 60 * 1000,
  };
  const header = { alg: 'ES256', typ: 'NAL' };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: store.privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return {
    token: `${signingInput}.${signature.toString('base64url')}`,
    payload,
    serverPublicKey: store.publicJwk(),
  };
}

function clientIp(request) {
  const forwarded = request.headers['x-forwarded-for'];
  return String(forwarded ? forwarded.split(',')[0] : request.socket.remoteAddress ?? 'unknown').trim();
}

function corsHeaders(request, allowedOrigins) {
  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.has(origin)) return {};
  return {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

async function serveStatic(response, webDir, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname === '/admin' ? '/admin/index.html' : pathname;
  const relative = normalize(decodeURIComponent(requested)).replace(/^[/\\]+/, '');
  const filePath = resolve(webDir, relative);
  if (filePath !== webDir && !filePath.startsWith(`${webDir}${sep}`)) return false;

  let info;
  try {
    info = await stat(filePath);
  } catch {
    return false;
  }
  if (!info.isFile()) return false;

  const extension = extname(filePath).toLowerCase();
  const cacheControl = requested === '/sw.js' || extension === '.html'
    ? 'no-cache, no-store, must-revalidate'
    : 'public, max-age=604800, immutable';
  response.writeHead(200, {
    'Content-Type': MIME_TYPES[extension] ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': cacheControl,
    ...securityHeaders(),
  });
  createReadStream(filePath).pipe(response);
  return true;
}

export async function createLicenseServer(options = {}) {
  const dataDir = resolve(options.dataDir ?? process.env.LICENSE_DATA_DIR ?? join(SERVER_DIR, '..', 'data', 'licenses'));
  const webDir = resolve(options.webDir ?? process.env.WEB_DIR ?? DEFAULT_WEB_DIR);
  const offlineDays = Number(options.offlineDays ?? process.env.LICENSE_OFFLINE_DAYS ?? 30);
  if (!Number.isInteger(offlineDays) || offlineDays < 1 || offlineDays > 365) {
    throw new Error('LICENSE_OFFLINE_DAYS deve essere compreso tra 1 e 365.');
  }
  const store = new LicenseStore(dataDir, options.adminToken ?? process.env.LICENSE_ADMIN_TOKEN);
  await store.initialize();

  const allowedOrigins = new Set([
    'capacitor://localhost',
    'http://localhost',
    'https://localhost',
    ...(options.allowedOrigins ?? String(process.env.LICENSE_ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean)),
  ]);
  const challenges = new Map();
  const activationAttempts = new Map();
  const adminAttempts = new Map();

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    const cors = corsHeaders(request, allowedOrigins);
    try {
      if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
        response.writeHead(204, { ...securityHeaders(), ...cors });
        response.end();
        return;
      }

      if (request.method === 'GET' && url.pathname === '/health') {
        jsonResponse(response, 200, { ok: true }, securityHeaders());
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/license/config') {
        jsonResponse(response, 200, { offlineDays, serverPublicKey: store.publicJwk() }, { ...securityHeaders(), ...cors });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/license/activate') {
        const ip = clientIp(request);
        const now = Date.now();
        const recent = (activationAttempts.get(ip) ?? []).filter((timestamp) => now - timestamp < ACTIVATION_WINDOW_MS);
        if (recent.length >= ACTIVATION_LIMIT) {
          jsonResponse(response, 429, { error: 'Troppi tentativi. Riprova più tardi.' }, { ...securityHeaders(), ...cors });
          return;
        }
        recent.push(now);
        activationAttempts.set(ip, recent);

        const body = await readJsonBody(request);
        const entry = store.findByCode(body.code);
        if (!entry || entry.status === 'revoked') {
          jsonResponse(response, 403, { error: 'Codice non valido o disattivato.' }, { ...securityHeaders(), ...cors });
          return;
        }
        const publicJwk = stableDeviceJwk(body.devicePublicKey);
        const thumbprint = deviceThumbprint(publicJwk);
        if (entry.status === 'active' && entry.deviceThumbprint !== thumbprint) {
          jsonResponse(response, 409, { error: 'Questo codice è già associato a un altro dispositivo.' }, { ...securityHeaders(), ...cors });
          return;
        }
        if (entry.status === 'available') {
          entry.status = 'active';
          entry.devicePublicKey = publicJwk;
          entry.deviceThumbprint = thumbprint;
          entry.deviceLabel = String(body.deviceLabel ?? '').slice(0, 120) || 'Dispositivo';
          entry.activatedAt = new Date().toISOString();
        }
        entry.lastRefreshAt = new Date().toISOString();
        await store.persist();
        jsonResponse(response, 200, createLicenseToken(store, entry, offlineDays), { ...securityHeaders(), ...cors });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/license/challenge') {
        const body = await readJsonBody(request);
        const entry = store.findById(String(body.licenseId ?? ''));
        if (!entry || entry.status !== 'active') {
          jsonResponse(response, 403, { error: 'Licenza non attiva.' }, { ...securityHeaders(), ...cors });
          return;
        }
        const nonce = randomBytes(24).toString('base64url');
        challenges.set(entry.id, { nonce, expiresAt: Date.now() + CHALLENGE_TTL_MS });
        jsonResponse(response, 200, { nonce }, { ...securityHeaders(), ...cors });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/license/refresh') {
        const body = await readJsonBody(request);
        const licenseId = String(body.licenseId ?? '');
        const entry = store.findById(licenseId);
        const challenge = challenges.get(licenseId);
        challenges.delete(licenseId);
        if (!entry || entry.status !== 'active' || !challenge || challenge.expiresAt < Date.now() || challenge.nonce !== body.nonce) {
          jsonResponse(response, 403, { error: 'Rinnovo della licenza non autorizzato.' }, { ...securityHeaders(), ...cors });
          return;
        }
        let signatureValid = false;
        try {
          signatureValid = verify('sha256', Buffer.from(`${licenseId}.${challenge.nonce}`), {
            key: createPublicKey({ key: entry.devicePublicKey, format: 'jwk' }),
            dsaEncoding: 'ieee-p1363',
          }, Buffer.from(String(body.signature ?? ''), 'base64url'));
        } catch {
          signatureValid = false;
        }
        if (!signatureValid) {
          jsonResponse(response, 403, { error: 'Firma del dispositivo non valida.' }, { ...securityHeaders(), ...cors });
          return;
        }
        entry.lastRefreshAt = new Date().toISOString();
        await store.persist();
        jsonResponse(response, 200, createLicenseToken(store, entry, offlineDays), { ...securityHeaders(), ...cors });
        return;
      }

      if (url.pathname.startsWith('/api/admin/')) {
        const ip = clientIp(request);
        const now = Date.now();
        const recent = (adminAttempts.get(ip) ?? []).filter((timestamp) => now - timestamp < ACTIVATION_WINDOW_MS);
        if (recent.length >= 10) {
          jsonResponse(response, 429, { error: 'Troppi tentativi amministrativi. Riprova più tardi.' }, securityHeaders());
          return;
        }
        if (!safeEqual(bearerToken(request), store.adminToken)) {
          recent.push(now);
          adminAttempts.set(ip, recent);
          jsonResponse(response, 401, { error: 'Credenziale amministrativa non valida.' }, securityHeaders());
          return;
        }
        adminAttempts.delete(ip);

        if (request.method === 'GET' && url.pathname === '/api/admin/codes') {
          jsonResponse(response, 200, { codes: store.state.codes.map(publicCode) }, securityHeaders());
          return;
        }

        if (request.method === 'POST' && url.pathname === '/api/admin/codes') {
          const body = await readJsonBody(request);
          const count = Math.max(1, Math.min(100, Number(body.count) || 1));
          const label = String(body.label ?? '').trim().slice(0, 120);
          const created = [];
          for (let index = 0; index < count; index += 1) {
            let code;
            do code = randomCode(); while (store.findByCode(code));
            const entry = {
              id: randomBytes(12).toString('base64url'),
              codeHash: codeHash(code),
              label: count === 1 ? label : `${label || 'Licenza'} ${index + 1}`,
              status: 'available',
              createdAt: new Date().toISOString(),
            };
            store.state.codes.unshift(entry);
            created.push({ ...publicCode(entry), code });
          }
          await store.persist();
          jsonResponse(response, 201, { codes: created }, securityHeaders());
          return;
        }

        const actionMatch = url.pathname.match(/^\/api\/admin\/codes\/([^/]+)\/(revoke|reset)$/);
        if (request.method === 'POST' && actionMatch) {
          const entry = store.findById(decodeURIComponent(actionMatch[1]));
          if (!entry) {
            jsonResponse(response, 404, { error: 'Licenza non trovata.' }, securityHeaders());
            return;
          }
          if (actionMatch[2] === 'revoke') {
            entry.status = 'revoked';
            entry.revokedAt = new Date().toISOString();
          } else {
            entry.status = 'available';
            delete entry.devicePublicKey;
            delete entry.deviceThumbprint;
            delete entry.deviceLabel;
            delete entry.activatedAt;
            delete entry.lastRefreshAt;
            delete entry.revokedAt;
          }
          await store.persist();
          jsonResponse(response, 200, { code: publicCode(entry) }, securityHeaders());
          return;
        }
      }

      if (request.method === 'GET' || request.method === 'HEAD') {
        if (await serveStatic(response, webDir, url.pathname)) return;
        if (!url.pathname.includes('.') && await serveStatic(response, webDir, '/index.html')) return;
      }

      jsonResponse(response, 404, { error: 'Risorsa non trovata.' }, securityHeaders());
    } catch (error) {
      jsonResponse(response, error.statusCode ?? 500, {
        error: error.statusCode ? error.message : 'Errore interno del servizio licenze.',
      }, { ...securityHeaders(), ...cors });
    }
  });

  return { server, store, offlineDays };
}

async function start() {
  const port = Number(process.env.PORT ?? 8080);
  const { server, store, offlineDays } = await createLicenseServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`NumerologApp pronta sulla porta ${port}.`);
    console.log(`Licenze offline: ${offlineDays} giorni.`);
    if (!process.env.LICENSE_ADMIN_TOKEN) {
      console.log(`Token amministrativo: ${store.adminToken}`);
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export const licenseInternals = {
  codeHash,
  deviceThumbprint,
  normalizeCode,
};
