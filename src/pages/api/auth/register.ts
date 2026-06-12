import type { APIRoute } from 'astro';
import { sendNewReaderRegistrationAdminEmail } from '../../../lib/supabase/account-emails';
import { supabaseAdmin, supabasePublic } from '../../../lib/supabase/server';

type RegisterPayload = {
  email?: string;
  password?: string;
  username?: string;
  displayName?: string;
  badgeKey?: string;
};

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

export const POST: APIRoute = async ({ request }) => {
  let payload: RegisterPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const email = payload.email?.trim().toLowerCase() ?? '';
  const password = payload.password ?? '';
  const username = normalizeUsername(payload.username ?? '');
  const displayName = payload.displayName?.trim() || username;
  const badgeKey = payload.badgeKey?.trim() ?? '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: 'Inserisci un indirizzo email valido.' }, 400);
  }

  if (password.length < 8) {
    return json({ ok: false, error: 'La password deve contenere almeno 8 caratteri.' }, 400);
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
    return json({ ok: false, error: badgeError.message }, 500);
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
    return json({ ok: false, error: profileCheckError.message }, 500);
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
    options: {     emailRedirectTo: `${siteUrl}/account/conferma/`,
    },
  });

  if (signUpError) {
    return json({ ok: false, error: signUpError.message }, 400);
  }

  const user = signUpData.user;

  if (!user) {
    return json({ ok: false, error: 'Registrazione non completata.' }, 500);
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

    return json({
      ok: false,
      error: insertProfileError.message,
    }, 500);
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
    message: 'Registrazione completata. Controlla la tua email per confermare l’account.',
    user: {
      id: user.id,
      email: user.email,
      username,
      displayName,
      badgeKey,
    },
  });
};
