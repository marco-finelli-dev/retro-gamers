import { Resend } from 'resend';
import { escapeEmailHtml, renderRetroGamersEmail } from '../email-template';
import { supabaseAdmin } from './server';

type NewReaderRegistrationPayload = {
  userId: string;
  email?: string | null;
  username: string;
  displayName: string;
  createdAt?: string | null;
};

const resend = import.meta.env.RESEND_API_KEY
  ? new Resend(import.meta.env.RESEND_API_KEY)
  : null;

const fallbackNotifyEmail = String(import.meta.env.COMMENTS_NOTIFY_EMAIL || '').trim();
const fromEmail = String(import.meta.env.COMMENTS_FROM_EMAIL || 'Retro-Gamers <noreply@retro-gamers.it>');
const siteUrl = String(import.meta.env.PUBLIC_SITE_URL || 'https://www.retro-gamers.it').replace(/\/$/, '');

const formatDate = (value?: string | null) => {
  if (!value) return new Date().toLocaleString('it-IT');

  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

async function getAdminNotificationRecipients() {
  const recipients = new Set<string>();

  const { data: profiles, error } = await supabaseAdmin
    .from('profiles')
    .select('user_id')
    .eq('role', 'admin')
    .eq('status', 'active');

  if (error) {
    console.error('Admin recipient lookup failed:', error);
  }

  for (const profile of profiles ?? []) {
    const userId = String(profile.user_id || '');
    if (!userId) continue;

    const { data, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (userError) {
      console.error('Admin auth user lookup failed:', userError);
      continue;
    }

    const email = data.user?.email?.trim().toLowerCase();

    if (email) {
      recipients.add(email);
    }
  }

  if (recipients.size === 0 && fallbackNotifyEmail) {
    fallbackNotifyEmail
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
      .forEach((email) => recipients.add(email));
  }

  return [...recipients];
}

export async function sendNewReaderRegistrationAdminEmail({
  email,
  username,
  displayName,
  createdAt,
}: NewReaderRegistrationPayload) {
  const recipients = await getAdminNotificationRecipients();

  if (recipients.length === 0) {
    console.warn('New reader registration email skipped: no admin recipients found.');
    return false;
  }

  if (!resend) {
    console.warn('New reader registration email skipped: RESEND_API_KEY not configured.');
    return false;
  }

  const adminUsersUrl = `${siteUrl}/admin/users/`;
  const subject = 'Nuovo utente registrato su Retro-Gamers.it';
  const html = renderRetroGamersEmail({
    title: 'Nuovo utente registrato',
    intro: 'È stato creato un nuovo profilo lettore su Retro-Gamers.it.',
    bodyHtml: `
      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse; margin:0;">
        <tr>
          <td style="padding:8px 0; color:#647883; width:150px;">Email</td>
          <td style="padding:8px 0; color:#10202a;"><strong>${escapeEmailHtml(email || 'Non disponibile')}</strong></td>
        </tr>
        <tr>
          <td style="padding:8px 0; color:#647883;">Username</td>
          <td style="padding:8px 0; color:#10202a;"><strong>${escapeEmailHtml(username)}</strong></td>
        </tr>
        <tr>
          <td style="padding:8px 0; color:#647883;">Display name</td>
          <td style="padding:8px 0; color:#10202a;"><strong>${escapeEmailHtml(displayName)}</strong></td>
        </tr>
        <tr>
          <td style="padding:8px 0; color:#647883;">Data registrazione</td>
          <td style="padding:8px 0; color:#10202a;"><strong>${escapeEmailHtml(formatDate(createdAt))}</strong></td>
        </tr>
      </table>
      <p style="margin:18px 0 0 0; color:#647883;">
        Puoi gestire ruolo e stato dal pannello utenti.
      </p>
    `,
    ctaLabel: 'Apri gestione utenti',
    ctaUrl: adminUsersUrl,
    language: 'it',
    previewText: 'Nuovo utente registrato su Retro-Gamers.it.',
  });

  try {
    await resend.emails.send({
      from: fromEmail,
      to: recipients,
      subject,
      html,
    });

    return true;
  } catch (error) {
    console.error('New reader registration email failed:', error);
    return false;
  }
}
