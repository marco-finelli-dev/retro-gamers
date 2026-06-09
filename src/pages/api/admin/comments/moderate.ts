import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../../lib/supabase/server';
import { getUserProfileFromToken, isStaffProfile } from '../../../../lib/supabase/auth';

type ModeratePayload = {
  commentId?: string;
  action?: 'approve' | 'reject' | 'spam' | 'delete' | 'restore';
  note?: string;
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const actionToStatus = {
  approve: 'approved',
  reject: 'rejected',
  spam: 'spam',
  delete: 'deleted',
  restore: 'pending',
} as const;

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export const POST: APIRoute = async ({ request, cookies }) => {
  const token = cookies.get('rg_access_token')?.value;
  const session = await getUserProfileFromToken(token ?? '');

  if (session.error || !session.profile || !session.user) {
    return json({ ok: false, error: session.error }, session.status);
  }

  if (!isStaffProfile(session.profile)) {
    return json({ ok: false, error: 'Permessi insufficienti.' }, 403);
  }

  let payload: ModeratePayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const commentId = payload.commentId?.trim() ?? '';
  const action = payload.action;

  if (!commentId) {
    return json({ ok: false, error: 'Commento mancante.' }, 400);
  }

  if (!isUuid(commentId)) {
    return json({ ok: false, error: 'ID commento non valido.' }, 400);
  }

  if (!action || !(action in actionToStatus)) {
    return json({ ok: false, error: 'Azione non valida.' }, 400);
  }

  const nextStatus = actionToStatus[action];

  const updatePayload: Record<string, unknown> = {
    status: nextStatus,
  };

  if (action === 'approve') {
    updatePayload.approved_at = new Date().toISOString();
    updatePayload.approved_by = session.user.id;
    updatePayload.deleted_at = null;
  }

  if (action === 'delete') {
    updatePayload.deleted_at = new Date().toISOString();
  }

  if (action === 'restore') {
    updatePayload.approved_at = null;
    updatePayload.approved_by = null;
    updatePayload.deleted_at = null;
  }

  const { data: comment, error: updateError } = await supabaseAdmin
    .from('comments')
    .update(updatePayload)
    .eq('id', commentId)
    .select('id, status, approved_at, deleted_at')
    .single();

  if (updateError) {
    return json({ ok: false, error: updateError.message }, 500);
  }

  const { error: eventError } = await supabaseAdmin
    .from('moderation_events')
    .insert({
      comment_id: commentId,
      moderator_id: session.user.id,
      action,
      note: payload.note?.trim() || null,
    });

  if (eventError) {
    return json({
      ok: true,
      warning: eventError.message,
      comment,
    });
  }

  return json({
    ok: true,
    comment,
  });
};
