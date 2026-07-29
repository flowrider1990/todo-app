# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## How to talk to the user

Talk to them as a **product owner**, not a developer. They decide what the app should do; they are not here to review implementation detail.

- Lead with what changed for the user and what it means for them. Keep the "how" short, or leave it out.
- Skip jargon, code identifiers, file paths and line numbers unless they asked for them or something is genuinely broken.
- Do raise anything that needs a decision — a tradeoff, a risk, something ambiguous in the request, or work left undone. Frame it in terms of consequences, not mechanics.
- Say plainly what is done, what is not, and what has not been checked. Never imply something was verified when it was not.

The technical rigour still applies to the work itself. This is about the reporting, not the standard.

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

Repeats need a little more: set one, tick it off, and confirm it moves to "Done for now" with the next date; untick it and confirm the old date comes back. To check the day rollover without waiting, move the OS clock forward past midnight, then switch away from the tab and back — the list must re-sort itself with no reload.

There is no test tooling in the repo and none should be added (it would mean a `package.json`). Throwaway harnesses outside the project are fair game, though, and worth it for the date arithmetic — the monthly anchor, the weekday walk and the DST cases are the parts least likely to be caught by clicking.

## Architecture

Three files, no abstraction layers:

- [index.html](index.html) — static markup. Every element JS touches has a fixed `id`; there are ~48 of them, so rather than listing them here, note the rule: **if JS looks it up, it has an `id` in the markup**, and a quick `getElementById` vs `id="…"` diff is worth running after any markup change — a missing element silently disables a whole feature. The three section containers (`section-open` / `list-open`, `section-later` / `list-later`, `section-done` / `list-done`), the emoji picker, and every chip row are empty containers filled at runtime.
- [style.css](style.css) — plain CSS, no variables/nesting. State is expressed through classes JS toggles: `.todo-item.done`, `.todo-item.flash`, `body.theme-dark`, `.due-badge.overdue` / `.due-badge.due-today` (and the same pair on `.due-hint`), `.chip.active`, `.emoji-option.selected`, `.emoji-trigger.has-emoji`, `.invalid` on the four text/date fields, plus the native `:disabled` on `.clear-completed` and `[aria-expanded]` on `.emoji-trigger`. `.form-error` collapses via `:empty` rather than a toggled class, so JS only ever sets its `textContent`.
  - `.hidden` is the one general-purpose toggle. Because most of what it hides is `display: flex` or `display: block`, it cannot be a bare `.hidden { display: none }` — there is a single grouped rule listing each class it applies to (`.section.hidden, .repeat-block.hidden, …`). Adding a newly hideable element means adding it to that list; `!important` is deliberately avoided.
  - `.chip` is one component shared by the due-date shortcuts, the repeat presets, the weekday toggles and the end condition. It was `.due-chip` until repeats needed the same thing three more times; keep it generic.
  - The `@media (max-width: 400px)` block is last in the file so it wins over the dark rules too. It hides `.repeat-detail:not(.keep)`, which is what stops a row carrying both a repeat badge and a date from breaking the task name one word per line.
- [app.js](app.js) — the whole app, wrapped in an IIFE with `"use strict"`. Nothing is exposed on `window`.

### The one pattern to follow

`app.js` uses a **single source of truth plus full re-render**. The `todos` array is the state; `render()` clears the three lists and rebuilds every `<li>` from scratch. Every mutation follows the same three steps:

```js
mutate todos → save() → render()
```

When adding a feature (filters, reordering, per-day grouping), extend this pattern rather than patching the DOM in place. Do not introduce a second copy of state or read task data back out of the DOM.

The corollary, which the repeat feature leans on heavily: **store the fact, derive the status.** A repeating task stores its rule and a log of when it was ticked off. Everything a user actually reads — "2 of 3 this week", whether it is waiting today, whether the series has finished, which section it belongs in — is recounted from that log at render time. There is no progress counter to reset and no "current period" to migrate, which is also why the day-rollover fix is nothing more than "re-render when the date changes". Resist adding a cached field for any of it.

Theme is one of two pieces of state living outside the `todos` array, and it mirrors the same shape: `mutate theme → saveTheme() → applyTheme()`. It is stored separately under the `theme` key, holding `"light"` or `"dark"` only once the user clicks the toggle — until then the variable is `null` and the app follows `prefers-color-scheme`, which is why `resolvedTheme()` exists and why the `matchMedia` change listener re-applies only while no override is set.

