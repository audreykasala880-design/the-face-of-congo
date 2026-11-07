import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const tokenLifetimeSeconds = 60 * 60;
const futureClockSkewSeconds = 60;

export function createCsrfToken(secret, now = Date.now()) {
  const timestamp = Math.floor(now / 1000);
  const payload = `${timestamp}.${randomBytes(16).toString('hex')}`;
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyCsrfToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string') return false;
  const [timestampText, nonce, signature, ...extra] = token.split('.');
  if (extra.length || !/^\d+$/.test(timestampText) || !/^[a-f0-9]{32}$/.test(nonce) || !signature) {
    return false;
  }

  const timestamp = Number(timestampText);
  const age = Math.floor(now / 1000) - timestamp;
  if (!Number.isSafeInteger(timestamp) || age < -futureClockSkewSeconds || age > tokenLifetimeSeconds) {
    return false;
  }

  const payload = `${timestampText}.${nonce}`;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}