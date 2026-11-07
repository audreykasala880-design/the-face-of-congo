import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudinaryStorage, CloudinaryUnavailableError } from './cloudinary-storage.js';

function fakeCloudinary({ failSlot = null } = {}) {
  const uploaded = [];
  const deleted = [];
  const options = [];
  const client = {
    uploader: {
      upload_stream(uploadOptions, callback) {
        options.push(uploadOptions);
        return {
          end(buffer) {
            const slot = uploadOptions.public_id.split('-').at(-1);
            if (slot === failSlot) return callback(new Error('Upload échoué'));
            const asset = { public_id: uploadOptions.public_id, format: 'png' };
            uploaded.push(asset);
            callback(null, asset);
          },
      };
      },
      async destroy(publicId) {
        deleted.push(publicId);
        return { result: 'ok' };
      },
    },
    utils: {
      private_download_url(publicId, format, downloadOptions) {
        return `${publicId}.${format}?expires_at=${downloadOptions.expires_at}`;
      },
    },
  };
  return { client, uploaded, deleted, options };
}

const photos = {
  portrait: { data: Buffer.from('portrait') },
  pied: { data: Buffer.from('pied') },
  artistique: null,
};

test('envoie les photos comme ressources privées et génère un lien temporaire', async () => {
  const fake = fakeCloudinary();
  const storage = createCloudinaryStorage(fake.client, () => true);
  const uploaded = await storage.uploadApplicationPhotos(photos);

  assert.equal(fake.uploaded.length, 2);
  assert.ok(fake.options.every((option) => option.type === 'authenticated'));
  assert.match(storage.privateDownloadUrl(uploaded.portrait.publicId, 'png'), /expires_at=/);
});

test('supprime les photos déjà envoyées si une autre photo échoue', async () => {
  const fake = fakeCloudinary({ failSlot: 'pied' });
  const storage = createCloudinaryStorage(fake.client, () => true);

  await assert.rejects(() => storage.uploadApplicationPhotos(photos), /Upload échoué/);
  assert.equal(fake.uploaded.length, 1);
  assert.deepEqual(fake.deleted, [fake.uploaded[0].public_id]);
});

test('refuse les téléversements quand aucun secret Cloudinary n’est configuré', async () => {
  const fake = fakeCloudinary();
  const storage = createCloudinaryStorage(fake.client, () => false);

  await assert.rejects(() => storage.uploadApplicationPhotos(photos), CloudinaryUnavailableError);
  assert.equal(fake.uploaded.length, 0);
});