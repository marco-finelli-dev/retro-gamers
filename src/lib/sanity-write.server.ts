import { createClient, type SanityClient } from '@sanity/client';

const projectId = 'y88ky0mu';
const dataset = 'production';
const apiVersion = '2024-01-01';
const documentActionsApiVersion = '2024-05-23';

const baseWriteClientConfig = {
  projectId,
  dataset,
  apiVersion,
};

let sanityWriteClient: SanityClient | null = null;
let sanityRawClient: SanityClient | null = null;
let sanityDocumentActionsClient: SanityClient | null = null;

function assertServerRuntime() {
  if (typeof window !== 'undefined') {
    throw new Error('Sanity write client can only be used server-side.');
  }
}

function getSanityWriteToken() {
  assertServerRuntime();

  // Use process.env at request/runtime boundaries so Vite does not inline the
  // write token into browser or serverless build artifacts.
  return String(
    process.env.SANITY_WRITE_TOKEN ||
      process.env.SANITY_API_WRITE_TOKEN ||
      ''
  ).trim();
}

export function hasSanityWriteToken() {
  return getSanityWriteToken().length > 0;
}

export function getSanityWriteClient() {
  const token = getSanityWriteToken();

  if (!token) {
    throw new Error('Sanity write token is not configured.');
  }

  if (!sanityWriteClient) {
    sanityWriteClient = createClient({
      ...baseWriteClientConfig,
      token,
      useCdn: false,
      perspective: 'published',
    });
  }

  return sanityWriteClient;
}

export function getSanityRawClient() {
  const token = getSanityWriteToken();

  if (!token) {
    throw new Error('Sanity write token is not configured.');
  }

  if (!sanityRawClient) {
    sanityRawClient = createClient({
      ...baseWriteClientConfig,
      token,
      useCdn: false,
      perspective: 'raw',
    });
  }

  return sanityRawClient;
}

export function getSanityDocumentActionsClient() {
  const token = getSanityWriteToken();

  if (!token) {
    throw new Error('Sanity write token is not configured.');
  }

  if (!sanityDocumentActionsClient) {
    sanityDocumentActionsClient = createClient({
      ...baseWriteClientConfig,
      apiVersion: documentActionsApiVersion,
      token,
      useCdn: false,
      perspective: 'published',
    });
  }

  return sanityDocumentActionsClient;
}
