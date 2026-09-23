export type EmailTemplateLanguage = 'it' | 'en';
export type EmailTemplateFooterType = 'operational' | 'newsletter';

type RenderRetroGamersEmailInput = {
  title: string;
  intro?: string;
  bodyHtml?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerType?: EmailTemplateFooterType;
  footerNote?: string;
  footerHtml?: string;
  language?: EmailTemplateLanguage;
  previewText?: string;
};

export const escapeEmailHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const defaultOperationalNote = (language: EmailTemplateLanguage) =>
  language === 'en'
    ? 'You are receiving this email because it relates to your account or an activity you requested on Retro-Gamers.it.'
    : 'Ricevi questa email perché riguarda il tuo account o un’attività richiesta su Retro-Gamers.it.';

export function renderRetroGamersEmail({
  title,
  intro,
  bodyHtml = '',
  ctaLabel,
  ctaUrl,
  footerType = 'operational',
  footerNote,
  footerHtml = '',
  language = 'it',
  previewText,
}: RenderRetroGamersEmailInput) {
  const escapedTitle = escapeEmailHtml(title);
  const escapedIntro = intro ? escapeEmailHtml(intro) : '';
  const escapedCtaLabel = ctaLabel ? escapeEmailHtml(ctaLabel) : '';
  const escapedCtaUrl = ctaUrl ? escapeEmailHtml(ctaUrl) : '';
  const escapedPreview = previewText ? escapeEmailHtml(previewText) : escapedTitle;
  const defaultFooterNote = footerType === 'operational' ? defaultOperationalNote(language) : '';
  const footerNoteText = footerNote ?? defaultFooterNote;

  // Static equivalents of the approved refresh tokens; email clients need inline fallbacks.
  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapedTitle}</title>
  <style>
    :root { color-scheme:light dark; supported-color-schemes:light dark; }
    table { border-spacing:0; }
    img { border:0; outline:none; }
    .rg-email-text a, .rg-email-footer a { color:#092547; text-decoration:underline; }
    .rg-email-text, .rg-email-footer, .rg-email-value, .rg-email-link {
      overflow-wrap:anywhere; word-break:break-word;
    }
    a:focus-visible { outline:none; text-decoration:underline !important; text-decoration-thickness:2px; text-underline-offset:4px; }
    @media only screen and (max-width:480px) {
      .rg-email-padding { padding:24px 16px !important; }
      h1.rg-email-title { font-size:24px !important; }
      .rg-email-data-label, .rg-email-value { display:block !important; width:auto !important; }
      .rg-email-data-label { padding-bottom:0 !important; }
      .rg-email-value { padding-top:2px !important; }
    }
    @media (prefers-color-scheme:dark) {
      body, .rg-email-body, .rg-email-shell { background:#092547 !important; color:#F7F1E5 !important; }
      .rg-email-title, .rg-email-value, .rg-email-brand, .rg-newsletter-item-title { color:#F7F1E5 !important; }
      .rg-email-text, .rg-email-muted, .rg-email-footer, .rg-newsletter-item-text,
      .rg-newsletter-item-kicker { color:#B0B4B6 !important; }
      .rg-email-link, .rg-email-text a, .rg-email-footer a, .rg-newsletter-item-link { color:#E8BA46 !important; }
      .rg-email-divider, .rg-newsletter-item { border-color:#2F4660 !important; }
      .rg-email-quote { background:#111C2B !important; border-color:#E8BA46 !important; color:#F7F1E5 !important; }
      .rg-email-alert { background:#111C2B !important; border-color:#E8BA46 !important; color:#F7F1E5 !important; }
      .rg-email-button-cell { background:#E8BA46 !important; }
      .rg-email-button { color:#092547 !important; }
    }
  </style>
</head>
<body class="rg-email-body" style="margin:0; padding:0; background:#F7F1E5; color:#092547; font-family:Arial, Helvetica, sans-serif; -webkit-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent; font-size:1px; line-height:1px; mso-hide:all;">${escapedPreview}</div>
  <table class="rg-email-shell" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; background:#F7F1E5;">
    <tr><td align="center">
      <!--[if mso]><table role="presentation" width="640" align="center"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; max-width:640px; margin:0 auto; table-layout:fixed;">
        <tr><td class="rg-email-padding" style="padding:32px 28px;">
          <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 28px;">
            <tr>
              <td width="56" style="width:56px; vertical-align:middle;">
                <img src="https://www.retro-gamers.it/icon-192.png" alt="Retro-Gamers" width="48" height="48" style="display:block; width:48px; height:48px;">
              </td>
              <td class="rg-email-brand" style="color:#092547; font-size:18px; line-height:1.3; font-weight:700; vertical-align:middle;">Retro-Gamers.it</td>
            </tr>
          </table>
          <h1 class="rg-email-title" style="margin:0 0 16px; font-size:28px; line-height:1.25; color:#092547; font-weight:700;">${escapedTitle}</h1>
          ${escapedIntro ? `<p class="rg-email-text" style="margin:0 0 20px; font-size:16px; line-height:1.6; color:#506276;">${escapedIntro}</p>` : ''}
          ${bodyHtml ? `<div class="rg-email-text" style="font-size:16px; line-height:1.6; color:#506276; overflow-wrap:anywhere; word-break:break-word;">${bodyHtml}</div>` : ''}
          ${escapedCtaLabel && escapedCtaUrl ? `
            <table role="presentation" cellspacing="0" cellpadding="0" style="max-width:100%; margin:24px 0 16px;">
              <tr><td class="rg-email-button-cell" align="center" bgcolor="#E8BA46" style="background:#E8BA46; border-radius:8px; mso-padding-alt:14px 20px;">
                <a class="rg-email-button" href="${escapedCtaUrl}" style="display:inline-block; padding:14px 20px; color:#092547; font-size:16px; line-height:1.3; font-weight:700; text-decoration:none; border-radius:8px;">${escapedCtaLabel}</a>
              </td></tr>
            </table>
            <p class="rg-email-muted" style="margin:0; font-size:13px; line-height:1.6; color:#506276; overflow-wrap:anywhere; word-break:break-word;">
              ${language === 'en' ? 'If the button does not work, open this link:' : 'Se il pulsante non funziona, apri questo link:'}<br>
              <a class="rg-email-link" href="${escapedCtaUrl}" style="color:#092547; text-decoration:underline; overflow-wrap:anywhere; word-break:break-word;">${escapedCtaUrl}</a>
            </p>` : ''}
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; table-layout:fixed; margin-top:28px;">
            <tr><td class="rg-email-footer rg-email-divider" style="border-top:1px solid #CCCCC8; padding-top:20px; font-size:13px; line-height:1.6; color:#506276; overflow-wrap:anywhere; word-break:break-word;">
              <p style="margin:0 0 8px;">
                <strong class="rg-email-title" style="color:#092547;">Retro-Gamers.it</strong><br>
                <a class="rg-email-link" href="https://www.retro-gamers.it/" style="color:#092547; text-decoration:underline;">https://www.retro-gamers.it/</a>
              </p>
              ${footerNoteText ? `<p style="margin:0 0 8px;">${escapeEmailHtml(footerNoteText)}</p>` : ''}
              ${footerHtml ? `<div style="margin-top:8px;">${footerHtml}</div>` : ''}
            </td></tr>
          </table>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}
