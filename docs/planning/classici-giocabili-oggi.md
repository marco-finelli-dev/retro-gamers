# Classici giocabili oggi

Documento di progetto interno per una futura sezione editoriale e download dedicata a giochi freeware, homebrew, open source, demo e materiali legalmente distribuibili.

## 1. Visione editoriale

La sezione non deve diventare un archivio "abandonware" generico. Retro-Gamers.it dovrebbe proporre una guida curata per giocare oggi in modo legale, ordinato e documentato.

L'obiettivo non è accumulare file, ma costruire un percorso editoriale:

- spiegare perché un titolo merita di essere riscoperto;
- indicare la fonte legale o l'autorizzazione;
- distinguere cosa può essere scaricato da Retro-Gamers.it e cosa va raggiunto tramite fonte ufficiale;
- aiutare il lettore a configurare emulatori, interpreti o versioni moderne;
- collegare schede, recensioni, interviste, piattaforme, aziende e creator già presenti nel sito.

Il valore della sezione sta nella fiducia: ogni contenuto deve essere verificabile, contestualizzato e accompagnato da istruzioni chiare.

## 2. Naming

| Nome | Pro | Contro |
| --- | --- | --- |
| Classici giocabili oggi | Editoriale, caldo, coerente con Retro-Gamers.it. Comunica subito l'idea di riscoperta pratica. | Non esplicita subito il tema legale/download, quindi richiede una buona introduzione. |
| Download legali | Chiarissimo sul perimetro e rassicurante. | Suona funzionale e un po' freddo. Rischia di sembrare una pagina utility più che una sezione editoriale. |
| Giochi liberati | Evocativo e memorabile. | Potrebbe essere ambiguo: "liberato" non è sempre una categoria legale precisa. |
| Freeware & Homebrew | Descrittivo per una parte dei contenuti. | Esclude mentalmente demo, shareware, configurazioni e guide. Inglese più tecnico. |
| Archivio legale | Molto chiaro sul posizionamento. | Troppo istituzionale, poco invitante e vicino al tono di un deposito documentale. |

Nome consigliato: **Classici giocabili oggi**.

Sottotitolo possibile:

> Giochi, demo, homebrew e configurazioni per riscoprire il passato in modo legale e documentato.

## 3. Cosa può entrare

Categorie ammesse:

- freeware ufficiali;
- homebrew;
- open source;
- public domain reale;
- demo redistribuibili;
- shareware redistribuibili;
- configurazioni emulatori create da Retro-Gamers;
- preset, profili, file `.ini`, guide PDF o checklist create da Retro-Gamers;
- link esterni ufficiali quando il file non va ospitato direttamente.

Ogni voce dovrebbe avere una fonte verificabile. Se la fonte non è chiara, la scheda può esistere solo come guida editoriale senza download.

## 4. Cosa non può entrare

Sono esclusi:

- BIOS, Kickstart, firmware o ROM di sistema protetti;
- ROM console commerciali;
- dump arcade commerciali;
- giochi commerciali non più venduti ma ancora protetti;
- ISO o archivi presi da fonti grigie senza autorizzazione;
- materiale "abandonware" senza base legale chiara;
- manuali, scansioni o asset protetti senza permesso.

Regola semplice: se non possiamo spiegare chiaramente perché un file è distribuibile, non lo ospitiamo.

## 5. Distinzione importante

### Freeware

Software distribuito gratuitamente dal titolare dei diritti. Può essere giocabile gratis, ma non sempre redistribuibile da terzi. Serve verificare le condizioni.

### Open source

Software con codice sorgente pubblicato sotto una licenza aperta. La licenza stabilisce cosa si può distribuire, modificare o includere.

### Public domain

Opera rinunciata o decaduta realmente nel pubblico dominio. Nel contesto videogiochi è un caso raro e va verificato con attenzione.

### Homebrew

Produzioni moderne per piattaforme storiche o ispirate a esse. Possono essere gratuite, commerciali o open source. Anche qui conta la licenza scelta dall'autore.

### Demo

Versione dimostrativa di un gioco. Alcune demo erano pensate per la libera circolazione, altre no. Va verificata la provenienza.

### Shareware

Modello storico in cui una parte del gioco veniva distribuita liberamente e il resto acquistato o registrato. La redistribuzione dipende dalle condizioni originali.

### Abandonware

