import type { APIRoute } from 'astro';
import { logApiError } from '../../../../lib/api-errors';
import {
  createEditorialArticle,
  getEditorialArticleEditPath,
  requireEditorialArticleContext,
} from '../../../../lib/editorial/articles.server';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
    },
  });

export const POST: APIRoute = async ({ request, cookies }) => {
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
    const result = await createEditorialArticle({
      context: access.context,
      language: payload.language,
      type: payload.type,
    });

    if (!result.ok) {
      return json({ ok: false, error: result.error }, result.status);
    }

    const requestedLanguage = payload.uiLanguage === 'en' ? 'en' : 'it';

    return json({
      ok: true,
      id: result.sanityDocumentId,
      draftId: result.draftDocumentId,
      editUrl: getEditorialArticleEditPath(result.sanityDocumentId, requestedLanguage),
      auditLogged: result.auditLogged,
    });
  } catch (error) {
    logApiError('editorial-articles.create-api', error);
    return json({ ok: false, error: 'article_create_failed' }, 500);
  }
};
