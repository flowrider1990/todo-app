(function () {
  "use strict";

  const STORAGE_KEY = "todos";

  const form = document.getElementById("todo-form");
  const input = document.getElementById("todo-input");
  const list = document.getElementById("todo-list");
  const emptyState = document.getElementById("empty-state");
  const clearCompletedBtn = document.getElementById("clear-completed");

  let todos = load();

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

  function addTodo(text) {
    todos.push({
      id: String(Date.now()) + Math.random().toString(16).slice(2),
      text: text,
      done: false,
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

      const span = document.createElement("span");
      span.className = "text";
      span.textContent = todo.text;

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-btn";
      deleteBtn.type = "button";
      deleteBtn.textContent = "×";
      deleteBtn.setAttribute("aria-label", "Delete task");
      deleteBtn.addEventListener("click", () => deleteTodo(todo.id));

      li.append(checkbox, span, deleteBtn);
      list.appendChild(li);
    });
  }

  if (clearCompletedBtn) {
    clearCompletedBtn.addEventListener("click", clearCompleted);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    addTodo(text);
    input.value = "";
    input.focus();
  });

  render();
})();
