import type { APIRoute } from 'astro';
import { logApiError } from '../../../../../../../lib/api-errors';
import { requireEditorialArticleContext } from '../../../../../../../lib/editorial/articles.server';
import { resolveEditorialArticleComment } from '../../../../../../../lib/editorial/comments.server';
import { normalizeUuid } from '../../../../../../../lib/uuid';

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

  const commentId = normalizeUuid(params.commentId);

  if (!commentId) {
    return json({ ok: false, error: 'invalid_comment_id' }, 400);
  }

  try {
    const result = await resolveEditorialArticleComment({
      context: access.context,
      rootDocumentId: params.id,
      commentId,
    });

    if (!result.ok) {
      return json({ ok: false, error: result.error }, result.status);
    }

    return json({
      ok: true,
      comment: result.comment,
    });
  } catch (error) {
    logApiError('editorial-comments.resolve-api', error);
    return json({ ok: false, error: 'comment_resolve_failed' }, 500);
  }
};
