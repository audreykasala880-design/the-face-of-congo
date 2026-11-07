import 'dotenv/config';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import multer from 'multer';
import mysql from 'mysql2/promise';
import nodemailer from 'nodemailer';
import { cloudinaryStorage, CloudinaryUnavailableError } from './cloudinary-storage.js';
import { MySQLSessionStore } from './mysql-session-store.js';
import { normalizeApplication, ValidationError } from './validation.js';

const directory = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const databaseOptions = {
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
  timezone: 'Z',
  ...(process.env.MYSQL_SSL_CA_BASE64
    ? { ssl: { ca: Buffer.from(process.env.MYSQL_SSL_CA_BASE64, 'base64'), rejectUnauthorized: true } }
    : process.env.MYSQL_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
};

function ensureConfiguration() {
  const localPasswordlessRoot = process.env.NODE_ENV !== 'production'
    && process.env.MYSQL_HOST === '127.0.0.1'
    && process.env.MYSQL_USER === 'root'
    && process.env.MYSQL_PASSWORD === '';
  const missing = ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE', 'ADMIN_USERNAME', 'ADMIN_PASSWORD', 'SESSION_SECRET']
    .filter((name) => !process.env[name] && !(name === 'MYSQL_PASSWORD' && localPasswordlessRoot));
  if (missing.length) {
    throw new Error(`Variables d’environnement manquantes : ${missing.join(', ')}`);
  }
  if (process.env.ADMIN_PASSWORD.length < 12) {
    throw new Error('ADMIN_PASSWORD doit contenir au moins 12 caractères.');
  }
  if (process.env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET doit contenir au moins 32 caractères.');
  }
  if (process.env.NODE_ENV === 'production' && !process.env.CLOUDINARY_URL) {
    throw new Error('CLOUDINARY_URL est obligatoire en production.');
  }
}

function safeEqual(first, second) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);
  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
}

function regenerateSession(request) {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => error ? reject(error) : resolve());
  });
}

function saveSession(request) {
  return new Promise((resolve, reject) => {
    request.session.save((error) => error ? reject(error) : resolve());
  });
}

function destroySession(request) {
  return new Promise((resolve, reject) => {
    request.session.destroy((error) => error ? reject(error) : resolve());
  });
}

function requireCsrf(request, response, next) {
  const provided = request.get('x-csrf-token') || '';
  const expected = request.session.csrfToken || '';
  if (!provided || !expected || !safeEqual(provided, expected)) {
    return response.status(403).json({ error: 'Requête expirée. Rechargez la page et réessayez.' });
  }
  next();
}

function requireAdmin(request, response, next) {
  if (request.session.adminAuthenticated !== true) {
    return response.status(401).json({ error: 'Authentification requise.' });
  }
  next();
}

const pool = mysql.createPool(databaseOptions);
const sessionStore = new MySQLSessionStore(pool);
const mailTransport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    } : undefined,
  })
  : null;

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '32kb' }));
app.use(session({
  name: 'face.sid',
  secret: process.env.SESSION_SECRET || 'configuration-invalide',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000,
  },
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 3, fields: 24, fieldSize: 10 * 1024 },
});
const parsePhotos = upload.fields([
  { name: 'photo_portrait', maxCount: 1 },
  { name: 'photo_pied', maxCount: 1 },
  { name: 'photo_artistique', maxCount: 1 },
]);
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
});

app.get('/', (request, response) => response.sendFile(join(directory, 'index.html')));
app.get('/admin', (request, response) => {
  response.set('Cache-Control', 'no-store');
  response.sendFile(join(directory, 'admin.html'));
});
app.get('/admin.html', (request, response) => {
  response.set('Cache-Control', 'no-store');
  response.sendFile(join(directory, 'admin.html'));
});
app.get('/style.css', (request, response) => response.sendFile(join(directory, 'style.css')));
app.get('/app.js', (request, response) => response.sendFile(join(directory, 'app.js')));
app.get('/admin.js', (request, response) => {
  response.set('Cache-Control', 'no-store');
  response.sendFile(join(directory, 'admin.js'));
});
app.get('/pwa.js', (request, response) => response.sendFile(join(directory, 'pwa.js')));
app.get('/logo.svg', (request, response) => response.sendFile(join(directory, 'logo.svg')));
app.get('/manifest.webmanifest', (request, response) => response.sendFile(join(directory, 'manifest.webmanifest')));
app.get('/icons/app-icon.svg', (request, response) => response.sendFile(join(directory, 'icons', 'app-icon.svg')));
app.get('/service-worker.js', (request, response) => {
  response.set('Service-Worker-Allowed', '/');
  response.sendFile(join(directory, 'service-worker.js'));
});

