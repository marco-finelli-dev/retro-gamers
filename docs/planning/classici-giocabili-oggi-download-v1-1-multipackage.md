# Classici giocabili oggi: download V1.1 multi-package

Documento tecnico per estendere i download autenticati della sezione
“Classici giocabili oggi” da singolo pacchetto a piu pacchetti per scheda.

## Perche servono piu pacchetti

Alcuni giochi possono avere materiali legalmente distribuibili diversi tra loro:

- versione DOS;
- versione DOS alternativa;
- versione Amiga;
- disk images Amiga;
- manuali, box, sticker, label o altri extra.

Un solo `storagePath` non basta a descrivere questi casi senza confondere
piattaforme, checksum, dimensioni e note legali/pratiche.

## Struttura Sanity

Lo schema `playableClassic` mantiene i campi legacy singoli:

- `packageName`
- `packageVersion`
- `packageSize`
- `checksumSha256`
- `storageProvider`
- `storagePath`

La V1.1 aggiunge `downloadPackages`, un array opzionale di oggetti con:

- `packageId`: identificativo stabile usato dall’endpoint;
- `title`: titolo del pacchetto;
- `platform`: riferimento opzionale a `platform`;
- `packageType`: `game`, `diskImages`, `documentation`, `patch`,
  `emulatorConfig`, `extras`, `other`;
- `language`;
- `packageVersion`;
- `packageSize`;
- `checksumSha256`;
- `storageProvider`;
- `storagePath`: percorso privato nello storage, mai esposto nel frontend;
- `isActive`;
- `requiresLogin`;
- `notes`.

Nelle query pubbliche del frontend sono proiettati solo i metadata mostrabili.
`storagePath` e `storageProvider` restano fuori dalla projection pubblica.

## Endpoint nuovo

La V1.1 aggiunge:

```text
/api/playable-classics/[slug]/download/[packageId]
```

Il flusso e:

```text
utente loggato
  -> click su un pacchetto
  -> endpoint con slug e packageId
  -> verifica sessione
  -> lettura server-side Sanity con storagePath privato
  -> controlli scheda e pacchetto
  -> signed URL Supabase Storage privata
  -> log download con package_id e package_title
  -> JSON con URL temporaneo e metadata pubblici
```

La risposta non espone mai `storagePath`.

## Compatibilita legacy

Il vecchio endpoint resta disponibile:

```text
/api/playable-classics/[slug]/download
```

Comportamento scelto:

- se i campi legacy includono `storagePath`, usa il modello singolo esistente;
- se non c’e legacy ma esiste un solo `downloadPackages` attivo, usa quel
  pacchetto;
- se ci sono piu pacchetti attivi e nessun legacy, restituisce errore e chiede
  di selezionare un pacchetto tramite endpoint con `packageId`.

Questo evita di rompere il test V1 gia riuscito e spinge le nuove schede
multi-file verso l’endpoint esplicito.

## SQL log aggiuntivo

Applicare manualmente:

```text
docs/supabase/playable-classics-downloads-v1-1.sql
```

La migrazione documentale aggiunge:

- `package_id text`
- `package_title text`

I log esistenti restano validi. Se le colonne non sono ancora applicate, il
download non viene bloccato e il server tenta un log fallback compatibile con
la V1.

## Esempio Nippon Safes Inc.

Possibili `packageId`:

- `dos-freeware`
- `dos-alt-freeware`
- `amiga-freeware`
- `amiga-disk-images`
- `manuals-materials`

Ogni pacchetto deve avere stato legale coerente con la scheda e uno
`storagePath` privato solo dopo verifica editoriale e legale.

## Checklist test dummy

Prima di caricare file reali:

- applicare SQL V1 e V1.1;
- verificare bucket privato `playable-classics`;
- non aggiungere policy pubbliche su `storage.objects`;
- compilare `downloadPackages` in Sanity;
- mantenere `downloadable == true` solo per schede verificate;
- mantenere `distributionType == "internalDownload"`;
- caricare un file dummy nello storage privato;
- valorizzare `storagePath` del pacchetto dummy;
- testare anonimo:

```bash
curl -i http://localhost:4321/api/playable-classics/nippon-safes-inc/download/dos-freeware
```

Risultato atteso:

```text
401 Unauthorized
```

- testare utente loggato da browser;
- verificare apertura signed URL temporanea;
- verificare inserimento log con `package_id` e `package_title`;
- rimuovere file dummy prima di usare pacchetti reali.

## Limiti attuali

- Nessun rate limit specifico per singolo pacchetto.
- Nessuna UI account con storico download.
- Nessuna UI admin per leggere i log.
- Nessun controllo antivirus automatico sui pacchetti.
- Nessuna gestione di pacchetti pubblici senza login: anche se un pacchetto ha
  `requiresLogin == false`, l’endpoint V1.1 richiede comunque autenticazione.
