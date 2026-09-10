# Retro-Gamers.it — Design Constitution

Queste regole definiscono il linguaggio visivo di Retro-Gamers.it.

Valgono per homepage, articoli, archivi, piattaforme, community, account, aree editoriali e nuove funzionalità.

Una nuova sezione può avere una composizione diversa dalle altre, ma non può inventare autonomamente colori, tipografia, spacing, radius, hover o comportamenti.

Principio fondamentale:

> Coerenza senza uniformità.

Retro-Gamers deve essere riconoscibile senza diventare ripetitivo.

---

## 1. Identità

Retro-Gamers è un sito editoriale contemporaneo dedicato alla storia e alla cultura videoludica.

Il design può richiamare in modo astratto sistemi, console e interfacce storiche come Amiga, Nintendo, Sega, SNK e arcade, ma non deve imitarli letteralmente.

Sono ammessi richiami attraverso:

- proporzioni;
- smussi;
- curve;
- tab;
- notch;
- asimmetrie;
- geometrie;
- ritmo delle composizioni.

Non sono ammessi come linguaggio generale:

- estetica finto-retro;
- scanline decorative;
- pixel art gratuita;
- neon;
- glow;
- RGB gaming;
- glassmorphism;
- effetti futuristici;
- decorazioni senza funzione.

Il retro deve emergere dalla cultura visiva del progetto, non da cliché.

---

## 2. Branding

Il sistema del marchio è modulare.

### Wordmark

Il wordmark `RETRO GAMERS.IT` senza monogramma RG è la versione preferita nell'header.

Deve mantenere la propria costruzione cromatica e geometrica, compresi gli elementi Ivory/Navy che richiamano la saetta spezzata.

### Monogramma RG

Il monogramma è il simbolo compatto del brand.

Contesti naturali:

- favicon;
- app icon;
- avatar social;
- badge;
- award;
- piccoli elementi identificativi;
- spazi in cui il wordmark completo non è appropriato.

Non deve essere aggiunto automaticamente accanto al wordmark.

### Lockup completo

Monogramma + wordmark viene utilizzato quando serve presentare il marchio completo, per esempio in materiali istituzionali, social, comunicazione esterna o superfici con spazio sufficiente.

Non aggiungere ulteriori elementi decorativi al logo.

---

## 3. Tipografia

La famiglia ufficiale di Retro-Gamers.it è:

**IBM Plex Sans**

Non utilizzare font secondari "gaming", futuristici o nostalgici.

Non utilizzare Orbitron.

Pesi disponibili e autorizzati:

- 400 Regular
- 500 Medium
- 600 SemiBold
- 700 Bold

Non richiedere pesi superiori a 700.

La gerarchia deve derivare da:

- dimensione;
- peso;
- line-height;
- spazio;
- posizione.

Non dalla sostituzione del font.

La scala tipografica globale deve coprire soltanto livelli realmente necessari:

- metadata / kicker;
- utility small;
- body;
- compact title;
- content title;
- module title;
- section title;
- panel title;
- feature title;
- page H1.

I componenti devono utilizzare la scala condivisa.

Non introdurre nuove dimensioni locali senza una motivazione reale.

---

## 4. Palette RG

Palette ufficiale:

**Navy** `#092547`
Struttura, canvas, header, ancoraggio visivo, testo principale in light mode.

**Ivory** `#F7F1E5`
Superficie editoriale, testo principale in dark mode.

**Gold** `#E8BA46`
Rilievo editoriale, contenuti protagonisti, heritage, elementi di particolare importanza.

**Teal** `#005F8E`
Informazione, metadata, utility, navigazione secondaria.

**Green** `#36BA81`
Community, partecipazione, stato positivo, feedback o interazione personale.

**Coral** `#EA4E47`
Attualità, azione, attività, stato attivo e contenuti editorialmente "caldi".

### Regola cromatica

La palette non è una scatola di colori da utilizzare contemporaneamente.

In una composizione normale:

**Navy/Ivory + un accento principale**

sono spesso sufficienti.

Un colore deve essere scelto perché comunica qualcosa, non perché riempie uno spazio o "sta bene".

Evitare rainbow UI.

