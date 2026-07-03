import { randomBytes } from 'node:crypto';
import { logApiError } from '../api-errors';
import { supabaseAdmin } from './server';

export type NewsletterLanguage = 'it' | 'en';
export type NewsletterStatus = 'pending' | 'active' | 'unsubscribed';

export type NewsletterSubscriber = {
  id: string;
  email: string;
  user_id: string | null;
  language: NewsletterLanguage;
  status: NewsletterStatus;
  consent_at: string | null;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  unsubscribe_token: string;
  confirmation_token: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
};

type SubscribeInput = {
  email: string;
  language?: string | null;
  consent: boolean;
  source?: string | null;
  userId?: string | null;
};

export class NewsletterValidationError extends Error {
  status: number;
  code: string;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = 'NewsletterValidationError';
    this.code = code;
    this.status = status;
  }
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const tokenPattern = /^[A-Za-z0-9_-]{32,160}$/;

export const normalizeNewsletterEmail = (email: string) =>
  String(email || '').trim().toLowerCase();

export const isValidNewsletterEmail = (email: string) =>
  email.length <= 254 && emailPattern.test(email);

export const normalizeNewsletterLanguage = (language?: string | null): NewsletterLanguage =>
  language === 'en' ? 'en' : 'it';

export const normalizeNewsletterSource = (source?: string | null) => {
  const normalized = String(source || '').trim().toLowerCase();

  if (!normalized) {
    return 'website';
  }

  return normalized.replace(/[^a-z0-9_-]/g, '-').slice(0, 80) || 'website';
};

export const createNewsletterTokens = () => ({
  confirmationToken: randomBytes(32).toString('base64url'),
  unsubscribeToken: randomBytes(32).toString('base64url'),
});

export const isValidNewsletterToken = (token: string) =>
  tokenPattern.test(String(token || '').trim());

export const isNewsletterUnavailableError = (
  error: { code?: string; message?: string; details?: string } | null | undefined
) => {
  if (!error) return false;

  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();

  return (
    message.includes('newsletter_subscribers') ||
    message.includes('newsletter_delivery_logs') ||
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST204' ||
    message.includes('schema cache') ||
    message.includes('does not exist')
  );
};

const selectSubscriber = `
  id,
  email,
  user_id,
  language,
  status,
  consent_at,
  confirmed_at,
  unsubscribed_at,
  unsubscribe_token,
  confirmation_token,
  source,
  created_at,
  updated_at
`;

