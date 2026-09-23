# Audit e visual refresh email — 23 settembre 2026

Solo template e fixture offline. Nessun invio, modifica a dati, auth, query, tracking o provider. Branch `visual-refresh`; lavori preesistenti preservati.

## Inventario effettivo

Tutti i file della tabella sono sotto `src/lib/supabase/`; tutti usano `src/lib/email-template.ts` e Resend. Non è stato trovato un altro trasporto email nel codice applicativo.

| Template / file e funzione | Punto di invio | Subject | Destinatario / dati dinamici | Plain text / asset |
|---|---|---|---|---|
| Campagna newsletter IT/EN — `newsletter-campaign-emails.ts`, `sendNewsletterCampaignEmail` / `renderNewsletterCampaignEmail` | `/api/admin/newsletter/campaigns/[campaignId]/send` e `/test-send` (preview HTML anche nell'area newsletter) | `campaign.subject`, prefisso `[TEST]` nel test esistente | Destinatario passato dal chiamante; lingua, subject, preheader, intro, HTML/testo editoriale, item con tipo/titolo/descrizione/URL/immagine, CTA, token unsubscribe | **Sì**, invariato. Immagini dinamiche `item.image_url`, normalizzazione URL invariata |
| Conferma iscrizione newsletter IT/EN — `newsletter-emails.ts`, `sendNewsletterConfirmationEmail` | `/api/newsletter/subscribe`, `/api/account/newsletter` (iscrizione/reinvio) | `Conferma iscrizione alla newsletter di Retro-Gamers.it` / `Confirm your Retro-Gamers.it newsletter subscription` | Subscriber email; lingua, confirmation token → URL conferma | No versione text esplicita preesistente; non rimossa né inventata |
| Nuovo lettore — `account-emails.ts`, `sendNewReaderRegistrationAdminEmail` | `/api/auth/register`; `supabase/oauth.ts` per primo profilo OAuth | `Nuovo utente registrato su Retro-Gamers.it` | Admin attivi da helper esistente, fallback `COMMENTS_NOTIFY_EMAIL`; email, username, display name, data, URL gestione utenti | No text esplicito |
| Commento da moderare — `comment-emails.ts`, `sendNewCommentAdminEmail` | `/api/comments/create` | `Nuovo commento in attesa su ${articleTitle || 'Retro-Gamers.it'}` | `COMMENTS_NOTIFY_EMAIL`; titolo/URL articolo, nome autore, lingua, anteprima corpo (limite invariato), URL moderazione | No text esplicito |
| Commento approvato IT/EN — stesso file, `sendCommentApprovedEmail` | `comment-admin-notifications.ts` → `/api/admin/comments/moderate`, `/bulk-moderate` | `Il tuo commento è stato approvato su Retro-Gamers.it` / `Your comment was approved on Retro-Gamers.it` | Destinatario risolto dal chiamante; titolo/URL articolo e anchor commento, lingua, identificatori per log | No text esplicito |
| Risposta al commento IT/EN — stesso file, `sendReplyApprovedEmail` | `/api/comments/create`; `comment-admin-notifications.ts` dopo moderazione | `Hai ricevuto una risposta su Retro-Gamers.it` / `You received a reply on Retro-Gamers.it` | Destinatario autorizzato dal flusso esistente; titolo/URL articolo e anchor, lingua, link unsubscribe opzionale | No text esplicito; opt-out preservato |
| Risposta Community Survey — `community-survey-emails.ts`, `sendCommunitySurveyResponseAdminEmail` | `/api/community/surveys/[surveyKey]/responses`, solo nelle condizioni esistenti | `Nuova risposta al Community Survey` | Helper admin condiviso; key/titolo/lingua/data, URL risultati; nessuna risposta individuale in email | No text esplicito |

Mittente e selezione destinatari restano quelli già configurati. Nessun indirizzo reale viene inserito nelle fixture.

Le notifiche redazionali in `editorial/notifications.server.ts` sono **messaggi nell'account**, non email. Nessun nuovo template creato per esse. Nessuna welcome distinta inviata dal repository individuata.

## Auth esterna: passaggi manuali

La conferma account/reinvio passano a Supabase Auth (`signUp` e `auth.resend`): il template effettivo risiede in **Supabase Dashboard → Authentication → Emails → Confirm signup**. SMTP/Resend è il trasporto, non il renderer locale. Nel microfix Confirm signup successivo, Subject e HTML hosted sono stati ispezionati in sola lettura; non sono stati modificati nel Dashboard. Vedi la guida dedicata aggiornata.

`docs/supabase/confirm-signup-email-template.html` è ora il **Body aggiornato da incollare manualmente** in Confirm sign up, non un template caricato a runtime. Non è stato installato nel Dashboard. La guida `docs/supabase/email-confirmation-setup.md` documenta il passaggio manuale. Il microfix successivo aggiunge il metadata `language` al signup IT/EN: il Body e il Subject condizionali sono pronti, ma devono essere installati nel Dashboard. Nessun altro template Auth è stato modificato.

Il nuovo Body usa canvas Ivory `#F7F1E5`, testo Navy `#092547`, PNG RG, CTA Gold/Navy, footer sobrio e media query dark come nel renderer condiviso. Conserva `{{ .ConfirmationURL }}`; usare il Subject localizzato indicato nella guida senza cambiare redirect. Provare prima nel sistema di preview del provider.

Non sono state trovate chiamate `resetPasswordForEmail`/`recover` né route di password dimenticata nel repository corrente. `change-password` usa `updateUser` per l'utente autenticato. Eventuali template Recovery, Invite, Email change o notifiche sicurezza abilitati **solo nel provider** richiedono un inventario del Dashboard; non si presume che siano attivi o assenti. Non crearne copie locali. Nessuna dichiarazione di audit completo della configurazione esterna.

## Struttura e palette

Renderer condiviso riusato: preheader invisibile, branding compatto, unico H1, corpo, CTA con URL fallback, footer operativo/newsletter. Tabelle di presentazione, limite 640 px e wrapper condizionale MSO; CSS critico inline, nessun flex/grid/JS, radius CTA 8 px senza ombre. Nessuna grande card perimetrale.

Focus tastiera con sottolineatura, senza cornici verdi. Valori statici da `src/styles/global.css`: Navy `#092547`, Ivory `#F7F1E5`, Gold `#E8BA46`, superficie `#111C2B` dark / `#F0E8DA` light. Secondari e divider sono le composizioni opache dei token Navy/Ivory (70% testo, 18% bordo light / 16% dark), arrotondate a RGB per non dipendere da CSS variables/color-mix.

CTA Gold con testo Navy in entrambi i temi: contrasto superiore a 8:1; link sottolineati Navy in light e Gold in dark. Titoli Ivory e testi secondari chiari in dark. `color-scheme`, `supported-color-schemes` e `prefers-color-scheme:dark`; fallback inline leggibile senza CSS head. Nessun filtro sulle immagini. Le inversioni forzate dei client non sono garantibili da una preview browser.

## Logo e immagini

**`https://www.retro-gamers.it/icon-192.png`**, PNG approvato già esistente e pubblico, visualizzato 48×48 con alt `Retro-Gamers`, accompagnato dal nome. HTTP 200 e SHA256 identico al file locale verificati. Nessun asset del sito modificato/coperto/convertito. Gli altri raster con nome logo individuati rappresentano il marchio legacy: non usati.

Newsletter: stessi URL dinamici, immagini responsive larghezza massima 584 px e altezza naturale; nessun rapporto imposto o crop nuovo. Alt derivato dal titolo del contenuto collegato. Il modello non espone dimensioni native affidabili: non si inventa una height fissa.

`campaign.content_html` è mantenuto letteralmente come prima: eventuali stili inline legacy **salvati nel contenuto** non vengono riscritti da questo intervento. Richiedono revisione editoriale separata prima dell'invio.

## Verifiche riproducibili senza invio

Nessun test email preesistente individuato. Aggiunti:

- `tests/email-templates.test.mjs`: 27 controlli su 13 fixture, confronto con renderer precedente per subject, destinatari, mittente, tutti gli href e plain text. Verifica escaping, unsubscribe e struttura condivisa.
- `tests/helpers/email-harness.mjs`: bundle esbuild con sostituzione obbligatoria di Resend e storage prima di caricare i moduli; nessun `.env`, nessuna chiamata ai servizi reali.
- `tests/helpers/email-preview.mjs`: scrive HTML e text in una cartella temporanea. Eseguire dalla radice: `node tests/helpers/email-preview.mjs /tmp/rg-email-preview`.
- `node --test tests/email-templates.test.mjs`.

I token nei link di preview sono fittizi. Non usare i link di azione per testare dati reali.

Browser locale: newsletter IT/EN, amministrative e conferme/commenti in light/dark a 320/640 px; campioni anche 390/600/1280. Nessun overflow rilevato. Screenshot locali in `/tmp/rg-email-preview/screenshots/`. Build frontend e `git diff --check` eseguiti.

Non testati invii effettivi, Apple Mail, Gmail/Outlook reali o inversione automatica proprietaria. Il tentativo di apertura Safari per una verifica WebKit locale è terminato in timeout: nessuna compatibilità WebKit dichiarata. La preview browser non equivale a certificazione di compatibilità email. Prima del live serve controllo nei client destinatari reali con un invio di prova separatamente autorizzato.

## File modificati

Produzione: `src/lib/email-template.ts`, `src/lib/supabase/account-emails.ts`, `src/lib/supabase/comment-emails.ts`, `src/lib/supabase/community-survey-emails.ts`, `src/lib/supabase/newsletter-campaign-emails.ts`.

Supporto: questo inventario e i tre file test/preview elencati sopra. Nessuna pagina frontend, asset, configurazione provider o file Sanity modificato.
