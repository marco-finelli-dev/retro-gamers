import type { APIRoute } from 'astro';
import { logApiError } from '../../../lib/api-errors';
import { supabasePublic } from '../../../lib/supabase/server';

type ResendConfirmationPayload = {
  email?: string;
};

const genericMessage = 'Se l’indirizzo è valido, riceverai una nuova email di conferma.';
const genericMessageEn = 'If the address is valid, you will receive a new confirmation email.';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const POST: APIRoute = async ({ request }) => {
  let payload: ResendConfirmationPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const email = payload.email?.trim().toLowerCase() ?? '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: 'Inserisci un indirizzo email valido.' }, 400);
  }

  const siteUrl = String(
    import.meta.env.PUBLIC_SITE_URL ||
    import.meta.env.SITE ||
    'http://localhost:4321'
  ).replace(/\/$/, '');

  const { error } = await supabasePublic.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: `${siteUrl}/account/confirmed/`,
    },
  });

  if (error) {
    logApiError('auth-resend-confirmation', error);
  }

  return json({
    ok: true,
    message: genericMessage,
    messageEn: genericMessageEn,
  });
};
