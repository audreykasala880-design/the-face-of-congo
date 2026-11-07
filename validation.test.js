import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApplication, ValidationError } from './validation.js';

const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/r9sAAAAASUVORK5CYII=', 'base64');

function validBody() {
  return {
    nom: 'Kabila',
    prenom: 'Amina',
    sexe: 'Femme',
    telephone: '+243000000000',
    date_naissance: '2000-01-01',
    ville: 'Kinshasa',
    email: 'amina@example.com',
    taille: '170',
    experience: 'Non',
    motivation: 'Participer au concours.',
    qualites: 'Motivée et ponctuelle.',
    signature: 'Amina Kabila',
    date_soumission: '2026-11-06',
    engagement: '1',
    type_modele: ['Mode', 'Artistique'],
  };
}

function validFiles() {
  return {
    photo_portrait: [{ buffer: tinyPng }],
    photo_pied: [{ buffer: tinyPng }],
  };
}

test('normalise une candidature et identifie les photos par leur contenu', async () => {
  const result = await normalizeApplication(validBody(), validFiles());

  assert.equal(result.application.taille, 170);
  assert.deepEqual(result.application.type_modele, ['Mode', 'Artistique']);
  assert.equal(result.photos.portrait.mime, 'image/png');
  assert.equal(result.photos.artistique, null);
});

test('refuse une adresse e-mail invalide', async () => {
  const body = validBody();
  body.email = 'pas-une-adresse';

  await assert.rejects(() => normalizeApplication(body, validFiles()), ValidationError);
});

test('refuse une date impossible et une photo absente', async () => {
  const invalidDate = validBody();
  invalidDate.date_naissance = '2000-02-31';
  await assert.rejects(() => normalizeApplication(invalidDate, validFiles()), /dates valides/);

  const missingPhoto = validFiles();
  delete missingPhoto.photo_pied;
  await assert.rejects(() => normalizeApplication(validBody(), missingPhoto), /photo en pied/);
});

test('refuse les octets qui ne sont pas une image', async () => {
  const files = validFiles();
  files.photo_portrait[0].buffer = Buffer.from('not an image');

  await assert.rejects(() => normalizeApplication(validBody(), files), /format JPG, PNG ou WEBP/);
});