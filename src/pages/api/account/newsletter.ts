import type { APIRoute } from 'astro';
import { logApiError } from '../../../lib/api-errors';
import { getUserSessionFromCookies } from '../../../lib/supabase/auth';
import {
  NewsletterValidationError,
  getNewsletterSubscriptionForUser,
  normalizeNewsletterLanguage,
  subscribeLoggedUserToNewsletter,
  unsubscribeLoggedUserFromNewsletter,
} from '../../../lib/supabase/newsletter';
import { sendNewsletterConfirmationEmail } from '../../../lib/supabase/newsletter-emails';

type AccountNewsletterPayload = {
  action?: string;
  language?: string;
  consent?: boolean;
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const getAccountSession = async (cookies: any) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user || !session.profile) {
    return { session, error: session.error || 'Sessione non valida.', status: session.status || 401 };
  }

  const email = session.user.email?.trim().toLowerCase() || '';

  if (!email) {
    return { session, error: 'Email account non disponibile.', status: 400 };
  }

  return { session, error: null, status: 200 };
};

export const GET: APIRoute = async ({ cookies }) => {
  const { session, error, status } = await getAccountSession(cookies);

  if (error || !session.user) {
    return json({ ok: false, error }, status);
  }

  const result = await getNewsletterSubscriptionForUser(session.user.id, session.user.email);

  if (!result.ok) {
    return json({ ok: false, error: 'Newsletter non disponibile.' }, 500);
  }

  return json({
    ok: true,
    status: result.status,
    language: result.language,
    unavailable: result.unavailable,
  });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const { session, error, status } = await getAccountSession(cookies);

  if (error || !session.user) {
    return json({ ok: false, error }, status);
  }

  let payload: AccountNewsletterPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const action = String(payload.action || '').trim();

  if (action === 'subscribe') {
    if (payload.consent !== true) {
      return json({ ok: false, error: 'Il consenso newsletter è obbligatorio.', code: 'missing_consent' }, 400);
    }

    try {
      const result = await subscribeLoggedUserToNewsletter({
        userId: session.user.id,
        email: session.user.email || '',
        language: normalizeNewsletterLanguage(payload.language),
      });

      if (result.ok && result.shouldSendConfirmation && result.subscriber) {
        await sendNewsletterConfirmationEmail(result.subscriber);
      }

      if (!result.ok) {
        return json({ ok: false, error: 'Newsletter non aggiornata.' }, 500);
      }

      return json({
        ok: true,
        status: result.subscriber?.status || 'none',
        language: result.subscriber?.language || normalizeNewsletterLanguage(payload.language),
        message: result.subscriber?.status === 'active'
          ? 'Iscrizione aggiornata.'
          : 'Controlla la tua email per confermare l’iscrizione.',
        unavailable: result.unavailable,
      });
    } catch (subscribeError) {
      if (subscribeError instanceof NewsletterValidationError) {
        return json({ ok: false, error: subscribeError.message, code: subscribeError.code }, subscribeError.status);
      }

      logApiError('account-newsletter.subscribe', subscribeError);
      return json({ ok: false, error: 'Impossibile aggiornare la newsletter.' }, 500);
    }
  }

  if (action === 'unsubscribe') {
    const result = await unsubscribeLoggedUserFromNewsletter({
      userId: session.user.id,
      email: session.user.email || '',
    });

    if (!result.ok) {
      return json({ ok: false, error: 'Newsletter non aggiornata.' }, 500);
    }

    return json({
      ok: true,
      status: result.status === 'none' ? 'unsubscribed' : result.status,
      language: result.language,
      message: 'Newsletter disattivata.',
      unavailable: result.unavailable,
    });
  }

  return json({ ok: false, error: 'Azione newsletter non valida.' }, 400);
};
