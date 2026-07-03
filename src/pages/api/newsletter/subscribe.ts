import type { APIRoute } from 'astro';
import { logApiError } from '../../../lib/api-errors';
import { getUserSessionFromCookies } from '../../../lib/supabase/auth';
import {
  NewsletterValidationError,
  normalizeNewsletterLanguage,
  subscribeToNewsletter,
} from '../../../lib/supabase/newsletter';
import { sendNewsletterConfirmationEmail } from '../../../lib/supabase/newsletter-emails';

type NewsletterSubscribePayload = {
  email?: string;
  language?: string;
  consent?: boolean;
  source?: string;
};

const genericMessages = {
  it: 'Se l’indirizzo è valido, riceverai una email di conferma.',
  en: 'If the address is valid, you will receive a confirmation email.',
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const POST: APIRoute = async ({ request, cookies }) => {
  let payload: NewsletterSubscribePayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const language = normalizeNewsletterLanguage(payload.language);
  const genericMessage = genericMessages[language];

  try {
    const session = await getUserSessionFromCookies(cookies);
    const userId = !session.error && session.user?.id ? session.user.id : null;
    const result = await subscribeToNewsletter({
      email: payload.email || '',
      language,
      consent: payload.consent === true,
      source: payload.source || 'website',
      userId,
    });

    if (result.ok && result.shouldSendConfirmation && result.subscriber) {
      await sendNewsletterConfirmationEmail(result.subscriber);
    }

    if (!result.ok && result.error) {
      console.warn('Newsletter subscription was not completed:', {
        unavailable: result.unavailable,
        error: result.error,
      });
    }

    return json({
      ok: true,
      message: genericMessage,
      messageEn: genericMessages.en,
    });
  } catch (error) {
    if (error instanceof NewsletterValidationError) {
      const errorMessage = language === 'en'
        ? error.code === 'missing_consent'
          ? 'Newsletter consent is required.'
          : 'Enter a valid email address.'
        : error.code === 'missing_consent'
          ? 'Il consenso newsletter è obbligatorio.'
          : 'Inserisci un indirizzo email valido.';

      return json({ ok: false, error: errorMessage, code: error.code }, error.status);
    }

    logApiError('newsletter.subscribe', error);

    return json({
      ok: true,
      message: genericMessage,
      messageEn: genericMessages.en,
    });
  }
};

export const GET: APIRoute = async () =>
  json({ ok: false, error: 'Metodo non consentito.' }, 405);
