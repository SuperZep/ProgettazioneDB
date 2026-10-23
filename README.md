# DB Quest + SQL Quest

Corsi gamificati di **progettazione di database** (DB Quest) e **SQL** (SQL Quest) per l'ITES Valturio di Rimini.
Sito: https://superzep.github.io/ProgettazioneDB/

- `index.html` — l'intera applicazione (una sola pagina).
- `firestore.rules` — regole Firestore di base (verifica corretta nel browser).
- `firestore.server.rules` — regole sicure, da usare con la correzione sul server.
- `functions/` — Cloud Functions che avviano e correggono la verifica finale. Collaudo: `cd functions && npm install && npm test`.
- `ATTIVA-SERVER.md` — come attivare la correzione sul server (Google Cloud Shell, pochi minuti).

Se in `index.html` la configurazione Firebase (`CONFIG.firebase`) è vuota, il sito funziona in **modalità demo**:
login simulato e progressi salvati solo nel browser.
