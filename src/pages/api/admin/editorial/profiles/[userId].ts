import type { APIRoute } from 'astro';
import { logApiError } from '../../../../../lib/api-errors';
import {
  fetchSanityAuthorsByIds,
  fetchTargetCommunityProfile,
  normalizeEditorialRole,
  normalizeEditorialStatus,
  normalizeUuid,
  requireEditorialMappingManager,
  updateEditorialProfile,
} from '../../../../../lib/editorial/admin.server';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
    },
  });

export const PATCH: APIRoute = async ({ cookies, params, request }) => {
  const auth = await requireEditorialMappingManager(cookies);

  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, auth.status);
  }

  const targetUserId = normalizeUuid(params.userId);

  if (!targetUserId) {
    return json({ ok: false, error: 'target_user_missing' }, 400);
  }

  let payload: Record<string, unknown>;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_request' }, 400);
  }

  const hasRole = Object.hasOwn(payload, 'editorialRole');
  const hasStatus = Object.hasOwn(payload, 'status');
  const editorialRole = hasRole ? normalizeEditorialRole(payload.editorialRole) : null;
  const status = hasStatus ? normalizeEditorialStatus(payload.status) : null;

  if (!hasRole && !hasStatus) {
    return json({ ok: false, error: 'invalid_request' }, 400);
  }

  if (hasRole && !editorialRole) {
    return json({ ok: false, error: 'invalid editorial role' }, 400);
  }

  if (hasStatus && !status) {
    return json({ ok: false, error: 'invalid_status' }, 400);
  }

  const target = await fetchTargetCommunityProfile(targetUserId);

  if (!target.ok) {
    return json({ ok: false, error: target.error }, target.status);
  }

  try {
    const result = await updateEditorialProfile({
      actorUserId: auth.context.user.id,
      targetUserId,
      editorialRole,
      status,
    });

    if (!result.ok) {
      return json({ ok: false, error: result.error }, result.status);
    }

    const authorById = await fetchSanityAuthorsByIds([result.profile.sanityAuthorId]);

    return json({
      ok: true,
      auditLogged: result.auditLogged,
      editorialProfile: {
        userId: result.profile.userId,
        sanityAuthorId: result.profile.sanityAuthorId,
        editorialRole: result.profile.editorialRole,
        status: result.profile.status,
        author: authorById.get(result.profile.sanityAuthorId) || null,
      },
      warning: result.auditLogged ? null : 'audit_unavailable',
    });
  } catch (error) {
    logApiError('editorial-profile-update-api', error);
    return json({ ok: false, error: 'mapping_failed' }, 500);
  }
};
