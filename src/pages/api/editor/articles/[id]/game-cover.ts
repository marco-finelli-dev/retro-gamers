import type { APIRoute } from 'astro';
import { logApiError } from '../../../../../lib/api-errors';
import {
  requireEditorialArticleContext,
  updateEditorialArticleGameCover,
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

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return json({ ok: false, error: 'invalid_request' }, 400);
  }

  try {
    const result = await updateEditorialArticleGameCover({
      context: access.context,
      rootDocumentId: params.id,
      formData,
    });

    if (!result.ok) {
      const failure = result as typeof result & {
        assetUploaded?: boolean;
        articleUpdated?: boolean;
      };

      return json(
        {
          ok: false,
          error: result.error,
          assetUploaded: failure.assetUploaded || false,
          articleUpdated: failure.articleUpdated || false,
        },
        result.status
      );
    }

    return json({
      ok: true,
      article: result.article,
      action: result.action,
      assetUploaded: result.assetUploaded,
      articleUpdated: result.articleUpdated,
      auditLogged: result.auditLogged,
    });
  } catch (error) {
    logApiError('editorial-articles.game-cover-api', error);

    return json({ ok: false, error: 'game_cover_failed' }, 500);
  }
};
