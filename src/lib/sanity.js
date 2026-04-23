import { createClient } from '@sanity/client';

export const client = createClient({
  projectId: 'y88ky0mu',
  dataset: 'production',
  apiVersion: '2024-01-01',

  useCdn: false, // 🔥 IMPORTANTISSIMO ORA
  perspective: 'published'
});