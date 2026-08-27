# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

React 19 + TypeScript + Vite 8, routing with `react-router` 8. No state-management library yet — components use local state only. Testing uses Vitest + React Testing Library.

## Commands

- `npm run dev` — start the Vite dev server
- `npm run build` — type-check (`tsc -b`) then build (`vite build`)
- `npm run lint` — run ESLint over the whole project
- `npm run preview` — preview the production build
- `npm test` — run the test suite once (`vitest run`)
- `npm run test:watch` — run tests in watch mode

There is no `format` script yet.

## Project structure and naming conventions

- `src/app/components/<name>/` — one folder per component, containing `<name>Component.tsx` + a co-located `<name>Component.css` (e.g. `src/app/components/button/buttonComponent.tsx` + `buttonComponent.css`). Component function names are PascalCase with a `Component` suffix (e.g. `ButtonComponent`).
- `src/app/pages/<name>/` — one folder per page, containing `<name>.tsx` + a co-located `<name>.css` (e.g. `src/app/pages/auth/auth.tsx`). Page function names are PascalCase without a suffix (e.g. `Auth`).
- `src/shared/routes.ts` — central `ROUTES` array (`{ name, element, childrens?, hidden }`) consumed by `App.tsx` to build `<Route>` entries. New pages are registered here.
- New components/pages should follow this folder + co-located-CSS + naming pattern.

## Testing

Vitest is configured in `vite.config.ts` (`environment: 'jsdom'`, setup file `src/setupTests.ts`). Test files live next to the code they cover (e.g. `buttonComponent.test.tsx` beside `buttonComponent.tsx`). Import `describe`/`it`/`expect`/`vi` explicitly from `"vitest"` — globals are not enabled. `src/setupTests.ts` registers `@testing-library/jest-dom` matchers and calls `cleanup()` after each test (required since globals are off, so React Testing Library's automatic cleanup doesn't kick in on its own).

## Available agents

These live in the user-level `~/.claude/agents/` directory (there is no project-level `.claude/agents/` folder), so they're already available — reach for one instead of recreating its job inline or spawning a fresh ad-hoc agent for it. None of them retain memory across sessions.

- **react-expert** — writes, fixes and reviews React 19 + TypeScript components, pages, hooks and routes. Use for a new component/page or a targeted review of recently changed React code (hooks correctness, re-renders, a11y, tests).
- **css-expert** — writes and fixes CSS Modules: design tokens (`src/index.css`), specificity, redundancy, interaction states (hover/focus/disabled), responsive layout, CSS-level accessibility. Not for overall visual direction — that's `web-design`.
- **web-design** — decides UI/UX direction (content hierarchy, layout, typography, interaction states) consistent with the Ardesia & Menta palette, then implements the markup and base CSS. Not for pure CSS technical cleanup — that's `css-expert`.
- **seo-expert** — technical SEO for the SPA: per-route title/meta, distinguishing public vs. authenticated pages for indexability, `robots.txt`/`sitemap.xml`, semantic HTML/heading structure, SEO-relevant performance. Flags SSR/prerendering needs rather than implementing them unprompted (this app has no SSR today).
- **typescript-optimizer** — run at the end of a task touching TypeScript code; optimizes type-safety, performance and readability without changing behavior.
- **issue-scout** — read-only; reproduces and localizes problems reported by the IDE/`tsc`/tests with `file:line` and explains the root cause without fixing. Use to triage a pile of errors after a broad refactor.
- **esploratore** — read-only; maps every file a task might touch before implementation starts, without judging the code. Use before a non-trivial change to scope its blast radius.
- **ricognitore** — checks whether the code state has drifted since a task was defined, and remaps impacted files. Use at the start of a session that resumes WIP or a previously-planned task.
- **node-expert** — read-only; assesses npm dependency vulnerabilities, upgrade risk and regressions. Use when `npm audit` flags something or before a mass dependency upgrade.
- **security-auditor** — audits sensitive code (auth, input handling, env/config, network exposure). Requires explicit user consent before each invocation — never launch it proactively without asking first.
