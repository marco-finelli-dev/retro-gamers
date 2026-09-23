# Social login OAuth

Questa nota documenta la configurazione richiesta per usare il login social
Retro-Gamers.it con Supabase Auth.

Provider implementati nel frontend:

- Google
- Apple

Provider pronto nel codice ma nascosto lato UI pubblica:

- Facebook

## URL applicazione

Impostare `PUBLIC_SITE_URL` sull'URL pubblico canonico:

```text
https://www.retro-gamers.it
```

L'origine OAuth è scelta separatamente dall'URL canonico:

- localhost/loopback: origine della richiesta, con la sua porta;
- Vercel `VERCEL_ENV=preview`: origine della richiesta, anche per gli alias del branch;
- produzione o altro hosting: origine di `PUBLIC_SITE_URL` / `SITE`.

Non cambiare il Site URL hosted di produzione. In locale la callback resta su:

```text
http://localhost:4321
```

## Redirect URL Supabase

In Supabase Dashboard, aprire:

```text
Authentication -> URL Configuration
```

Aggiungere tra gli Additional Redirect URLs:

```text
https://www.retro-gamers.it/api/auth/oauth/callback
http://localhost:4321/api/auth/oauth/callback
```

Il progetto non dispone di uno script per applicare questa allowlist hosted;
`supabase/config.toml` configura lo stack locale. La modifica hosted resta manuale.

Per una Preview, autorizzare la sua origine e il path callback. Il parametro
`redirectTo` include anche `returnTo` e `provider`: per esempio dalla Home IT:

```text
https://DOMINIO-PREVIEW.vercel.app/api/auth/oauth/callback?returnTo=%2F&provider=google
```

Per consentire i diversi percorsi post-login senza autorizzare altri domini o
path, aggiungere il pattern seguente (il `\?` indica il punto interrogativo
letterale; `**` copre la query variabile):

```text
https://DOMINIO-PREVIEW.vercel.app/api/auth/oauth/callback\?**
http://localhost:4321/api/auth/oauth/callback\?**
```

Usare l'hostname del nuovo deployment quando cambia. Non autorizzare
indistintamente tutti i domini `vercel.app`. Vedi la
[sintassi wildcard Supabase](https://supabase.com/docs/guides/auth/redirect-urls#use-wildcards-in-redirect-urls).
Se un redirect locale/Preview non è autorizzato, Supabase può usare il Site URL:
questo non dimostra che il frontend abbia costruito un callback production.

## Google OAuth

In Google Cloud Console:

1. Creare o selezionare un progetto.
2. Configurare OAuth consent screen.
3. Creare credenziali OAuth Client ID di tipo Web application.
4. Aggiungere Authorized redirect URI Supabase:

```text
https://PROJECT-REF.supabase.co/auth/v1/callback
```

5. Copiare Client ID e Client Secret.

In Supabase Dashboard:

```text
Authentication -> Providers -> Google
```

Abilitare Google e inserire Client ID e Client Secret.

## Facebook Login

In Meta for Developers:

1. Creare o selezionare una app.
2. Aggiungere il prodotto Facebook Login.
3. Configurare OAuth redirect URI Supabase:

```text
https://PROJECT-REF.supabase.co/auth/v1/callback
```

4. Copiare App ID e App Secret.

In Supabase Dashboard:

```text
Authentication -> Providers -> Facebook
```

Abilitare Facebook e inserire App ID e App Secret.

## Flusso frontend

Il sito usa:

```text
/api/auth/oauth/start?provider=google
/api/auth/oauth/start?provider=apple
/api/auth/oauth/start?provider=facebook
```

La callback è:

```text
/api/auth/oauth/callback
```

La callback:

- scambia il codice OAuth con Supabase;
- imposta i cookie sessione già usati dal sito;
- crea il profilo in `profiles` solo se non esiste;
- crea il messaggio interno di benvenuto solo alla prima creazione profilo;
- invia la notifica admin nuova registrazione solo alla prima creazione profilo.

## Apple Login

Apple richiede configurazione manuale in Apple Developer e Supabase Dashboard.
Seguire la guida dedicata:

```text
docs/supabase/apple-login-setup.md
```
