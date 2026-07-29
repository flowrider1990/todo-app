(function () {
  "use strict";

  const STORAGE_KEY = "todos";
  const THEME_KEY = "theme";
  const SECTIONS_KEY = "sections";

  // A daily task ticked for years would otherwise grow localStorage without
  // bound. Only the tail matters: totals and the current period both read from
  // the end of the log.
  const HISTORY_LIMIT = 400;
  const MAX_COUNT = 999;

  const UNITS = ["day", "week", "month"];
  const KINDS = ["schedule", "quota"];
  const END_KINDS = ["never", "date", "count"];

  const DUE_SHORTCUTS = [
    { label: "Today", days: 0 },
    { label: "Tomorrow", days: 1 },
    { label: "Next week", days: 7 },
  ];

  // Presets, not the whole vocabulary — the custom row below them reaches
  // everything else. `repeat: null` is the "Never" case.
  const REPEAT_PRESETS = [
    { label: "Never", repeat: null },
    { label: "Daily", repeat: { kind: "schedule", n: 1, unit: "day" } },
    { label: "Weekly", repeat: { kind: "schedule", n: 1, unit: "week" } },
    { label: "Monthly", repeat: { kind: "schedule", n: 1, unit: "month" } },
  ];

  const END_PRESETS = [
    { label: "Never", endKind: "never" },
    { label: "On date", endKind: "date" },
    { label: "After…", endKind: "count" },
  ];

  // Monday first, because the week does. The values are getDay() indices, which
  // put Sunday at 0 — hence the odd-looking order.
  const WEEKDAYS = [
    { label: "Mo", value: 1, name: "Monday" },
    { label: "Tu", value: 2, name: "Tuesday" },
    { label: "We", value: 3, name: "Wednesday" },
    { label: "Th", value: 4, name: "Thursday" },
    { label: "Fr", value: 5, name: "Friday" },
    { label: "Sa", value: 6, name: "Saturday" },
    { label: "Su", value: 0, name: "Sunday" },
  ];

  const UNIT_PERIOD = { day: "today", week: "this week", month: "this month" };
  const UNIT_SHORT = { day: "d", week: "w", month: "mo" };
  const UNIT_EVERY = { day: "Daily", week: "Weekly", month: "Monthly" };

  const form = document.getElementById("todo-form");
  const input = document.getElementById("todo-input");
  const emptyState = document.getElementById("empty-state");
  const todoError = document.getElementById("todo-error");
  const clearCompletedBtn = document.getElementById("clear-completed");
  const themeToggleBtn = document.getElementById("theme-toggle");

  const openHeading = document.getElementById("open-heading");
  const sectionOpen = document.getElementById("section-open");
  const sectionLater = document.getElementById("section-later");
  const sectionDone = document.getElementById("section-done");
  const listOpen = document.getElementById("list-open");
  const listLater = document.getElementById("list-later");
  const listDone = document.getElementById("list-done");
  const countOpen = document.getElementById("count-open");
  const countLater = document.getElementById("count-later");
  const countDone = document.getElementById("count-done");

  const dialog = document.getElementById("task-dialog");
  const detailForm = document.getElementById("task-detail-form");
  const detailText = document.getElementById("detail-text");
  const detailError = document.getElementById("detail-error");
  const detailDone = document.getElementById("detail-done");
  const detailDoneRow = document.getElementById("detail-done-row");
  const detailEmoji = document.getElementById("detail-emoji");
  const detailDue = document.getElementById("detail-due");
  const detailDueBlock = document.getElementById("detail-due-block");
  const detailDueLabel = document.getElementById("detail-due-label");
  const detailDueOptional = document.getElementById("detail-due-optional");
  const detailDueClearBtn = document.getElementById("detail-due-clear");
  const detailDueQuick = document.getElementById("detail-due-quick");
  const detailDueHint = document.getElementById("detail-due-hint");
  const detailRepeatQuick = document.getElementById("detail-repeat-quick");
  const detailRepeatCustom = document.getElementById("detail-repeat-custom");
  const detailRepeatKind = document.getElementById("detail-repeat-kind");
  const detailRepeatN = document.getElementById("detail-repeat-n");
  const detailRepeatUnit = document.getElementById("detail-repeat-unit");
  const detailWeekdayBlock = document.getElementById("detail-weekday-block");
  const detailWeekdays = document.getElementById("detail-weekdays");
  const detailQuotaStatus = document.getElementById("detail-quota-status");
  const detailEndBlock = document.getElementById("detail-end-block");
  const detailEndQuick = document.getElementById("detail-end-quick");
  const detailEndDateRow = document.getElementById("detail-end-date-row");
  const detailEndDate = document.getElementById("detail-end-date");
  const detailEndCountRow = document.getElementById("detail-end-count-row");
  const detailEndCount = document.getElementById("detail-end-count");
  const detailRepeatError = document.getElementById("detail-repeat-error");
  const detailHistory = document.getElementById("detail-history");
  const detailDeleteBtn = document.getElementById("detail-delete");
  const detailCancelBtn = document.getElementById("detail-cancel");

  // Grouped by theme, and sized so the picker fills whole rows alongside the
  // clear button. Older BMP symbols (✈ ❤ 🏋 🍽 🏖 🗺) carry U+FE0F so they
  // render as emoji rather than monochrome text glyphs.
  const EMOJI_CHOICES = [
    // work
    "💼", "💻", "📧", "📞", "📅", "📝", "📊",
    // home
    "🏠", "🧹", "🧺", "🔧", "🌱",
    // errands and money
    "🛒", "📦", "🎁", "🏦", "💰", "💳",
    // health
    "🏋️", "🏃", "🧘", "💊", "🩺", "😴",
    // learning
    "📚", "🎓", "🧠", "🎨",
    // food
    "🍽️", "☕", "🍎", "🎂",
    // travel
    "✈️", "🚗", "🏖️", "🗺️",
    // life
    "🎵", "🐶", "🎉", "❤️",
    // priority
    "⭐", "🔥", "⏰", "🚩",
  ];

  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

  let todos = load();
  // null means "no explicit choice yet" — follow the OS until the user picks.
  let theme = loadTheme();
  let sections = loadSections();

  // Which todo the dialog is editing, and its uncommitted emoji and repeat.
  // Both exist because their controls are buttons rather than form fields, so
  // they have nowhere else to hold a draft. Neither is task state.
  let editingId = null;
  let draftEmoji = "";
  let draftRepeat = null;
  // The palette stays collapsed behind the trigger until asked for.
  let emojiExpanded = false;

  // The row to flash on the next render, so ticking off a repeating task is
  // visibly acknowledged even when the checkbox does not stay ticked.
  let flashId = null;

  // The day the list was last drawn for. Everything date-dependent is derived
  // at draw time, so noticing this changed and redrawing is the whole of the
  // day-rollover fix — there is no stored state to migrate.
  let lastRenderedDay = "";
  let midnightTimer = null;

  /* ---------- storage ---------- */

  function isDueString(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function isStamp(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value);
  }

  function clampCount(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return 1;
    return Math.min(MAX_COUNT, Math.max(1, n));
  }

  // 0 means "not set" — fall back to the day-of-month of the due date.
  function clampAnchorDay(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < 1 || n > 31) return 0;
    return n;
  }

  function normalizeHistoryEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    if (!isStamp(entry.at)) return null;
    // `was` records which occurrence this completion settled, so unticking can
    // put the date back where it was.
    return { at: entry.at, was: isDueString(entry.was) ? entry.was : "" };
  }

  function normalizeHistory(raw) {
    if (!Array.isArray(raw)) return [];
    const list = raw.map(normalizeHistoryEntry).filter(Boolean);
    // Oldest first, because undo pops the newest off the end.
    list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    return list.slice(-HISTORY_LIMIT);
  }

  function normalizeRepeat(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (KINDS.indexOf(raw.kind) < 0) return null;
    if (UNITS.indexOf(raw.unit) < 0) return null;

    const scheduledWeekly = raw.kind === "schedule" && raw.unit === "week";
    const days = Array.isArray(raw.days)
      ? raw.days
          .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
          .filter((d, i, all) => all.indexOf(d) === i)
          .sort((a, b) => a - b)
      : [];

    let endKind = END_KINDS.indexOf(raw.endKind) >= 0 ? raw.endKind : "never";
    const endDate = isDueString(raw.endDate) ? raw.endDate : "";
    // An end date that did not survive validation cannot be honoured; falling
    // back to "never" is safer than a repeat that ends on nothing.
    if (endKind === "date" && !endDate) endKind = "never";

    return {
      kind: raw.kind,
      n: clampCount(raw.n),
      unit: raw.unit,
      days: scheduledWeekly ? days : [],
      weekAnchor: isDueString(raw.weekAnchor) ? raw.weekAnchor : "",
      anchorDay: clampAnchorDay(raw.anchorDay),
      endKind: endKind,
      endDate: endDate,
      endCount: clampCount(raw.endCount),
    };
  }

  // JSON.parse only guarantees valid JSON, not a usable todo. Without this,
  // a hand-edited due of the wrong type reaches due.split() in formatDue and
  // throws inside render(), blanking the whole list at startup. Every new
  // field is type-checked here so nothing downstream has to re-guard.
  function normalize(entry) {
    if (!entry || typeof entry !== "object") return null;
    if (typeof entry.id !== "string" || typeof entry.text !== "string") return null;
    return {
      id: entry.id,
      text: entry.text,
      done: entry.done === true,
      emoji: typeof entry.emoji === "string" ? entry.emoji : "",
      due: isDueString(entry.due) ? entry.due : "",
      history: normalizeHistory(entry.history),
      repeat: normalizeRepeat(entry.repeat),
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalize).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }

  function loadTheme() {
    try {
      const raw = localStorage.getItem(THEME_KEY);
      return raw === "light" || raw === "dark" ? raw : null;
    } catch (e) {
      return null;
    }
  }

  function saveTheme() {
    localStorage.setItem(THEME_KEY, theme);
  }

  function loadSections() {
    try {
      const raw = localStorage.getItem(SECTIONS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== "object") return { later: false, done: false };
      return { later: parsed.later === true, done: parsed.done === true };
    } catch (e) {
      return { later: false, done: false };
    }
  }

  function saveSections() {
    localStorage.setItem(SECTIONS_KEY, JSON.stringify(sections));
  }

  /* ---------- theme ---------- */

  function resolvedTheme() {
    return theme || (darkQuery.matches ? "dark" : "light");
  }

  function toggleTheme() {
    theme = resolvedTheme() === "dark" ? "light" : "dark";
    saveTheme();
    applyTheme();
  }

  function applyTheme() {
    const dark = resolvedTheme() === "dark";
    document.body.classList.toggle("theme-dark", dark);

    if (themeToggleBtn) {
      // The icon shows the action, not the current state.
      const label = dark ? "Switch to light theme" : "Switch to dark theme";
      themeToggleBtn.textContent = dark ? "☀" : "☾";
      themeToggleBtn.setAttribute("aria-label", label);
      themeToggleBtn.title = label;
    }
  }

  /* ---------- dates ---------- */

  // Dates are stored as the "YYYY-MM-DD" string <input type="date"> produces.
  // Never pass that string to new Date() — it parses as UTC midnight, which
  // renders as the previous day in any negative-offset timezone. Compare the
  // strings instead (ISO dates sort lexicographically) and build from parts.
  // Completion stamps follow the same rule: "YYYY-MM-DDTHH:MM" in local time,
  // sliced apart for comparison and never reparsed.

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function isoFrom(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function todayISO() {
    return isoFrom(new Date());
  }

  function nowStamp() {
    const now = new Date();
    return isoFrom(now) + "T" + pad(now.getHours()) + ":" + pad(now.getMinutes());
  }

  // setDate rolls month and year boundaries over correctly.
  function shiftISO(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return isoFrom(date);
  }

  // Built from parts, so the result is local midnight rather than the UTC
  // midnight new Date("2026-07-30") would give.
  function dateFromISO(due) {
    const parts = due.split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function addDaysISO(iso, days) {
    const date = dateFromISO(iso);
    date.setDate(date.getDate() + days);
    return isoFrom(date);
  }

  function daysInMonth(year, month) {
    // Day 0 of the next month is the last day of this one.
    return new Date(year, month + 1, 0).getDate();
  }

  // anchorDay is what keeps a monthly repeat off the 31st → 28th → 28th slide:
  // the target day always comes from the anchor, clamped to the month length,
  // never from the previous occurrence.
  function addMonthsISO(iso, months, anchorDay) {
    const year = Number(iso.slice(0, 4));
    const total = Number(iso.slice(5, 7)) - 1 + months;
    const targetYear = year + Math.floor(total / 12);
    const targetMonth = ((total % 12) + 12) % 12;
    const wanted = anchorDay || Number(iso.slice(8, 10));
    const day = Math.min(wanted, daysInMonth(targetYear, targetMonth));
    return targetYear + "-" + pad(targetMonth + 1) + "-" + pad(day);
  }

  function weekdayOf(iso) {
    return dateFromISO(iso).getDay();
  }

  // The week starts Monday (ISO 8601). getDay() puts Sunday at 0, so the shift
  // is (day + 6) % 7 rather than day - 1.
  function mondayOfISO(iso) {
    return addDaysISO(iso, -((weekdayOf(iso) + 6) % 7));
  }

  // Both arguments are Mondays at local midnight, and the result is rounded, so
  // a 23- or 25-hour DST week cannot knock the count off by one.
  function weeksBetween(fromISO, toISO) {
    const diff = dateFromISO(toISO) - dateFromISO(fromISO);
    return Math.round(diff / (7 * 86400000));
  }

  function periodStartISO(unit) {
    const today = todayISO();
    if (unit === "day") return today;
    if (unit === "week") return mondayOfISO(today);
    return today.slice(0, 8) + "01";
  }

  function periodEndISO(unit) {
    const start = periodStartISO(unit);
    if (unit === "day") return start;
    if (unit === "week") return addDaysISO(start, 6);
    const year = Number(start.slice(0, 4));
    const month = Number(start.slice(5, 7)) - 1;
    return start.slice(0, 8) + pad(daysInMonth(year, month));
  }

  // Both sides are pinned to local midnight before diffing, and rounded, so a
  // 23- or 25-hour DST day cannot knock the count off by one.
  function daysUntil(due) {
    const target = dateFromISO(due);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target - start) / 86400000);
  }

  function describeDue(due) {
    const diff = daysUntil(due);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    if (diff > 0) return "in " + diff + " days";
    return Math.abs(diff) + " days ago";
  }

  function formatDue(due, today) {
    if (due === today) return "Today";

    const options = { month: "short", day: "numeric" };
    if (due.slice(0, 4) !== today.slice(0, 4)) options.year = "numeric";
    return dateFromISO(due).toLocaleDateString(undefined, options);
  }

  function formatLongDate(iso) {
    return dateFromISO(iso).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }

  function describeStamp(stamp) {
    const date = stamp.slice(0, 10);
    const time = stamp.slice(11, 16);
    const today = todayISO();
    let when;
    if (date === today) when = "today";
    else if (date === shiftISO(-1)) when = "yesterday";
    else when = formatDue(date, today);
    return when + " at " + time;
  }

  /* ---------- repeats (all derived, nothing cached) ---------- */

  function totalDone(todo) {
    return todo.history.length;
  }

  // How many completions fall inside the period we are in right now. This is
  // what replaces a stored counter: there is no reset to schedule, because
  // moving into a new period simply changes which entries are counted.
  function periodDone(todo, repeat) {
    const rule = repeat || todo.repeat;
    if (!rule) return 0;
    const start = periodStartISO(rule.unit);
    return todo.history.filter((entry) => entry.at.slice(0, 10) >= start).length;
  }

  // One step of the repeat rule. Kept separate from nextOccurrence so the
  // "keep stepping until it is in the future" loop stays readable.
  function stepOnce(iso, repeat) {
    if (repeat.unit === "day") return addDaysISO(iso, repeat.n);
    if (repeat.unit === "month") return addMonthsISO(iso, repeat.n, repeat.anchorDay);

    if (!repeat.days.length) return addDaysISO(iso, 7 * repeat.n);

    // Specific weekdays: walk forward a day at a time to the next selected one,
    // skipping whole weeks when the interval is more than 1. The anchor pins
    // which weeks count; without it every week is allowed.
    const anchor = repeat.weekAnchor;
    let candidate = addDaysISO(iso, 1);
    for (let i = 0; i < 7 * repeat.n + 7; i++) {
      const weekOK =
        repeat.n === 1 ||
        !anchor ||
        weeksBetween(anchor, mondayOfISO(candidate)) % repeat.n === 0;
      if (repeat.days.indexOf(weekdayOf(candidate)) >= 0 && weekOK) return candidate;
      candidate = addDaysISO(candidate, 1);
    }
    return addDaysISO(iso, 7 * repeat.n);
  }

  // The next occurrence strictly after today. Stepping rather than jumping is
  // what makes a neglected daily task land on tomorrow instead of on yet
  // another date in the past.
  function nextOccurrence(todo) {
    const repeat = todo.repeat;
    if (!repeat || repeat.kind !== "schedule") return "";

    const today = todayISO();
    let current = todo.due || today;
    for (let i = 0; i < 2000; i++) {
      const next = stepOnce(current, repeat);
      // Defensive: a rule that fails to move forward would otherwise spin.
      if (next <= current) break;
      current = next;
      if (current > today) break;
    }
    return current;
  }

  // A series is over when its end condition is met. Derived, so nothing has to
  // be written at the moment it happens — and an end date takes effect on its
  // own as the clock moves past it.
  function isFinished(todo) {
    const repeat = todo.repeat;
    if (!repeat) return false;
    if (repeat.endKind === "count") return totalDone(todo) >= repeat.endCount;
    if (repeat.endKind === "date") {
      if (!repeat.endDate) return false;
      if (repeat.kind === "quota") return todayISO() > repeat.endDate;
      return !!todo.due && todo.due > repeat.endDate;
    }
    return false;
  }

  function hasActiveRepeat(todo) {
    return !!todo.repeat && !isFinished(todo);
  }

  // "open" — waiting for you. "later" — a repeat that is satisfied for now and
  // will come back on its own. "done" — finished, and clearable.
  function sectionOf(todo, today) {
    if (todo.repeat) {
      if (isFinished(todo)) return "done";
      if (todo.repeat.kind === "quota") {
        return periodDone(todo) >= todo.repeat.n ? "later" : "open";
      }
      return todo.due && todo.due > today ? "later" : "open";
    }
    return todo.done ? "done" : "open";
  }

  // For a repeating task the tick state is derived, not stored: it is ticked
  // exactly when it is not waiting for you.
  function isChecked(todo, today) {
    if (todo.repeat) return sectionOf(todo, today) !== "open";
    return todo.done;
  }

  function weekdayNames(days) {
    return WEEKDAYS.filter((d) => days.indexOf(d.value) >= 0)
      .map((d) => d.label)
      .join(", ");
  }

  function describeInterval(repeat) {
    if (repeat.kind === "quota") {
      const times = repeat.n === 1 ? "Once" : repeat.n + " times";
      return times + " a " + repeat.unit;
    }
    let phrase = repeat.n === 1 ? UNIT_EVERY[repeat.unit] : "Every " + repeat.n + " " + repeat.unit + "s";
    if (repeat.unit === "week" && repeat.days.length) {
      phrase += " on " + weekdayNames(repeat.days);
    }
    return phrase;
  }

  // The long form, for tooltips and screen readers.
  function describeRepeat(todo) {
    const repeat = todo.repeat;
    if (!repeat) return "";
    let phrase = describeInterval(repeat);
    if (repeat.endKind === "date" && repeat.endDate) {
      phrase += ", until " + formatLongDate(repeat.endDate);
    } else if (repeat.endKind === "count") {
      phrase += ", " + repeat.endCount + " times in total";
    }
    if (isFinished(todo)) return phrase + " — finished";
    const total = totalDone(todo);
    if (total) phrase += " (done " + total + (total === 1 ? " time" : " times") + " so far)";
    return phrase;
  }

  // The badge text, split so CSS can drop the wordy half on a narrow screen —
  // there the ↻ alone says "this comes back" and the full phrase is still in
  // title/aria-label. `keep` marks text that must survive that: a quota's
  // progress is the only place its status is shown.
  function shortRepeat(todo) {
    const repeat = todo.repeat;
    if (isFinished(todo)) return { text: "finished", keep: false };
    if (repeat.kind === "quota") return { text: periodDone(todo) + "/" + repeat.n, keep: true };
    if (repeat.n === 1) return { text: UNIT_EVERY[repeat.unit].toLowerCase(), keep: false };
    return { text: repeat.n + UNIT_SHORT[repeat.unit], keep: false };
  }

  /* ---------- mutations: always mutate → save → render ---------- */

  function addTodo(text) {
    todos.push({
      id: String(Date.now()) + Math.random().toString(16).slice(2),
      text: text,
      done: false,
      emoji: "",
      due: "",
      history: [],
      repeat: null,
    });
    save();
    render();
  }

  function completeRepeat(todo) {
    // The occurrence being settled has to be read before the date moves on,
    // so unticking can put it back.
    const entry = { at: nowStamp(), was: todo.repeat.kind === "schedule" ? todo.due : "" };
    const next = todo.repeat.kind === "schedule" ? nextOccurrence(todo) : "";

    todo.history.push(entry);
    if (todo.history.length > HISTORY_LIMIT) {
      todo.history = todo.history.slice(-HISTORY_LIMIT);
    }
    if (todo.repeat.kind === "schedule") todo.due = next;
    flashId = todo.id;
  }

  function uncompleteRepeat(todo) {
    const entry = todo.history.pop();
    if (!entry) return;
    // "" is a meaningful restore: it means the repeat had no date set yet.
    if (todo.repeat.kind === "schedule") todo.due = entry.was;
    flashId = todo.id;
  }

  function toggleTodo(id) {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;

    if (todo.repeat) {
      if (isChecked(todo, todayISO())) uncompleteRepeat(todo);
      else completeRepeat(todo);
    } else {
      todo.done = !todo.done;
    }

    save();
    render();
  }

  function deleteTodo(id) {
    todos = todos.filter((t) => t.id !== id);
    save();
    render();
  }

  // Only what sits in the Done section goes, which is why an active repeat is
  // safe here without a special case: it is never in that section.
  function clearCompleted() {
    const today = todayISO();
    todos = todos.filter((t) => sectionOf(t, today) !== "done");
    save();
    render();
  }

  /* ---------- name validation ---------- */

  // Done and un-done tasks both block, but the wording differs, so this
  // returns the match rather than a boolean. An open duplicate wins when both
  // exist — it is the more actionable of the two. exceptId lets a rename skip
  // the task being renamed, which would otherwise always match itself.
  function findDuplicate(text, exceptId) {
    const needle = text.toLowerCase();
    const matches = todos.filter(
      (t) => t.id !== exceptId && t.text.toLowerCase() === needle
    );
    return matches.find((t) => !t.done) || matches[0] || null;
  }

  // { text, action }: the statement, then the call to action, which renders
  // bold on its own line. action is optional.
  function duplicateMessage(duplicate) {
    return duplicate.done
      ? {
          text: "A completed task with that name already exists.",
          action: "Choose a different name or clear the list.",
        }
      : {
          text: "A task with that name already exists.",
          action: "Please choose a different name.",
        };
  }

  // One error component, used by the add form and the detail dialog alike.
  function setFieldError(field, errorEl, message) {
    if (errorEl) {
      // Assigning textContent first also clears any previous action element.
      errorEl.textContent = message.text;
      if (message.action) {
        const action = document.createElement("strong");
        action.className = "form-error-action";
        action.textContent = message.action;
        errorEl.appendChild(action);
      }
    }
    if (!field) return;
    field.classList.add("invalid");
    field.focus();
    // select() throws InvalidStateError on date and number inputs in Chrome,
    // so it is only safe on the text fields.
    if (field.type === "text") field.select();
  }

  function clearFieldError(field, errorEl) {
    if (errorEl) errorEl.textContent = "";
    if (field) field.classList.remove("invalid");
  }

  // Shared by both forms: empty and duplicate names are rejected identically
  // whether you are creating a task or renaming one.
  function validateName(text, field, errorEl, exceptId) {
    if (!text) {
      setFieldError(field, errorEl, { text: "Give the task a name." });
      return false;
    }

    const duplicate = findDuplicate(text, exceptId);
    if (duplicate) {
      setFieldError(field, errorEl, duplicateMessage(duplicate));
      return false;
    }

    clearFieldError(field, errorEl);
    return true;
  }

  /* ---------- rendering ---------- */

  function show(el, visible) {
    if (el) el.classList.toggle("hidden", !visible);
  }

  function buildRow(todo, today) {
    const li = document.createElement("li");
    const checked = isChecked(todo, today);
    li.className =
      "todo-item" + (checked ? " done" : "") + (todo.id === flashId ? " flash" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.setAttribute("aria-label", checked ? "Reopen task" : "Mark task done");
    checkbox.addEventListener("change", () => toggleTodo(todo.id));

    // A button, not a span: click, Enter/Space and focus come for free.
    const textBtn = document.createElement("button");
    textBtn.className = "text";
    textBtn.type = "button";
    textBtn.textContent = todo.text;
    textBtn.addEventListener("click", () => openTaskDialog(todo.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.type = "button";
    deleteBtn.textContent = "×";
    deleteBtn.setAttribute("aria-label", "Delete task");
    deleteBtn.addEventListener("click", () => deleteTodo(todo.id));

    li.append(checkbox);

    if (todo.emoji) {
      const emojiSpan = document.createElement("span");
      emojiSpan.className = "emoji";
      emojiSpan.textContent = todo.emoji;
      li.append(emojiSpan);
    }

    li.append(textBtn);

    if (todo.repeat) {
      const badge = document.createElement("span");
      badge.className = "repeat-badge" + (isFinished(todo) ? " finished" : "");

      const icon = document.createElement("span");
      icon.textContent = "↻";
      badge.append(icon);

      const part = shortRepeat(todo);
      const detail = document.createElement("span");
      detail.className = "repeat-detail" + (part.keep ? " keep" : "");
      detail.textContent = part.text;
      badge.append(detail);

      const full = describeRepeat(todo);
      badge.title = full;
      badge.setAttribute("aria-label", full);
      li.append(badge);
    }

    // A quota repeat has no date, and a finished series shows its outcome
    // rather than a date that is no longer meaningful.
    const showDue = todo.due && !(todo.repeat && (todo.repeat.kind === "quota" || isFinished(todo)));
    if (showDue) {
      const badge = document.createElement("span");
      let state = "";
      if (todo.due < today) state = " overdue";
      else if (todo.due === today) state = " due-today";
      badge.className = "due-badge" + state;
      badge.textContent = formatDue(todo.due, today);
      li.append(badge);
    }

    li.append(deleteBtn);
    return li;
  }

  function fillList(listEl, items, today) {
    listEl.innerHTML = "";
    items.forEach((todo) => listEl.appendChild(buildRow(todo, today)));
  }

  function render() {
    const today = todayISO();
    lastRenderedDay = today;

    const buckets = { open: [], later: [], done: [] };
    todos.forEach((todo) => buckets[sectionOf(todo, today)].push(todo));

    fillList(listOpen, buckets.open, today);
    fillList(listLater, buckets.later, today);
    fillList(listDone, buckets.done, today);

    if (countOpen) countOpen.textContent = String(buckets.open.length);
    if (countLater) countLater.textContent = String(buckets.later.length);
    if (countDone) countDone.textContent = String(buckets.done.length);

    show(sectionOpen, buckets.open.length > 0);
    show(sectionLater, buckets.later.length > 0);
    show(sectionDone, buckets.done.length > 0);
    // With nothing to tell it apart from, the "Open" heading is just noise.
    show(openHeading, buckets.open.length > 0 && (buckets.later.length > 0 || buckets.done.length > 0));

    if (sectionLater) sectionLater.open = sections.later;
    if (sectionDone) sectionDone.open = sections.done;

    emptyState.classList.toggle("hidden", todos.length > 0);
    if (clearCompletedBtn) clearCompletedBtn.disabled = buckets.done.length === 0;

    // One flash per mutation, and only on the row that caused it.
    flashId = null;
  }

  /* ---------- day rollover ---------- */

  // Timers alone are not enough: a suspended laptop fires them late or not at
  // all, so becoming visible or focused re-checks the date as well.
  function refreshIfDayChanged() {
    if (todayISO() !== lastRenderedDay) render();
  }

  function scheduleMidnightRefresh() {
    if (midnightTimer) clearTimeout(midnightTimer);
    const now = new Date();
    // A couple of seconds past midnight, so the new date is unambiguous.
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
    const delay = Math.max(1000, next - now);
    midnightTimer = setTimeout(() => {
      render();
      scheduleMidnightRefresh();
    }, delay);
  }

  /* ---------- detail dialog ---------- */

  function openTaskDialog(id) {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;
    // A missing dialog must not take the list down with it.
    if (!dialog || !detailText || !detailDone || !detailDue) return;

    editingId = id;
    draftEmoji = todo.emoji || "";
    draftRepeat = todo.repeat ? normalizeRepeat(todo.repeat) : null;
    emojiExpanded = false;

    detailText.value = todo.text;
    clearFieldError(detailText, detailError);
    clearFieldError(null, detailRepeatError);
    detailDone.checked = todo.done;
    detailDue.value = todo.due || "";
    if (detailEndDate) detailEndDate.value = draftRepeat ? draftRepeat.endDate : "";
    if (detailEndCount) detailEndCount.value = draftRepeat ? String(draftRepeat.endCount) : "1";

    renderEmojiPicker();
    syncRepeatUI();

    dialog.showModal();
    detailText.focus();
    detailText.select();
  }

  function editingTodo() {
    return todos.find((t) => t.id === editingId) || null;
  }

  // Everything that reacts to the due value: the clear button (Chrome and
  // Safari offer no way to empty a date input once set), the relative hint,
  // and the shortcut chips. Rebuilt wholesale, like render().
  function syncDueUI() {
    const value = detailDue ? detailDue.value : "";
    const today = todayISO();

    show(detailDueClearBtn, !!value);

    if (detailDueHint) {
      detailDueHint.textContent = value ? describeDue(value) : "";
      let state = "";
      if (value && value < today) state = " overdue";
      else if (value && value === today) state = " due-today";
      detailDueHint.className = "due-hint" + state;
    }

    if (detailDueQuick) {
      detailDueQuick.innerHTML = "";
      DUE_SHORTCUTS.forEach((shortcut) => {
        const iso = shiftISO(shortcut.days);
        const active = iso === value;
        const btn = chipButton(shortcut.label, active, () => {
          // Clicking the active chip again clears it.
          detailDue.value = active ? "" : iso;
          syncDueUI();
        });
        detailDueQuick.appendChild(btn);
      });
    }
  }

  function chipButton(label, active, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip" + (active ? " active" : "");
    btn.textContent = label;
    btn.setAttribute("aria-pressed", String(active));
    btn.addEventListener("click", onClick);
    return btn;
  }

  function sameRepeatPreset(preset) {
    if (!preset) return !draftRepeat;
    if (!draftRepeat) return false;
    return (
      draftRepeat.kind === preset.kind &&
      draftRepeat.n === preset.n &&
      draftRepeat.unit === preset.unit &&
      !draftRepeat.days.length
    );
  }

  function applyRepeatPreset(preset) {
    if (!preset) {
      draftRepeat = null;
    } else {
      draftRepeat = normalizeRepeat({
        kind: preset.kind,
        n: preset.n,
        unit: preset.unit,
        endKind: draftRepeat ? draftRepeat.endKind : "never",
        endDate: draftRepeat ? draftRepeat.endDate : "",
        endCount: draftRepeat ? draftRepeat.endCount : 1,
      });
      // A scheduled repeat needs a first date to count from; today is the
      // least surprising default and saves an error on Save.
      if (draftRepeat.kind === "schedule" && detailDue && !detailDue.value) {
        detailDue.value = todayISO();
      }
    }
    clearFieldError(null, detailRepeatError);
    syncRepeatUI();
  }

  // Split out so typing in the interval field can refresh the presets without
  // rebuilding the field underneath the cursor.
  function syncRepeatChips() {
    if (!detailRepeatQuick) return;
    detailRepeatQuick.innerHTML = "";
    REPEAT_PRESETS.forEach((preset) => {
      detailRepeatQuick.appendChild(
        chipButton(preset.label, sameRepeatPreset(preset.repeat), () =>
          applyRepeatPreset(preset.repeat)
        )
      );
    });
  }

  // Rebuilt wholesale from draftRepeat, like render() and syncDueUI(): every
  // control writes into the draft and then asks for a redraw.
  function syncRepeatUI() {
    const repeat = draftRepeat;
    const scheduled = !!repeat && repeat.kind === "schedule";
    const quota = !!repeat && repeat.kind === "quota";

    syncRepeatChips();

    show(detailRepeatCustom, !!repeat);
    show(detailWeekdayBlock, scheduled && repeat.unit === "week");
    show(detailEndBlock, !!repeat);
    show(detailQuotaStatus, quota);
    // Being done is derived for an active repeat, so there is nothing to tick.
    show(detailDoneRow, !repeat);
    // A quota repeat has no date at all — the calendar period is the deadline.
    show(detailDueBlock, !quota);

    if (repeat) {
      if (detailRepeatKind) detailRepeatKind.value = repeat.kind;
      if (detailRepeatN) detailRepeatN.value = String(repeat.n);
      if (detailRepeatUnit) detailRepeatUnit.value = repeat.unit;
    }

    if (detailDueLabel) detailDueLabel.textContent = scheduled ? "Next one due" : "Due date";
    show(detailDueOptional, !repeat);

    if (detailWeekdays) {
      detailWeekdays.innerHTML = "";
      WEEKDAYS.forEach((day) => {
        const active = !!repeat && repeat.days.indexOf(day.value) >= 0;
        const btn = chipButton(day.label, active, () => {
          if (!draftRepeat) return;
          const days = draftRepeat.days.slice();
          const at = days.indexOf(day.value);
          if (at >= 0) days.splice(at, 1);
          else days.push(day.value);
          draftRepeat.days = days.sort((a, b) => a - b);
          syncRepeatUI();
        });
        btn.setAttribute("aria-label", day.name);
        detailWeekdays.appendChild(btn);
      });
    }

    if (detailEndQuick) {
      detailEndQuick.innerHTML = "";
      END_PRESETS.forEach((preset) => {
        const active = !!repeat && repeat.endKind === preset.endKind;
        detailEndQuick.appendChild(
          chipButton(preset.label, active, () => {
            if (!draftRepeat) return;
            draftRepeat.endKind = preset.endKind;
            clearFieldError(detailEndDate, detailRepeatError);
            syncRepeatUI();
          })
        );
      });
    }

    show(detailEndDateRow, !!repeat && repeat.endKind === "date");
    show(detailEndCountRow, !!repeat && repeat.endKind === "count");

    syncDueUI();
    syncQuotaStatus();
    syncHistoryLine();
  }

  function syncQuotaStatus() {
    if (!detailQuotaStatus) return;
    const todo = editingTodo();
    if (!todo || !draftRepeat || draftRepeat.kind !== "quota") {
      detailQuotaStatus.textContent = "";
      return;
    }

    const done = periodDone(todo, draftRepeat);
    const unit = draftRepeat.unit;
    let text = done + " of " + draftRepeat.n + " done " + UNIT_PERIOD[unit];
    if (unit !== "day") {
      text += " (" + formatLongDate(periodStartISO(unit)) + " – " + formatLongDate(periodEndISO(unit)) + ")";
    }
    if (done >= draftRepeat.n) text += " — done for now.";
    detailQuotaStatus.textContent = text;
  }

  function syncHistoryLine() {
    if (!detailHistory) return;
    const todo = editingTodo();
    const total = todo ? totalDone(todo) : 0;
    if (!todo || !draftRepeat || !total) {
      detailHistory.textContent = "";
      show(detailHistory, false);
      return;
    }
    const last = todo.history[total - 1];
    detailHistory.textContent =
      "Last done " + describeStamp(last.at) + " · " + total + (total === 1 ? " time" : " times") + " in total";
    show(detailHistory, true);
  }

  function chooseEmoji(emoji) {
    draftEmoji = emoji;
    emojiExpanded = false;
    renderEmojiPicker(true);
  }

  function renderEmojiPicker(focusTrigger) {
    if (!detailEmoji) return;
    detailEmoji.innerHTML = "";

    // Collapsed state: a single button showing the current choice, or ⊘ for
    // none. The full palette only appears once it is clicked.
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "emoji-trigger" + (draftEmoji ? " has-emoji" : "");
    trigger.textContent = draftEmoji || "⊘";
    trigger.setAttribute("aria-label", draftEmoji ? "Change emoji" : "Choose an emoji");
    trigger.setAttribute("aria-expanded", String(emojiExpanded));
    trigger.addEventListener("click", () => {
      emojiExpanded = !emojiExpanded;
      renderEmojiPicker(true);
    });
    detailEmoji.appendChild(trigger);

    if (emojiExpanded) {
      const grid = document.createElement("div");
      grid.className = "emoji-grid";

      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "emoji-option clear" + (draftEmoji ? "" : " selected");
      clearBtn.textContent = "⊘";
      clearBtn.setAttribute("aria-label", "No emoji");
      clearBtn.setAttribute("aria-pressed", String(!draftEmoji));
      clearBtn.addEventListener("click", () => chooseEmoji(""));
      grid.appendChild(clearBtn);

      EMOJI_CHOICES.forEach((emoji) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "emoji-option" + (emoji === draftEmoji ? " selected" : "");
        btn.textContent = emoji;
        btn.setAttribute("aria-label", "Emoji " + emoji);
        btn.setAttribute("aria-pressed", String(emoji === draftEmoji));
        btn.addEventListener("click", () => chooseEmoji(emoji));
        grid.appendChild(btn);
      });

      detailEmoji.appendChild(grid);
    }

    // The rebuild drops focus to the body, so hand it back to the trigger.
    if (focusTrigger) trigger.focus();
  }

  // Repeat settings that only make sense once the dates are known: the monthly
  // anchor and the week anchor are both read off the first occurrence.
  function finalizeRepeat(repeat, due) {
    if (!repeat) return null;
    const settled = normalizeRepeat(repeat);
    if (settled.kind === "quota") {
      settled.days = [];
      settled.weekAnchor = "";
      settled.anchorDay = 0;
      return settled;
    }
    if (settled.unit === "month" && due) settled.anchorDay = Number(due.slice(8, 10));
    if (settled.unit === "week" && due) settled.weekAnchor = mondayOfISO(due);
    return settled;
  }

  function validateRepeat(due) {
    if (!draftRepeat) return true;

    if (draftRepeat.kind === "schedule" && !due) {
      setFieldError(detailDue, detailRepeatError, {
        text: "A repeating task needs a first date.",
        action: "Pick when the next one is due.",
      });
      return false;
    }

    if (draftRepeat.endKind === "date") {
      const endDate = detailEndDate ? detailEndDate.value : "";
      if (!endDate) {
        setFieldError(detailEndDate, detailRepeatError, {
          text: "No end date set.",
          action: "Pick a date, or choose Never.",
        });
        return false;
      }
      const first = draftRepeat.kind === "schedule" ? due : todayISO();
      if (endDate < first) {
        setFieldError(detailEndDate, detailRepeatError, {
          text: "That end date has already passed the first occurrence.",
          action: "Pick a later date.",
        });
        return false;
      }
    }

    clearFieldError(detailEndDate, detailRepeatError);
    clearFieldError(detailDue, detailRepeatError);
    return true;
  }

  function saveTaskDetails() {
    const todo = editingTodo();
    if (!todo) return;

    const text = detailText.value.trim();
    // exceptId, or the task would collide with its own unchanged name.
    if (!validateName(text, detailText, detailError, editingId)) return;

    // Read the number fields back into the draft, clamped rather than rejected:
    // a stray 0 is a slip, not something worth an error message over.
    if (draftRepeat) {
      if (detailRepeatN) draftRepeat.n = clampCount(detailRepeatN.value);
      if (detailEndCount) draftRepeat.endCount = clampCount(detailEndCount.value);
      if (detailEndDate) draftRepeat.endDate = isDueString(detailEndDate.value) ? detailEndDate.value : "";
    }

    const quota = !!draftRepeat && draftRepeat.kind === "quota";
    const due = quota ? "" : detailDue.value;
    if (!validateRepeat(due)) return;

    todo.text = text;
    todo.emoji = draftEmoji;
    todo.due = due;
    todo.repeat = finalizeRepeat(draftRepeat, due);
    // Only a one-off task carries a stored done flag; for a repeat it is
    // derived from the completion log.
    todo.done = todo.repeat ? false : detailDone.checked;

    save();
    render();
    dialog.close();
  }

  function deleteEditingTask() {
    const id = editingId;
    dialog.close();
    if (id) deleteTodo(id);
  }

  /* ---------- wiring ---------- */

  if (clearCompletedBtn) {
    clearCompletedBtn.addEventListener("click", clearCompleted);
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", toggleTheme);
  }

  [
    { el: sectionLater, key: "later" },
    { el: sectionDone, key: "done" },
  ].forEach((entry) => {
    if (!entry.el) return;
    // <details> gives us the disclosure for free; we only remember the state.
    entry.el.addEventListener("toggle", () => {
      if (sections[entry.key] === entry.el.open) return;
      sections[entry.key] = entry.el.open;
      saveSections();
    });
  });

  if (detailForm) {
    detailForm.addEventListener("submit", (e) => {
      e.preventDefault();
      saveTaskDetails();
    });
  }

  if (detailText) {
    detailText.addEventListener("input", () => clearFieldError(detailText, detailError));
  }

  if (detailDue) {
    detailDue.addEventListener("input", syncRepeatUI);
    detailDue.addEventListener("change", syncRepeatUI);
  }

  if (detailDueClearBtn) {
    detailDueClearBtn.addEventListener("click", () => {
      detailDue.value = "";
      syncRepeatUI();
      detailDue.focus();
    });
  }

  if (detailRepeatKind) {
    detailRepeatKind.addEventListener("change", () => {
      if (!draftRepeat) return;
      draftRepeat.kind = KINDS.indexOf(detailRepeatKind.value) >= 0 ? detailRepeatKind.value : "schedule";
      // Weekdays are a scheduling concept; a quota does not care which day.
      if (draftRepeat.kind === "quota") draftRepeat.days = [];
      if (draftRepeat.kind === "schedule" && detailDue && !detailDue.value) {
        detailDue.value = todayISO();
      }
      syncRepeatUI();
    });
  }

  if (detailRepeatUnit) {
    detailRepeatUnit.addEventListener("change", () => {
      if (!draftRepeat) return;
      draftRepeat.unit = UNITS.indexOf(detailRepeatUnit.value) >= 0 ? detailRepeatUnit.value : "day";
      if (draftRepeat.unit !== "week") draftRepeat.days = [];
      syncRepeatUI();
    });
  }

  if (detailRepeatN) {
    detailRepeatN.addEventListener("input", () => {
      if (!draftRepeat) return;
      // Clamped on save; here the raw value is kept so typing "10" is not
      // fought over on the way past "1".
      const raw = Math.round(Number(detailRepeatN.value));
      if (Number.isFinite(raw) && raw >= 1) draftRepeat.n = Math.min(MAX_COUNT, raw);
      // Not the whole UI: rebuilding the field would fight the cursor.
      syncRepeatChips();
      syncQuotaStatus();
    });
  }

  if (detailEndDate) {
    detailEndDate.addEventListener("input", () => {
      if (draftRepeat) draftRepeat.endDate = detailEndDate.value;
      clearFieldError(detailEndDate, detailRepeatError);
    });
  }

  if (detailEndCount) {
    detailEndCount.addEventListener("input", () => {
      clearFieldError(detailEndCount, detailRepeatError);
    });
  }

  if (detailDeleteBtn) {
    detailDeleteBtn.addEventListener("click", deleteEditingTask);
  }

  if (detailCancelBtn) {
    detailCancelBtn.addEventListener("click", () => dialog.close());
  }

  if (dialog) {
    // Covers Save, Cancel, Delete and Esc in one place.
    dialog.addEventListener("close", () => {
      editingId = null;
      draftEmoji = "";
      draftRepeat = null;
      emojiExpanded = false;
      clearFieldError(detailText, detailError);
      clearFieldError(detailEndDate, detailRepeatError);
      clearFieldError(detailDue, null);
    });
  }

  darkQuery.addEventListener("change", () => {
    // An explicit choice must never be overridden by the OS.
    if (!theme) applyTheme();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshIfDayChanged();
  });
  window.addEventListener("focus", refreshIfDayChanged);

  input.addEventListener("input", () => clearFieldError(input, todoError));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!validateName(text, input, todoError)) return;

    addTodo(text);
    input.value = "";
    input.focus();
  });

  applyTheme();
  render();
  scheduleMidnightRefresh();
})();
