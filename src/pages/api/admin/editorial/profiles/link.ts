import type { APIRoute } from 'astro';
import { logApiError } from '../../../../../lib/api-errors';
import {
  fetchTargetCommunityProfile,
  linkEditorialProfile,
  normalizeEditorialRole,
  normalizeUuid,
  requireEditorialMappingManager,
  verifySanityAuthor,
} from '../../../../../lib/editorial/admin.server';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
    },
  });

export const POST: APIRoute = async ({ cookies, request }) => {
  const auth = await requireEditorialMappingManager(cookies);

  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, auth.status);
  }

  let payload: Record<string, unknown>;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_request' }, 400);
  }

  const targetUserId = normalizeUuid(payload.targetUserId);
  const editorialRole = normalizeEditorialRole(payload.editorialRole);
  const sanityAuthorId = String(payload.sanityAuthorId || '').trim();

  if (!targetUserId) {
    return json({ ok: false, error: 'target_user_missing' }, 400);
  }

  if (!editorialRole) {
    return json({ ok: false, error: 'invalid editorial role' }, 400);
  }

  const target = await fetchTargetCommunityProfile(targetUserId);

  if (!target.ok) {
    return json({ ok: false, error: target.error }, target.status);
  }

  try {
    const author = await verifySanityAuthor(sanityAuthorId);

    if (!author) {
      return json({ ok: false, error: 'author missing' }, 404);
    }

    const result = await linkEditorialProfile({
      actorUserId: auth.context.user.id,
      targetUserId,
      sanityAuthorId: author._id,
      editorialRole,
    });

    if (!result.ok) {
      return json({ ok: false, error: result.error }, result.status);
    }

    return json({
      ok: true,
      auditLogged: result.auditLogged,
      editorialProfile: {
        userId: result.profile.userId,
        sanityAuthorId: result.profile.sanityAuthorId,
        editorialRole: result.profile.editorialRole,
        status: result.profile.status,
        author,
      },
      warning: result.auditLogged ? null : 'audit_unavailable',
    });
  } catch (error) {
    logApiError('editorial-profile-link-api', error);
    return json({ ok: false, error: 'mapping_failed' }, 500);
  }
};