Termine informale per software non più venduto o non più supportato. **Abandonware non significa automaticamente legale o distribuibile**. Un gioco può essere introvabile sul mercato e restare pienamente protetto da copyright.

## 6. Tipi di scheda futura

Struttura contenuto proposta per ogni scheda:

- titolo;
- slug;
- piattaforma originale;
- anno;
- sviluppatore;
- publisher;
- genere;
- stato legale;
- fonte/autorizzazione;
- tipo distribuzione: ospitato da Retro-Gamers, link esterno ufficiale, solo guida;
- emulatore consigliato;
- istruzioni rapide;
- note tecniche;
- lingua;
- screenshot/immagini;
- articolo o intervista collegata;
- aziende, creator e piattaforme correlate;
- CTA registrazione se download riservato agli utenti loggati.

Esempio di stati legali utili:

- freeware ufficiale verificato;
- open source;
- homebrew con licenza dell'autore;
- demo redistribuibile;
- shareware redistribuibile;
- link esterno ufficiale;
- solo guida, nessun file ospitato.

## 7. Tipi di file scaricabili

### File ospitabili subito con basso rischio

- configurazioni create da Retro-Gamers;
- preset emulatori creati da Retro-Gamers;
- profili controller creati da Retro-Gamers;
- file `.ini` creati da Retro-Gamers;
- checklist PDF create da Retro-Gamers;
- guide PDF create da Retro-Gamers;
- piccoli pacchetti tecnici senza contenuti protetti.

### File ospitabili solo dopo verifica

- freeware ufficiali con redistribuzione permessa;
- demo con permesso chiaro di redistribuzione;
- shareware con condizioni originali compatibili;
- homebrew con licenza o consenso esplicito;
- build open source ridistribuibili secondo licenza.

### File da non ospitare ma solo linkare

- giochi gratuiti scaricabili da sito ufficiale ma senza permesso di mirror;
- build mantenute da progetti esterni;
- pacchetti con licenza non chiara ma fonte ufficiale disponibile;
- contenuti che richiedono accettazione di termini esterni.

## 8. Architettura tecnica futura, solo ipotesi

Ipotesi ad alto livello:

- schede pubbliche indicizzabili;
- download solo per utenti registrati, se si vuole creare retention e tracciamento leggero;
- storage privato, per esempio Supabase Storage;
- signed URL temporanei per evitare link permanenti ai file;
- eventuale log download minimale;
- nessun file pesante nel repository;
- nessun file pesante in `public/`;
- contenuti editoriali gestiti in Sanity;
- file distribuiti tramite storage separato;
- policy pubblica chiara su licenze, fonti e rimozione contenuti.

Questa fase non richiede implementazione. Prima serve definire policy, modello editoriale e criteri di ammissione.

## 9. Prime schede pilota editoriali

### Avventure grafiche

#### Nippon Safes Inc.

Interessante per Retro-Gamers perché unisce avventura italiana, Dynabyte, Genova e una storia produttiva poco raccontata. È anche collegabile a ScummVM e a materiale editoriale già presente.

Partenza consigliata: scheda editoriale con link esterno o solo guida, poi eventuale download solo dopo verifica/autorizzazione.

#### Beneath a Steel Sky

Classico dell'avventura grafica europea, storicamente associato a una distribuzione gratuita tramite ScummVM. Forte valore storico e ottimo esempio di gioco riscopribile oggi.

Partenza consigliata: link esterno ufficiale e guida ScummVM.

#### Flight of the Amazon Queen

Avventura grafica accessibile, nota nel contesto ScummVM, adatta a una scheda pratica per giocare oggi.

Partenza consigliata: link esterno ufficiale e guida ScummVM.

#### Lure of the Temptress

Titolo Revolution storicamente importante, utile per raccontare il legame tra design narrativo, avventure punta e clicca e preservazione.

Partenza consigliata: link esterno ufficiale e guida ScummVM.

### Shoot 'em up DOS

#### Tyrian 2000

Shoot 'em up DOS molto amato, accessibile e ancora interessante per lettori PC retro. Buon candidato per guida a DOSBox o fonte ufficiale.

Partenza consigliata: link esterno ufficiale o download da verificare.

#### Stargunner

Titolo Apogee/3D Realms con forte identità DOS shareware. Ha valore per raccontare la cultura shareware anni Novanta.

Partenza consigliata: link esterno ufficiale o download da verificare.