export async function subscribeToNewsletter({
  email,
  language,
  consent,
  source,
  userId,
}: SubscribeInput) {
  const normalizedEmail = normalizeNewsletterEmail(email);
  const normalizedLanguage = normalizeNewsletterLanguage(language);
  const normalizedSource = normalizeNewsletterSource(source);

  if (!isValidNewsletterEmail(normalizedEmail)) {
    throw new NewsletterValidationError('Indirizzo email non valido.', 'invalid_email');
  }

  if (!consent) {
    throw new NewsletterValidationError('Consenso newsletter obbligatorio.', 'missing_consent');
  }

  const now = new Date().toISOString();
  const { confirmationToken, unsubscribeToken } = createNewsletterTokens();

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from('newsletter_subscribers')
    .select(selectSubscriber)
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (lookupError) {
    if (!isNewsletterUnavailableError(lookupError)) {
      logApiError('newsletter.subscribe.lookup', lookupError);
    }

    return {
      ok: false,
      unavailable: true,
      subscriber: null as NewsletterSubscriber | null,
      shouldSendConfirmation: false,
      error: lookupError.message,
    };
  }

  if (existing?.id && existing.status === 'active') {
    const updatePayload: Record<string, unknown> = {
      language: normalizedLanguage,
      source: normalizedSource,
    };

    if (userId && !existing.user_id) {
      updatePayload.user_id = userId;
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('newsletter_subscribers')
      .update(updatePayload)
      .eq('id', existing.id)
      .select(selectSubscriber)
      .single();

    if (updateError) {
      logApiError('newsletter.subscribe.active-update', updateError);

      return {
        ok: false,
        unavailable: isNewsletterUnavailableError(updateError),
        subscriber: existing as NewsletterSubscriber,
        shouldSendConfirmation: false,
        error: updateError.message,
      };
    }

    return {
      ok: true,
      unavailable: false,
      subscriber: updated as NewsletterSubscriber,
      shouldSendConfirmation: false,
    };
  }

  if (existing?.id) {
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('newsletter_subscribers')
      .update({
        user_id: userId || existing.user_id || null,
        language: normalizedLanguage,
        status: 'pending',
        consent_at: now,
        confirmed_at: null,
        unsubscribed_at: null,
        confirmation_token: confirmationToken,
        unsubscribe_token: unsubscribeToken,
        source: normalizedSource,
      })
      .eq('id', existing.id)
      .select(selectSubscriber)
      .single();

    if (updateError) {
      logApiError('newsletter.subscribe.update', updateError);

      return {
        ok: false,
        unavailable: isNewsletterUnavailableError(updateError),
        subscriber: existing as NewsletterSubscriber,
        shouldSendConfirmation: false,
        error: updateError.message,
      };
    }

    return {
      ok: true,
      unavailable: false,
      subscriber: updated as NewsletterSubscriber,
      shouldSendConfirmation: true,
    };
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('newsletter_subscribers')
    .insert({
      email: normalizedEmail,
      user_id: userId || null,
      language: normalizedLanguage,
      status: 'pending',
      consent_at: now,
      unsubscribe_token: unsubscribeToken,
      confirmation_token: confirmationToken,
      source: normalizedSource,
    })
    .select(selectSubscriber)
    .single();

  if (insertError) {
    logApiError('newsletter.subscribe.insert', insertError);

    return {
      ok: false,
      unavailable: isNewsletterUnavailableError(insertError),
      subscriber: null as NewsletterSubscriber | null,
      shouldSendConfirmation: false,
      error: insertError.message,
    };
  }

  return {
    ok: true,
    unavailable: false,
    subscriber: inserted as NewsletterSubscriber,
    shouldSendConfirmation: true,
  };
}

export async function getNewsletterSubscriberByToken(
  token: string,
  tokenType: 'confirmation' | 'unsubscribe' = 'confirmation'
) {
  const normalizedToken = String(token || '').trim();

  if (!isValidNewsletterToken(normalizedToken)) {
    return { subscriber: null as NewsletterSubscriber | null, error: null, invalid: true };
  }

  const column = tokenType === 'unsubscribe' ? 'unsubscribe_token' : 'confirmation_token';
  const { data, error } = await supabaseAdmin
    .from('newsletter_subscribers')
    .select(selectSubscriber)
    .eq(column, normalizedToken)
    .maybeSingle();

  if (error) {
    if (!isNewsletterUnavailableError(error)) {
      logApiError(`newsletter.token.${tokenType}`, error);
    }

    return { subscriber: null as NewsletterSubscriber | null, error, invalid: false };
  }

  return {
    subscriber: (data as NewsletterSubscriber | null) ?? null,
    error: null,
    invalid: !data,
  };
}

export async function confirmNewsletterSubscription(token: string) {
  const lookup = await getNewsletterSubscriberByToken(token, 'confirmation');

  if (!lookup.subscriber) {
    return {
      ok: false,
      subscriber: null as NewsletterSubscriber | null,
      language: 'it' as NewsletterLanguage,
      reason: lookup.error ? 'error' : 'invalid',
      error: lookup.error,
    };
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('newsletter_subscribers')
    .update({
      status: 'active',
      confirmed_at: now,
      unsubscribed_at: null,
      confirmation_token: null,
    })
    .eq('id', lookup.subscriber.id)
    .select(selectSubscriber)
    .single();

  if (error) {
    logApiError('newsletter.confirm.update', error);

    return {
      ok: false,
      subscriber: lookup.subscriber,
      language: lookup.subscriber.language,
      reason: 'error',
      error,
    };
  }

  return {
    ok: true,
    subscriber: data as NewsletterSubscriber,
    language: (data as NewsletterSubscriber).language,
    reason: null,
    error: null,
  };
}

export async function unsubscribeNewsletter(token: string) {
  const lookup = await getNewsletterSubscriberByToken(token, 'unsubscribe');

  if (!lookup.subscriber) {
    return {
      ok: false,
      subscriber: null as NewsletterSubscriber | null,
      language: 'it' as NewsletterLanguage,
      reason: lookup.error ? 'error' : 'invalid',
      error: lookup.error,
    };
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('newsletter_subscribers')
    .update({
      status: 'unsubscribed',
      unsubscribed_at: now,
      confirmation_token: null,
    })
    .eq('id', lookup.subscriber.id)
    .select(selectSubscriber)
    .single();

  if (error) {
    logApiError('newsletter.unsubscribe.update', error);

    return {
      ok: false,
      subscriber: lookup.subscriber,
      language: lookup.subscriber.language,
      reason: 'error',
      error,
    };
  }

  return {
    ok: true,
    subscriber: data as NewsletterSubscriber,
    language: (data as NewsletterSubscriber).language,
    reason: null,
    error: null,
  };
}

export async function logNewsletterDelivery({
  subscriberId,
  email,
  campaignKey,
  emailType,
  status,
  resendMessageId,
  errorMessage,
  sentAt,
}: {
  subscriberId?: string | null;
  email: string;
  campaignKey?: string | null;
  emailType: 'newsletter' | 'confirmation' | 'unsubscribe' | 'manual';
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  resendMessageId?: string | null;
  errorMessage?: string | null;
  sentAt?: string | null;
}) {
  const { error } = await supabaseAdmin
    .from('newsletter_delivery_logs')
    .insert({
      subscriber_id: subscriberId || null,
      email: normalizeNewsletterEmail(email),
      campaign_key: campaignKey || null,
      email_type: emailType,
      status,
      resend_message_id: resendMessageId || null,
      error_message: errorMessage || null,
      sent_at: sentAt || null,
    });

  if (error && !isNewsletterUnavailableError(error)) {
    logApiError('newsletter.delivery-log', error);
  }
}
