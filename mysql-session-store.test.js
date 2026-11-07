import test from 'node:test';
import assert from 'node:assert/strict';
import { MySQLSessionStore } from './mysql-session-store.js';

class FakePool {
  sessions = new Map();

  async query() {
    return [undefined];
  }

  async execute(sql, values) {
    if (sql.includes('SELECT session_data')) {
      const session = this.sessions.get(values[0]);
      return [[session && session.expiresAt > values[1] ? { session_data: session.data } : undefined].filter(Boolean)];
    }
    if (sql.includes('INSERT INTO admin_sessions')) {
      this.sessions.set(values[0], { expiresAt: values[1], data: values[2] });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('UPDATE admin_sessions')) {
      const session = this.sessions.get(values[1]);
      if (session) session.expiresAt = values[0];
      return [{ affectedRows: session ? 1 : 0 }];
    }
    if (sql.includes('DELETE FROM admin_sessions WHERE session_id')) {
      this.sessions.delete(values[0]);
      return [{ affectedRows: 1 }];
    }
    return [[{ affectedRows: 0 }]];
  }
}

function storeCall(store, method, ...values) {
  return new Promise((resolve, reject) => {
    store[method](...values, (error, result) => error ? reject(error) : resolve(result));
  });
}

test('persiste, lit puis supprime une session', async () => {
  const store = new MySQLSessionStore(new FakePool());
  const sessionData = { adminAuthenticated: true, cookie: { originalMaxAge: 60000 } };
  try {
    await storeCall(store, 'set', 'session-1', sessionData);
    assert.deepEqual(await storeCall(store, 'get', 'session-1'), sessionData);
    await storeCall(store, 'destroy', 'session-1');
    assert.equal(await storeCall(store, 'get', 'session-1'), null);
  } finally {
    store.close();
  }
});

test('ne renvoie pas une session expirée', async () => {
  const pool = new FakePool();
  const store = new MySQLSessionStore(pool);
  pool.sessions.set('expired', { expiresAt: Date.now() - 1, data: '{"adminAuthenticated":true}' });
  try {
    assert.equal(await storeCall(store, 'get', 'expired'), null);
  } finally {
    store.close();
  }
});