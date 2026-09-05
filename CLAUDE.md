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

## Available agents

These live in the user-level `~/.claude/agents/` directory (there is no project-level `.claude/agents/` folder), so they're already available — reach for one instead of recreating its job inline or spawning a fresh ad-hoc agent for it. Most don't retain memory across sessions; `security-auditor` and `pentest-engineer` do (shared across projects, each entry prefixed by project name).

- **react-expert** — writes, fixes and reviews React 19 + TypeScript components, pages, hooks and routes. Use for a new component/page or a targeted review of recently changed React code (hooks correctness, re-renders, a11y, tests).
- **css-expert** — writes and fixes CSS Modules: design tokens (`src/index.css`), specificity, redundancy, interaction states (hover/focus/disabled), responsive layout, CSS-level accessibility. Not for overall visual direction — that's `web-design`.
- **web-design** — decides UI/UX direction (content hierarchy, layout, typography, interaction states) consistent with the Ardesia & Menta palette, then implements the markup and base CSS. Not for pure CSS technical cleanup — that's `css-expert`.
- **seo-expert** — technical SEO for the SPA: per-route title/meta, distinguishing public vs. authenticated pages for indexability, `robots.txt`/`sitemap.xml`, semantic HTML/heading structure, SEO-relevant performance. Flags SSR/prerendering needs rather than implementing them unprompted (this app has no SSR today).
- **typescript-optimizer** — run at the end of a task touching TypeScript code; optimizes type-safety, performance and readability without changing behavior.
- **issue-scout** — read-only; reproduces and localizes problems reported by the IDE/`tsc`/tests with `file:line` and explains the root cause without fixing. Use to triage a pile of errors after a broad refactor.
- **esploratore** — read-only; maps every file a task might touch before implementation starts, without judging the code. Use before a non-trivial change to scope its blast radius.
- **ricognitore** — checks whether the code state has drifted since a task was defined, and remaps impacted files. Use at the start of a session that resumes WIP or a previously-planned task.
- **node-expert** — read-only; assesses npm dependency vulnerabilities, upgrade risk and regressions. Use when `npm audit` flags something or before a mass dependency upgrade.
- **security-auditor** — read-only; audits sensitive code (auth, input handling, env/config, network exposure) and produces a report. Requires explicit user consent before each invocation — never launch it proactively without asking first.
- **pentest-engineer** — offensive/defensive security: actively verifies vulnerabilities against the local/dev instance (not just static review), researches real CVEs on installed dependency versions, audits infra/deploy config (env vars, CI/CD, secrets), and applies the minimal fix. Only ever tests against `localhost`/dev — never third-party or production targets. Requires explicit user consent before each invocation, same as `security-auditor`.
