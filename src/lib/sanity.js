import { createClient } from '@sanity/client';

const projectId = 'y88ky0mu';
const dataset = 'production';
const apiVersion = '2024-01-01';
const readToken = process.env.SANITY_API_READ_TOKEN;

export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  perspective: 'published',
  token: readToken
});

export const previewClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  perspective: 'drafts',
  token: process.env.SANITY_API_READ_TOKEN
});

export function getSanityClient(isPreview = false) {
  return isPreview ? previewClient : client;
}
