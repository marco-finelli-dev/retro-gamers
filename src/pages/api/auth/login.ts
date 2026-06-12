import type { APIRoute } from 'astro';
import { logApiError } from '../../../lib/api-errors';
import { supabasePublic, supabaseAdmin } from '../../../lib/supabase/server';
import { isBlockedProfileStatus } from '../../../lib/supabase/auth';

type LoginPayload = {
  email?: string;
  password?: string;
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const POST: APIRoute = async ({ request, cookies }) => {
  let payload: LoginPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const email = payload.email?.trim().toLowerCase() ?? '';
  const password = payload.password ?? '';

  if (!email || !password) {
    return json({ ok: false, error: 'Email e password sono obbligatorie.' }, 400);
  }

  const { data: authData, error: authError } = await supabasePublic.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) {
    return json({ ok: false, error: authError.message }, 401);
  }

  const user = authData.user;
  const session = authData.session;

  if (!user || !session) {
    return json({ ok: false, error: 'Login non completato.' }, 500);
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select(`
      id,
      user_id,
      username,
      display_name,
      badge_key,
      role,
      status,
      notify_replies_to_my_comments,
      notify_threads_i_join,
      user_badges (
        key,
        label_it,
        label_en,
        image_path
      )
    `)
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError) {
    logApiError('auth-login.profile', profileError);
    return json({ ok: false, error: 'Profilo non disponibile. Riprova più tardi.' }, 500);
  }

  if (!profile) {
    return json({ ok: false, error: 'Profilo lettore non trovato.' }, 404);
  }

  if (isBlockedProfileStatus(profile.status)) {
    return json({ ok: false, error: 'Account bloccato.' }, 403);
  }

  const secure = import.meta.env.PROD;

  cookies.set('rg_access_token', session.access_token, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: 60 * 60,
  });

  cookies.set('rg_refresh_token', session.refresh_token, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  });

  return json({
    ok: true,
    message: 'Login effettuato.',
    user: {
      id: user.id,
      email: user.email,
    },
    profile,
  });
};
