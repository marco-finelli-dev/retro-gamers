import type { APIRoute } from 'astro';
import { logApiError } from '../../../lib/api-errors';
import {
  requireEditorialArticleContext,
  searchEditorialAuthors,
} from '../../../lib/editorial/articles.server';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
    },
  });

export const GET: APIRoute = async ({ cookies, request }) => {
  const access = await requireEditorialArticleContext(cookies);

  if (!access.ok) {
    return json({ ok: false, error: access.error }, access.status);
  }

  try {
    const url = new URL(request.url);
    const result = await searchEditorialAuthors({
      context: access.context,
      q: url.searchParams.get('q'),
      limit: url.searchParams.get('limit'),
    });

    if (!result.ok) {
      return json({ ok: false, error: result.error }, result.status);
    }

    return json({ ok: true, items: result.items });
  } catch (error) {
    logApiError('editorial-authors.api', error);

    return json({ ok: false, error: 'author_search_failed' }, 500);
  }
};
