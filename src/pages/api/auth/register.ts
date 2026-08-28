import type { APIRoute } from 'astro';
import { logApiError } from '../../../lib/api-errors';
import { assignReaderBadgeToUser } from '../../../lib/badges';
import { sendNewReaderRegistrationAdminEmail } from '../../../lib/supabase/account-emails';
import { createWelcomeAccountMessage } from '../../../lib/supabase/account-messages';
import { supabaseAdmin, supabasePublic } from '../../../lib/supabase/server';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const normalizeUsername = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const getStringField = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];

  return typeof value === 'string' ? value : '';
};

const normalizeComparableText = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .trim();

const hasPasswordInPublicProfileField = (
  password: string,
  fields: string[]
) => {
  const normalizedPassword = normalizeComparableText(password);

  if (!normalizedPassword) return false;

  const passwordComparisons = new Set([
    normalizedPassword,
    normalizedPassword.toLowerCase(),
    normalizeUsername(normalizedPassword),
  ].filter(Boolean));

  return fields.some((field) => {
    const normalizedField = normalizeComparableText(field);

    if (!normalizedField) return false;

    return [
      normalizedField,
      normalizedField.toLowerCase(),
      normalizeUsername(normalizedField),
    ].some((candidate) => passwordComparisons.has(candidate));
  });
};

const registrationReceivedMessage =
  'Registrazione ricevuta. Controlla la tua email per confermare l’account.';
const registrationReceivedMessageEn =
  'Registration received. Check your email to confirm your account.';
const confirmationEmailErrorMessage =
  'Non siamo riusciti a inviare la mail di conferma. Riprova più tardi o contattaci.';
const confirmationEmailErrorMessageEn =
  'We could not send the confirmation email. Please try again later or contact us.';
const unconfirmedAccountMessage =
  'Questo account è già stato creato ma non è ancora confermato. Controlla la tua email o richiedi un nuovo link di conferma.';
const unconfirmedAccountMessageEn =
  'This account has already been created but is not confirmed yet. Check your email or request a new confirmation link.';

const isEmailDeliveryError = (error: unknown) => {
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();

  return /email|mail|smtp|rate|limit|confirmation|confirm|send/.test(message);
};

const isAlreadyRegisteredError = (error: unknown) => {
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();

  return /already|registered|exists|duplicate/.test(message);
};

const isConfirmedAuthUser = (user: { email_confirmed_at?: string | null; confirmed_at?: string | null }) =>
  Boolean(user.email_confirmed_at || user.confirmed_at);

const findAuthUserByEmail = async (email: string) => {
  const perPage = 1000;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    const user = (data.users ?? []).find(
      (candidate) => candidate.email?.trim().toLowerCase() === email
    );

    if (user) {
      return user;
    }

    if ((data.users ?? []).length < perPage) {
      break;
    }
  }

  return null;
};