#### Major Stryker

Altro esempio utile per raccontare il modello shareware e il rapporto tra distribuzione libera e registrazione.

Partenza consigliata: link esterno ufficiale o download da verificare.

### Platform/action

#### Bio Menace

Platform DOS legato all'ecosistema Apogee, interessante per chi segue PC gaming, shareware e action platform anni Novanta.

Partenza consigliata: link esterno ufficiale o download da verificare.

### Picchiaduro

#### One Must Fall 2097

Picchiaduro DOS molto riconoscibile, perfetto per parlare di alternative PC ai fighting game arcade e console.

Partenza consigliata: link esterno ufficiale o download da verificare.

### Strategia/open source

#### OpenTTD

Progetto open source vivo, ottimo per spiegare cosa significa giocare oggi a un'esperienza classica tramite reimplementazione moderna.

Partenza consigliata: link esterno ufficiale. Attenzione ai dati originali se richiesti o opzionali.

#### Warzone 2100

Strategico 3D con codice e asset liberati, caso molto interessante per la storia della preservazione e del rilascio open source.

Partenza consigliata: link esterno ufficiale, con eventuale guida installazione.

## 10. Caso speciale Nippon Safes Inc.

Nippon Safes Inc. è un possibile contenuto pilota forte perché Retro-Gamers ha già:

- intervista a Massimo Magnasciutti;
- materiale iconografico fornito;
- legame con Dynabyte e Genova;
- collegamento naturale a ScummVM;
- valore editoriale italiano e internazionale.

Prima di pubblicare una scheda nella futura sezione, conviene sistemare l'intervista esistente:

- rivedere titolo, excerpt e immagini;
- chiarire contesto storico;
- collegare Dynabyte, autori e piattaforme;
- verificare eventuali diritti sul materiale iconografico;
- aggiungere un box "giocabile oggi" con ScummVM e fonte ufficiale;
- collegare poi l'intervista alla futura scheda.

La scheda di Nippon Safes dovrebbe partire in modo prudente: guida, contesto e link esterno ufficiale, senza ospitare file finché non esiste una base legale chiara.

## 11. Workflow editoriale

Checklist prima della pubblicazione:

- verificare fonte legale;
- decidere se ospitare o linkare;
- verificare licenza o autorizzazione;
- salvare riferimento alla fonte;
- preparare istruzioni emulatore o interprete;
- controllare screenshot e immagini;
- scrivere nota legale chiara;
- collegare articoli, piattaforme, aziende e creator;
- testare download se interno;
- testare installazione o avvio;
- indicare lingua e requisiti;
- preparare eventuale fallback se il download esterno cambia URL;
- definire contatto per richiesta rimozione.

Nota legale breve da adattare:

> Retro-Gamers.it ospita o segnala solo materiali che risultano distribuibili sulla base delle informazioni disponibili. Se sei titolare dei diritti e ritieni che un contenuto sia stato incluso per errore, contattaci per una verifica.

## 12. Roadmap

### Fase 0: documento progetto

Definire visione, perimetro legale, categorie ammesse, esclusioni e prime schede pilota.

### Fase 1: policy pubblica e prime schede senza download interno

Pubblicare una policy chiara e creare prime schede con link esterni ufficiali o guide, senza file ospitati da Retro-Gamers.

### Fase 2: schema Sanity

Progettare un tipo contenuto dedicato, con campi per stato legale, fonte, tipo distribuzione, piattaforme, emulatori e relazioni editoriali.

### Fase 3: pagine frontend

Creare indice, schede pubbliche, filtri per piattaforma/genere/tipo distribuzione e collegamenti a recensioni, interviste, creator e aziende.

### Fase 4: Supabase Storage e download per registrati

Usare storage privato, signed URL temporanei e download accessibili solo agli utenti registrati, se coerente con la strategia community.

### Fase 5: integrazione account/dashboard

Aggiungere nello spazio account una sezione per download recenti, guide salvate o suggerimenti basati sugli interessi.

### Fase 6: espansione catalogo

Ampliare gradualmente il catalogo, privilegiando qualità, verifica legale e valore editoriale rispetto alla quantità.

## Principio guida

Meglio poche schede solide, verificabili e ben raccontate che una raccolta ampia ma legalmente ambigua. La sezione deve aiutare il lettore a giocare oggi, non a cercare scorciatoie grigie.
