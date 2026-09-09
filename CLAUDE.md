# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project structure and naming conventions

- `src/app/components/<name>/` — one folder per component, containing `<name>Component.tsx` + a co-located `<name>Component.css` (e.g. `src/app/components/button/buttonComponent.tsx` + `buttonComponent.css`). Component function names are PascalCase with a `Component` suffix (e.g. `ButtonComponent`).
- `src/app/pages/<name>/` — one folder per page, containing `<name>.tsx` + a co-located `<name>.css` (e.g. `src/app/pages/auth/auth.tsx`). Page function names are PascalCase without a suffix (e.g. `Auth`).
- `src/shared/routes.ts` — central `ROUTES` array (`{ name, element, childrens?, hidden }`) consumed by `App.tsx` to build `<Route>` entries. New pages are registered here.
- New components/pages should follow this folder + co-located-CSS + naming pattern.

## Testing

Vitest is configured in `vite.config.ts` (`environment: 'jsdom'`, setup file `src/setupTests.ts`). Test files live next to the code they cover (e.g. `buttonComponent.test.tsx` beside `buttonComponent.tsx`). Import `describe`/`it`/`expect`/`vi` explicitly from `"vitest"` — globals are not enabled. `src/setupTests.ts` registers `@testing-library/jest-dom` matchers and calls `cleanup()` after each test (required since globals are off, so React Testing Library's automatic cleanup doesn't kick in on its own).

## Linting

Il frontend (root) ha `npm run lint` (ESLint, config in `eslint.config.js`). Il **backend non ha uno script di lint dedicato**, per scelta deliberata e non per mancanza di tentativo: `typescript-eslint` blocca esplicitamente TypeScript ≥7.0 (usato dal backend per `tsc -b` e `tsoa:gen`) — è un limite architetturale in ESLint core (nessun supporto a parser asincroni), tracciato nella issue pubblica [typescript-eslint/typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940), ancora aperta al 2026-09-05. Un override npm mirato solo a ESLint (per non toccare la risoluzione di `typescript` usata da `tsc -b`/`tsoa:gen`) è stato provato e si è rivelato inaffidabile: `typescript` è una peer dependency di `typescript-eslint`, e npm non crea una copia annidata distinta quando il pacchetto in conflitto coincide con un devDependency di primo livello del progetto. Rivalutare quando typescript-eslint supporterà TS7, o se si valuta un linter alternativo (es. oxlint, che ha un parser TS proprio e un companion `oxlint-tsgolint` pensato per tsgo).

## Backend security

- **Niente logica nei controller.** I controller (`backend/src/controllers/`) delegano sempre ai service (`backend/src/services/`): ricevono la request, chiamano il service, mappano il risultato/l'errore sulla risposta HTTP. Qualunque validazione di dominio, calcolo o accesso diretto ai dati appartiene al service, mai al controller.
- **Pattern di scoping multi-azienda obbligatorio.** Ogni rotta che legge o scrive una risorsa appartenente a un'azienda deve verificare `requester.companyId === risorsa.companyId` (o passare esplicitamente `companyId` al service, che lo usa per filtrare la query) subito dopo il controllo di autenticazione — è la difesa contro l'IDOR cross-tenant, applicata oggi manualmente in ogni controller. Un nuovo endpoint che dimentica questo controllo espone dati di un'altra azienda. Le funzioni di service con `companyId?: string | null` opzionale (es. `listProjects`, `listUsers`) sono per usi interni che devono deliberatamente vedere tutte le aziende: un controller che le chiama per una richiesta autenticata deve **sempre** valorizzare `companyId`, mai ometterlo.

Nota per chi clona questo repo: se usi Claude Code con agenti personalizzati a livello utente (`~/.claude/agents/`), puoi documentarli in un `CLAUDE.local.md` accanto a questo file — non è tracciato da git, quindi resta specifico alla tua macchina/account e non si propaga ad altri contributori.
