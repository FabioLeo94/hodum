# Contribuire a Hodum

Hodum è in sviluppo attivo: mancano funzionalità e alcune parti sono
destinate a cambiare. Segnalazioni, richieste di funzionalità e contributi
di codice sono benvenuti.

## Segnalare un bug

Apri una [issue](../../issues/new) e includi:

- Cosa ti aspettavi e cosa è successo invece.
- Passi per riprodurlo.
- Modalità di avvio (Docker Compose o setup manuale) e versione di Node/Postgres se rilevante.
- Log utili (`docker compose logs -f backend`, console del browser) — **senza dati sensibili** (password, token, dati aziendali reali).

## Proporre una funzionalità

Apri una issue descrivendo il problema che vorresti risolvere prima ancora
della soluzione: aiuta a capire se rientra nell'ambito del progetto.

## Segnalare una vulnerabilità di sicurezza

**Non aprire una issue pubblica.** Usa la funzione di [GitHub Security
Advisories](../../security/advisories/new) del repository per una
segnalazione privata.

## Contribuire con codice

```bash
# Frontend (root del repo)
npm install
npm run dev

# Backend
cd backend
npm install
cp .env.example .env   # imposta DATABASE_URL e le altre variabili
npm run migrate:up
npm run dev
```

Prima di aprire una pull request:

```bash
npm run lint   # frontend
npm test       # frontend e backend (nelle rispettive cartelle)
npm run build  # frontend e backend
```

Le convenzioni di struttura del progetto (organizzazione di componenti/pagine,
naming, pattern di sicurezza multi-azienda nel backend) sono documentate in
[`CLAUDE.md`](./CLAUDE.md) — valgono per qualunque contributo, umano o assistito da AI.

Le pull request dovrebbero essere mirate: preferisci una modifica piccola e
chiara a un cambiamento ampio che tocca più aree contemporaneamente.
