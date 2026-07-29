# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Hard constraints

These are course requirements, not preferences. Do not violate them even if a change would be easier otherwise:

- **Simple and static only**: plain HTML, CSS, JavaScript, and `localStorage` for persistence.
- **No frameworks** — no React, no Next.js, no jQuery, no CSS frameworks. (Frameworks arrive in a later lesson.)
- **No build step** — no bundler, no transpiler, no `package.json`, no npm dependencies. The files served are the files edited.
- **No backend** — no server code, no APIs, no fetch to remote endpoints. All state lives in the browser.

Consequences worth remembering: no ES module `import`/`export` (the script is a classic `<script>`), no JSX, no TypeScript, no preprocessors. Everything must work by opening `index.html` directly in a browser.

## Running it

There is no build, test, or lint tooling. To run the app, open [index.html](index.html) in a browser (double-click, or `start index.html` on Windows).

Verification is manual: add a task, toggle it, delete it, click "Clear completed", then reload the page to confirm state survived. Reset state via DevTools → Application → Local Storage, or `localStorage.removeItem("todos")` in the console.

## Architecture

Three files, no abstraction layers:

- [index.html](index.html) — static markup. Every element JS touches has a fixed `id`: `todo-form`, `todo-input`, `todo-list`, `empty-state`, `clear-completed`, `theme-toggle`, plus the detail dialog's `task-dialog`, `task-detail-form`, `detail-text`, `detail-done`, `detail-emoji`, `detail-due`, `detail-due-clear`, `detail-due-quick`, `detail-due-hint`, `detail-delete`, `detail-cancel`. The task list, the emoji picker and the due-date shortcuts are all empty containers filled at runtime.
- [style.css](style.css) — plain CSS, no variables/nesting. State is expressed through classes JS toggles: `.todo-item.done`, `.empty-state.hidden`, `body.theme-dark`, `.due-badge.overdue` / `.due-badge.due-today` (and the same pair on `.due-hint`), `.due-clear.hidden`, `.due-chip.active`, `.emoji-option.selected`, `.emoji-trigger.has-emoji`, plus the native `:disabled` state on `.clear-completed` and `[aria-expanded]` on `.emoji-trigger`.
- [app.js](app.js) — the whole app, wrapped in an IIFE with `"use strict"`. Nothing is exposed on `window`.

### The one pattern to follow

`app.js` uses a **single source of truth plus full re-render**. The `todos` array is the state; `render()` clears `todo-list` and rebuilds every `<li>` from scratch. Every mutation follows the same three steps:

```js
mutate todos → save() → render()
```

When adding a feature (filters, editing, reordering, counts), extend this pattern rather than patching the DOM in place. Do not introduce a second copy of state or read task data back out of the DOM.

Theme is the one piece of state that lives outside the `todos` array, and it mirrors the same shape: `mutate theme → saveTheme() → applyTheme()`. It is stored separately under the `theme` key, holding `"light"` or `"dark"` only once the user clicks the toggle — until then the variable is `null` and the app follows `prefers-color-scheme`, which is why `resolvedTheme()` exists and why the `matchMedia` change listener re-applies only while no override is set.

Other conventions in `app.js`:

- Todo shape is `{ id, text, done, emoji, due }`. `id` is a timestamp plus random suffix — treat it as an opaque string. `emoji` is `""` or a single emoji; `due` is `""` or a `YYYY-MM-DD` string. `load()` runs every stored entry through `normalize()`, so those types are guaranteed by the time anything renders — older todos missing `emoji`/`due` come back with `""`, and entries without a string `id` and `text` are dropped. Rely on that instead of re-guarding at each use.
- **Dates never go through `new Date(string)`.** `new Date("2026-07-30")` parses as UTC midnight and renders as the 29th in any negative-offset timezone. Compare `due` against `todayISO()` as strings (ISO dates sort lexicographically) and build display dates from parts.
- The detail dialog lives **outside `#todo-list`** in the markup, because `render()` rebuilds that list on every mutation and would destroy it mid-edit. It holds only `editingId` plus a `draftEmoji` for the picker; task data is always re-read from `todos` by id. Everything commits together on Save — except Delete, which acts immediately and closes.
- List items are built with `createElement` and `textContent`, never `innerHTML`, so user text cannot inject markup. Keep it that way.
- `load()` wraps `JSON.parse` in try/catch, rejects a non-array, and normalises every entry, so corrupt `localStorage` cannot break startup. This is stronger than a try/catch alone: valid JSON of the wrong shape once reached `due.split()` inside `render()` and blanked the entire list. Any new field must be type-checked in `normalize()`, not trusted.
- Optional elements are guarded (`if (clearCompletedBtn)`) — a missing element must not throw and take the whole app down. This was a real bug fix (commit `1acf1c0`); preserve the guards, and follow the same approach for any element that might not be present.
