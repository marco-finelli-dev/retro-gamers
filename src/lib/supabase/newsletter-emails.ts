import { Resend } from 'resend';
import { escapeEmailHtml, renderRetroGamersEmail } from '../email-template';
import {
  logNewsletterDelivery,
  type NewsletterLanguage,
  type NewsletterSubscriber,
} from './newsletter';

const resend = import.meta.env.RESEND_API_KEY
  ? new Resend(import.meta.env.RESEND_API_KEY)
  : null;

const fromEmail = String(import.meta.env.COMMENTS_FROM_EMAIL || 'Retro-Gamers <noreply@retro-gamers.it>').trim();
const siteUrl = String(import.meta.env.PUBLIC_SITE_URL || 'https://www.retro-gamers.it').replace(/\/$/, '');

const buildNewsletterConfirmUrl = (token: string) =>
  `${siteUrl}/newsletter/confirm/?token=${encodeURIComponent(token)}`;

export async function sendNewsletterConfirmationEmail(subscriber: NewsletterSubscriber) {
  if (!subscriber.confirmation_token) {
    return false;
  }

  const language: NewsletterLanguage = subscriber.language === 'en' ? 'en' : 'it';
  const confirmationUrl = buildNewsletterConfirmUrl(subscriber.confirmation_token);
  const subject = language === 'en'
    ? 'Confirm your Retro-Gamers.it newsletter subscription'
    : 'Conferma iscrizione alla newsletter di Retro-Gamers.it';
  const title = language === 'en'
    ? 'Confirm your subscription'
    : 'Conferma la tua iscrizione';
  const intro = language === 'en'
    ? 'You requested to receive updates from Retro-Gamers.it. Confirm your subscription to complete the process.'
    : 'Hai richiesto di ricevere aggiornamenti da Retro-Gamers.it. Conferma l’iscrizione per completare la procedura.';
  const ctaLabel = language === 'en'
    ? 'Confirm subscription'
    : 'Conferma iscrizione';
  const ignoreText = language === 'en'
    ? 'If you did not request this, you can ignore this email.'
    : 'Se non hai richiesto questa iscrizione, puoi ignorare questa email.';
  const footerNote = language === 'en'
    ? 'You are receiving this email because you requested to subscribe to the Retro-Gamers.it newsletter.'
    : 'Ricevi questa email perché hai richiesto l’iscrizione alla newsletter di Retro-Gamers.it.';

  const html = renderRetroGamersEmail({
    title,
    intro,
    ctaLabel,
    ctaUrl: confirmationUrl,
    footerNote,
    footerHtml: `
      <p style="margin:0;">
        ${escapeEmailHtml(ignoreText)}
      </p>
    `,
    language,
    previewText: intro,
  });

  if (!resend || !fromEmail) {
    console.warn('Newsletter confirmation email skipped: RESEND_API_KEY or sender not configured.');
    await logNewsletterDelivery({
      subscriberId: subscriber.id,
      email: subscriber.email,
      emailType: 'confirmation',
      status: 'failed',
      errorMessage: 'RESEND_API_KEY or sender not configured.',
    });

    return false;
  }

  try {
    const result = await resend.emails.send({
      from: fromEmail,
      to: subscriber.email,
      subject,
      html,
    });
    const resendError = (result as { error?: { message?: string } | null })?.error;

    if (resendError) {
      const errorMessage = resendError.message || 'Newsletter confirmation email failed.';

      console.error('Newsletter confirmation email failed:', resendError);
      await logNewsletterDelivery({
        subscriberId: subscriber.id,
        email: subscriber.email,
        emailType: 'confirmation',
        status: 'failed',
        errorMessage,
      });

      return false;
    }

    const messageId = (result as { data?: { id?: string } })?.data?.id || null;

    await logNewsletterDelivery({
      subscriberId: subscriber.id,
      email: subscriber.email,
      emailType: 'confirmation',
      status: 'sent',
      resendMessageId: messageId,
      sentAt: new Date().toISOString(),
    });

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Newsletter confirmation email failed.';

    console.error('Newsletter confirmation email failed:', error);
    await logNewsletterDelivery({
      subscriberId: subscriber.id,
      email: subscriber.email,
      emailType: 'confirmation',
      status: 'failed',
      errorMessage,
    });

    return false;
  }
}