export const POST: APIRoute = async ({ request }) => {
  let payload: Record<string, unknown>;

  try {
    const body = await request.json();

    if (!isRecord(body)) {
      return json({ ok: false, error: 'Richiesta non valida.' }, 400);
    }

    payload = body;
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const rawUsername = getStringField(payload, 'username');
  const rawDisplayName = getStringField(payload, 'displayName');
  const email = getStringField(payload, 'email').trim().toLowerCase();
  const password = getStringField(payload, 'password');
  const username = normalizeUsername(rawUsername);
  const displayName = rawDisplayName.trim() || username;
  const badgeKey = getStringField(payload, 'badgeKey').trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: 'Inserisci un indirizzo email valido.' }, 400);
  }

  if (password.length < 8) {
    return json({ ok: false, error: 'La password deve contenere almeno 8 caratteri.' }, 400);
  }

  if (hasPasswordInPublicProfileField(password, [rawUsername, rawDisplayName, username, displayName])) {
    return json({
      ok: false,
      error: 'La password non può essere usata come nome pubblico del profilo.',
      errorEn: 'The password cannot be used as a public profile name.',
      code: 'password_in_public_profile_field',
    }, 400);
  }

  if (!/^[a-z0-9_-]{3,24}$/.test(username)) {
    return json({
      ok: false,
      error: 'Lo username deve contenere 3-24 caratteri: lettere, numeri, trattino o underscore.',
    }, 400);
  }

  if (displayName.length < 2 || displayName.length > 40) {
    return json({ ok: false, error: 'Il nome visualizzato deve contenere 2-40 caratteri.' }, 400);
  }

  try {
    const existingAuthUser = await findAuthUserByEmail(email);

    if (existingAuthUser) {
      if (!isConfirmedAuthUser(existingAuthUser)) {
        return json({
          ok: false,
          error: unconfirmedAccountMessage,
          errorEn: unconfirmedAccountMessageEn,
          code: 'email_not_confirmed',
        }, 409);
      }

      return json({
        ok: false,
        error: 'Questo indirizzo email è già registrato. Accedi con il tuo account.',
        code: 'email_already_registered',
      }, 409);
    }
  } catch (error) {
    logApiError('auth-register.email-check', error);
    return json({ ok: false, error: 'Registrazione non disponibile. Riprova più tardi.' }, 500);
  }

  if (!badgeKey) {
    return json({ ok: false, error: 'Scegli un badge lettore.' }, 400);
  }

  const { data: badge, error: badgeError } = await supabaseAdmin
    .from('user_badges')
    .select('key')
    .eq('key', badgeKey)
    .eq('is_active', true)
    .maybeSingle();

  if (badgeError) {
    logApiError('auth-register.badge', badgeError);
    return json({ ok: false, error: 'Registrazione non disponibile. Riprova più tardi.' }, 500);
  }

  if (!badge) {
    return json({ ok: false, error: 'Badge non valido.' }, 400);
  }

  const { data: existingProfile, error: profileCheckError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (profileCheckError) {
    logApiError('auth-register.profile-check', profileCheckError);
    return json({ ok: false, error: 'Registrazione non disponibile. Riprova più tardi.' }, 500);
  }

  if (existingProfile) {
    return json({ ok: false, error: 'Questo username è già stato scelto.' }, 409);
  }

  const siteUrl =
    import.meta.env.PUBLIC_SITE_URL ||
    import.meta.env.SITE ||
    'http://localhost:4321';

  const { data: signUpData, error: signUpError } = await supabasePublic.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl.replace(/\/$/, '')}/account/confirmed/`,
    },
  });

  if (signUpError) {
    logApiError('auth-register.sign-up', signUpError);

    if (isAlreadyRegisteredError(signUpError)) {
      return json({
        ok: false,
        error: unconfirmedAccountMessage,
        errorEn: unconfirmedAccountMessageEn,
        code: 'email_not_confirmed',
      }, 409);
    }

    if (isEmailDeliveryError(signUpError)) {
      return json({
        ok: false,
        error: confirmationEmailErrorMessage,
        errorEn: confirmationEmailErrorMessageEn,
        code: 'confirmation_email_failed',
      }, 503);
    }

    return json({ ok: false, error: 'Registrazione non disponibile. Riprova più tardi.' }, 400);
  }

  const user = signUpData.user;

  if (!user) {
    return json({ ok: false, error: 'Registrazione non completata.' }, 500);
  }

  if (Array.isArray(user.identities) && user.identities.length === 0) {
    const error = isConfirmedAuthUser(user)
      ? 'Questo indirizzo email è già registrato. Accedi con il tuo account.'
      : unconfirmedAccountMessage;

    return json({
      ok: false,
      error,
      errorEn: isConfirmedAuthUser(user) ? undefined : unconfirmedAccountMessageEn,
      code: isConfirmedAuthUser(user) ? 'email_already_registered' : 'email_not_confirmed',
    }, 409);
  }

  const { data: existingUserProfile, error: existingUserProfileError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingUserProfileError) {
    logApiError('auth-register.profile-user-check', existingUserProfileError);
    return json({ ok: false, error: 'Registrazione non disponibile. Riprova più tardi.' }, 500);
  }

  if (existingUserProfile) {
    return json({
      ok: false,
      error: unconfirmedAccountMessage,
      errorEn: unconfirmedAccountMessageEn,
      code: 'email_not_confirmed',
    }, 409);
  }

  const { error: insertProfileError } = await supabaseAdmin
    .from('profiles')
    .insert({
      user_id: user.id,
      username,
      display_name: displayName,
      badge_key: badgeKey,
      role: 'user',
      status: 'active',
    });

  if (insertProfileError) {
    await supabaseAdmin.auth.admin.deleteUser(user.id);
    logApiError('auth-register.profile-insert', insertProfileError);

    return json({
      ok: false,
      error: 'Registrazione non completata. Riprova più tardi.',
    }, 500);
  }

  const badgeAssignment = await assignReaderBadgeToUser({
    userId: user.id,
    badgeKey,
  });

  if (!badgeAssignment.ok && badgeAssignment.assignmentsAvailable) {
    console.error('Initial reader badge assignment failed:', badgeAssignment.error);
  }

  try {
    await createWelcomeAccountMessage({
      userId: user.id,
      displayName,
    });
  } catch (error) {
    console.error('Welcome account message failed:', error);
  }

  try {
    await sendNewReaderRegistrationAdminEmail({
      userId: user.id,
      email: user.email,
      username,
      displayName,
      createdAt: user.created_at,
    });
  } catch (error) {
    console.error('New reader registration admin notification failed:', error);
  }

  return json({
    ok: true,
    message: registrationReceivedMessage,
    messageEn: registrationReceivedMessageEn,
    user: {
      id: user.id,
      email: user.email,
      username,
      displayName,
      badgeKey,
    },
  });
};
