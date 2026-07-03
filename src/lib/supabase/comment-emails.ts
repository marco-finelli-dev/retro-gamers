import { Resend } from 'resend';
import { escapeEmailHtml, renderRetroGamersEmail } from '../email-template';
import { supabaseAdmin } from './server';

type CommentEmailLanguage = 'it' | 'en';
type CommentEmailType = 'comment_approved' | 'reply_to_comment';

type CommentEmailPayload = {
  to?: string | null;
  userId?: string | null;
  commentId?: string | null;
  articleTitle: string;
  articleUrl: string;
  authorName?: string;
  body?: string;
  language: CommentEmailLanguage;
  unsubscribeUrl?: string | null;
};

const resend = import.meta.env.RESEND_API_KEY
  ? new Resend(import.meta.env.RESEND_API_KEY)
  : null;

const notifyEmail = String(import.meta.env.COMMENTS_NOTIFY_EMAIL || '').trim();
const fromEmail = String(import.meta.env.COMMENTS_FROM_EMAIL || 'Retro-Gamers <noreply@retro-gamers.it>');
const siteUrl = String(import.meta.env.PUBLIC_SITE_URL || 'https://www.retro-gamers.it').replace(/\/$/, '');

export const absoluteArticleUrl = (articleUrl: string) => {
  if (articleUrl.startsWith('http://') || articleUrl.startsWith('https://')) {
    return articleUrl;
  }

  return `${siteUrl}${articleUrl.startsWith('/') ? articleUrl : `/${articleUrl}`}`;
};

const renderPreview = (body = '', maxLength = 700) => {
  const preview = body.length > maxLength ? `${body.slice(0, maxLength)}...` : body;

  return escapeEmailHtml(preview).replace(/\n/g, '<br>');
};

async function sendEmail({
  type,
  to,
  userId,
  commentId,
  subject,
  html,
}: {
  type?: CommentEmailType;
  to?: string | null;
  userId?: string | null;
  commentId?: string | null;
  subject: string;
  html: string;
}) {
  if (!to) {
    return false;
  }

  if (!resend) {
    if (type) {
      await logEmailNotification({
        type,
        to,
        userId,
        commentId,
        status: 'failed',
        errorMessage: 'RESEND_API_KEY non configurata.',
      });
    }

    return false;
  }

  try {
    await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
    });

    if (type) {
      await logEmailNotification({
        type,
        to,
        userId,
        commentId,
        status: 'sent',
      });
    }

    return true;
  } catch (error) {
    if (type) {
      await logEmailNotification({
        type,
        to,
        userId,
        commentId,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Errore invio email.',
      });
    }

    console.error('Comment email send failed:', error);

    return false;
  }
}

async function logEmailNotification({
  type,
  to,
  userId,
  commentId,
  status,
  errorMessage,
}: {
  type: CommentEmailType;
  to: string;
  userId?: string | null;
  commentId?: string | null;
  status: 'sent' | 'failed';
  errorMessage?: string | null;
}) {
  try {
    await supabaseAdmin
      .from('email_notifications')
      .insert({
        user_id: userId || null,
        recipient_email: to,
        type,
        status,
        comment_id: commentId || null,
        error_message: errorMessage || null,
        sent_at: status === 'sent' ? new Date().toISOString() : null,
      });
  } catch (error) {
    console.error('Email notification log failed:', error);
  }
}

