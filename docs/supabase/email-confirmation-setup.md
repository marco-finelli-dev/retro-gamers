# Email confirmation setup

Questa nota documenta il flusso di conferma email usato dagli account
Retro-Gamers.it con Supabase Auth.

## SMTP

Supabase Auth deve usare il custom SMTP configurato con Resend.
Questo evita i rate limit del mailer predefinito Supabase e mantiene le email
operative sotto il controllo del dominio del sito.

Configurazione da verificare in Supabase Dashboard:

```text
Authentication -> Settings -> SMTP Settings
```

Non salvare chiavi SMTP, API key Resend o secret nel repository.

## URL principali

Site URL attuale:

```text
https://www.retro-gamers.it
```

Redirect URL OAuth usato dal sito:

```text
https://www.retro-gamers.it/api/auth/oauth/callback
```

Pagina preparata per la conferma email:

```text
https://www.retro-gamers.it/account/confirmed/
```

Il vecchio path locale `/account/conferma/` rimanda alla nuova pagina per
compatibilità con eventuali link già generati.

## Conferma email Supabase

Il link standard inviato da Supabase parte dal dominio del progetto:

```text
https://PROJECT-REF.supabase.co/auth/v1/verify?token=...
```

Dopo la verifica, Supabase può rimandare alla Site URL o al redirect indicato
nel flusso di signup, se consentito dalla configurazione URL del progetto.

Nel codice frontend la registrazione email/password passa come destinazione:

```text
/account/confirmed/
```

## Template Confirm signup

Il Body HTML pronto da copiare in Supabase è in:

```text
docs/supabase/confirm-signup-email-template.html
```

In Supabase Dashboard:

```text
Authentication -> Emails -> Confirm signup -> Body
```

Subject consigliato:

```text
Conferma il tuo account Retro-Gamers.it / Confirm your account
```

Il template non usa immagini e mantiene il placeholder Supabase:

```text
{{ .ConfirmationURL }}
```

## Redirect consigliato

In futuro, se il template email o la configurazione Supabase lo supportano in
modo affidabile, configurare la conferma email verso:

```text
https://www.retro-gamers.it/account/confirmed/
```

In Supabase Dashboard verificare:

```text
Authentication -> URL Configuration
```

Additional Redirect URLs consigliati:

```text
https://www.retro-gamers.it/account/confirmed/
http://localhost:4321/account/confirmed/
```

Il comportamento minimo accettabile resta:

1. l'utente crea l'account;
2. Supabase invia la mail di conferma;
3. il link Supabase conferma l'indirizzo;
4. Supabase rimanda alla Site URL;
5. l'utente accede manualmente da `/account/login/`.

## Reinvio conferma

Il sito espone:

```text
POST /api/auth/resend-confirmation
```

L'endpoint usa:

```text
supabase.auth.resend({ type: 'signup', email })
```

La risposta pubblica è sempre generica per email formalmente valide, così non
permette di scoprire se un account esiste:

```text
Se l'indirizzo è valido, riceverai una nuova email di conferma.
```

Gli errori SMTP, rate limit o Supabase vengono loggati solo lato server.
