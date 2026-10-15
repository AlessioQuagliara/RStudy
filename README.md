# RStudy

RStudy è un'app desktop per organizzare lo studio per corsi e lezioni, e per lavorare sui propri appunti in modo attivo: esercizi, flashcard, presentazioni di ripasso, domande sui materiali del corso.

Corsi, lezioni e file importati restano sul tuo computer. Le funzioni AI possono girare su un modello locale oppure su un servizio cloud incluso nell'app: più sotto spiego cosa cambia.

## L'idea

Hai gli appunti della lezione, le slide del docente, magari un PDF. Li hai riletti due volte. Li sai davvero?

Rileggere ti fa sentire di conoscere un argomento. Rispondere a una domanda senza guardare ti dice se lo conosci davvero.

RStudy prova ad accorciare la strada verso quel secondo passaggio. Dagli appunti di una lezione ricava domande, carte da ripassare e una presentazione, così passi il tempo a metterti alla prova e non a preparare il materiale. Non sostituisce lo studio e non garantisce risultati: ti dà un percorso più ordinato per farlo.

## Cosa puoi fare

**Organizzare il materiale**
- Creare corsi e, dentro ogni corso, le lezioni.
- Scrivere gli appunti in un editor con titoli, liste, tabelle, checklist ed evidenziazioni.
- Dettare gli appunti con il microfono, se il servizio di trascrizione è attivo nella build.
- Importare materiali in PDF, TXT e Markdown. Anche DOCX, ma l'estrazione del testo non riesce sempre con documenti complessi.

**Studiare in modo attivo**
- Da una lezione, generare un riepilogo, uno schema in forma di diagramma, domande di autoverifica e flashcard.
- Generare esercizi: risposta multipla, risposta aperta e, per le materie che lo richiedono, esercizi di codice. Le risposte aperte vengono confrontate con quella attesa a livello di testo, non di significato, e l'app lo dice.
- Generare una presentazione della lezione da scorrere come ripasso.
- Avere un riepilogo dell'intero corso.
- Generare una "sessione studio": un PDF che raccoglie le lezioni di un corso in capitoli. È l'operazione più pesante, quindi ha limiti di frequenza propri.

**Ripassare**
- Studiare le flashcard (generate o scritte a mano) e valutare ogni carta come facile, media o difficile. La carta torna rispettivamente dopo 7, 3 o 1 giorno.
- Fare domande ai materiali del corso in una chat. La risposta si basa sui passaggi trovati nei tuoi file e, se il contesto non basta, l'app lo segnala invece di inventare.

## Come si usa

1. Crei un corso, per esempio "Analisi 1".
2. Aggiungi le lezioni e scrivi (o detti) gli appunti.
3. Importi i materiali collegati: slide, dispense, esercizi del docente.
4. Quando una lezione è pronta, chiedi tu all'app di generare riepilogo, esercizi o presentazione. Niente parte da solo.
5. Fai gli esercizi, poi ripassi le flashcard nei giorni successivi.
6. Quando ti serve, fai domande al corso o generi la sessione studio in PDF.

Quello che genera l'AI va letto con spirito critico: può sbagliare, semplificare troppo o perdere un passaggio. Gli appunti di partenza restano la fonte.

## Dati e AI

**Cosa resta sul computer.** Il database con corsi, lezioni, flashcard e contenuti generati, insieme ai file importati, è salvato in locale. Anche la ricerca nei materiali usata dalla chat è calcolata in locale.

**AI cloud (impostazione predefinita).** Se non cambi nulla, le generazioni passano da un servizio AI cloud incluso nell'app: non devi inserire chiavi. In questo caso gli appunti della lezione e i passaggi dei materiali necessari alla richiesta vengono inviati al provider esterno. Non viene inviato l'intero database, ma il contenuto esce dal computer. C'è un limite giornaliero di richieste per installazione.

**AI locale.** Dalle Impostazioni puoi scaricare un modello (circa 2 GB) e scegliere "Locale": a quel punto le generazioni avvengono sul computer, senza inviare testi. Il modello è piccolo, quindi è più lento e meno preciso del cloud, soprattutto su esercizi e presentazioni. Se usi il cloud e hai già scaricato il modello locale, l'app ci ripiega da sola quando il cloud non risponde, per esempio se sei offline.

**Dettato.** L'audio registrato viene inviato a un servizio di trascrizione esterno per ottenere il testo. Non viene salvato su disco.

**Altro traffico di rete.** L'attivazione della licenza contatta Paddle per verificare l'acquisto. All'avvio l'app controlla se ci sono aggiornamenti sulle release di GitHub. Il download del modello locale avviene una volta sola.

**Backup.** Dalle Impostazioni puoi esportare un backup JSON e reimportarlo. Contiene corsi, lezioni, flashcard, riepiloghi di lezioni e corsi, e i dati dei materiali. Restano fuori i file originali dei materiali, gli esercizi e le presentazioni generati e le impostazioni. Dopo un ripristino, quindi, il modello locale va riscaricato.

## Stato del progetto

RStudy è in sviluppo. Le [release su GitHub](https://github.com/AlessioQuagliara/RStudy/releases) contengono installer per macOS (Apple Silicon), Windows e Linux (AppImage). L'app è sviluppata e provata soprattutto su macOS Apple Silicon. Le altre piattaforme vengono compilate, ma le ho provate meno.

Limiti da sapere:
- su macOS l'app non è ancora firmata con un certificato Apple: al primo avvio il sistema mostra un avviso e l'aggiornamento automatico non funziona;
- serve una licenza attivata, senza la quale l'app mostra solo la schermata di attivazione;
- niente sincronizzazione tra dispositivi né app mobile: per spostare i dati si usa il backup;
- la ricerca nei materiali usa un metodo leggero e offline, meno preciso di una ricerca semantica vera.

## Avvio in sviluppo

Il codice dell'app è in `studyforge/`. Servono Node.js 22, pnpm e, su macOS, i Command Line Tools di Xcode per compilare i moduli nativi.

```bash
cd studyforge
pnpm install
pnpm dev
```

`pnpm seed` crea un corso di esempio senza usare l'AI. `pnpm test` esegue i test.

Una cosa importante: anche in sviluppo l'app chiede l'attivazione della licenza, e l'attivazione e le funzioni AI cloud dipendono da credenziali del distributore che non sono nel repository. In `studyforge/.env.example` trovi i nomi delle variabili da configurare in un file `.env`. Senza credenziali le funzioni cloud risultano non disponibili. Senza attivazione, l'app non va oltre la prima schermata.

Per architettura, build e dettagli tecnici: [`studyforge/README.md`](studyforge/README.md).

## Dentro il repository

- `studyforge/`: l'app desktop (Electron, React, TypeScript, SQLite).
- `web/`: il sito di presentazione.
- `docs/`: la versione compilata del sito, pubblicata con GitHub Pages.

## Licenza

Il repository non contiene un file di licenza. Il codice è pubblico, ma questo non vuol dire che sia riutilizzabile liberamente. L'app è distribuita con una licenza commerciale, che va attivata per usarla.
