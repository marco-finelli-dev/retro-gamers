# Classici giocabili oggi: download V1

Documento tecnico per attivare i download interni autenticati della sezione
“Classici giocabili oggi”.

## Cosa fa la V1

La V1 usa un endpoint server-side Astro per generare una signed URL temporanea
da Supabase Storage privato.

Il flusso è:

```text
utente loggato
  -> bottone download nella scheda playableClassic
  -> /api/playable-classics/[slug]/download
  -> verifica sessione account
  -> lettura server-side Sanity
  -> controlli isPublished/downloadable/distributionType/requiresLogin/storagePath
  -> signed URL Supabase Storage privata
  -> log download non bloccante
  -> JSON con URL temporaneo e metadata pacchetto
```

La risposta non espone mai `storagePath` e non fa redirect automatici verso file
pubblici.

## Env necessaria

Il progetto usa già:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Per i download serve anche:

```text
SUPABASE_PLAYABLE_CLASSICS_BUCKET=playable-classics
```

Se questa variabile non è presente, l’endpoint risponde con `503`.

## Bucket Supabase richiesto

Nome previsto:

```text
playable-classics
```

Il bucket deve essere privato:

```text
public = false
```

Non aggiungere policy pubbliche di lettura su `storage.objects` per questo
bucket. Le URL devono essere generate solo server-side, dopo verifica utente e
scheda Sanity.

## SQL da applicare

Prima di attivare i download reali va applicato:

```text
docs/supabase/playable-classics-downloads.sql
```

La tabella preparata è:

```text
public.playable_classic_download_logs
```

Il log è scritto dal server con service role dopo la generazione della signed
URL. Se il log fallisce, il download non viene bloccato, ma il server scrive un
warning.

## Controlli Sanity obbligatori

Una scheda può mostrare il bottone download solo se:

- `isPublished == true`
- `downloadable == true`
- `distributionType == "internalDownload"`

L’endpoint controlla anche:

- `requiresLogin == true`
- `storagePath` presente

`storagePath` resta solo nella query server-side dell’endpoint. Non va aggiunto
alle query pubbliche o al rendering frontend.

## Risposta endpoint

Successo:

```json
{
  "ok": true,
  "url": "https://...",
  "expiresIn": 120,
  "packageName": "Nippon Safes Inc.",
  "packageVersion": "1.0",
  "packageSize": "4.2 MB",
  "checksumSha256": "..."
}
```

Errori previsti:

- `401` se l’utente non è loggato;
- `404` se la scheda non esiste o non è pubblicata;
- `403` se la scheda non è scaricabile o non è configurata correttamente;
- `503` se bucket/env/storage non sono pronti.

## Test manuale

Utente anonimo:

```bash
curl -i http://localhost:4321/api/playable-classics/nippon-safes-inc/download
```

Risultato atteso:

```text
401 Unauthorized
```

Utente loggato, scheda non pubblicata:

```text
404
```

Utente loggato, scheda pubblicata ma non scaricabile:

```text
403
```

Utente loggato, scheda scaricabile ma bucket/env non pronti:

```text
503
```

Utente loggato, scheda scaricabile e storage pronto:

```text
200 con signed URL temporanea
```

## Checklist prima di caricare file reali

- Policy pubblica già online e coerente.
- Scheda Sanity con stato legale chiaro.
- Autorizzazione, licenza o fonte verificata.
- `downloadable` attivato solo dopo verifica.
- `distributionType` impostato a `internalDownload`.
- `requiresLogin` impostato a `true`.
- `storagePath` valorizzato solo con percorso privato.
- Bucket `playable-classics` privato.
- SQL download log applicato.
- File caricato nello storage, non nel repo e non in `public/`.
- Checksum SHA-256 calcolato e salvato in Sanity.
- Test download con utente loggato.
- Test anonimo confermato a `401`.

## Limiti attuali

- Nessun rate limit specifico per download.
- Nessuna pagina account con storico download.
- Nessuna UI admin per leggere i log.
- Nessun controllo antivirus automatico sui pacchetti.
- Nessun supporto multi-file per singola scheda.