Non introdurre colori esterni alla palette senza una necessità documentata.

---

## 5. Layout

Il contenuto editoriale utilizza un sistema di container unico.

Riferimento desktop:

**1200 px**

Le sezioni devono condividere:

- stessa logica di max-width;
- stessi gutter;
- stessi breakpoint;
- stessa relazione con il foglio centrale.

Una sezione non può diventare accidentalmente più larga o più stretta delle altre.

Sono invece incoraggiate composizioni interne differenti:

- 50/50;
- 60/40;
- 65/35;
- colonne strette;
- feature dominante;
- griglie;
- liste;
- moduli laterali.

La varietà avviene dentro il container, non cambiando il container.

---

## 6. Spacing

Utilizzare esclusivamente la scala spacing condivisa.

Riferimento:

`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 80 / 96`

Non introdurre valori arbitrari come `27px`, `43px`, `71px` senza una ragione concreta.

La stessa scala deve governare:

- metadata → titolo;
- titolo → excerpt;
- media → testo;
- gap fra elementi;
- gap fra moduli;
- padding;
- distanza fra sezioni.

La homepage deve avere ritmo, non buchi casuali né densità casuale.

---

## 7. Immagini e aspect ratio

Il **4:3 è il formato editoriale nativo di Retro-Gamers.it**.

Non è un obbligo universale.

È il rapporto preferito quando non esiste una ragione migliore per utilizzarne un altro.

Sono ammessi:

- 16:9 per feature specifiche;
- portrait per box art, libri, fotografie o contenuti verticali;
- formati naturali quando il crop danneggerebbe l'immagine.

Mai deformare un'immagine per adattarla al layout.

Evitare crop aggressivi che eliminano:

- HUD;
- personaggi;
- elementi importanti della composizione;
- informazioni visive significative.

---

## 8. Geometria

Retro-Gamers non utilizza automaticamente quattro angoli identici su ogni immagine.

Sono previste geometrie canoniche e riutilizzabili.

Esempi concettuali:

**Neutral**
Radius moderato e uniforme.

**Leading**
Un angolo dominante più morbido, coerente con la direzione della composizione.

**Trailing**
Profilo speculare.

**Feature**
Asimmetria più evidente, riservata agli elementi editorialmente importanti.

Le variazioni geometriche devono seguire:

- ruolo;
- posizione;
- direzione;
- gerarchia.

Non devono essere casuali.

Evitare:

- clip-path gratuiti;
- tagli aggressivi a 45°;
- triangolini decorativi;
- segmenti appesi alle immagini;
- forme sci-fi;
- linee che sembrano scrollbar;
- combinazioni di radius inventate elemento per elemento.

La geometria deve emergere dalle masse, non dagli ornamenti.

---

## 9. Card e superfici

Una sezione editoriale non è automaticamente una card.

Una card viene utilizzata soltanto quando rappresenta realmente un oggetto autonomo.

Non racchiudere intere sezioni in grandi contenitori soltanto per distinguerle.

Preferire:

- whitespace;
- tipografia;
- immagini;
- composizione;
- divider;
- variazioni di densità.

### Regola assoluta

> Se un elemento non è una card a riposo, non deve diventare una card in hover.

Non far comparire in hover:

- background;
- border;
- shadow;
- pill;
- pannelli;
- superfici nuove.

---

## 10. Hover e focus

I titoli editoriali di Retro-Gamers **non vengono sottolineati**.

Niente underline in:

- rest;
- hover;
- focus;
- active.

Hover consentiti:

- lieve variazione cromatica;
- lieve variazione della luminosità dell'immagine;
- piccola variazione di un bordo già esistente.

Non utilizzare:

- lift;
- translateY;
- zoom evidente;
- shadow aggiuntive;
- underline animate;
- baffi;
- marker;
- segmenti decorativi;
- elementi che compaiono dal nulla.

Le transizioni devono essere brevi e discrete.

Il focus da tastiera deve restare chiaramente riconoscibile e non deve dipendere esclusivamente dal colore.

Rispettare `prefers-reduced-motion`.

---

## 11. Dark e Light

Dark e Light sono due rappresentazioni dello stesso sistema.

