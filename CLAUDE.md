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

- [index.html](index.html) — static markup. Every element JS touches has a fixed `id`: `todo-form`, `todo-input`, `todo-list`, `empty-state`, `clear-completed`. The task list itself is an empty `<ul>` filled at runtime.
- [style.css](style.css) — plain CSS, no variables/nesting. State is expressed through classes JS toggles: `.todo-item.done`, `.empty-state.hidden`, plus the native `:disabled` state on `.clear-completed`.
- [app.js](app.js) — the whole app, wrapped in an IIFE with `"use strict"`. Nothing is exposed on `window`.

### The one pattern to follow

`app.js` uses a **single source of truth plus full re-render**. The `todos` array is the state; `render()` clears `todo-list` and rebuilds every `<li>` from scratch. Every mutation follows the same three steps:

```js
mutate todos → save() → render()
```

When adding a feature (filters, editing, reordering, counts), extend this pattern rather than patching the DOM in place. Do not introduce a second copy of state or read task data back out of the DOM.

Other conventions in `app.js`:

- Todo shape is `{ id, text, done }`. `id` is a timestamp plus random suffix — treat it as an opaque string.
- List items are built with `createElement` and `textContent`, never `innerHTML`, so user text cannot inject markup. Keep it that way.
- `load()` wraps `JSON.parse` in try/catch and falls back to `[]`, so corrupt `localStorage` cannot break startup.
- Optional elements are guarded (`if (clearCompletedBtn)`) — a missing element must not throw and take the whole app down. This was a real bug fix (commit `1acf1c0`); preserve the guards, and follow the same approach for any element that might not be present.
