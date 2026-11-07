import test from 'node:test';
import assert from 'node:assert/strict';
import { configureProxyTrust } from './proxy-config.js';

function fakeApp() {
  return { settings: new Map(), set(name, value) { this.settings.set(name, value); } };
}

test('fait confiance à un seul proxy sur Render même si TRUST_PROXY manque', () => {
  const app = fakeApp();

  assert.equal(configureProxyTrust(app, { RENDER_SERVICE_ID: 'srv-test' }), true);
  assert.equal(app.settings.get('trust proxy'), 1);
});

test('respecte le paramètre explicite hors Render', () => {
  const enabled = fakeApp();
  const disabled = fakeApp();

  assert.equal(configureProxyTrust(enabled, { TRUST_PROXY: 'true' }), true);
  assert.equal(enabled.settings.get('trust proxy'), 1);
  assert.equal(configureProxyTrust(disabled, { TRUST_PROXY: 'false' }), false);
  assert.equal(disabled.settings.has('trust proxy'), false);
});