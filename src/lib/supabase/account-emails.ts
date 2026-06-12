import { Resend } from 'resend';
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

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

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
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
      <h2>Nuovo utente registrato su Retro-Gamers.it</h2>

      <p>
        <strong>Email:</strong> ${escapeHtml(email || 'Non disponibile')}<br>
        <strong>Username:</strong> ${escapeHtml(username)}<br>
        <strong>Display name:</strong> ${escapeHtml(displayName)}<br>
        <strong>Data registrazione:</strong> ${escapeHtml(formatDate(createdAt))}
      </p>

      <p>
        Puoi gestire ruolo e stato dal pannello utenti:<br>
        <a href="${escapeHtml(adminUsersUrl)}" style="color: #0070f3;">${escapeHtml(adminUsersUrl)}</a>
      </p>
    </div>
  `;

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
