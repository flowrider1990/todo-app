(function () {
  "use strict";

  const STORAGE_KEY = "todos";
  const THEME_KEY = "theme";

  const EMOJI_CHOICES = [
    "💼", "🏠", "🛒", "📞",
    "💰", "🏋", "🧠", "📚",
    "✈", "🍽", "💊", "🐶",
    "🎉", "⭐", "🔥", "❤",
  ];

  const form = document.getElementById("todo-form");
  const input = document.getElementById("todo-input");
  const list = document.getElementById("todo-list");
  const emptyState = document.getElementById("empty-state");
  const clearCompletedBtn = document.getElementById("clear-completed");
  const themeToggleBtn = document.getElementById("theme-toggle");

  const dialog = document.getElementById("task-dialog");
  const detailForm = document.getElementById("task-detail-form");
  const detailText = document.getElementById("detail-text");
  const detailDone = document.getElementById("detail-done");
  const detailEmoji = document.getElementById("detail-emoji");
  const detailDue = document.getElementById("detail-due");
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

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
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

  function todayISO() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return now.getFullYear() + "-" + month + "-" + day;
  }

  function formatDue(due) {
    const today = todayISO();
    if (due === today) return "Today";

    const parts = due.split("-");
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const options = { month: "short", day: "numeric" };
    if (parts[0] !== today.slice(0, 4)) options.year = "numeric";
    return date.toLocaleDateString(undefined, options);
  }

  function openTaskDialog(id) {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;
    // A missing dialog must not take the list down with it.
    if (!dialog || !detailText || !detailDone || !detailDue) return;

    editingId = id;
    draftEmoji = todo.emoji || "";
    detailText.value = todo.text;
    detailDone.checked = todo.done;
    detailDue.value = todo.due || "";
    renderEmojiPicker();

    dialog.showModal();
    detailText.focus();
    detailText.select();
  }

  function renderEmojiPicker() {
    if (!detailEmoji) return;
    detailEmoji.innerHTML = "";

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "emoji-option clear" + (draftEmoji ? "" : " selected");
    clearBtn.textContent = "⊘";
    clearBtn.setAttribute("aria-label", "No emoji");
    clearBtn.setAttribute("aria-pressed", String(!draftEmoji));
    clearBtn.addEventListener("click", () => {
      draftEmoji = "";
      renderEmojiPicker();
    });
    detailEmoji.appendChild(clearBtn);

    EMOJI_CHOICES.forEach((emoji) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "emoji-option" + (emoji === draftEmoji ? " selected" : "");
      btn.textContent = emoji;
      btn.setAttribute("aria-label", "Emoji " + emoji);
      btn.setAttribute("aria-pressed", String(emoji === draftEmoji));
      btn.addEventListener("click", () => {
        draftEmoji = emoji;
        renderEmojiPicker();
      });
      detailEmoji.appendChild(btn);
    });
  }

  function saveTaskDetails() {
    const todo = todos.find((t) => t.id === editingId);
    if (!todo) return;

    const text = detailText.value.trim();
    if (!text) {
      detailText.focus();
      return;
    }

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
        const today = todayISO();
        let state = "";
        if (todo.due < today) state = " overdue";
        else if (todo.due === today) state = " due-today";
        badge.className = "due-badge" + state;
        badge.textContent = formatDue(todo.due);
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
    });
  }

  darkQuery.addEventListener("change", () => {
    // An explicit choice must never be overridden by the OS.
    if (!theme) applyTheme();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    addTodo(text);
    input.value = "";
    input.focus();
  });

  applyTheme();
  render();
})();
