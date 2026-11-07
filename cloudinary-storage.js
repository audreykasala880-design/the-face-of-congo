import { randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({ secure: true });

export class CloudinaryUnavailableError extends Error {
  constructor() {
    super('Le stockage des photos n’est pas encore configuré.');
    this.name = 'CloudinaryUnavailableError';
    this.statusCode = 503;
  }
}

function uploadBuffer(client, buffer, slot) {
  return new Promise((resolve, reject) => {
    const stream = client.uploader.upload_stream({
      resource_type: 'image',
      type: 'authenticated',
      asset_folder: 'the-face-of-congo/applications',
      public_id: `application-${randomUUID()}-${slot}`,
      overwrite: false,
      unique_filename: false,
      headers: 'X-Robots-Tag: noindex',
    }, (error, result) => error ? reject(error) : resolve(result));
    stream.end(buffer);
  });
}

export function createCloudinaryStorage(client, isConfigured) {
  return {
    async uploadApplicationPhotos(photos) {
      if (!isConfigured()) throw new CloudinaryUnavailableError();

      const entries = Object.entries(photos).filter(([, photo]) => photo !== null);
      const results = await Promise.allSettled(
        entries.map(async ([slot, photo]) => ({ slot, asset: await uploadBuffer(client, photo.data, slot) })),
      );
      const failures = results.filter((result) => result.status === 'rejected');
      if (failures.length) {
        const uploadedAssets = results
          .filter((result) => result.status === 'fulfilled')
          .map((result) => result.value.asset);
        await Promise.allSettled(uploadedAssets.map((asset) => this.deleteAsset(asset.public_id)));
        throw failures[0].reason;
      }

      return Object.fromEntries(results.map((result) => [result.value.slot, {
        publicId: result.value.asset.public_id,
        format: result.value.asset.format,
      }]));
    },

    async deleteAsset(publicId) {
      return client.uploader.destroy(publicId, {
        resource_type: 'image',
        type: 'authenticated',
        invalidate: true,
      });
    },

    privateDownloadUrl(publicId, format) {
      if (!isConfigured()) throw new CloudinaryUnavailableError();
      return client.utils.private_download_url(publicId, format, {
        resource_type: 'image',
        type: 'authenticated',
        expires_at: Math.floor(Date.now() / 1000) + 300,
        attachment: false,
      });
    },
  };
}

export const cloudinaryStorage = createCloudinaryStorage(
  cloudinary,
  () => Boolean(process.env.CLOUDINARY_URL),
);