The other is which sections are expanded, under the `sections` key as `{ later, done }`. The `<details>` elements own the disclosure themselves — JS only records the state on `toggle` and re-applies it in `render()`. The `toggle` handler compares before writing, because `render()` setting `.open` would otherwise fire it right back.

### Sections

`render()` sorts every todo into one of three buckets via `sectionOf(todo, today)`:

| Section | Contains |
| --- | --- |
| **Open** | a one-off that is not ticked; a scheduled repeat whose date is today or past; a quota repeat below its count |
| **Done for now** | a scheduled repeat whose next date is still ahead; a quota repeat that has hit its count this period |
| **Done** | a ticked one-off; a repeat whose end condition has been met |

Several things fall out of this rather than needing their own code, and should stay that way:

- **"Clear completed" cannot eat an active repeat.** It deletes what is in *Done*, and an active repeat is never there. `clearCompleted()` and the button's `disabled` state both ask `sectionOf`, not `todo.done`.
- A daily task ticked today sits in "Done for now" and returns to Open tomorrow by itself.
- `isChecked(todo, today)` is derived for repeats — a repeating task is ticked exactly when it is not in Open. `todo.done` is only meaningful for a one-off, and `saveTaskDetails` forces it to `false` whenever a repeat is set. Do not start writing `done` for repeats.

### Repeats

`repeat` is `null` or an object with `kind`, `n`, `unit`, and its end condition. There are two kinds, and they behave differently enough that conflating them would be a mistake:

- **`"schedule"`** — "every 2 weeks", "every Mon & Thu", "monthly". The rule generates the date, so `due` is the *next occurrence*, not a hand-set deadline. `nextOccurrence()` steps the rule until it passes today, rather than jumping once, so a task neglected for a week lands on tomorrow instead of on another date in the past.
- **`"quota"`** — "3 times a week". No date at all; `due` is forced to `""`. The calendar period is the deadline, and progress is `history` entries whose date falls on or after `periodStartISO(unit)`.

Details that exist for a reason:

- **`anchorDay`** (monthly) is why the 31st does not slide to the 28th and stay there. `addMonthsISO` always takes the day from the anchor and clamps it to the target month's length, never from the previous occurrence.
- **`weekAnchor`** (weekly, `n > 1`) marks which weeks count, so "every 2 weeks on Monday" skips the week in between. With `n === 1` it is unused.
- **`days`** empty means "keep the weekday of the date". It is cleared for anything that is not a scheduled weekly repeat, in `normalizeRepeat` and again in `finalizeRepeat`.
- The week starts **Monday** (ISO 8601, and right for a German browser). `mondayOfISO` shifts by `(getDay() + 6) % 7`, not `getDay() - 1`, because `getDay()` puts Sunday at 0.
- Unticking a repeat pops the newest `history` entry and restores `due` from its `was` field — which is why an entry records the occurrence it settled and not just a timestamp. Restoring `""` is meaningful (the repeat had no date yet), so assign it unconditionally.
- `isFinished` is derived from the log and the clock, so an end date takes effect on its own. Nothing is written at the moment a series ends.

### The day changing

Everything date-dependent is computed inside `render()`, so a stale list is fixed by re-rendering — no state to migrate. Two things trigger it: a `setTimeout` to a couple of seconds past the next local midnight (which reschedules itself), and `visibilitychange` / `focus` handlers that compare `todayISO()` against `lastRenderedDay`. **Both are needed** — a suspended laptop fires the timer late or not at all, and the visibility check is what actually catches the common case. `todayISO()` is recomputed at fire time; never close over the old value.

Task names are validated in exactly one place, `validateName(text, field, errorEl, exceptId)`, used by **both** the add form and the dialog's Save. It rejects empty names and duplicates against done and un-done tasks alike, with different wording for each — a completed match points at "Clear completed" as the way out. When a name matches both a done and an un-done task, the un-done one wins the message. Comparison is trimmed and case-insensitive. `exceptId` is what lets a rename skip the task being renamed, which would otherwise always collide with itself.

