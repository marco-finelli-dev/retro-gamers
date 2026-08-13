import type { APIRoute } from 'astro';
import {
  fetchEditorialAuthorProfile,
  fetchPublishedArticleCountForAuthor,
  normalizeAuthorProfileResponse,
  requireActiveEditorialAuthorContext,
  updateEditorialAuthorProfile,
} from '../../../lib/editorial/profile.server';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });

export const GET: APIRoute = async ({ cookies }) => {
  const access = await requireActiveEditorialAuthorContext(cookies);

  if (!access.ok) {
    return json({ ok: false, error: access.error }, access.status);
  }

  const author = await fetchEditorialAuthorProfile(access.context.sanityAuthorId);

  if (!author) {
    return json({ ok: false, error: 'sanity_author_missing' }, 409);
  }

  const articleCount = await fetchPublishedArticleCountForAuthor(access.context.sanityAuthorId);

  return json({
    ok: true,
    ...normalizeAuthorProfileResponse(author, articleCount),
  });
};

export const PATCH: APIRoute = async ({ request, cookies }) => {
  const access = await requireActiveEditorialAuthorContext(cookies);

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

  const result = await updateEditorialAuthorProfile({
    context: access.context,
    payload,
  });

  if (!result.ok) {
    return json({ ok: false, error: result.error }, result.status);
  }

  const articleCount = await fetchPublishedArticleCountForAuthor(access.context.sanityAuthorId);

  return json({
    ok: true,
    ...normalizeAuthorProfileResponse(result.author, articleCount),
    fieldsChanged: result.fieldsChanged,
    auditLogged: result.auditLogged,
  });
};
