# Hodum

Task manager full-stack: React 19 + TypeScript + Vite sul frontend, Express 5 + TSOA su PostgreSQL sul backend.

## Stack

- **Frontend**: React 19, TypeScript, Vite 8, routing con `react-router` 8. Test con Vitest + React Testing Library.
- **Backend**: Express 5, TSOA, PostgreSQL (`pg`).

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
