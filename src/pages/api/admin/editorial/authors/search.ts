import type { APIRoute } from 'astro';
import { logApiError } from '../../../../../lib/api-errors';
import {
  requireEditorialMappingManager,
  searchSanityAuthors,
} from '../../../../../lib/editorial/admin.server';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
    },
  });

export const GET: APIRoute = async ({ cookies, url }) => {
  const auth = await requireEditorialMappingManager(cookies);

  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, auth.status);
  }

  const query = String(url.searchParams.get('q') || '').trim().slice(0, 80);

  try {
    const authors = await searchSanityAuthors(query);

    return json({
      ok: true,
      authors,
    });
  } catch (error) {
    logApiError('editorial-authors-search', error);
    return json({ ok: false, error: 'Sanity unavailable' }, 503);
  }
};
