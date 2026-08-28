---
name: new-component
description: Scaffolds a new component or page in this project following its folder + co-located-CSS + naming conventions. Use when the user asks to create a new component or page (e.g. "/new-component input" or "/new-component page dashboard").
disable-model-invocation: true
---

Create a new component or page for this Hodum project, following the conventions documented in CLAUDE.md.

`$ARGUMENTS` gives the kind (`component` or `page`) and the name, e.g. `component input` or `page dashboard`. If the kind is omitted, ask the user whether they want a component or a page.

## For a component

1. Create `src/app/components/<name>/<name>Component.tsx` and `src/app/components/<name>/<name>Component.css`.
2. The component function name is PascalCase with a `Component` suffix (e.g. `input` → `InputComponent`).
3. Import the co-located CSS file at the top of the `.tsx` file.
4. Follow the existing pattern in `src/app/components/button/buttonComponent.tsx`: accept an optional `key` prop defaulting to `crypto.randomUUID()` if the component is likely to be rendered in a list; otherwise omit it.
5. Export the component as the default export.

## For a page

1. Create `src/app/pages/<name>/<name>.tsx` and `src/app/pages/<name>/<name>.css`.
2. The page function name is PascalCase, no suffix (e.g. `dashboard` → `Dashboard`).
3. Import the co-located CSS file at the top of the `.tsx` file.
4. Export the page as the default export.
5. Register the page in `src/shared/routes.ts`: import it and add an entry to the `ROUTES` array as `{ name: "<route-name>", element: <PageFunction>(), hidden: false }` — call the function directly, matching the existing `Auth()` pattern (this is intentional in this project, not a mistake).

After creating the files, run `npm run lint` on the new files to confirm they pass ESLint.
