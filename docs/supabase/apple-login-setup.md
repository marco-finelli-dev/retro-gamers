# Apple Login setup

Questa nota prepara la configurazione manuale di Sign in with Apple per
Retro-Gamers.it tramite Supabase Auth.

Non salvare nel repository file `.p8`, chiavi private, client secret o valori
sensibili. Le credenziali Apple devono restare in Apple Developer e Supabase
Dashboard.

## Stato nel codice

Il frontend espone il provider OAuth `apple` usando lo stesso flusso già usato
per Google:

```text
/api/auth/oauth/start?provider=apple
/api/auth/oauth/callback
```

La callback resta quella condivisa: scambia il codice con Supabase, imposta i
cookie sessione del sito, crea il profilo in `profiles` solo se manca e invia i
messaggi interni o le notifiche admin solo alla prima creazione del profilo.

## Apple Developer

1. Accedere ad Apple Developer.
2. Creare o usare un App ID principale per Retro-Gamers.it.
3. Abilitare `Sign in with Apple` sull'App ID.
4. Creare un Services ID per il login web.
5. Usare un identifier coerente, per esempio `it.retrogamers.login` oppure
   `com.retro-gamers.login`. Sono solo suggerimenti, non valori hardcoded nel
   sito.
6. Nella configurazione Web Authentication impostare:
   - Domain/Subdomain: `www.retro-gamers.it`
   - eventualmente anche `retro-gamers.it`, se Apple lo richiede per la
     configurazione del dominio principale
   - Return URL: usare il Callback URL mostrato da Supabase nel provider Apple
7. Creare una Sign in with Apple private key.
8. Scaricare il file `.p8` e conservarlo in modo sicuro fuori dal repository.
9. Annotare:
   - Services ID, usato come Client ID
   - Team ID
   - Key ID
   - private key `.p8`

## Supabase Dashboard

1. Aprire Supabase Dashboard.
2. Andare in `Authentication -> Providers -> Apple`.
3. Abilitare `Sign in with Apple`.
4. Inserire `Client ID` uguale al Services ID Apple.
5. Inserire la configurazione richiesta da Supabase usando:
   - Team ID
   - Key ID
   - private key `.p8`
   - Client ID / Services ID
6. Copiare il Callback URL mostrato da Supabase per Apple.
7. Verificare che il Callback URL Supabase sia identico al Return URL
   configurato in Apple Developer.
8. Salvare.

## Redirect URL

Usare sempre il Callback URL fornito da Supabase per il provider Apple. Non
inventare URL diversi se Supabase mostra già quello corretto. Di solito è un URL
del progetto Supabase, per esempio:

```text
https://PROJECT-REF.supabase.co/auth/v1/callback
```

Dominio pubblico del sito:

```text
https://www.retro-gamers.it
```

Nel progetto il ritorno finale al sito passa dalla callback condivisa:

```text
https://www.retro-gamers.it/api/auth/oauth/callback
```

## Test

Dopo aver completato la configurazione Apple e Supabase, verificare:

1. Aprire `/account/login/`.
2. Cliccare `Continua con Apple`.
3. Completare il primo accesso Apple.
4. Verificare il ritorno al sito.
5. Verificare la creazione del profilo in `/account/`.
6. Controllare nome, email e immagine profilo se Apple li fornisce.
7. Testare il caso in cui Apple nasconde l'email usando il relay privato.
8. Eseguire logout e login successivo.
9. Chiudere e riaprire il browser per verificare la persistenza sessione.
10. Controllare `/account/`.
11. Controllare `/account/messages/`.
12. Controllare i commenti sotto un articolo.

## Privacy e Cookie Policy

Dopo l'attivazione pubblica di Apple Login, verificare Privacy Policy e Cookie
Policy per citare Apple come provider di autenticazione, se non già citato.
