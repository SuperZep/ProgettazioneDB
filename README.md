# DB Quest + SQL Quest

Corsi gamificati di **progettazione di database** (DB Quest) e **SQL** (SQL Quest) per l'ITES Valturio di Rimini.
Sito: https://superzep.github.io/ProgettazioneDB/

- `index.html` — l'intera applicazione (una sola pagina).
- `firestore.rules` — regole Firestore per il **piano gratuito** con **convalida del docente** (vedi sotto).
- `firestore.server.rules` — regole da usare solo se si attiva la correzione sul server (piano Blaze).
- `functions/` — Cloud Functions che avviano e correggono la verifica finale. Collaudo: `cd functions && npm install && npm test`.
- `ATTIVA-SERVER.md` — come attivare la correzione sul server (Google Cloud Shell, pochi minuti).

Se in `index.html` la configurazione Firebase (`CONFIG.firebase`) è vuota, il sito funziona in **modalità demo**:
login simulato e progressi salvati solo nel browser.

## Convalida del docente (piano gratuito)

Senza Cloud Functions la verifica si corregge nel browser dello studente, che vede subito il punteggio
**provvisorio**. Domande e risposte restano salvate nel tentativo; quando il docente apre il pannello di un corso,
il suo browser **ricorregge** ogni verifica non ancora convalidata (query SQL comprese, anche sui dati nascosti)
e rilascia l'attestato solo a chi ha davvero raggiunto la soglia. Un punteggio dichiarato diverso da quello
ricalcolato, o domande alterate, vengono segnalati con ⚠️.

Le regole di `firestore.rules` impediscono allo studente di: scriversi l'attestato, i tentativi concessi o le
convalide; modificare o cancellare i tentativi consegnati; iniziare una verifica senza tentativi o prima delle
48 ore (misurate con l'ora del server); cambiare le domande dopo l'inizio o abbandonare una verifica per
ricominciarla con domande nuove.
