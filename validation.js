import { fileTypeFromBuffer } from 'file-type';

const allowedModelTypes = new Set(['Mode', 'Beaute', 'Commercial', 'Artistique']);
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxImageSize = 2 * 1024 * 1024;

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

function readText(body, name, { required = false, maxLength = 255 } = {}) {
  const value = body[name] ?? '';
  if (typeof value !== 'string') {
    throw new ValidationError(`Le champ ${name} est invalide.`);
  }

  const text = value.trim();
  if (required && text === '') {
    throw new ValidationError('Veuillez remplir tous les champs obligatoires.');
  }
  if (text.length > maxLength) {
    throw new ValidationError(`Le champ ${name} dépasse la longueur autorisée.`);
  }
  return text;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

async function validateImage(file, required, label) {
  if (!file) {
    if (required) throw new ValidationError(`Veuillez ajouter la photo ${label}.`);
    return null;
  }
  if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0 || file.buffer.length > maxImageSize) {
    throw new ValidationError(`La photo ${label} doit peser au maximum 2 Mo.`);
  }

  const detected = await fileTypeFromBuffer(file.buffer);
  if (!detected || !allowedImageTypes.has(detected.mime)) {
    throw new ValidationError('Les photos doivent être au format JPG, PNG ou WEBP.');
  }
  return { data: file.buffer, mime: detected.mime };
}

export async function normalizeApplication(body, files) {
  const requiredFields = new Set([
    'nom', 'prenom', 'sexe', 'telephone', 'date_naissance', 'ville', 'email',
    'taille', 'motivation', 'qualites', 'signature', 'date_soumission',
  ]);
  const maxLengths = {
    nom: 120,
    postnom: 120,
    prenom: 120,
    sexe: 20,
    telephone: 40,
    nom_scene: 120,
    ville: 120,
    email: 254,
    taille: 3,
    profession: 160,
    experience: 20,
    motivation: 5000,
    qualites: 5000,
    signature: 240,
  };
  const fields = [
    'nom', 'postnom', 'prenom', 'sexe', 'telephone', 'nom_scene', 'date_naissance',
    'ville', 'email', 'taille', 'profession', 'experience', 'motivation', 'qualites',
    'signature', 'date_soumission',
  ];
  const application = {};
  for (const name of fields) {
    application[name] = readText(body, name, {
      required: requiredFields.has(name),
      maxLength: maxLengths[name] ?? 10,
    });
  }

  if (!['Femme', 'Homme'].includes(application.sexe)) {
    throw new ValidationError('La valeur du champ sexe est invalide.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(application.email)) {
    throw new ValidationError('Veuillez saisir une adresse e-mail valide.');
  }
  if (!validDate(application.date_naissance) || !validDate(application.date_soumission)) {
    throw new ValidationError('Veuillez saisir des dates valides.');
  }
  if (!/^\d{1,3}$/.test(application.taille) || Number(application.taille) < 100 || Number(application.taille) > 250) {
    throw new ValidationError('La taille doit être comprise entre 100 et 250 cm.');
  }
  application.taille = Number(application.taille);
  application.experience = application.experience || 'Non';
  if (!['Oui', 'Non'].includes(application.experience)) {
    throw new ValidationError('La valeur du champ expérience est invalide.');
  }
  if (!body.engagement) {
    throw new ValidationError('Veuillez confirmer votre engagement.');
  }

  const submittedTypes = body.type_modele ?? [];
  const modelTypes = Array.isArray(submittedTypes) ? submittedTypes : [submittedTypes];
  if (modelTypes.some((type) => typeof type !== 'string' || !allowedModelTypes.has(type))) {
    throw new ValidationError('La sélection du type de modèle est invalide.');
  }
  application.type_modele = [...new Set(modelTypes)];

  const photos = {
    portrait: await validateImage(files.photo_portrait?.[0], true, 'portrait'),
    pied: await validateImage(files.photo_pied?.[0], true, 'en pied'),
    artistique: await validateImage(files.photo_artistique?.[0], false, 'artistique'),
  };

  return { application, photos };
}