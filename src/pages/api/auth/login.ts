import type { APIRoute } from 'astro';
import { supabasePublic } from '../../../lib/supabase/server';
import { getUserProfileFromToken, setAuthSessionCookies } from '../../../lib/supabase/auth';

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

  const profileSession = await getUserProfileFromToken(session.access_token);

  if (profileSession.error || !profileSession.profile) {
    return json({ ok: false, error: profileSession.error }, profileSession.status);
  }

  setAuthSessionCookies(cookies, session);

  return json({
    ok: true,
    message: 'Login effettuato.',
    user: {
      id: user.id,
      email: user.email,
    },
    profile: profileSession.profile,
  });
};
