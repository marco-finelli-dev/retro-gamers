import type { APIRoute } from 'astro';
import { logApiError } from '../../../../lib/api-errors';
import { normalizeUuid } from '../../../../lib/uuid';
import { getUserSessionFromCookies } from '../../../../lib/supabase/auth';
import { supabaseAdmin } from '../../../../lib/supabase/server';

const usernamePattern = /^[a-z0-9_-]{3,24}$/;
const allowedPayloadKeys = new Set(['userId', 'username']);

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeUsername = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');

const isUniqueViolation = (error: { code?: string; message?: string } | null) =>
  error?.code === '23505' || String(error?.message || '').toLowerCase().includes('duplicate key');

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.profile || !session.user) {
    return json({ ok: false, error: session.error }, session.status);
  }

  if (session.profile.role !== 'admin') {
    return json({ ok: false, error: 'Permessi insufficienti.', code: 'forbidden' }, 403);
  }

  let payload: Record<string, unknown>;

  try {
    const body = await request.json();

    if (!isRecord(body)) {
      return json({ ok: false, error: 'Richiesta non valida.', code: 'invalid_request' }, 400);
    }

    const unexpectedKeys = Object.keys(body).filter((key) => !allowedPayloadKeys.has(key));

    if (unexpectedKeys.length > 0) {
      return json({ ok: false, error: 'Richiesta non valida.', code: 'invalid_request' }, 400);
    }

    payload = body;
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.', code: 'invalid_request' }, 400);
  }

  const userId = normalizeUuid(payload.userId);
  const rawUsername = typeof payload.username === 'string' ? payload.username : '';
  const username = normalizeUsername(rawUsername);

  if (!userId) {
    return json({ ok: false, error: 'Utente non valido.', code: 'invalid_user' }, 400);
  }

  if (!rawUsername.trim() || !usernamePattern.test(username)) {
    return json({
      ok: false,
      error: 'Lo username deve contenere 3-24 caratteri: lettere, numeri, trattino o underscore.',
      errorEn: 'Enter a valid username: 3-24 lowercase letters, numbers, hyphen or underscore.',
      code: 'invalid_username',
    }, 400);
  }

  const { data: targetProfile, error: targetError } = await supabaseAdmin
    .from('profiles')
    .select('id, user_id, username')
    .eq('user_id', userId)
    .maybeSingle();

  if (targetError) {
    logApiError('admin-users-username.lookup', targetError);
    return json({
      ok: false,
      error: 'Profilo utente non disponibile. Riprova più tardi.',
      errorEn: 'User profile unavailable. Please try again later.',
      code: 'profile_unavailable',
    }, 500);
  }

  if (!targetProfile) {
    return json({
      ok: false,
      error: 'Profilo utente non trovato.',
      errorEn: 'User profile not found.',
      code: 'profile_not_found',
    }, 404);
  }

  if (normalizeUsername(targetProfile.username || '') === username) {
    return json({
      ok: false,
      error: 'Questo username è già impostato.',
      errorEn: 'This username is already set.',
      code: 'username_unchanged',
    }, 400);
  }

  const { data: usernameConflicts, error: conflictError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .neq('user_id', userId)
    .limit(1);

  if (conflictError) {
    logApiError('admin-users-username.conflict-check', conflictError);
    return json({
      ok: false,
      error: 'Username non verificabile. Riprova più tardi.',
      errorEn: 'Could not verify username availability. Please try again later.',
      code: 'username_check_failed',
    }, 500);
  }

  if ((usernameConflicts || []).length > 0) {
    return json({
      ok: false,
      error: 'Username già in uso.',
      errorEn: 'Username already in use.',
      code: 'username_taken',
    }, 409);
  }

  const { data: updatedProfile, error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ username })
    .eq('user_id', userId)
    .select('user_id, username')
    .single();

  if (updateError) {
    if (isUniqueViolation(updateError)) {
      return json({
        ok: false,
        error: 'Username già in uso.',
        errorEn: 'Username already in use.',
        code: 'username_taken',
      }, 409);
    }

    logApiError('admin-users-username.update', updateError);
    return json({
      ok: false,
      error: 'Username non aggiornato. Riprova più tardi.',
      errorEn: 'Username not updated. Please try again later.',
      code: 'username_update_failed',
    }, 500);
  }

  return json({
    ok: true,
    message: 'Username aggiornato.',
    messageEn: 'Username updated.',
    profile: {
      userId: updatedProfile.user_id,
      username: updatedProfile.username,
    },
  });
};
