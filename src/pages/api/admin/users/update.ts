import type { APIRoute } from 'astro';
import { logApiError } from '../../../../lib/api-errors';
import { supabaseAdmin } from '../../../../lib/supabase/server';
import { getUserSessionFromCookies, isStaffProfile } from '../../../../lib/supabase/auth';

type UserRole = 'user' | 'moderator' | 'admin';
type UserStatus = 'active' | 'suspended' | 'banned';

type UpdateUserPayload = {
  userId?: string;
  role?: UserRole;
  status?: UserStatus;
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

const allowedRoles = new Set(['user', 'moderator', 'admin']);
const allowedStatuses = new Set(['active', 'suspended', 'banned']);

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.profile || !session.user) {
    return json({ ok: false, error: session.error }, session.status);
  }

  if (!isStaffProfile(session.profile)) {
    return json({ ok: false, error: 'Permessi insufficienti.' }, 403);
  }

  let payload: UpdateUserPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const userId = payload.userId?.trim() ?? '';
  const nextRole = payload.role;
  const nextStatus = payload.status;

  if (!userId || !isUuid(userId)) {
    return json({ ok: false, error: 'Utente non valido.' }, 400);
  }

  if (userId === session.user.id) {
    return json({ ok: false, error: 'Non puoi modificare il tuo account da questo pannello.' }, 403);
  }

  if (nextRole && !allowedRoles.has(nextRole)) {
    return json({ ok: false, error: 'Ruolo non valido.' }, 400);
  }

  if (nextStatus && !allowedStatuses.has(nextStatus)) {
    return json({ ok: false, error: 'Stato non valido.' }, 400);
  }

  if (!nextRole && !nextStatus) {
    return json({ ok: false, error: 'Nessuna modifica richiesta.' }, 400);
  }

  const { data: targetProfile, error: targetError } = await supabaseAdmin
    .from('profiles')
    .select('id, user_id, username, display_name, role, status')
    .eq('user_id', userId)
    .maybeSingle();

  if (targetError) {
    logApiError('admin-users-update.lookup', targetError);
    return json({ ok: false, error: 'Utente non disponibile. Riprova più tardi.' }, 500);
  }

  if (!targetProfile) {
    return json({ ok: false, error: 'Profilo utente non trovato.' }, 404);
  }

  const actorRole = session.profile.role === 'admin' ? 'admin' : 'moderator';
  const targetRole = targetProfile.role || 'user';

  if (nextRole && actorRole !== 'admin') {
    return json({ ok: false, error: 'Solo gli admin possono modificare i ruoli.' }, 403);
  }

  if (actorRole === 'moderator' && targetRole !== 'user') {
    return json({ ok: false, error: 'I moderator possono gestire solo utenti standard.' }, 403);
  }

  const updatePayload: Record<string, string> = {};

  if (nextRole) {
    updatePayload.role = nextRole;
  }

  if (nextStatus) {
    updatePayload.status = nextStatus;
  }

  const { data: profile, error: updateError } = await supabaseAdmin
    .from('profiles')
    .update(updatePayload)
    .eq('user_id', userId)
    .select('id, user_id, username, display_name, role, status')
    .single();

  if (updateError) {
    logApiError('admin-users-update.update', updateError);
    return json({ ok: false, error: 'Utente non aggiornato. Riprova più tardi.' }, 500);
  }

  return json({
    ok: true,
    profile,
  });
};
