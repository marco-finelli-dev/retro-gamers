import type { APIRoute } from 'astro';
import { logApiError } from '../../../../../lib/api-errors';
import {
  createSanityAuthorAndLinkProfile,
  fetchTargetCommunityProfile,
  normalizeEditorialRole,
  normalizeUuid,
  requireEditorialMappingManager,
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
    const result = await createSanityAuthorAndLinkProfile({
      actorUserId: auth.context.user.id,
      targetUserId,
      name: payload.name,
      nickname: payload.nickname,
      displayName: payload.displayName,
      slug: payload.slug,
      editorialRole,
    });

    if (!result.ok) {
      return json({
        ok: false,
        error: result.error,
        sanityAuthorId: result.sanityAuthorId || null,
      }, result.status);
    }

    return json({
      ok: true,
      auditLogged: result.auditLogged,
      author: result.author,
      editorialProfile: {
        userId: result.profile.userId,
        sanityAuthorId: result.profile.sanityAuthorId,
        editorialRole: result.profile.editorialRole,
        status: result.profile.status,
        author: result.author,
      },
      warning: result.auditLogged ? null : 'audit_unavailable',
    });
  } catch (error) {
    logApiError('editorial-author-create-api', error);
    return json({ ok: false, error: 'mapping_failed' }, 500);
  }
};
