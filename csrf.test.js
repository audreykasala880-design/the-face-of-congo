import test from 'node:test';
import assert from 'node:assert/strict';
import { createCsrfToken, verifyCsrfToken } from './csrf.js';

const secret = 'a-test-secret-long-enough-for-hmac-signing';

test('accepte un jeton CSRF signé avec le même secret', () => {
  const token = createCsrfToken(secret);

  assert.equal(verifyCsrfToken(token, secret), true);
  assert.equal(verifyCsrfToken(token, 'a-different-secret-long-enough'), false);
});

test('refuse un jeton altéré ou expiré', () => {
  const now = 1_800_000_000_000;
  const token = createCsrfToken(secret, now);

  assert.equal(verifyCsrfToken(`${token}x`, secret, now), false);
  assert.equal(verifyCsrfToken(token, secret, now + 60 * 60 * 1000 + 1000), false);
});