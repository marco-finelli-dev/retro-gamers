# Classici giocabili oggi: download V0

Documento tecnico per la base futura dei download interni autenticati della
sezione “Classici giocabili oggi”.

## Cosa è stato preparato

### SQL Supabase

Il file `docs/supabase/playable-classics-downloads.sql` prepara una tabella
minimale:

- `playable_classic_download_logs`

Campi principali:

- `user_id`, collegato a `auth.users`;
- `playable_classic_id`, id documento Sanity;
- `slug`;
- `package_name`;
- `package_version`;
- `storage_path`;
- `downloaded_at`;
- `user_agent`;
- `ip_hash`, opzionale e pensato solo come hash, non come IP in chiaro.

La tabella è pensata per scritture server-side con service role. Gli utenti
autenticati possono leggere solo i propri log, se questa vista verrà usata in
futuro nell’account.

### Helper server-side

Il file `src/lib/supabase/playable-classics-downloads.ts` prepara:

- verifica sessione utente tramite i cookie auth già usati dal sito;
- lettura server-side da Sanity della scheda `playableClassic`;
- controllo dei campi necessari:
  - `isPublished == true`;
  - `downloadable == true`;
  - `distributionType == "internalDownload"`;
  - `requiresLogin == true`;
  - `storagePath` presente.

La query server-side può leggere `storagePath`, ma questo campo non viene
incluso nelle query pubbliche e non viene restituito dall’endpoint.

### Endpoint API V0

Il file `src/pages/api/playable-classics/[slug]/download.ts` espone un endpoint
GET preparatorio:

```text
/api/playable-classics/[slug]/download
```

Risposte previste:

- `401` se l’utente non è autenticato;
- `404` se la scheda non esiste o non è pubblicata;
- `403` se la scheda non è scaricabile, non è `internalDownload`, non richiede
  login o non ha `storagePath`;
- `503` se tutti i controlli teorici passano ma lo storage non è ancora
  configurato.

In V0 l’endpoint non restituisce mai URL firmati, non fa redirect e non espone
percorsi di storage.

## Cosa manca prima dei download reali

- Creare manualmente un bucket Supabase Storage privato, per esempio
  `playable-classics`.
- Definire naming e struttura dei pacchetti nello storage.
- Caricare solo file legalmente verificati e approvati.
- Attivare una funzione server-side per generare signed URL temporanei.
- Registrare il download nella tabella log solo quando la signed URL viene
  generata con successo.
- Definire eventuale policy di rate limit o anti-abuso.
- Aggiornare la pagina dettaglio con CTA reale solo quando il flusso è completo.

## Env vars previste

Il progetto usa già:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Per la fase download futura è prevista:

- `SUPABASE_PLAYABLE_CLASSICS_BUCKET`

Valore consigliato:

```text
playable-classics
```

Questa variabile non attiva da sola i download. La V0 resta bloccata in modo
prudente.

## Flusso futuro

```text
utente loggato
  -> endpoint /api/playable-classics/[slug]/download
  -> verifica sessione account
  -> lettura server-side Sanity
  -> controlli legal/download/storagePath
  -> signed URL temporanea Supabase Storage
  -> insert log download
  -> risposta JSON con URL temporaneo
```

## Perché la V0 fallisce in modo sicuro

La V0 serve a preparare il perimetro tecnico senza rendere scaricabile nulla.
Per questo, anche quando una scheda fosse configurata correttamente, l’endpoint
si ferma con:

```json
{
  "ok": false,
  "code": "service_unavailable",
  "message": "Download storage is not configured yet."
}
```

Questo impedisce attivazioni accidentali prima che storage, policy, contenuti e
log siano stati verificati.
