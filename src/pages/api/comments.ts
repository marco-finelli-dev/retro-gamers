import type { APIRoute } from 'astro';
import { createClient } from '@sanity/client';

export const prerender = false;

const sanityClient = createClient({
  projectId: import.meta.env.SANITY_PROJECT_ID,
  dataset: import.meta.env.SANITY_DATASET || 'production',
  apiVersion: import.meta.env.SANITY_API_VERSION || '2025-01-01',
  token: import.meta.env.SANITY_WRITE_TOKEN,
  useCdn: false
});

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

    return redirectWithStatus(articleUrl, 'ok');
  } catch (error) {
    console.error('Comment submit error:', error);
    return redirectWithStatus(articleUrl, 'error');
  }
};