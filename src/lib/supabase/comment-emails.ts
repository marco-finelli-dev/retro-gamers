import { Resend } from 'resend';

type CommentEmailLanguage = 'it' | 'en';

type CommentEmailPayload = {
  to?: string | null;
  articleTitle: string;
  articleUrl: string;
  authorName?: string;
  body?: string;
  language: CommentEmailLanguage;
};

const resend = import.meta.env.RESEND_API_KEY
  ? new Resend(import.meta.env.RESEND_API_KEY)
  : null;

const notifyEmail = String(import.meta.env.COMMENTS_NOTIFY_EMAIL || '').trim();
const fromEmail = String(import.meta.env.COMMENTS_FROM_EMAIL || 'Retro-Gamers <noreply@retro-gamers.it>');
const siteUrl = String(import.meta.env.PUBLIC_SITE_URL || 'https://www.retro-gamers.it').replace(/\/$/, '');

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export const absoluteArticleUrl = (articleUrl: string) => {
  if (articleUrl.startsWith('http://') || articleUrl.startsWith('https://')) {
    return articleUrl;
  }

  return `${siteUrl}${articleUrl.startsWith('/') ? articleUrl : `/${articleUrl}`}`;
};

const renderPreview = (body = '', maxLength = 700) => {
  const preview = body.length > maxLength ? `${body.slice(0, maxLength)}...` : body;

  return escapeHtml(preview).replace(/\n/g, '<br>');
};

async function sendEmail({
  to,
  subject,
  html,
}: {
  to?: string | null;
  subject: string;
  html: string;
}) {
  if (!resend || !to) {
    return false;
  }

  await resend.emails.send({
    from: fromEmail,
    to,
    subject,
    html,
  });

  return true;
}

export async function sendNewCommentAdminEmail({
  articleTitle,
  articleUrl,
  authorName = 'Lettore',
  body = '',
  language,
}: CommentEmailPayload) {
  return sendEmail({
    to: notifyEmail,
    subject: `Nuovo commento in attesa su ${articleTitle || 'Retro-Gamers.it'}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
        <h2>Nuovo commento in attesa</h2>
        <p>
          È arrivato un nuovo commento su
          <strong>${escapeHtml(articleTitle || 'un articolo Retro-Gamers')}</strong>.
        </p>
        <p>
          <strong>Autore:</strong> ${escapeHtml(authorName)}<br>
          <strong>Lingua:</strong> ${escapeHtml(language.toUpperCase())}
        </p>
        <blockquote style="margin: 20px 0; padding: 14px 18px; border-left: 4px solid #22c8ff; background: #f4f7fb;">
          ${renderPreview(body)}
        </blockquote>
        <p>
          <a href="${escapeHtml(absoluteArticleUrl(articleUrl))}" style="color: #0070f3;">Apri l’articolo</a>
        </p>
        <p style="font-size: 13px; color: #666;">
          Apri il pannello commenti per approvare o rifiutare il messaggio.
        </p>
      </div>
    `,
  });
}

export async function sendCommentApprovedEmail({
  to,
  articleTitle,
  articleUrl,
  language,
}: CommentEmailPayload) {
  const subject = language === 'en'
    ? `Your comment was approved on Retro-Gamers.it`
    : `Il tuo commento è stato approvato su Retro-Gamers.it`;

  const message = language === 'en'
    ? `Hi, your comment was approved and is now visible in the article.`
    : `Ciao, il tuo commento è stato approvato ed è ora visibile nell’articolo.`;

  const cta = language === 'en' ? 'Read it here' : 'Puoi leggerlo qui';

  return sendEmail({
    to,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
        <h2>${escapeHtml(subject)}</h2>
        <p>${escapeHtml(message)}</p>
        <p><strong>${escapeHtml(articleTitle || 'Retro-Gamers.it')}</strong></p>
        <p>
          <a href="${escapeHtml(absoluteArticleUrl(articleUrl))}" style="color: #0070f3;">${escapeHtml(cta)}</a>
        </p>
      </div>
    `,
  });
}

export async function sendReplyApprovedEmail({
  to,
  articleTitle,
  articleUrl,
  language,
}: CommentEmailPayload) {
  const subject = language === 'en'
    ? `You received a reply on Retro-Gamers.it`
    : `Hai ricevuto una risposta su Retro-Gamers.it`;

  const message = language === 'en'
    ? `Hi, someone replied to your comment in the article`
    : `Ciao, qualcuno ha risposto al tuo commento nell’articolo`;

  const cta = language === 'en' ? 'Read the reply' : 'Leggi la risposta';

  return sendEmail({
    to,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
        <h2>${escapeHtml(subject)}</h2>
        <p>${escapeHtml(message)} <strong>${escapeHtml(articleTitle || 'Retro-Gamers.it')}</strong>.</p>
        <p>
          <a href="${escapeHtml(absoluteArticleUrl(articleUrl))}" style="color: #0070f3;">${escapeHtml(cta)}</a>
        </p>
        <p style="font-size: 13px; color: #666;">
          Questa email viene inviata solo se hai chiesto di ricevere risposte ai tuoi commenti.
        </p>
      </div>
    `,
  });
}
