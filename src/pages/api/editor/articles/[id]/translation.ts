import type { APIRoute } from 'astro';
import { logApiError } from '../../../../../lib/api-errors';
import {
  createEditorialArticleTranslation,
  getEditorialArticleEditPath,
  requireEditorialArticleContext,
} from '../../../../../lib/editorial/articles.server';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
    },
  });

export const POST: APIRoute = async ({ params, cookies }) => {
  const access = await requireEditorialArticleContext(cookies);

  if (!access.ok) {
    return json({ ok: false, error: access.error }, access.status);
  }

  try {
    const result = await createEditorialArticleTranslation({
      context: access.context,
      sourceRootDocumentId: params.id,
    });

    if (!result.ok) {
      return json({ ok: false, error: result.error }, result.status);
    }

    return json({
      ok: true,
      id: result.sanityDocumentId,
      draftId: result.draftDocumentId,
      editUrl: getEditorialArticleEditPath(result.sanityDocumentId, 'en'),
      auditLogged: result.auditLogged,
    });
  } catch (error) {
    logApiError('editorial-articles.translation-api', error);
    return json({ ok: false, error: 'article_translation_create_failed' }, 500);
  }
};
