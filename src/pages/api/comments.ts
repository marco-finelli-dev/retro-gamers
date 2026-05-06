import type { APIRoute } from 'astro';
import { createClient } from '@sanity/client';
import { Resend } from 'resend';

export const prerender = false;

const sanityClient = createClient({
  projectId: import.meta.env.SANITY_PROJECT_ID,
  dataset: import.meta.env.SANITY_DATASET || 'production',
  apiVersion: import.meta.env.SANITY_API_VERSION || '2025-01-01',
  token: import.meta.env.SANITY_WRITE_TOKEN,
  useCdn: false
});

const resend = import.meta.env.RESEND_API_KEY
  ? new Resend(import.meta.env.RESEND_API_KEY)
  : null;

const notifyEmail = import.meta.env.COMMENTS_NOTIFY_EMAIL || '';

const siteUrl = 'https://www.retro-gamers.it';

function cleanText(value: FormDataEntryValue | null, maxLength = 2000) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function cleanMultiline(value: FormDataEntryValue | null, maxLength = 2000) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, maxLength);
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getClientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    ''
  );
}

function redirectWithStatus(articleUrl: string, status: 'ok' | 'error') {
  const safeUrl = articleUrl && articleUrl.startsWith('/')
    ? articleUrl
    : '/';

  return new Response(null, {
    status: 303,
    headers: {
      Location: `${safeUrl}?comment=${status}#comments`
    }
  });
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function absoluteArticleUrl(articleUrl = '/') {
  if (articleUrl.startsWith('http')) return articleUrl;

  return `${siteUrl}${articleUrl.startsWith('/') ? articleUrl : `/${articleUrl}`}`;
}

async function sendCommentNotification({
  articleTitle,
  articleUrl,
  authorName,
  authorEmail,
  body,
  language
}: {
  articleTitle: string;
  articleUrl: string;
  authorName: string;
  authorEmail: string;
  body: string;
  language: 'it' | 'en';
}) {
  console.log('Comment notification env', {
    hasResendApiKey: Boolean(import.meta.env.RESEND_API_KEY),
    hasResendClient: Boolean(resend),
    hasNotifyEmail: Boolean(notifyEmail),
    notifyEmailLength: notifyEmail.length
  });

  if (!resend || !notifyEmail) {
    console.warn('Comment notification skipped', {
      missingResendClient: !resend,
      missingNotifyEmail: !notifyEmail
    });

    return;
  }

  const pageUrl = absoluteArticleUrl(articleUrl);
  const preview = body.length > 500 ? `${body.slice(0, 500)}…` : body;

  try {
    const result = await resend.emails.send({
      from: 'Retro-Gamers <noreply@send.retro-gamers.it>',
      to: notifyEmail,
      subject: `Nuovo commento in attesa su Retro-Gamers`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
          <h2>Nuovo commento in attesa</h2>

          <p>
            È arrivato un nuovo commento su <strong>${escapeHtml(articleTitle || 'Articolo Retro-Gamers')}</strong>.
          </p>

          <p>
            <strong>Autore:</strong> ${escapeHtml(authorName)}<br>
            <strong>Email:</strong> ${escapeHtml(authorEmail)}<br>
            <strong>Lingua:</strong> ${escapeHtml(language.toUpperCase())}
          </p>

          <blockquote style="margin: 20px 0; padding: 14px 18px; border-left: 4px solid #22c8ff; background: #f4f7fb;">
            ${escapeHtml(preview).replace(/\n/g, '<br>')}
          </blockquote>

          <p>
            <a href="${escapeHtml(pageUrl)}" style="color: #0070f3;">Apri l’articolo</a>
          </p>

          <p style="font-size: 13px; color: #666;">
            Vai su Sanity Studio → Commenti → In attesa per approvarlo o rifiutarlo.
          </p>
        </div>
      `
    });

    console.log('Comment notification sent:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Comment notification email error:', JSON.stringify(error, null, 2));
  }
}

export const POST: APIRoute = async ({ request }) => {
  let articleUrl = '/';

  try {
    const formData = await request.formData();

    const honeypot = cleanText(formData.get('website'), 200);
    if (honeypot) {
      return redirectWithStatus(articleUrl, 'ok');
    }

    const articleId = cleanText(formData.get('articleId'), 120);
    const articleTitle = cleanText(formData.get('articleTitle'), 180);
    const language = cleanText(formData.get('language'), 2) === 'en'
      ? 'en'
      : 'it';

    articleUrl = cleanText(formData.get('articleUrl'), 300) || '/';

    const authorName = cleanText(formData.get('authorName'), 80);
    const authorEmail = cleanText(formData.get('authorEmail'), 120).toLowerCase();
    const body = cleanMultiline(formData.get('body'), 2000);

    if (!import.meta.env.SANITY_WRITE_TOKEN) {
      console.error('Missing SANITY_WRITE_TOKEN');
      return redirectWithStatus(articleUrl, 'error');
    }

    if (!articleId || !authorName || !authorEmail || !body) {
      return redirectWithStatus(articleUrl, 'error');
    }

    if (!isValidEmail(authorEmail)) {
      return redirectWithStatus(articleUrl, 'error');
    }

    if (body.length < 3) {
      return redirectWithStatus(articleUrl, 'error');
    }

    await sanityClient.create({
      _type: 'comment',
      article: {
        _type: 'reference',
        _ref: articleId
      },
      articleTitle,
      language,
      authorName,
      authorEmail,
      body,
      status: 'pending',
      isHighlighted: false,
      createdAt: new Date().toISOString(),
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') || ''
    });

    await sendCommentNotification({
      articleTitle,
      articleUrl,
      authorName,
      authorEmail,
      body,
      language
    });

    return redirectWithStatus(articleUrl, 'ok');
  } catch (error) {
    console.error('Comment submit error:', error);
    return redirectWithStatus(articleUrl, 'error');
  }
};