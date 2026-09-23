# Sondaggio Home: attivazione pre-live

## Unico passaggio manuale

Nello **Studio Sanity esistente**, creare e pubblicare le due versioni IT/EN di un Community Survey usando i valori nel file `home-amiga-platformer-2026.ndjson` accanto a questo documento. Il file è la specifica dei campi, non uno script da eseguire automaticamente. Non sostituire o importare sopra documenti esistenti.

- Chiave logica comune: `home-amiga-platformer-2026`.
- ID documenti previsti: `community-survey.home-amiga-platformer-2026.it` e `.en`. La UI funziona anche con ID assegnati dallo Studio: riceve quello reale dall'API.
- Slug in entrambe le lingue: `home-amiga-platformer-2026`.
- Stato in entrambe: `open`; nessuna pianificazione necessaria. Timestamp di creazione/aggiornamento assegnati dallo Studio.
- Collegare la traduzione EN alla versione IT tramite la relazione già esistente.
- Una sola domanda, tipo `single`, `questionId: next-review`.
- IT: **Quale platform Amiga vorresti vedere recensito?**
- EN: **Which Amiga platformer would you like to see reviewed?**
- Opzioni, nello stesso ordine e con gli stessi ID nelle due versioni:
  - `chuck-rock-ii`: Chuck Rock II
  - `superfrog`: Superfrog
  - `kid-chaos`: Kid Chaos
  - `fire-and-ice`: Fire & Ice

Non cambiare chiave/questionId/optionId dopo la raccolta delle risposte. Per chiudere il sondaggio, impostare `closed` in entrambe le versioni (o lo stesso `closesAt`). Non occorrono tabelle, migrazioni SQL, nuovi endpoint, dipendenze o modifiche allo schema Sanity.

La verifica locale dell'API collegata ai dati reali ha restituito `404 survey_not_found`: **il sondaggio non è stato creato/pubblicato durante questo task**. Finché manca, il widget si nasconde. Il codice non usa la specifica NDJSON come fonte dati di produzione.

## Integrazione

- GET `/api/community/surveys/home-amiga-platformer-2026?language=it|en`: stesso endpoint esistente, ora include aggregati pubblici soltanto per questa chiave, dopo partecipazione o chiusura.
- POST `/api/community/surveys/home-amiga-platformer-2026/responses`: endpoint, validazione, persistenza e notifica admin esistenti, invariati.
- Storage: `community_survey_responses` e `community_survey_answers`; nessuna tabella nuova.
- Identità: cookie casuale HttpOnly `rg_survey_guest`, SHA-256 server-side, vincolo unico `(survey_key, respondent_token_hash)`. Identico per guest e autenticati; non è un limite per account/IP. Cancellare il cookie o cambiare browser permette una nuova identità, come nel motore esistente.
- IT/EN condividono chiave e cookie. L'interfaccia non memorizza voti in localStorage e non inventa la scelta precedente.
- Risultati pubblici: percentuali intere con metodo dei resti maggiori, ordine editoriale, totale partecipanti. Nessun conteggio assoluto per opzione, risposta aperta, ID o hash del votante nel nuovo DTO.
- Conteggi pubblici tramite COUNT esatti, senza il limite di paginazione delle righe Supabase.
- Admin esistente: `/admin/surveys/home-amiga-platformer-2026/`, risultati, lingue, CSV/XLSX e conteggi esistenti. La navigazione nella pagina risultati elenca le chiavi disponibili, senza duplicare IT/EN. Stato editoriale gestito nello Studio già esistente.
- Il selettore automatico del Community Survey generale esclude questa chiave, così la CTA «Partecipa al sondaggio» continua a puntare al sondaggio generale.

## Verifica isolata

`node --test tests/community-surveys.test.mjs tests/guest-comments.test.mjs`

I test eseguono gli handler e il motore reali sostituendo esclusivamente Sanity, Supabase e notifiche con adattatori in memoria, senza credenziali né chiamate esterne. Verificano validazione, duplicati/invio simultaneo, cookie, IT→EN, errori, chiuso/programmazione/non pubblicato, conteggi/arrotondamenti, risultati/export admin e regressione single/multiple.

Per la verifica visiva: con il dev server locale sulla porta 4321, eseguire `node tests/helpers/home-survey-preview.mjs`, poi aprire `http://127.0.0.1:4327/`. Il proxy usa la Home reale e gli stessi handler, intercetta il sondaggio e blocca ogni altra scrittura. Il file temporaneo `/tmp/rg-home-poll/scenario.json` può configurare reset, fail, closed, missing, delay e counts. Questo server non viene importato nel frontend né distribuito.

Non sono stati inviati voti, email o modifiche a dati reali. Il collaudo su storage reale e sui documenti pubblicati sarà possibile solo dopo l'attivazione manuale; non è dichiarato eseguito.

## File della modifica

Produzione:
- `src/components/home/Reviews.astro`: sostituzione del solo placeholder.
- `src/components/home/HomeSurvey.tsx`: UI reale e stati di voto.
- `src/styles/components/home-survey.css`: caricamento/errori/risultati, riuso delle classi Home approvate.
- `src/lib/home-survey.ts`: chiave unica e arrotondamenti.
- `src/lib/community-surveys.ts`: conteggi pubblici limitati alla chiave Home, lettura rigorosa dello stato, elenco admin, esclusione dalla CTA del survey generale.
- `src/pages/api/community/surveys/[surveyKey].ts`: estensione del GET esistente; POST di voto invariato.
- `src/pages/admin/surveys/[surveyKey].astro`: navigazione fra sondaggi nella stessa area risultati.

Verifica/documentazione:
- `tests/community-surveys.test.mjs` (8 casi), `tests/helpers/survey-backend.mjs`, `tests/helpers/survey-harness.mjs`, `tests/helpers/home-survey-preview.mjs`.
- Questa guida e la specifica `home-amiga-platformer-2026.ndjson`.

Esito: 21 test superati includendo i 13 test guest preesistenti; build e `git diff --check` superati. Nel browser: stato iniziale, tutte le opzioni, frecce tastiera/focus, selezione singola, loading, voto, doppio click con un solo partecipante, IT→EN già votato, errore API e recupero preservando la selezione, chiuso/zero e widget assente se non disponibile. Controllati 390/430/768/1280/1512, IT/EN light/dark, senza overflow. Browser in sessione guest della fixture; comportamento autenticato verificato nell'adattatore isolato (le API reali ignorano deliberatamente la sessione account). Nessun test di voto su sessione autenticata reale o DB di produzione.
