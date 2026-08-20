import type { APIRoute } from 'astro';
import { logApiError } from '../../../../lib/api-errors';
import {
  fetchEditableEditorialArticle,
  requireEditorialArticleContext,
  updateEditableEditorialArticle,
} from '../../../../lib/editorial/articles.server';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
    },
  });

export const GET: APIRoute = async ({ params, cookies }) => {
  const access = await requireEditorialArticleContext(cookies);

  if (!access.ok) {
    return json({ ok: false, error: access.error }, access.status);
  }

  try {
    const result = await fetchEditableEditorialArticle({
      context: access.context,
      rootDocumentId: params.id,
    });

    if (!result.ok) {
      return json({ ok: false, error: result.error }, result.status);
    }

    return json({
      ok: true,
      article: result.article,
      ownership: result.ownership,
      documentLifecycle: result.documentLifecycle,
      documentSource: result.documentSource,
    });
  } catch (error) {
    logApiError('editorial-articles.get-api', error);
    return json({ ok: false, error: 'article_fetch_failed' }, 500);
  }
};

export const PATCH: APIRoute = async ({ request, params, cookies }) => {
  const access = await requireEditorialArticleContext(cookies);

  if (!access.ok) {
    return json({ ok: false, error: access.error }, access.status);
  }

  let payload: Record<string, unknown>;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_request' }, 400);
  }

  try {
    const result = await updateEditableEditorialArticle({
      context: access.context,
      rootDocumentId: params.id,
      payload,
    });

    if (!result.ok) {
      return json({ ok: false, error: result.error }, result.status);
    }

    return json({
      ok: true,
      article: result.article,
      auditLogged: result.auditLogged,
    });
  } catch (error) {
    logApiError('editorial-articles.patch-api', error);
    return json({ ok: false, error: 'article_save_failed' }, 500);
  }
};
