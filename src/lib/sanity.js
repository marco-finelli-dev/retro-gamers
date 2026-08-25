import { createClient } from '@sanity/client';

const projectId = 'y88ky0mu';
const dataset = 'production';
const apiVersion = '2024-01-01';
const studioUrl = 'https://retro-gamers-studio.vercel.app';

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

export const publicFreshClient = createClient({
  ...baseClientConfig,
  useCdn: false,
  perspective: 'published'
});

let publishedReadClient;
let hasWarnedMissingReadToken = false;

function getSanityReadToken() {
  return String(process.env.SANITY_API_READ_TOKEN || '').trim();
}

function warnMissingReadToken() {
  if (!import.meta.env.DEV || hasWarnedMissingReadToken) {
    return;
  }

  hasWarnedMissingReadToken = true;
  console.warn(
    '[Sanity] SANITY_API_READ_TOKEN missing: authenticated published content may be unavailable locally.'
  );
}

export function getPublishedReadClient() {
  const readToken = getSanityReadToken();

  if (!readToken) {
    warnMissingReadToken();

    return publicFreshClient;
  }

  if (!publishedReadClient) {
    publishedReadClient = createClient({
      ...baseClientConfig,
      useCdn: false,
      perspective: 'published',
      token: readToken
    });
  }

  return publishedReadClient;
}

// Alias mantenuto per compatibilità con gli import esistenti.
export const client = publicClient;

let previewClient;

export function getPreviewClient() {
  const readToken = getSanityReadToken();

  if (!readToken) {
    throw new Error('Sanity preview read token is not configured.');
  }

  if (!previewClient) {
    previewClient = createClient({
      ...baseClientConfig,
      useCdn: false,
      perspective: 'drafts',
      token: readToken,
      stega: {
        enabled: true,
        studioUrl
      }
    });
  }

  return previewClient;
}

export function getSanityClient(isPreview = false) {
  return isPreview ? getPreviewClient() : publicClient;
}
