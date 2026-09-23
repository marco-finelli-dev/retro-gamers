import { Resend } from 'resend';
import { escapeEmailHtml, renderRetroGamersEmail } from '../email-template';
import type { CommunitySurveyLanguage } from '../community-surveys';
import { getAdminNotificationRecipients } from './account-emails';

type CommunitySurveyResponseAdminEmailPayload = {
  surveyKey: string;
  surveyTitle?: string | null;
  surveyLanguage: CommunitySurveyLanguage;
  submittedAt?: string | null;
};

const resend = import.meta.env.RESEND_API_KEY
  ? new Resend(import.meta.env.RESEND_API_KEY)
  : null;

const fromEmail = String(import.meta.env.COMMENTS_FROM_EMAIL || 'Retro-Gamers <noreply@retro-gamers.it>');
const siteUrl = String(import.meta.env.PUBLIC_SITE_URL || 'https://www.retro-gamers.it').replace(/\/$/, '');
const adminEmailDateFormatter = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Rome',
});

const formatDate = (value?: string | null) => {
  if (!value) return adminEmailDateFormatter.format(new Date());

  return adminEmailDateFormatter.format(new Date(value));
};

export async function sendCommunitySurveyResponseAdminEmail({
  surveyKey,
  surveyTitle,
  surveyLanguage,
  submittedAt,
}: CommunitySurveyResponseAdminEmailPayload) {
  const recipients = await getAdminNotificationRecipients();

  if (recipients.length === 0) {
    console.warn('Community survey response email skipped: no admin recipients found.');
    return false;
  }

  if (!resend) {
    console.warn('Community survey response email skipped: RESEND_API_KEY not configured.');
    return false;
  }

  const cleanSurveyKey = String(surveyKey || '').trim();
  const title = String(surveyTitle || cleanSurveyKey || 'Community Survey').trim();
  const adminResultsUrl = `${siteUrl}/admin/surveys/${encodeURIComponent(cleanSurveyKey)}/`;
  const submittedAtLabel = formatDate(submittedAt);

  const bodyHtml = `
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%; table-layout:fixed; border-collapse:collapse; margin:0;">
      <tr>
        <td class="rg-email-muted rg-email-data-label" style="padding:8px 0; vertical-align:top; color:#506276; width:30%;">Survey</td>
        <td class="rg-email-value" style="padding:8px 0; vertical-align:top; overflow-wrap:anywhere; word-break:break-word; color:#092547;"><strong style="color:inherit;">${escapeEmailHtml(title)}</strong></td>
      </tr>
      <tr>
        <td class="rg-email-muted rg-email-data-label" style="padding:8px 0; vertical-align:top; color:#506276;">Lingua</td>
        <td class="rg-email-value" style="padding:8px 0; vertical-align:top; overflow-wrap:anywhere; word-break:break-word; color:#092547;"><strong style="color:inherit;">${escapeEmailHtml(surveyLanguage.toUpperCase())}</strong></td>
      </tr>
      <tr>
        <td class="rg-email-muted rg-email-data-label" style="padding:8px 0; vertical-align:top; color:#506276;">Data risposta</td>
        <td class="rg-email-value" style="padding:8px 0; vertical-align:top; overflow-wrap:anywhere; word-break:break-word; color:#092547;"><strong style="color:inherit;">${escapeEmailHtml(submittedAtLabel)}</strong></td>
      </tr>
    </table>
    <p class="rg-email-muted" style="margin:18px 0 0 0; color:#506276;">
      L’email segnala solo la nuova partecipazione. Le risposte individuali non sono incluse.
    </p>
  `;

  try {
    await resend.emails.send({
      from: fromEmail,
      to: recipients,
      subject: 'Nuova risposta al Community Survey',
      html: renderRetroGamersEmail({
        title: 'Nuova risposta al Community Survey',
        intro: 'È stata registrata una nuova partecipazione anonima al sondaggio community.',
        bodyHtml,
        ctaLabel: 'Apri risultati',
        ctaUrl: adminResultsUrl,
        language: 'it',
        previewText: 'Nuova partecipazione anonima al Community Survey di Retro-Gamers.it.',
      }),
    });

    return true;
  } catch (error) {
    console.error('Community survey response email failed:', error);
    return false;
  }
}
