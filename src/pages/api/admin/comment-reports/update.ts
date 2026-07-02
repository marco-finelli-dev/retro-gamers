import type { APIRoute } from 'astro';
import { logApiError } from '../../../../lib/api-errors';
import { getUserSessionFromCookies, isStaffProfile } from '../../../../lib/supabase/auth';
import { supabaseAdmin } from '../../../../lib/supabase/server';

type UpdatePayload = {
  reportId?: string;
  status?: 'open' | 'resolved' | 'archived';
  adminNote?: string;
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const allowedStatuses = new Set(['open', 'resolved', 'archived']);

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user || !session.profile) {
    return json({ ok: false, error: session.error || 'Sessione non valida.' }, session.status || 401);
  }

  if (!isStaffProfile(session.profile)) {
    return json({ ok: false, error: 'Permessi insufficienti.' }, 403);
  }

  let payload: UpdatePayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const reportId = String(payload.reportId || '').trim();
  const status = String(payload.status || '').trim();
  const adminNote = String(payload.adminNote || '').trim().slice(0, 2000);

  if (!reportId || !isUuid(reportId)) {
    return json({ ok: false, error: 'Segnalazione non valida.' }, 400);
  }

  if (!allowedStatuses.has(status)) {
    return json({ ok: false, error: 'Stato non valido.' }, 400);
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    status,
    admin_note: adminNote || null,
    updated_at: now,
  };

  if (status === 'open') {
    updatePayload.resolved_by = null;
    updatePayload.resolved_at = null;
  } else {
    updatePayload.resolved_by = session.user.id;
    updatePayload.resolved_at = now;
  }

  const { data, error } = await supabaseAdmin
    .from('comment_reports')
    .update(updatePayload)
    .eq('id', reportId)
    .select('id')
    .maybeSingle();

  if (error) {
    logApiError('admin-comment-reports.update', error);
    return json({ ok: false, error: 'Segnalazione non aggiornata. Riprova più tardi.' }, 500);
  }

  if (!data) {
    return json({ ok: false, error: 'Segnalazione non trovata.' }, 404);
  }

  return json({ ok: true });
};