Errors render through one component, `.form-error` + `.invalid` on the field, driven by `setFieldError` / `clearFieldError`. The element collapses via `:empty` so it costs no layout space when quiet.

A message is `{ text, action }`, where `action` is the optional call to action — rendered as a `<strong class="form-error-action">` that `display: block` puts on its own line. Both parts are set with `textContent`, so this stays within the never-`innerHTML` rule; assigning `text` first also clears any previous action element.

Other conventions in `app.js`:

- Todo shape is `{ id, text, done, emoji, due, history, repeat }`. `id` is a timestamp plus random suffix — treat it as an opaque string. `emoji` is `""` or a single emoji; `due` is `""` or a `YYYY-MM-DD` string. `history` is an array of `{ at, was }`, oldest first, where `at` is a local `"YYYY-MM-DDTHH:MM"` stamp and `was` is the occurrence that completion settled (`""` for a quota repeat). `repeat` is `null` or the rule object above. `load()` runs every stored entry through `normalize()`, so those types are guaranteed by the time anything renders — older todos missing any field come back with a safe default, and entries without a string `id` and `text` are dropped. Rely on that instead of re-guarding at each use.
- `history` is capped at the most recent 400 entries in `normalize()`, so a task ticked daily for years cannot grow `localStorage` without bound. It is also sorted there, because unticking pops the newest off the end.
- **Dates never go through `new Date(string)`.** `new Date("2026-07-30")` parses as UTC midnight and renders as the 29th in any negative-offset timezone. Compare `due` against `todayISO()` as strings (ISO dates sort lexicographically) and build display dates from parts. The same rule covers `history` stamps: slice the date and time apart and compare the pieces — never reparse one.
- Dates are shown via `toLocaleDateString`, so a German browser gets `30.07.2026` and `30. Juli`. That is intended; do not hard-code a format. It does mean the surrounding English wording ("Last done 27. Juli at 18:30") reads mixed — a known cosmetic wart, not a bug to "fix" by pinning a locale.
- Day-of-month arithmetic goes through `addMonthsISO` / `addDaysISO`, never `setMonth` on a shared date object. `daysInMonth` uses the day-0-of-next-month trick.
- `weeksBetween` and `daysUntil` both round after dividing, so a 23- or 25-hour DST day cannot knock the count off by one. Keep the rounding.
- The detail dialog lives **outside the three lists** in the markup, because `render()` rebuilds them on every mutation and would destroy it mid-edit. It holds only `editingId`, a `draftEmoji` and a `draftRepeat`; task data is always re-read from `todos` by id. Everything commits together on Save — except Delete, which acts immediately and closes.
- `syncRepeatUI()` is the dialog's `render()`: it rebuilds every chip row from `draftRepeat` and shows or hides the blocks that apply. Controls write into the draft and then ask for a redraw. The one exception is the interval number field, which calls `syncRepeatChips()` + `syncQuotaStatus()` instead of the full rebuild — rebuilding the field under the cursor would fight the user's typing.
- `setFieldError` only calls `select()` when the field is a text input. `select()` throws `InvalidStateError` on date and number inputs in Chrome, and the repeat validation points at both.
- Repeat validation refuses two things: a scheduled repeat with no first date, and an end date earlier than the first occurrence. Numbers are *clamped* to 1–999 rather than rejected — a stray `0` is a slip, not worth an error message.
- List items are built with `createElement` and `textContent`, never `innerHTML`, so user text cannot inject markup. Keep it that way.
- `load()` wraps `JSON.parse` in try/catch, rejects a non-array, and normalises every entry, so corrupt `localStorage` cannot break startup. This is stronger than a try/catch alone: valid JSON of the wrong shape once reached `due.split()` inside `render()` and blanked the entire list. Any new field must be type-checked in `normalize()`, not trusted. `normalizeRepeat` returns `null` for anything it does not recognise — an unknown `kind` or `unit` degrades the task to a plain one-off rather than throwing — and it downgrades `endKind: "date"` with no date to `"never"`, because a repeat that ends on nothing would never end.
- Optional elements are guarded (`if (clearCompletedBtn)`) — a missing element must not throw and take the whole app down. This was a real bug fix (commit `1acf1c0`); preserve the guards, and follow the same approach for any element that might not be present.
