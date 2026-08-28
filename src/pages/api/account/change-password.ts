import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { logApiError } from '../../../lib/api-errors';
import { getUserSessionFromCookies, setAuthSessionCookies } from '../../../lib/supabase/auth';

type ChangePasswordPayload = {
  currentPassword?: unknown;
  newPassword?: unknown;
  confirmPassword?: unknown;
};

type AuthProviderUser = {
  id?: string | null;
  email?: string | null;
  app_metadata?: {
    provider?: string | null;
    providers?: string[] | null;
  };
  identities?: Array<{
    provider?: string | null;
  }> | null;
};

const allowedPayloadFields = new Set([
  'currentPassword',
  'newPassword',
  'confirmPassword',
]);

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
    },
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const getStringField = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];

  return typeof value === 'string' ? value : '';
};

const hasOnlyAllowedPayloadFields = (payload: Record<string, unknown>) =>
  Object.keys(payload).every((key) => allowedPayloadFields.has(key));

const createSupabaseAuthClient = () =>
  createClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

const hasPasswordAuthProvider = (user: AuthProviderUser) => {
  const identityProviders = new Set(
    (user.identities || [])
      .map((identity) => String(identity?.provider || '').toLowerCase())
      .filter(Boolean)
  );
  const appMetadataProviders = Array.isArray(user.app_metadata?.providers)
    ? user.app_metadata.providers
        .map((provider) => String(provider || '').toLowerCase())
        .filter(Boolean)
    : [];
  const primaryProvider = String(user.app_metadata?.provider || '').toLowerCase();

  return (
    identityProviders.has('email') ||
    appMetadataProviders.includes('email') ||
    primaryProvider === 'email' ||
    (Boolean(user.email) && identityProviders.size === 0 && appMetadataProviders.length === 0 && !primaryProvider)
  );
};

const isRateLimitError = (error: unknown) => {
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();

  return message.includes('rate') || message.includes('too many');
};

const isPasswordValidationError = (error: unknown) => {
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();

  return message.includes('password') || message.includes('weak');
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.profile || !session.user) {
    return json({
      ok: false,
      error: session.error,
      errorEn: session.status === 401
        ? 'Session expired. Sign in again.'
        : 'Account unavailable. Please try again later.',
    }, session.status);
  }

  const user = session.user as AuthProviderUser;
  const email = user.email?.trim().toLowerCase() || '';

  if (!email || !hasPasswordAuthProvider(user)) {
    return json({
      ok: false,
      error: 'Questo account usa l’accesso social. Gestisci la password dal provider con cui accedi.',
      errorEn: 'This account uses social sign-in. Manage the password with the provider you use to sign in.',
    }, 400);
  }

  let payload: ChangePasswordPayload;

  try {
    const body = await request.json();

    if (!isRecord(body) || !hasOnlyAllowedPayloadFields(body)) {
      return json({ ok: false, error: 'Richiesta non valida.', errorEn: 'Invalid request.' }, 400);
    }

    payload = body;
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.', errorEn: 'Invalid request.' }, 400);
  }

  const currentPassword = getStringField(payload as Record<string, unknown>, 'currentPassword');
  const newPassword = getStringField(payload as Record<string, unknown>, 'newPassword');
  const confirmPassword = getStringField(payload as Record<string, unknown>, 'confirmPassword');

  if (!currentPassword || !newPassword || !confirmPassword) {
    return json({ ok: false, error: 'Compila tutti i campi password.', errorEn: 'Fill in all password fields.' }, 400);
  }

  if (newPassword.length < 8) {
    return json({
      ok: false,
      error: 'La nuova password deve contenere almeno 8 caratteri.',
      errorEn: 'The new password must contain at least 8 characters.',
    }, 400);
  }

  if (newPassword !== confirmPassword) {
    return json({
      ok: false,
      error: 'La conferma della nuova password non coincide.',
      errorEn: 'The new password confirmation does not match.',
    }, 400);
  }

  if (newPassword === currentPassword) {
    return json({
      ok: false,
      error: 'Scegli una password diversa da quella attuale.',
      errorEn: 'Choose a password different from the current one.',
    }, 400);
  }

  const authClient = createSupabaseAuthClient();
  const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
    email,
    password: currentPassword,
  });

  if (signInError || !signInData.session || signInData.user?.id !== user.id) {
    return json({
      ok: false,
      error: 'La password attuale non è corretta.',
      errorEn: 'The current password is incorrect.',
    }, 401);
  }

  const { error: updateError } = await authClient.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    if (isRateLimitError(updateError)) {
      return json({
        ok: false,
        error: 'Troppe richieste. Riprova tra qualche minuto.',
        errorEn: 'Too many requests. Please try again in a few minutes.',
      }, 429);
    }

    if (isPasswordValidationError(updateError)) {
      return json({
        ok: false,
        error: 'La nuova password non è valida.',
        errorEn: 'The new password is not valid.',
      }, 400);
    }

    logApiError('account-change-password.update', updateError);
    return json({
      ok: false,
      error: 'Non è stato possibile aggiornare la password.',
      errorEn: 'Could not update the password.',
    }, 500);
  }

  const { data: refreshedAuthData } = await authClient.auth.getSession();
  const nextSession = refreshedAuthData.session || signInData.session;

  if (nextSession) {
    setAuthSessionCookies(cookies, nextSession);
  }

  return json({
    ok: true,
    message: 'Password aggiornata.',
    messageEn: 'Password updated.',
  });
};
