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
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${escapedTitle}</title>
    <style>
      :root {
        color-scheme: light dark;
        supported-color-schemes: light dark;
      }

      .rg-email-body,
      .rg-email-shell {
        background: #f5f3ee;
      }

      .rg-email-card {
        background: #ffffff;
        border-color: #e5e0d8;
      }

      .rg-email-title {
        color: #111827;
      }

      .rg-email-text {
        color: #374151;
      }

      .rg-email-muted,
      .rg-email-footer {
        color: #5b6472;
      }

      .rg-email-brand,
      .rg-email-link,
      .rg-email-text a,
      .rg-email-footer a {
        color: #0b7f89;
      }

      .rg-email-button-cell {
        background: #0f9fab;
      }

      .rg-email-button {
        color: #ffffff !important;
      }

      @media (prefers-color-scheme: dark) {
        body,
        .rg-email-body,
        .rg-email-shell {
          background: #0f1418 !important;
          color: #f3f7f8 !important;
        }

        .rg-email-card {
          background: #171f26 !important;
          border-color: #2b3944 !important;
          box-shadow: none !important;
        }

        .rg-email-title,
        .rg-newsletter-item-title {
          color: #f3f7f8 !important;
        }

        .rg-email-text,
        .rg-newsletter-item-text {
          color: #b8c4cc !important;
        }

        .rg-email-muted,
        .rg-email-footer {
          color: #b8c4cc !important;
        }

        .rg-email-brand,
        .rg-email-link,
        .rg-email-text a,
        .rg-email-footer a,
        .rg-newsletter-item-link {
          color: #35d3df !important;
        }

        .rg-email-button-cell {
          background: #35d3df !important;
        }

        .rg-email-button {
          color: #071015 !important;
        }

        .rg-email-accent {
          background: #35d3df !important;
        }

        .rg-newsletter-item {
          background: #18222b !important;
          border-color: #2b3944 !important;
        }

        .rg-newsletter-item-kicker {
          color: #35d3df !important;
        }

        .rg-email-alert {
          background: #332a11 !important;
          border-color: #d8b43f !important;
          color: #ffe8a3 !important;
        }
      }
    </style>
  </head>
  <body class="rg-email-body" style="margin:0; padding:0; background:#f5f3ee; font-family:Arial, Helvetica, sans-serif; color:#111827;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">
      ${escapedPreview}
    </div>

    <table class="rg-email-shell" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; background:#f5f3ee; margin:0; padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; max-width:640px; margin:0 auto;">
            <tr>
              <td style="padding:0 0 14px 0;">
                <div class="rg-email-brand" style="font-size:13px; line-height:1.4; letter-spacing:0.08em; font-weight:700; color:#0b6b73; text-transform:uppercase;">
                  Retro-Gamers.it
                </div>
              </td>
            </tr>

            <tr>
              <td class="rg-email-card" style="background:#ffffff; border:1px solid #e5e0d8; border-radius:18px; overflow:hidden; box-shadow:0 12px 32px rgba(11, 31, 42, 0.08);">
                <div class="rg-email-accent" style="height:5px; background:#19b9c4;"></div>
                <div style="padding:30px 28px 28px 28px;">
                  <h1 class="rg-email-title" style="margin:0 0 16px 0; font-size:26px; line-height:1.22; color:#111827; font-weight:800;">
                    ${escapedTitle}
                  </h1>

                  ${escapedIntro ? `
                    <p class="rg-email-text" style="margin:0 0 20px 0; font-size:16px; line-height:1.65; color:#374151;">
                      ${escapedIntro}
                    </p>
                  ` : ''}

                  ${bodyHtml ? `
                    <div class="rg-email-text" style="font-size:15px; line-height:1.65; color:#374151;">
                      ${bodyHtml}
                    </div>
                  ` : ''}

                  ${escapedCtaLabel && escapedCtaUrl ? `
                    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0 12px 0;">
                      <tr>
                        <td class="rg-email-button-cell" style="border-radius:999px; background:#0f9fab;">
                          <a class="rg-email-button" href="${escapedCtaUrl}" style="display:inline-block; padding:13px 22px; color:#ffffff; font-size:15px; font-weight:700; text-decoration:none; border-radius:999px;">
                            ${escapedCtaLabel}
                          </a>
                        </td>
                      </tr>
                    </table>

                    <p class="rg-email-muted" style="margin:0; font-size:12px; line-height:1.5; color:#5b6472;">
                      ${language === 'en' ? 'If the button does not work, open this link:' : 'Se il pulsante non funziona, apri questo link:'}<br>
                      <a class="rg-email-link" href="${escapedCtaUrl}" style="color:#0b7f89; text-decoration:underline; word-break:break-word;">${escapedCtaUrl}</a>
                    </p>
                  ` : ''}
                </div>
              </td>
            </tr>

            <tr>
              <td class="rg-email-footer" style="padding:18px 4px 0 4px; font-size:12px; line-height:1.6; color:#5b6472;">
                <p style="margin:0 0 8px 0;">
                  <strong class="rg-email-title" style="color:#111827;">Retro-Gamers.it</strong><br>
                  <a class="rg-email-link" href="https://www.retro-gamers.it/" style="color:#0b7f89; text-decoration:underline;">https://www.retro-gamers.it/</a>
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