Non devono diventare due design differenti.

### Dark

- base strutturale Navy/dark;
- testo primario Ivory;
- accent semantici invariati.

### Light

- superficie Ivory;
- testo primario Navy;
- accent semantici invariati.

Non introdurre pannelli o colori arbitrari soltanto per rendere una sezione "più interessante" in uno dei due temi.

---

## 12. Homepage

La homepage è una **copertina editoriale**, non l'indice completo del sito.

Non deve rappresentare automaticamente tutte le tassonomie del CMS.

Le Navigation Rails si occupano della navigazione globale.

La home può quindi:

- selezionare;
- gerarchizzare;
- sorprendere;
- alternare densità;
- distribuire contenuti interattivi;
- cambiare composizione durante lo scroll.

Le sezioni possono avere forme differenti, ma devono condividere lo stesso DNA.

La varietà deve nascere da:

- gerarchia;
- geometria;
- rapporto fra colonne;
- densità;
- dimensioni delle immagini;
- alternanza fra contenuto visuale, tecnico, pratico e interattivo.

Non da sistemi CSS differenti.

Obiettivo:

> Scorrere la homepage deve far venire voglia di vedere come sarà composta la fascia successiva, senza mai avere la sensazione di essere entrati in un altro sito.

---

## 13. Community nella home

La homepage non mostra automaticamente contenuti UGC provenienti dalle discussioni.

Discussioni e commenti possono contenere testi non editoriali e non devono essere percepiti come voce di Retro-Gamers.

Sono invece adatti alla homepage elementi Community controllati e strutturati come:

- Quiz;
- Sondaggi;
- Community Survey;
- statistiche di partecipazione;
- CTA di registrazione;
- ranking o risultato personale.

Questi elementi possono essere distribuiti come moduli contestuali all'interno della homepage.

Non è obbligatorio creare una singola grande sezione "Community".

---

## 14. Navigation Rails

Le rail principali rappresentano la navigazione stabile di Retro-Gamers.

Le mini rail rappresentano quick action e shortcut.

Il sistema può evolvere verso una maggiore contestualità o personalizzazione, ma ogni controllo deve avere utilità reale.

Una quick action deve superare questa domanda:

> Fa risparmiare realmente uno scroll, una ricerca o più click?

Se la risposta è no, non deve essere aggiunta.

La presenza di una tecnologia non giustifica da sola la presenza di una funzione.

---

## 15. Linguaggio UI

Evitare CTA ridondanti.

Se titolo e immagine sono già chiaramente cliccabili, non aggiungere automaticamente:

- Leggi l'articolo;
- Scopri;
- Vai;
- Continua;
- Vedi altro.

CTA e link di navigazione devono essere utilizzati soltanto quando aggiungono una destinazione o un'azione non già evidente.

La terminologia deve essere coerente tra sezioni.

Non alternare arbitrariamente:

- Tutti...
- Vedi tutto
- Scopri
- Esplora
- Vai a...
- Leggi...

Ogni pattern testuale deve avere un significato stabile.

Metadata, kicker e label devono essere brevi.

La UI non deve spiegare ciò che la gerarchia visuale comunica già.

---

## 16. Regola per nuovi componenti

Prima di aggiungere:

- un nuovo colore;
- un nuovo font-size;
- un nuovo spacing;
- un nuovo radius;
- un nuovo breakpoint;
- un nuovo hover;
- una nuova superficie;
- una nuova geometria;

verificare prima che il Design System RG non contenga già una soluzione adatta.

Una nuova eccezione deve essere motivata da un'esigenza reale del contenuto o dell'interazione.

Non dalla preferenza estetica del singolo componente.

---

## 17. Principio finale

Retro-Gamers può essere complesso sotto la superficie.

Per il lettore deve restare semplice.

Il design non deve dimostrare quanto è sofisticato il sistema.

Deve far sì che:

- leggere sia facile;
- orientarsi sia naturale;
- interagire richieda pochi passaggi;
- il contenuto resti protagonista;
- l'identità Retro-Gamers sia riconoscibile senza diventare rumorosa.

Se un elemento è bello ma non migliora identità, gerarchia, comprensione o utilità, probabilmente è rumore.
