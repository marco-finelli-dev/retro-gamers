import type { APIRoute } from 'astro';
import { logApiError } from '../../../../../lib/api-errors';
import { requireEditorialArticleContext } from '../../../../../lib/editorial/articles.server';
import {
  createEditorialArticleComment,
  listEditorialArticleComments,
} from '../../../../../lib/editorial/comments.server';
import { normalizeUuid } from '../../../../../lib/uuid';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
    },
  });

function normalizeCommentBody(value: unknown) {
  if (typeof value !== 'string') return null;

  return value.trim();
}

function normalizeParentId(value: unknown) {
  const parentId = String(value || '').trim();

  if (!parentId) return null;

  return normalizeUuid(parentId);
}

export const GET: APIRoute = async ({ params, cookies }) => {
  const access = await requireEditorialArticleContext(cookies);

  if (!access.ok) {
    return json({ ok: false, error: access.error }, access.status);
  }

  try {
    const result = await listEditorialArticleComments({
      context: access.context,
      rootDocumentId: params.id,
    });

    if (!result.ok) {
      return json({ ok: false, error: result.error }, result.status);
    }

    return json({
      ok: true,
      comments: result.comments,
    });
  } catch (error) {
    logApiError('editorial-comments.get-api', error);
    return json({ ok: false, error: 'comments_fetch_failed' }, 500);
  }
};

export const POST: APIRoute = async ({ request, params, cookies }) => {
  const access = await requireEditorialArticleContext(cookies);

  if (!access.ok) {
    return json({ ok: false, error: access.error }, access.status);
  }

  let payload: Record<string, unknown>;

  try {
    const parsed = await request.json();

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json({ ok: false, error: 'invalid_request' }, 400);
    }

    payload = parsed as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid_request' }, 400);
  }

  const body = normalizeCommentBody(payload.body);

  if (body === null) {
    return json({ ok: false, error: 'invalid_comment_body' }, 400);
  }

  if (!body) {
    return json({ ok: false, error: 'comment_body_required' }, 422);
  }

  const parentId = normalizeParentId(payload.parentId);

  if (parentId === '') {
    return json({ ok: false, error: 'invalid_parent_comment_id' }, 400);
  }

  try {
    if (parentId) {
      const commentsResult = await listEditorialArticleComments({
        context: access.context,
        rootDocumentId: params.id,
      });

      if (!commentsResult.ok) {
        return json({ ok: false, error: commentsResult.error }, commentsResult.status);
      }

      const parentComment = commentsResult.comments.find((comment) => comment.id === parentId);

      if (!parentComment) {
        return json({ ok: false, error: 'parent_comment_not_found' }, 404);
      }

      if (parentComment.parentId) {
        return json({ ok: false, error: 'nested_replies_not_supported' }, 422);
      }
    }

    const result = await createEditorialArticleComment({
      context: access.context,
      rootDocumentId: params.id,
      body,
      parentId,
    });

    if (!result.ok) {
      return json({ ok: false, error: result.error }, result.status);
    }

    return json({
      ok: true,
      comment: result.comment,
    }, 201);
  } catch (error) {
    logApiError('editorial-comments.post-api', error);
    return json({ ok: false, error: 'comment_create_failed' }, 500);
  }
};
