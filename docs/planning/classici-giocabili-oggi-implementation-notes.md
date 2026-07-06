# Classici giocabili oggi: note implementative V1

Queste note riepilogano la prima preparazione tecnica per la futura sezione
“Classici giocabili oggi”.

La sezione resta pensata come area editoriale e download legale interna a
Retro-Gamers.it. Non deve diventare una raccolta generica di link esterni e non
deve ospitare materiale commercialmente protetto o legalmente ambiguo.

## Cosa è stato aggiunto

### Frontend Astro

- Pagina policy italiana:
  `/classici-giocabili-oggi/policy/`
- Pagina policy inglese:
  `/en/playable-classics/policy/`

Le pagine usano il layout statico/legale già presente nel sito e chiariscono:

- cosa sono i “Classici giocabili oggi”;
- cosa può essere ospitato o segnalato;
- cosa non sarà ospitato;
- differenza tra freeware, open source, homebrew, demo, shareware e abandonware;
- download futuri riservati agli utenti registrati;
- principio di ammissione: se non possiamo spiegare chiaramente perché un file è
  distribuibile, non lo ospitiamo;
- possibilità di richiesta rimozione da parte dei titolari dei diritti.

### Sanity CMS

È stato aggiunto il document type:

- `playableClassic`

Titolo Sanity:

- `Classici giocabili oggi`

Lo schema prepara schede future con campi editoriali, dati storici, stato legale,
tipo distribuzione, metadata download, istruzioni pratiche e relazioni con
articoli, piattaforme, aziende e creator.

## Cosa manca

Questa milestone non implementa ancora:

- indice pubblico della sezione;
- pagine scheda pubbliche;
- query GROQ frontend per `playableClassic`;
- Supabase Storage;
- endpoint download;
- signed URL temporanei;
- tracking download;
- area account con download recenti;
- caricamento o distribuzione di file reali.

## Perché i file non sono nel repo

I file scaricabili non devono essere inseriti nel repository Git e non devono
stare in `public/`.

Motivi:

- evitare URL pubblici permanenti;
- mantenere controllo sugli accessi;
- poter revocare o sostituire file senza deploy;
- evitare di mescolare codice sorgente e pacchetti distribuiti;
- preparare download riservati agli utenti registrati.

La destinazione prevista per i file è uno storage privato separato, come Supabase
Storage privato.

## Perché i download reali arrivano dopo

Prima dei download reali serve una base tecnica e legale più solida:

- policy pubblica già disponibile;
- schede Sanity con stato legale chiaro;
- verifica fonte/licenza/autorizzazione;
- storage privato;
- endpoint server-side che controlla la sessione utente;
- signed URL temporanei;
- log download minimale;
- procedura di rimozione o sospensione dei file.

Senza questi passaggi, un download interno rischierebbe di essere troppo esposto
o non abbastanza documentato.

## Milestone successive consigliate

1. Query e pagine pubbliche V1
   Creare indice e scheda dettaglio per `playableClassic`, mostrando solo contenuti
   pubblicati e campi legali essenziali.

2. Schede pilota senza download interno
   Pubblicare alcune schede come guide o riferimenti ufficiali, senza file ospitati,
   per testare tono editoriale, campi legali e relazioni.

3. Supabase Storage privato
   Definire bucket privato, naming dei pacchetti, policy storage e convenzioni per
   `storagePath`.

4. Endpoint download autenticato
   Creare un endpoint server-side che verifica l’utente, controlla la scheda e genera
   signed URL temporanei.

5. Tracking leggero
   Salvare un log minimo dei download per sicurezza, manutenzione e analisi tecnica,
   senza esporre dati privati nelle pagine pubbliche.

6. Account retention
   Mostrare nell’account eventuali download recenti, guide salvate o suggerimenti
   collegati agli interessi dell’utente.

## Regola operativa

Ogni scheda deve avere uno stato legale chiaro prima della pubblicazione. Ogni
download interno deve richiedere login e deve passare da storage privato e URL
temporanei.
