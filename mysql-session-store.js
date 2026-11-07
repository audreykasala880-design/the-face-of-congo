import session from 'express-session';

const sessionLifetime = 8 * 60 * 60 * 1000;

export class MySQLSessionStore extends session.Store {
  constructor(pool) {
    super();
    this.pool = pool;
    this.cleanupTimer = setInterval(() => {
      this.pool.execute('DELETE FROM admin_sessions WHERE expires_at <= ?', [Date.now()])
        .catch((error) => console.error(`Nettoyage des sessions impossible : ${error.message}`));
    }, 15 * 60 * 1000).unref();
  }

  initialize() {
    return this.pool.query(`
      CREATE TABLE IF NOT EXISTS admin_sessions (
        session_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        expires_at BIGINT UNSIGNED NOT NULL,
        session_data MEDIUMTEXT NOT NULL,
        PRIMARY KEY (session_id),
        INDEX idx_admin_sessions_expires (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  get(sessionId, callback) {
    this.pool.execute(
      'SELECT session_data FROM admin_sessions WHERE session_id = ? AND expires_at > ?',
      [sessionId, Date.now()],
    ).then(([rows]) => {
      callback(null, rows.length ? JSON.parse(rows[0].session_data) : null);
    }).catch(callback);
  }

  set(sessionId, sessionData, callback) {
    const lifetime = Number(sessionData.cookie?.originalMaxAge) || sessionLifetime;
    const expiresAt = Date.now() + lifetime;
    this.pool.execute(`
      INSERT INTO admin_sessions (session_id, expires_at, session_data)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at), session_data = VALUES(session_data)
    `, [sessionId, expiresAt, JSON.stringify(sessionData)]).then(() => callback?.(null)).catch((error) => callback?.(error));
  }

  touch(sessionId, sessionData, callback) {
    const lifetime = Number(sessionData.cookie?.originalMaxAge) || sessionLifetime;
    this.pool.execute(
      'UPDATE admin_sessions SET expires_at = ? WHERE session_id = ?',
      [Date.now() + lifetime, sessionId],
    ).then(() => callback?.(null)).catch((error) => callback?.(error));
  }

  destroy(sessionId, callback) {
    this.pool.execute('DELETE FROM admin_sessions WHERE session_id = ?', [sessionId])
      .then(() => callback?.(null)).catch((error) => callback?.(error));
  }

  close() {
    clearInterval(this.cleanupTimer);
  }
}