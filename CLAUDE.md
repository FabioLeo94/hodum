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

## Intentional patterns (do not "fix" these)

- In `src/shared/routes.ts`, page components are invoked directly as functions (e.g. `Auth()`) rather than rendered as JSX (`<Auth />`) when building the `ROUTES` array. This is deliberate, not a bug.
- Components accept an optional `key` prop with a `crypto.randomUUID()` default (see `buttonComponent.tsx`). This is deliberate, not a bug — keep this pattern when adding similar components.

## Testing

Vitest is configured in `vite.config.ts` (`environment: 'jsdom'`, setup file `src/setupTests.ts`). Test files live next to the code they cover (e.g. `buttonComponent.test.tsx` beside `buttonComponent.tsx`). Import `describe`/`it`/`expect`/`vi` explicitly from `"vitest"` — globals are not enabled. `src/setupTests.ts` registers `@testing-library/jest-dom` matchers and calls `cleanup()` after each test (required since globals are off, so React Testing Library's automatic cleanup doesn't kick in on its own).
