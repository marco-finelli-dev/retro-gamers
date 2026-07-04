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

  return `<!doctype html>
<html lang="${language}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapedTitle}</title>
  </head>
  <body style="margin:0; padding:0; background:#eef4f5; font-family:Arial, Helvetica, sans-serif; color:#10202a;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">
      ${escapedPreview}
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; background:#eef4f5; margin:0; padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; max-width:640px; margin:0 auto;">
            <tr>
              <td style="padding:0 0 14px 0;">
                <div style="font-size:13px; line-height:1.4; letter-spacing:0.08em; font-weight:700; color:#0b6b73; text-transform:uppercase;">
                  Retro-Gamers.it
                </div>
              </td>
            </tr>

            <tr>
              <td style="background:#ffffff; border:1px solid #d8e7e9; border-radius:18px; overflow:hidden; box-shadow:0 12px 32px rgba(11, 31, 42, 0.08);">
                <div style="height:5px; background:#19b9c4;"></div>
                <div style="padding:30px 28px 28px 28px;">
                  <h1 style="margin:0 0 16px 0; font-size:26px; line-height:1.22; color:#10202a; font-weight:800;">
                    ${escapedTitle}
                  </h1>

                  ${escapedIntro ? `
                    <p style="margin:0 0 20px 0; font-size:16px; line-height:1.65; color:#31424d;">
                      ${escapedIntro}
                    </p>
                  ` : ''}

                  ${bodyHtml ? `
                    <div style="font-size:15px; line-height:1.65; color:#31424d;">
                      ${bodyHtml}
                    </div>
                  ` : ''}

                  ${escapedCtaLabel && escapedCtaUrl ? `
                    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0 12px 0;">
                      <tr>
                        <td style="border-radius:999px; background:#0f9fab;">
                          <a href="${escapedCtaUrl}" style="display:inline-block; padding:13px 22px; color:#ffffff; font-size:15px; font-weight:700; text-decoration:none; border-radius:999px;">
                            ${escapedCtaLabel}
                          </a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:0; font-size:12px; line-height:1.5; color:#647883;">
                      ${language === 'en' ? 'If the button does not work, open this link:' : 'Se il pulsante non funziona, apri questo link:'}<br>
                      <a href="${escapedCtaUrl}" style="color:#0b7f89; text-decoration:underline; word-break:break-word;">${escapedCtaUrl}</a>
                    </p>
                  ` : ''}
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 4px 0 4px; font-size:12px; line-height:1.6; color:#647883;">
                <p style="margin:0 0 8px 0;">
                  <strong style="color:#31424d;">Retro-Gamers.it</strong><br>
                  <a href="https://www.retro-gamers.it/" style="color:#0b7f89; text-decoration:underline;">https://www.retro-gamers.it/</a>
                </p>
                ${footerNoteText ? `
                  <p style="margin:0 0 8px 0;">
                    ${escapeEmailHtml(footerNoteText)}
                  </p>
                ` : ''}
                ${footerHtml ? `
                  <div style="margin-top:8px;">
                    ${footerHtml}
                  </div>
                ` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
