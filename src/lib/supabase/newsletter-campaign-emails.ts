import { Resend } from 'resend';
import { escapeEmailHtml, renderRetroGamersEmail } from '../email-template';
import type { NewsletterSubscriber } from './newsletter';
import type { NewsletterCampaign, NewsletterCampaignItem } from './newsletter-campaigns';

const resend = import.meta.env.RESEND_API_KEY
  ? new Resend(import.meta.env.RESEND_API_KEY)
  : null;

const fromEmail = String(import.meta.env.COMMENTS_FROM_EMAIL || 'Retro-Gamers <noreply@retro-gamers.it>').trim();
const siteUrl = String(import.meta.env.PUBLIC_SITE_URL || 'https://www.retro-gamers.it').replace(/\/$/, '');

const buildNewsletterUnsubscribeUrl = (token?: string | null) =>
  token
    ? `${siteUrl}/newsletter/unsubscribe/?token=${encodeURIComponent(token)}`
    : `${siteUrl}/newsletter/unsubscribe/`;

const isAbsoluteHttpUrl = (value?: string | null) => {
  try {
    const url = new URL(String(value || ''), siteUrl);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const normalizeUrl = (value?: string | null) => {
  const trimmed = String(value || '').trim();

  if (!trimmed) return '';

  try {
    return new URL(trimmed, siteUrl).toString();
  } catch {
    return '';
  }
};

const renderTextContent = (value?: string | null) => {
  const paragraphs = String(value || '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs
    .map((paragraph) => `
      <p style="margin:0 0 14px 0;">
        ${escapeEmailHtml(paragraph).replace(/\n/g, '<br>')}
      </p>
    `)
    .join('');
};

const stripEmailHtml = (value?: string | null) =>
  String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const renderCampaignItem = (item: NewsletterCampaignItem) => {
  const url = normalizeUrl(item.url);
  const imageUrl = normalizeUrl(item.image_url);
  const title = escapeEmailHtml(item.title);
  const description = item.description ? escapeEmailHtml(item.description) : '';
  const type = escapeEmailHtml(item.type.replace(/_/g, ' '));
  const titleHtml = url
    ? `<a href="${escapeEmailHtml(url)}" style="color:#0b7f89; text-decoration:none;">${title}</a>`
    : title;

  return `
    <div style="border:1px solid #d8e7e9; border-radius:14px; padding:14px; margin:0 0 14px 0; background:#f8fbfc;">
      ${imageUrl && isAbsoluteHttpUrl(imageUrl) ? `
        <img src="${escapeEmailHtml(imageUrl)}" alt="" width="560" style="display:block; width:100%; max-width:560px; height:auto; border-radius:10px; margin:0 0 12px 0;">
      ` : ''}
      <div style="margin:0 0 7px 0; font-size:11px; line-height:1.3; letter-spacing:0.08em; text-transform:uppercase; color:#0b6b73; font-weight:700;">
        ${type}
      </div>
      <h2 style="margin:0 0 8px 0; font-size:18px; line-height:1.3; color:#10202a;">
        ${titleHtml}
      </h2>
      ${description ? `
        <p style="margin:0; color:#31424d; font-size:14px; line-height:1.55;">
          ${description}
        </p>
      ` : ''}
    </div>
  `;
};

const renderNewsletterCampaignText = ({
  campaign,
  unsubscribeUrl,
  isTest,
}: {
  campaign: NewsletterCampaign;
  unsubscribeUrl: string;
  isTest: boolean;
}) => {
  const language = campaign.language === 'en' ? 'en' : 'it';
  const parts = [
    campaign.subject,
    isTest
      ? language === 'en'
        ? 'This is a test email.'
        : 'Questa è una email di test.'
      : '',
    campaign.intro || '',
    campaign.content_text || stripEmailHtml(campaign.content_html),
    ...(campaign.items || []).map((item) => [
      item.title,
      item.description || '',
      item.url ? normalizeUrl(item.url) : '',
    ].filter(Boolean).join('\n')),
    campaign.cta_label && campaign.cta_url
      ? `${campaign.cta_label}: ${normalizeUrl(campaign.cta_url)}`
      : '',
    language === 'en'
      ? `You are receiving this newsletter because you subscribed to Retro-Gamers.it.\nYou can unsubscribe at any time using this link:\n${unsubscribeUrl}\n\nRetro-Gamers.it`
      : `Ricevi questa newsletter perché ti sei iscritto a Retro-Gamers.it.\nPuoi disiscriverti in qualsiasi momento da questo link:\n${unsubscribeUrl}\n\nRetro-Gamers.it`,
  ];

  return parts.filter(Boolean).join('\n\n');
};

export function renderNewsletterCampaignEmail({
  campaign,
  subscriber,
  isTest = false,
}: {
  campaign: NewsletterCampaign;
  subscriber?: NewsletterSubscriber | null;
  isTest?: boolean;
}) {
  const language = campaign.language === 'en' ? 'en' : 'it';
  const unsubscribeUrl = subscriber?.unsubscribe_token
    ? buildNewsletterUnsubscribeUrl(subscriber.unsubscribe_token)
    : '#unsubscribe-preview';
  const testNotice = isTest
    ? language === 'en'
      ? 'This is a test email.'
      : 'Questa è una email di test.'
    : '';
  const footerIntro = language === 'en'
    ? 'You are receiving this newsletter because you subscribed to Retro-Gamers.it.'
    : 'Ricevi questa newsletter perché ti sei iscritto a Retro-Gamers.it.';
  const unsubscribeText = language === 'en'
    ? 'You can unsubscribe at any time using this link:'
    : 'Puoi disiscriverti in qualsiasi momento da questo link:';
  const previewNotice = isTest
    ? language === 'en'
      ? 'The unsubscribe link is a preview placeholder in test emails.'
      : 'Il link di disiscrizione è un placeholder nelle email di test.'
    : '';
  const contentHtml = String(campaign.content_html || '').trim();
  const contentTextFallback = String(campaign.content_text || '').trim();
  const bodyHtml = `
    ${testNotice ? `
      <div style="border:1px solid #f4c857; border-radius:12px; padding:12px 14px; margin:0 0 18px 0; background:#fff7d6; color:#6d5400; font-weight:700;">
        ${escapeEmailHtml(testNotice)}
      </div>
    ` : ''}
    ${contentHtml || (contentTextFallback ? renderTextContent(contentTextFallback) : '')}
    ${(campaign.items || []).map(renderCampaignItem).join('')}
  `;

  return renderRetroGamersEmail({
    title: campaign.subject,
    intro: campaign.intro || undefined,
    bodyHtml,
    ctaLabel: campaign.cta_label || undefined,
    ctaUrl: campaign.cta_url ? normalizeUrl(campaign.cta_url) : undefined,
    footerType: 'newsletter',
    footerHtml: `
      <p style="margin:0 0 8px 0;">
        ${escapeEmailHtml(footerIntro)}
      </p>
      <p style="margin:0;">
        ${escapeEmailHtml(unsubscribeText)}<br>
        <a href="${escapeEmailHtml(unsubscribeUrl)}" style="color:#0b7f89; text-decoration:underline; word-break:break-word;">${escapeEmailHtml(unsubscribeUrl)}</a>
      </p>
      ${previewNotice ? `<p style="margin:8px 0 0 0;">${escapeEmailHtml(previewNotice)}</p>` : ''}
    `,
    language,
    previewText: campaign.preheader || campaign.intro || campaign.subject,
  });
}

export async function sendNewsletterCampaignEmail({
  campaign,
  to,
  subscriber,
  isTest = false,
}: {
  campaign: NewsletterCampaign;
  to: string;
  subscriber?: NewsletterSubscriber | null;
  isTest?: boolean;
}) {
  const html = renderNewsletterCampaignEmail({ campaign, subscriber, isTest });
  const unsubscribeUrl = subscriber?.unsubscribe_token
    ? buildNewsletterUnsubscribeUrl(subscriber.unsubscribe_token)
    : '#unsubscribe-preview';
  const text = renderNewsletterCampaignText({ campaign, unsubscribeUrl, isTest });
  const subject = isTest
    ? `[TEST] ${campaign.subject}`
    : campaign.subject;

  if (!resend || !fromEmail) {
    return {
      ok: false,
      error: 'RESEND_API_KEY or sender not configured.',
      messageId: null as string | null,
    };
  }

  try {
    const result = await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
      text,
    });
    const resendError = (result as { error?: { message?: string } | null })?.error;

    if (resendError) {
      return {
        ok: false,
        error: resendError.message || 'Newsletter campaign email failed.',
        messageId: null as string | null,
      };
    }

    return {
      ok: true,
      error: null,
      messageId: (result as { data?: { id?: string } })?.data?.id || null,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Newsletter campaign email failed.',
      messageId: null as string | null,
    };
  }
}
