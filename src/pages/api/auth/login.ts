import type { APIRoute } from 'astro';
import { logApiError } from '../../../lib/api-errors';
import { supabasePublic } from '../../../lib/supabase/server';
import { getUserProfileFromToken, setAuthSessionCookies } from '../../../lib/supabase/auth';
import { touchUserActivity } from '../../../lib/supabase/user-activity';

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

const isEmailNotConfirmedError = (error: unknown) => {
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();

  return /email.*not.*confirm|confirm.*email|not.*confirmed/.test(message);
};

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
    logApiError('auth-login.sign-in', authError);

    if (isEmailNotConfirmedError(authError)) {
      return json({
        ok: false,
        error: 'Account non confermato. Controlla la tua email o richiedi un nuovo link di conferma.',
        code: 'email_not_confirmed',
      }, 401);
    }

    return json({ ok: false, error: 'Email o password non corretti.' }, 401);
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
  await touchUserActivity(user.id, 'auth-login');

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
