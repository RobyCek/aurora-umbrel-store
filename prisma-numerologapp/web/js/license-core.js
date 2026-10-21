const encoder = new TextEncoder();

export function base64urlToBytes(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function bytesToBase64url(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function normalizeActivationCode(value) {
  const compact = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!compact.startsWith('NUME')) return compact;
  const suffix = compact.slice(4);
  const groups = suffix.match(/.{1,4}/g) ?? [];
  return ['NUME', ...groups].join('-').slice(0, 19);
}

export function stableDeviceJwk(jwk) {
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) {
    throw new Error('Identità del dispositivo non valida.');
  }
  return { crv: 'P-256', kty: 'EC', x: String(jwk.x), y: String(jwk.y) };
}

export async function deviceThumbprint(jwk) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(stableDeviceJwk(jwk))));
  return bytesToBase64url(digest);
}

export function decodeLicenseToken(token) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) throw new Error('Licenza non valida.');
  const decodeJson = (part) => JSON.parse(new TextDecoder().decode(base64urlToBytes(part)));
  return {
    header: decodeJson(parts[0]),
    payload: decodeJson(parts[1]),
    signature: base64urlToBytes(parts[2]),
    signingInput: `${parts[0]}.${parts[1]}`,
  };
}

export async function verifyLicenseToken(token, serverPublicJwk, expectedDeviceJwk, now = Date.now(), allowExpired = false) {
  const decoded = decodeLicenseToken(token);
  if (decoded.header.alg !== 'ES256' || decoded.header.typ !== 'NAL') {
    throw new Error('Formato della licenza non riconosciuto.');
  }
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    serverPublicJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  const validSignature = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    decoded.signature,
    encoder.encode(decoded.signingInput),
  );
  if (!validSignature) throw new Error('Firma della licenza non valida.');
  if (decoded.payload.deviceThumbprint !== await deviceThumbprint(expectedDeviceJwk)) {
    throw new Error('La licenza appartiene a un altro dispositivo.');
  }
  if (!Number.isFinite(decoded.payload.validUntil) || (!allowExpired && decoded.payload.validUntil <= now)) {
    throw new Error('La licenza deve essere rinnovata online.');
  }
  return decoded.payload;
}

export function refreshMessage(licenseId, nonce) {
  return `${licenseId}.${nonce}`;
}