app.get('/health', async (request, response, next) => {
  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/csrf', async (request, response, next) => {
  try {
    request.session.csrfToken ??= randomBytes(32).toString('hex');
    await saveSession(request);
    response.set('Cache-Control', 'no-store');
    response.json({ csrfToken: request.session.csrfToken });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/login', loginLimiter, requireCsrf, async (request, response, next) => {
  try {
    const { username, password } = request.body ?? {};
    const valid = typeof username === 'string'
      && typeof password === 'string'
      && safeEqual(username, process.env.ADMIN_USERNAME)
      && safeEqual(password, process.env.ADMIN_PASSWORD);

    if (!valid) return response.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });

    await regenerateSession(request);
    request.session.adminAuthenticated = true;
    request.session.csrfToken = randomBytes(32).toString('hex');
    await saveSession(request);
    response.set('Cache-Control', 'no-store');
    response.json({ csrfToken: request.session.csrfToken });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/logout', requireCsrf, requireAdmin, async (request, response, next) => {
  try {
    await destroySession(request);
    response.clearCookie('face.sid', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/applications', requireAdmin, async (request, response, next) => {
  try {
    response.set('Cache-Control', 'no-store');
    const [applications] = await pool.query(`
      SELECT id, nom, postnom, prenom, sexe, telephone, nom_scene, date_naissance,
             ville, email, taille, profession, experience, type_modele, motivation,
             qualites, signature, date_soumission, statut, cree_le,
             (photo_artistique_public_id IS NOT NULL OR photo_artistique IS NOT NULL) AS a_photo_artistique
      FROM candidatures
      ORDER BY cree_le DESC, id DESC
    `);
    const normalizedApplications = applications.map((application) => ({
      ...application,
      type_modele: typeof application.type_modele === 'string'
        ? JSON.parse(application.type_modele)
        : application.type_modele,
      a_photo_artistique: Boolean(application.a_photo_artistique),
    }));
    const [statusRows] = await pool.query('SELECT statut, COUNT(*) AS total FROM candidatures GROUP BY statut');
    const counts = { total: 0, 'Reçue': 0, 'En cours': 0, 'Acceptée': 0, 'Refusée': 0 };
    const [[totalRow]] = await pool.query('SELECT COUNT(*) AS total FROM candidatures');
    counts.total = Number(totalRow.total);
    for (const row of statusRows) {
      if (Object.hasOwn(counts, row.statut)) counts[row.statut] = Number(row.total);
    }
    response.json({ applications: normalizedApplications, counts });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/applications/:id/status', requireCsrf, requireAdmin, async (request, response, next) => {
  try {
    const id = Number(request.params.id);
    const { statut } = request.body ?? {};
    const statuses = ['Reçue', 'En cours', 'Acceptée', 'Refusée'];
    if (!Number.isSafeInteger(id) || id < 1 || !statuses.includes(statut)) {
      return response.status(400).json({ error: 'La mise à jour du statut est invalide.' });
    }
    const [result] = await pool.execute('UPDATE candidatures SET statut = ? WHERE id = ?', [statut, id]);
    if (result.affectedRows === 0) {
      const [rows] = await pool.execute('SELECT id FROM candidatures WHERE id = ?', [id]);
      if (!rows.length) return response.status(404).json({ error: 'Candidature introuvable.' });
    }
    response.json({ updated: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/applications/:id/photos/:type', requireAdmin, async (request, response, next) => {
  const photoColumns = {
    portrait: ['photo_portrait_public_id', 'photo_portrait_format', 'photo_portrait', 'photo_portrait_mime'],
    pied: ['photo_pied_public_id', 'photo_pied_format', 'photo_pied', 'photo_pied_mime'],
    artistique: ['photo_artistique_public_id', 'photo_artistique_format', 'photo_artistique', 'photo_artistique_mime'],
  };
  const columns = photoColumns[request.params.type];
  const id = Number(request.params.id);
  if (!columns || !Number.isSafeInteger(id) || id < 1) {
    return response.status(404).json({ error: 'Photo introuvable.' });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT ${columns[0]} AS public_id, ${columns[1]} AS format, ${columns[2]} AS legacy_image, ${columns[3]} AS legacy_mime FROM candidatures WHERE id = ?`,
      [id],
    );
    if (!rows.length || (!rows[0].public_id && !rows[0].legacy_image)) {
      return response.status(404).json({ error: 'Photo introuvable.' });
    }
    if (rows[0].public_id) {
      return response.redirect(302, cloudinaryStorage.privateDownloadUrl(rows[0].public_id, rows[0].format));
    }
    response.set({
      'Content-Type': rows[0].legacy_mime,
      'Content-Length': rows[0].legacy_image.length,
      'Content-Disposition': `inline; filename="candidature-${id}-${request.params.type}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(rows[0].legacy_image);
  } catch (error) {
    next(error);
  }
});

app.post('/api/applications', requireCsrf, parsePhotos, async (request, response, next) => {
  let uploadedAssets;
  try {
    const { application, photos } = await normalizeApplication(request.body, request.files ?? {});
    uploadedAssets = await cloudinaryStorage.uploadApplicationPhotos(photos);
    await pool.execute(`
      INSERT INTO candidatures (
        nom, postnom, prenom, sexe, telephone, nom_scene, date_naissance,
        ville, email, taille, profession, experience, type_modele, motivation,
        qualites, signature, date_soumission,
        photo_portrait_public_id, photo_portrait_format, photo_pied_public_id,
        photo_pied_format, photo_artistique_public_id, photo_artistique_format
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      application.nom,
      application.postnom,
      application.prenom,
      application.sexe,
      application.telephone,
      application.nom_scene,
      application.date_naissance,
      application.ville,
      application.email,
      application.taille,
      application.profession,
      application.experience,
      JSON.stringify(application.type_modele),
      application.motivation,
      application.qualites,
      application.signature,
      application.date_soumission,
      uploadedAssets.portrait.publicId,
      uploadedAssets.portrait.format,
      uploadedAssets.pied.publicId,
      uploadedAssets.pied.format,
      uploadedAssets.artistique?.publicId ?? null,
      uploadedAssets.artistique?.format ?? null,
    ]);
    if (mailTransport && process.env.ADMIN_NOTIFICATION_EMAIL && process.env.SMTP_FROM) {
      const baseUrl = process.env.PUBLIC_BASE_URL || `${request.protocol}://${request.get('host')}`;
      mailTransport.sendMail({
        from: process.env.SMTP_FROM,
        to: process.env.ADMIN_NOTIFICATION_EMAIL,
        subject: 'Nouvelle candidature - The Face of Congo',
        text: `Une nouvelle candidature de ${application.prenom} ${application.nom} a été reçue. Consultez le dossier dans le tableau d’administration : ${baseUrl}/admin`,
      }).catch((error) => console.error(`Notification e-mail non envoyée : ${error.message}`));
    }
    response.status(201).json({ message: 'Votre candidature a bien été enregistrée. Merci !' });
  } catch (error) {
    if (uploadedAssets) {
      await Promise.allSettled(Object.values(uploadedAssets)
        .filter(Boolean)
        .map((asset) => cloudinaryStorage.deleteAsset(asset.publicId)));
    }
    next(error);
  }
});

app.use((error, request, response, next) => {
  if (response.headersSent) return next(error);
  if (error instanceof ValidationError) {
    return response.status(error.statusCode).json({ error: error.message });
  }
  if (error instanceof CloudinaryUnavailableError) {
    return response.status(error.statusCode).json({ error: error.message });
  }
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Chaque photo doit peser au maximum 2 Mo.'
      : 'Les fichiers envoyés sont invalides.';
    return response.status(400).json({ error: message });
  }
  console.error(error);
  response.status(500).json({ error: 'Une erreur est survenue. Veuillez réessayer plus tard.' });
});

async function start() {
  ensureConfiguration();
  await pool.query('SELECT 1');
  const schema = await readFile(join(directory, 'schema.sql'), 'utf8');
  await pool.query(schema);
  const [columns] = await pool.query('SHOW COLUMNS FROM candidatures');
  const existingColumns = new Map(columns.map((column) => [column.Field, column.Null]));
  const cloudinaryColumns = [
    ['photo_portrait_public_id', 'VARCHAR(255) NULL'],
    ['photo_portrait_format', 'VARCHAR(16) NULL'],
    ['photo_pied_public_id', 'VARCHAR(255) NULL'],
    ['photo_pied_format', 'VARCHAR(16) NULL'],
    ['photo_artistique_public_id', 'VARCHAR(255) NULL'],
    ['photo_artistique_format', 'VARCHAR(16) NULL'],
  ];
  for (const [name, definition] of cloudinaryColumns) {
    if (!existingColumns.has(name)) {
      await pool.query(`ALTER TABLE candidatures ADD COLUMN ${name} ${definition}`);
    }
  }
  const legacyImageColumns = [
    ['photo_portrait', 'MEDIUMBLOB'],
    ['photo_portrait_mime', 'VARCHAR(32)'],
    ['photo_pied', 'MEDIUMBLOB'],
    ['photo_pied_mime', 'VARCHAR(32)'],
    ['photo_artistique', 'MEDIUMBLOB'],
    ['photo_artistique_mime', 'VARCHAR(32)'],
  ];
  for (const [name, type] of legacyImageColumns) {
    if (existingColumns.get(name) === 'NO') {
      await pool.query(`ALTER TABLE candidatures MODIFY COLUMN ${name} ${type} NULL`);
    }
  }
  await sessionStore.initialize();
  app.listen(port, host, () => {
    console.log(`The Face of Congo prêt sur http://${host}:${port}`);
  });
}

start().catch(async (error) => {
  console.error(`Démarrage impossible : ${error.message}`);
  await pool.end();
  sessionStore.close();
  process.exitCode = 1;
});