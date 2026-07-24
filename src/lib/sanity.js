import { createClient } from '@sanity/client';

const projectId = 'y88ky0mu';
const dataset = 'production';
const apiVersion = '2024-01-01';

const baseClientConfig = {
  projectId,
  dataset,
  apiVersion
};

export const publicClient = createClient({
  ...baseClientConfig,
  useCdn: true,
  perspective: 'published'
});

// Alias mantenuto per compatibilità con gli import esistenti.
export const client = publicClient;

let previewClient;

export function getPreviewClient() {
  const readToken = process.env.SANITY_API_READ_TOKEN;

  if (!readToken) {
    throw new Error('Sanity preview read token is not configured.');
  }

  if (!previewClient) {
    previewClient = createClient({
      ...baseClientConfig,
      useCdn: false,
      perspective: 'drafts',
      token: readToken
    });
  }

  return previewClient;
}

export function getSanityClient(isPreview = false) {
  return isPreview ? getPreviewClient() : publicClient;
}