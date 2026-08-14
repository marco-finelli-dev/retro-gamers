import type { APIRoute } from 'astro';
import { logApiError } from '../../../../../../lib/api-errors';
import {
  requireEditorialArticleContext,
  uploadEditorialArticleBodyImageAsset,
} from '../../../../../../lib/editorial/articles.server';

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
    const result = await uploadEditorialArticleBodyImageAsset({
      context: access.context,
      rootDocumentId: params.id,
      formData,
    });

    if (!result.ok) {
      return json({ ok: false, error: result.error }, result.status);
    }

    return json({
      ok: true,
      asset: result.asset,
    });
  } catch (error) {
    logApiError('editorial-articles.body-image-api', error);

    return json({ ok: false, error: 'body_image_upload_failed' }, 500);
  }
};