export async function sendNewCommentAdminEmail({
  articleTitle,
  articleUrl,
  authorName = 'Lettore',
  body = '',
  language,
  commentId,
}: CommentEmailPayload) {
  const moderationUrl = `${siteUrl}/admin/comments/?status=pending`;
  const articleLink = absoluteArticleUrl(articleUrl);

  return sendEmail({
    to: notifyEmail,
    commentId,
    subject: `Nuovo commento in attesa su ${articleTitle || 'Retro-Gamers.it'}`,
    html: renderRetroGamersEmail({
      title: 'Nuovo commento in attesa',
      intro: `È arrivato un nuovo commento su ${articleTitle || 'un articolo Retro-Gamers'}.`,
      bodyHtml: `
        <p style="margin:0 0 16px 0;">
          <strong>Autore:</strong> ${escapeEmailHtml(authorName)}<br>
          <strong>Lingua:</strong> ${escapeEmailHtml(language.toUpperCase())}
        </p>
        <blockquote style="margin:20px 0; padding:14px 18px; border-left:4px solid #19b9c4; background:#f4f9fa; border-radius:10px;">
          ${renderPreview(body)}
        </blockquote>
        <p style="margin:16px 0 0 0;">
          Articolo:
          <a href="${escapeEmailHtml(articleLink)}" style="color:#0b7f89; text-decoration:underline;">${escapeEmailHtml(articleTitle || articleLink)}</a>
        </p>
        <p style="margin:12px 0 0 0; color:#647883;">
          Apri il pannello commenti per approvare o rifiutare il messaggio.
        </p>
      `,
      ctaLabel: 'Apri moderazione',
      ctaUrl: moderationUrl,
      language: 'it',
      previewText: 'Nuovo commento in attesa di moderazione su Retro-Gamers.it.',
    }),
  });
}

export async function sendCommentApprovedEmail({
  to,
  userId,
  commentId,
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

  const cta = language === 'en' ? 'Open comment' : 'Apri commento';

  return sendEmail({
    type: 'comment_approved',
    to,
    userId,
    commentId,
    subject,
    html: renderRetroGamersEmail({
      title: subject,
      intro: message,
      bodyHtml: `
        <p style="margin:0;">
          <strong>${escapeEmailHtml(articleTitle || 'Retro-Gamers.it')}</strong>
        </p>
      `,
      ctaLabel: cta,
      ctaUrl: absoluteArticleUrl(articleUrl),
      language,
      previewText: message,
    }),
  });
}

export async function sendReplyApprovedEmail({
  to,
  userId,
  commentId,
  articleTitle,
  articleUrl,
  language,
  unsubscribeUrl,
}: CommentEmailPayload) {
  const subject = language === 'en'
    ? `You received a reply on Retro-Gamers.it`
    : `Hai ricevuto una risposta su Retro-Gamers.it`;

  const message = language === 'en'
    ? `Hi, someone replied to your comment in the article`
    : `Ciao, qualcuno ha risposto al tuo commento nell’articolo`;

  const cta = language === 'en' ? 'Read the reply' : 'Leggi la risposta';
  const replyNote = language === 'en'
    ? 'This email is sent only if you asked to receive replies to your comments.'
    : 'Questa email viene inviata solo se hai chiesto di ricevere risposte ai tuoi commenti.';
  const unsubscribeText = language === 'en'
    ? 'You can stop reply notifications from this link:'
    : 'Puoi interrompere queste notifiche da questo link:';
  const unsubscribeLabel = language === 'en' ? 'Unsubscribe' : 'Disiscriviti';

  return sendEmail({
    type: 'reply_to_comment',
    to,
    userId,
    commentId,
    subject,
    html: renderRetroGamersEmail({
      title: subject,
      intro: `${message} ${articleTitle || 'Retro-Gamers.it'}.`,
      ctaLabel: cta,
      ctaUrl: absoluteArticleUrl(articleUrl),
      language,
      previewText: subject,
      footerHtml: `
        <p style="margin:0 0 8px 0;">
          ${escapeEmailHtml(replyNote)}
        </p>
        ${unsubscribeUrl ? `
          <p style="margin:0;">
            ${escapeEmailHtml(unsubscribeText)}
            <a href="${escapeEmailHtml(unsubscribeUrl)}" style="color:#0b7f89; text-decoration:underline;">${escapeEmailHtml(unsubscribeLabel)}</a>
          </p>
        ` : ''}
      `,
    }),
  });
}
