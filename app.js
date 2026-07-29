(function () {
  "use strict";

  const STORAGE_KEY = "todos";
  const THEME_KEY = "theme";

  const DUE_SHORTCUTS = [
    { label: "Today", days: 0 },
    { label: "Tomorrow", days: 1 },
    { label: "Next week", days: 7 },
  ];

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

  const form = document.getElementById("todo-form");
  const input = document.getElementById("todo-input");
  const list = document.getElementById("todo-list");
  const emptyState = document.getElementById("empty-state");
  const todoError = document.getElementById("todo-error");
  const clearCompletedBtn = document.getElementById("clear-completed");
  const themeToggleBtn = document.getElementById("theme-toggle");

  const dialog = document.getElementById("task-dialog");
  const detailForm = document.getElementById("task-detail-form");
  const detailText = document.getElementById("detail-text");
  const detailError = document.getElementById("detail-error");
  const detailDone = document.getElementById("detail-done");
  const detailEmoji = document.getElementById("detail-emoji");
  const detailDue = document.getElementById("detail-due");
  const detailDueClearBtn = document.getElementById("detail-due-clear");
  const detailDueQuick = document.getElementById("detail-due-quick");
  const detailDueHint = document.getElementById("detail-due-hint");
  const detailDeleteBtn = document.getElementById("detail-delete");
  const detailCancelBtn = document.getElementById("detail-cancel");

  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

  let todos = load();
  // null means "no explicit choice yet" — follow the OS until the user picks.
  let theme = loadTheme();
  // Which todo the dialog is editing, and its uncommitted emoji choice.
  // draftEmoji exists because the picker is buttons, not a form control — the
  // other three fields hold their own draft. Neither is task state.
  let editingId = null;
  let draftEmoji = "";
  // The palette stays collapsed behind the trigger until asked for.
  let emojiExpanded = false;

  function isDueString(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  // JSON.parse only guarantees valid JSON, not a usable todo. Without this,
  // a hand-edited due of the wrong type reaches due.split() in formatDue and
  // throws inside render(), blanking the whole list at startup.
  function normalize(entry) {
    if (!entry || typeof entry !== "object") return null;
    if (typeof entry.id !== "string" || typeof entry.text !== "string") return null;
    return {
      id: entry.id,
      text: entry.text,
      done: entry.done === true,
      emoji: typeof entry.emoji === "string" ? entry.emoji : "",
      due: isDueString(entry.due) ? entry.due : "",
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

  // Dates are stored as the "YYYY-MM-DD" string <input type="date"> produces.
  // Never pass that string to new Date() — it parses as UTC midnight, which
  // renders as the previous day in any negative-offset timezone. Compare the
  // strings instead (ISO dates sort lexicographically) and build from parts.

  function isoFrom(date) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return date.getFullYear() + "-" + month + "-" + day;
  }

  function todayISO() {
    return isoFrom(new Date());
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

  function openTaskDialog(id) {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;
    // A missing dialog must not take the list down with it.
    if (!dialog || !detailText || !detailDone || !detailDue) return;

    editingId = id;
    draftEmoji = todo.emoji || "";
    emojiExpanded = false;
    detailText.value = todo.text;
    clearFieldError(detailText, detailError);
    detailDone.checked = todo.done;
    detailDue.value = todo.due || "";
    syncDueUI();
    renderEmojiPicker();

    dialog.showModal();
    detailText.focus();
    detailText.select();
  }

  // Everything that reacts to the due value: the clear button (Chrome and
  // Safari offer no way to empty a date input once set), the relative hint,
  // and the shortcut chips. Rebuilt wholesale, like render().
  function syncDueUI() {
    const value = detailDue ? detailDue.value : "";
    const today = todayISO();

    if (detailDueClearBtn) {
      detailDueClearBtn.classList.toggle("hidden", !value);
    }

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
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "due-chip" + (iso === value ? " active" : "");
        btn.textContent = shortcut.label;
        btn.setAttribute("aria-pressed", String(iso === value));
        btn.addEventListener("click", () => {
          // Clicking the active chip again clears it.
          detailDue.value = iso === value ? "" : iso;
          syncDueUI();
        });
        detailDueQuick.appendChild(btn);
      });
    }
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

  function saveTaskDetails() {
    const todo = todos.find((t) => t.id === editingId);
    if (!todo) return;

    const text = detailText.value.trim();
    // exceptId, or the task would collide with its own unchanged name.
    if (!validateName(text, detailText, detailError, editingId)) return;

    todo.text = text;
    todo.done = detailDone.checked;
    todo.emoji = draftEmoji;
    todo.due = detailDue.value;
    save();
    render();
    dialog.close();
  }

  function deleteEditingTask() {
    const id = editingId;
    dialog.close();
    if (id) deleteTodo(id);
  }

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
    field.select();
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

  function addTodo(text) {
    todos.push({
      id: String(Date.now()) + Math.random().toString(16).slice(2),
      text: text,
      done: false,
      emoji: "",
      due: "",
    });
    save();
    render();
  }

  function toggleTodo(id) {
    const todo = todos.find((t) => t.id === id);
    if (todo) {
      todo.done = !todo.done;
      save();
      render();
    }
  }

  function deleteTodo(id) {
    todos = todos.filter((t) => t.id !== id);
    save();
    render();
  }

  function clearCompleted() {
    todos = todos.filter((t) => !t.done);
    save();
    render();
  }

  function render() {
    list.innerHTML = "";
    emptyState.classList.toggle("hidden", todos.length > 0);
    if (clearCompletedBtn) {
      clearCompletedBtn.disabled = !todos.some((t) => t.done);
    }

    const today = todayISO();

    todos.forEach((todo) => {
      const li = document.createElement("li");
      li.className = "todo-item" + (todo.done ? " done" : "");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = todo.done;
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

      if (todo.due) {
        const badge = document.createElement("span");
        let state = "";
        if (todo.due < today) state = " overdue";
        else if (todo.due === today) state = " due-today";
        badge.className = "due-badge" + state;
        badge.textContent = formatDue(todo.due, today);
        li.append(badge);
      }

      li.append(deleteBtn);
      list.appendChild(li);
    });
  }

  if (clearCompletedBtn) {
    clearCompletedBtn.addEventListener("click", clearCompleted);
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", toggleTheme);
  }

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
    detailDue.addEventListener("input", syncDueUI);
    detailDue.addEventListener("change", syncDueUI);
  }

  if (detailDueClearBtn) {
    detailDueClearBtn.addEventListener("click", () => {
      detailDue.value = "";
      syncDueUI();
      detailDue.focus();
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
      emojiExpanded = false;
      clearFieldError(detailText, detailError);
    });
  }

  darkQuery.addEventListener("change", () => {
    // An explicit choice must never be overridden by the OS.
    if (!theme) applyTheme();
  });

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
})();
