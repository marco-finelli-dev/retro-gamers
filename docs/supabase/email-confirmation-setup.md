# Conferma registrazione: Supabase Auth Confirm signup

## Stato — 23 settembre 2026

Source of truth confermata nel codice e nel Dashboard del progetto `retro-gamers-comments`: **Authentication → Emails / Email Templates → Confirm sign up**.

Il template hosted è stato letto, ma NON modificato. Il file `confirm-signup-email-template.html` è il Body definitivo da incollare nel provider; `confirm-signup-email-subject.txt` è il Subject. Non sono un secondo renderer frontend: Supabase li userà soltanto dopo installazione nel Dashboard.

## Flusso e lingua

- `/account/register/` e `/en/account/register/` montano `src/components/account/RegisterPage.astro` con `lang="it"` / `lang="en"`.
- Il form ora aggiunge `language: clientCopy.lang` al payload esistente di `POST /api/auth/register`.
- `src/pages/api/auth/register.ts` normalizza la lingua: esattamente `en` → EN; ogni altro valore o metadata assente → IT. Passa `options.data: { language }` a `supabasePublic.auth.signUp`.
- Username, display name, badge, email/password, validazioni e salvataggio profilo restano invariati. Il metadata è solo presentazionale, mai usato per permessi.
- Il template legge `{{ .Data.language }}`: un solo ramo EN oppure IT. Nessuna deduzione da email, browser o preferenze account.
- Account precedenti senza metadata: fallback IT. Nessun backfill o modifica utenti effettuato.
- `POST /api/auth/resend-confirmation` resta invariato e riusa il template signup con i metadata dell'utente già memorizzati.

La notifica admin è separata: `sendNewReaderRegistrationAdminEmail` in `src/lib/supabase/account-emails.ts` usa il renderer locale `renderRetroGamersEmail` e Resend. Non è stata modificata.

## Cause verificate nel template hosted

- Il logo puntava a `https://www.retro-gamers.it/images/icons/retro-gamers-hero-logo-2`, che restituisce **HTTP 404**.
- Il Body conteneva due sezioni complete consecutive, IT e EN, senza alcuna condizione Go.
- Subject precedente: `Conferma il tuo account Retro-Gamers.it / Confirm your account`.
- Palette hosted: background `#f3f8fb`, card bianca, CTA `#dff4f8` / `#0f7780`, pill e ombra. Il refresh delle mail locali non poteva cambiare questa configurazione esterna.
- Le due CTA hosted usavano già `{{ .ConfirmationURL }}`: il nuovo template conserva la stessa variabile, senza introdurre endpoint o ricostruire token.

## Installazione manuale: solo Confirm signup

Nel Dashboard del progetto usato dal frontend aprire:

**Authentication → Emails (Email Templates) → Confirm sign up**

URL verificato: https://supabase.com/dashboard/project/rfozwxtnmttuugvyhakb/auth/templates/confirm-sign-up

1. Conservare una copia del Subject e del Body correnti.
2. Nel campo **Subject**, incollare il contenuto completo di `docs/supabase/confirm-signup-email-subject.txt`:

   ```gotemplate
   {{ if eq .Data.language "en" }}Confirm your Retro-Gamers.it account{{ else }}Conferma il tuo account Retro-Gamers.it{{ end }}
   ```

3. In **Body → Source**, sostituire tutto il contenuto con `docs/supabase/confirm-signup-email-template.html`.
4. Verificare la preview del provider e salvare **Save changes**. Non cambiare altri template, SMTP, Site URL, Redirect URLs, scadenza OTP o conferma obbligatoria.

Il subject supporta template Go: il Dashboard indica che i placeholder valgono per subject e body; il sorgente ufficiale Supabase Auth compila il subject con `template.New("Subject").Parse` e lo esegue con gli stessi dati del body. Non serve un workaround o un secondo flusso.

Non è presente un meccanismo versionato/configurato di aggiornamento hosted nel progetto: nessuno script Management API, nessun `SUPABASE_ACCESS_TOKEN` nelle configurazioni esaminate, nessuna CLI Supabase nel PATH. La service-role key non è un token Management. `supabase/config.toml` descrive il solo ambiente locale (`enable_confirmations = false`): **non applicarlo al progetto hosted**.

Il deploy del frontend da solo NON installa il template; viceversa, il ramo EN richiede che il codice signup con il nuovo metadata sia quello in esecuzione. Nessun deploy è stato effettuato in questo task.

## Link e logo

`{{ .ConfirmationURL }}` compare tre volte: href CTA, href fallback e testo URL fallback. Redirect esistente invariato: `${siteUrl}/account/confirmed/`. Nessun TokenHash/RedirectTo custom, nessuna modifica alla sicurezza Auth. Non esiste un plain-text separato nei file locali; nessuna parte alternativa rimossa.

Logo: **https://www.retro-gamers.it/icon-192.png**. PNG approvato, HTTP 200 `image/png`, dimensione nativa 192×192, resa 48×48. Alt e nome brand testuale restano visibili anche se il client blocca immagini esterne. Nessun asset creato o convertito.

## Design e limiti client

Tabelle email-safe, max-width 640 px, wrapper condizionale MSO, proprietà critiche inline. Canvas Ivory `#F7F1E5`, testo Navy `#092547`, CTA Gold `#E8BA46` con testo Navy. Dark: fondo Navy, testo Ivory, link Gold, divider sobri. Nessuna card bianca esterna, cyan, CSS variable, grid/flex o JavaScript.

Meta `color-scheme`, `supported-color-schemes` e media query `prefers-color-scheme:dark`; colori inline coerenti in assenza di CSS head. La preview browser verifica il CSS standard, NON certifica tutte le inversioni proprietarie di Gmail/Outlook/Apple Mail. La verifica definitiva in quei client richiede un test manuale di ricezione dopo installazione: nessuna email reale inviata automaticamente.

## Verifiche senza invio

- `node --test tests/auth-signup-language.test.mjs`: cinque casi sul vero handler con tutti i side effect sostituiti da mock (IT, EN, assente, lingua non supportata, tipo non valido). Metadata, redirect e dati profilo verificati.
- `node tests/helpers/confirm-signup-preview.mjs`: fixture IT/EN/fallback con URL `example.invalid` e token `PREVIEW_ONLY`; subject corretto, un H1 e una CTA, nessun doppio blocco, tre placeholder URL nel sorgente.
- Il generatore fixture espande solo la condizione letterale usata dal template: **non è un motore Go e non sostituisce il rendering hosted**. Nessuna nuova dipendenza.
- Browser reale: IT/EN × light/dark × 640/390 px, otto casi. Logo caricato, colori attesi, CTA e fallback URL coerenti, nessun overflow.
- `npm run build`: PASS; `git diff --check`: PASS; suite esistente con nuovi test: **61 PASS**. Resta il warning bundle oltre 500 kB, estraneo alla modifica.
- Nessun utente creato, nessuna chiamata live signup/resend, nessuna email reale, nessuna modifica admin mail, nessun commit/push/deploy.

Preview e screenshot: `/tmp/rg-confirm-signup/`; evidenze DOM in `browser-checks.json`. HTML fixture in `/tmp/rg-confirm-signup/preview/`. Copia del vecchio Body letto dal Dashboard in `/tmp/rg-confirm-signup/hosted-before.html`.

## Fonti ufficiali

- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/troubleshooting/customizing-emails-by-language-KZ_38Q
- https://github.com/supabase/auth/blob/master/internal/mailer/templatemailer/template.go
