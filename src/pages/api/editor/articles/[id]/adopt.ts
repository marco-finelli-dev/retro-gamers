import type { APIRoute } from 'astro';
import { logApiError } from '../../../../../lib/api-errors';
import {
  adoptPublishedLegacyEditorialArticle,
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

export const POST: APIRoute = async ({ request, params, cookies }) => {
  const access = await requireEditorialArticleContext(cookies);

  if (!access.ok) {
    return json({ ok: false, error: access.error }, access.status);
  }

  let payload: Record<string, unknown> = {};

  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  try {
    const result = await adoptPublishedLegacyEditorialArticle({
      context: access.context,
      rootDocumentId: params.id,
    });

    if (!result.ok) {
      return json({ ok: false, error: result.error }, result.status);
    }

    const requestedLanguage = payload.uiLanguage === 'en' ? 'en' : 'it';
    const editUrl = getEditorialArticleEditPath(
      result.ownership.sanityDocumentId,
      requestedLanguage
    );

    return json({
      ok: true,
      id: result.ownership.sanityDocumentId,
      editUrl,
      adopted: result.adopted,
    });
  } catch (error) {
    logApiError('editorial-articles.legacy-adoption-api', error);
    return json({ ok: false, error: 'legacy_adoption_failed' }, 500);
  }
};
