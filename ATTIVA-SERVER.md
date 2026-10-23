# Attivare la correzione della verifica sul server

Finché questo passaggio non è fatto, l'app funziona lo stesso: la verifica viene corretta nel browser
(il pannello docente lo segnala con «⚠️ correzione nel browser»). Dopo l'attivazione compare «🛡️ correzione sul server attiva»
e nessuno studente può più modificare dal browser la verifica, il punteggio o l'attestato.

## 1. Passa al piano Blaze (una volta sola)
Console Firebase → ⚙️ **Impostazioni progetto** → **Utilizzo e fatturazione** → **Modifica piano** → **Blaze**.
Serve una carta di credito, ma per una scuola il consumo resta nella quota gratuita (2 milioni di chiamate al mese).
Consiglio: in Google Cloud → **Fatturazione → Budget e avvisi** imposta un avviso a 5 €.

## 2. Pubblica le funzioni da Google Cloud Shell (nessuna installazione)
1. Apri **https://shell.cloud.google.com** con lo stesso account Google del progetto Firebase.
2. Incolla questi comandi, uno alla volta:

```bash
git clone https://github.com/SuperZep/ProgettazioneDB.git
cd ProgettazioneDB
npx -y firebase-tools login --no-localhost
npx -y firebase-tools deploy --only functions,firestore:rules
```

- Il comando `login` mostra un link: aprilo, autorizza con il tuo account e incolla il codice nel terminale.
- Il primo `deploy` può chiedere di abilitare alcuni servizi Google (Cloud Functions, Cloud Build, Artifact Registry): rispondi **sì**. Ci vogliono alcuni minuti.
- Prima di pubblicare vengono eseguiti in automatico i collaudi (`21 controlli superati`): se uno fallisce, la pubblicazione si ferma.

## 3. Controlla
Apri il sito ed entra come docente: sotto il titolo del pannello deve comparire **«🛡️ correzione sul server attiva»**.

## Quando cambiano i giochi
Dopo ogni aggiornamento di `index.html` che tocca giochi o verifica, ripeti in Cloud Shell:

```bash
cd ProgettazioneDB && git pull && npx -y firebase-tools deploy --only functions
```

## Che cosa viene pubblicato
- `functions/` — tre funzioni nella regione `europe-west1`: `ping`, `startExam` (sorteggia e salva le domande), `submitExam` (corregge e registra il risultato, comprese le query SQL provate anche sui dati nascosti).
- `firestore.server.rules` — regole che impediscono agli studenti di scrivere verifica, tentativi, risultato e attestato.
