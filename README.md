# Hodum

Task manager full-stack con assistente AI integrato: React 19 + TypeScript + Vite sul frontend, Express 5 + TSOA su PostgreSQL sul backend, sincronizzazione realtime via Socket.IO.

## Stack

- **Frontend**: React 19, TypeScript, Vite 8, routing con `react-router` 8. Test con Vitest + React Testing Library.
- **Backend**: Express 5, TSOA, PostgreSQL (`pg`), Socket.IO.
- **Assistente**: Ollama (locale), invocato dal backend per la chat integrata nell'app.

## Prerequisiti

- Node.js 20+
- Un'istanza PostgreSQL raggiungibile
- Ollama in esecuzione localmente, con il modello configurato già scaricato (`ollama pull <modello>`, default `qwen2.5:14b`)

## Setup

```bash
# Frontend (root del repo)
npm install

# Backend
cd backend
npm install
cp .env.example .env   # imposta DATABASE_URL e le altre variabili
npm run migrate:up
```

## Avvio in locale

```bash
# Backend (backend/)
npm run dev

# Frontend (root, in un altro terminale)
npm run dev
```

## Comandi

Frontend (root del repo):

```bash
npm run dev       # avvia il dev server Vite
npm run build     # type-check (tsc -b) e build
npm run lint      # ESLint su tutto il progetto
npm run preview   # preview della build di produzione
npm test          # esegue la test suite una volta (vitest run)
npm run test:watch
```

Backend (`backend/`):

```bash
npm run dev             # rigenera routes/spec TSOA e avvia il server in watch
npm run build            # rigenera routes/spec TSOA e compila
npm start                 # avvia il server compilato
npm run migrate:up       # esegue le migration pendenti
npm run migrate:create   # crea una nuova migration
npm run db:check         # verifica la connessione al database
```

## Struttura

- `src/app/components/<nome>/` — componenti, un folder ciascuno con CSS co-locato
- `src/app/pages/<nome>/` — pagine (auth, dashboard, task list)
- `src/shared/` — routing e codice condiviso lato frontend
- `backend/src/controllers|services/` — controller TSOA e logica di business (auth, progetti, task, assistente)
- `backend/src/realtime/` — gateway Socket.IO
- `backend/migrations/` — migration SQL numerate
