// Spruce Meadows HOA - Board Portal shared tools.
//
// Saving, loading, forms, error messages and the delete confirmation box.
// Only the logged-in board account can save: the Firestore security rules
// refuse changes from anyone else, no matter what this code does.

import { getApp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc,
  writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";
import { el, safeUrl } from "../utils.js";

// ---------- Database ----------

let db = null;
function database() {
  // The Firebase app is started by board.js when the page loads.
  if (!db) db = getFirestore(getApp());
  return db;
}

const TIMEOUT_MS = 20000;

function withTimeout(promise) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error("timeout");
      err.code = "timeout";
      reject(err);
    }, TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export const now = () => serverTimestamp();

export async function listDocs(name) {
  const snap = await withTimeout(getDocs(collection(database(), name)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getOne(name, id) {
  const snap = await withTimeout(getDoc(doc(database(), name, id)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// A new record's ID is chosen when the Add form opens. If a save is retried
// (for example after a dropped connection) it updates that same record
// instead of creating a duplicate.
export function newId(name) {
  return doc(collection(database(), name)).id;
}

export function createDoc(name, id, data) {
  return withTimeout(setDoc(doc(database(), name, id), { ...data, createdAt: now(), updatedAt: now() }));
}

// Changes only the fields given; everything else on the record is kept.
export function updateFields(name, id, data) {
  return withTimeout(updateDoc(doc(database(), name, id), { ...data, updatedAt: now() }));
}

export function removeDoc(name, id) {
  return withTimeout(deleteDoc(doc(database(), name, id)));
}

// Several changes saved together: either all of them are saved or none are.
export function updateMany(name, changes) {
  const batch = writeBatch(database());
  for (const { id, data } of changes) {
    batch.update(doc(database(), name, id), { ...data, updatedAt: now() });
  }
  return withTimeout(batch.commit());
}

// ---------- Plain-English error messages ----------

export function saveErrorText(error) {
  const code = error && error.code;
  if (code === "timeout" || code === "unavailable" || code === "deadline-exceeded") {
    return "We couldn't save. Please check your internet connection and try again. Your changes are still in the form.";
  }
  if (code === "permission-denied" || code === "unauthenticated") {
    return "Your login may have expired. Please log out and log back in, then try again.";
  }
  return "Something went wrong while saving. Please try again.";
}

export function actionErrorText(error, action) {
  const code = error && error.code;
  if (code === "timeout" || code === "unavailable" || code === "deadline-exceeded") {
    return `We couldn't ${action}. Please check your internet connection and try again.`;
  }
  if (code === "permission-denied" || code === "unauthenticated") {
    return "Your login may have expired. Please log out and log back in, then try again.";
  }
  return `Something went wrong and we couldn't ${action}. Please try again.`;
}

export function loadErrorBox(onRetry) {
  const retry = el("button", { type: "button", class: "btn btn-secondary btn-small" }, "Try again");
  retry.addEventListener("click", onRetry);
  return el("div", { class: "message message-error", role: "alert" },
    el("p", { text: "We couldn't load this list. Please check your internet connection." }),
    retry);
}

// ---------- Messages shown at the top of a screen ----------

let flash = null;
export function setFlash(text, kind = "success") { flash = { text, kind }; }
export function takeFlash() { const f = flash; flash = null; return f; }

export function messageBox(text, kind) {
  return el("p", { class: `message message-${kind}`, role: kind === "error" ? "alert" : "status", text });
}

// ---------- Links typed into forms ----------

// Returns { value } or { error }. Adds https:// if it was left off.
export function cleanUrl(raw, { required = false } = {}) {
  let value = (raw || "").trim();
  if (!value) return required ? { error: "Please paste a link." } : { value: "" };
  if (/\s/.test(value)) return { error: "A link can't contain spaces. Please copy and paste it again." };
  if (/^http:\/\//i.test(value)) {
    return { error: "This link starts with http://. Please use the secure version starting with https:// instead." };
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = "https://" + value.replace(/^\/+/, "");
  const safe = safeUrl(value);
  if (!safe || !safe.startsWith("https://") || !/^https:\/\/[^/]+\.[^/]+/.test(safe)) {
    return { error: "This doesn't look like a web address. It should look like https://www.example.com" };
  }
  if (safe.length > 2000) return { error: "This link is too long." };
  return { value: safe };
}

// ---------- Form builder ----------
//
// fields: [{ name, label, type, required, hint, max, options, placeholder }]
// type: text | textarea | date | time | select | checkbox | year

let fieldCounter = 0;

export function buildForm({ fields, values = {}, submitLabel, validate, save, onSaved, onCancel, intro }) {
  const form = el("form", { class: "card portal-form", novalidate: true });
  const inputs = {};
  const errors = {};

  if (intro) form.append(intro);

  for (const f of fields) {
    const id = `pf-${++fieldCounter}`;
    const hintId = `${id}-hint`;
    const errorId = `${id}-error`;
    const describedBy = [f.hint ? hintId : null, errorId].filter(Boolean).join(" ");
    let input;

    if (f.type === "checkbox") {
      input = el("input", { id, name: f.name, type: "checkbox", "aria-describedby": describedBy });
      input.checked = values[f.name] === true;
      const wrap = el("div", { class: "field field-checkbox" },
        el("div", { class: "checkbox-row" }, input, el("label", { for: id, text: f.label })),
        f.hint && el("p", { id: hintId, class: "field-hint", text: f.hint }),
        el("p", { id: errorId, class: "field-error", hidden: true }));
      form.append(wrap);
    } else {
      if (f.type === "textarea") {
        input = el("textarea", { id, name: f.name, rows: f.rows || 6, maxlength: f.max, "aria-describedby": describedBy });
      } else if (f.type === "select") {
        input = el("select", { id, name: f.name, "aria-describedby": describedBy },
          f.options.map(([value, label]) => el("option", { value, text: label })));
      } else if (f.type === "year") {
        input = el("input", { id, name: f.name, type: "text", inputmode: "numeric", maxlength: 4,
          autocomplete: "off", class: "input-short", "aria-describedby": describedBy });
      } else {
        input = el("input", { id, name: f.name, type: f.type || "text", maxlength: f.max,
          autocomplete: "off", placeholder: f.placeholder,
          class: f.type === "date" || f.type === "time" ? "input-short" : null,
          "aria-describedby": describedBy });
      }
      if (f.required) input.setAttribute("aria-required", "true");
      const v = values[f.name];
      input.value = v == null ? "" : String(v);

      form.append(el("div", { class: "field" },
        el("label", { for: id },
          f.label, " ",
          el("span", { class: f.required ? "req-tag" : "opt-tag", text: f.required ? "(required)" : "(optional)" })),
        input,
        f.hint && el("p", { id: hintId, class: "field-hint", text: f.hint }),
        el("p", { id: errorId, class: "field-error", hidden: true })));
    }
    inputs[f.name] = input;
    errors[f.name] = form.querySelector(`#${errorId}`);
  }

  const summary = el("p", { class: "message", role: "alert", tabindex: "-1", hidden: true });
  const saveBtn = el("button", { type: "submit", class: "btn btn-primary" }, submitLabel);
  const cancelBtn = el("button", { type: "button", class: "btn btn-secondary" }, "Cancel");
  form.append(summary, el("div", { class: "form-actions" }, saveBtn, cancelBtn));

  let dirty = false;
  form.addEventListener("input", () => { dirty = true; });
  form.addEventListener("change", () => { dirty = true; });

  function getValues() {
    const out = {};
    for (const [name, input] of Object.entries(inputs)) {
      out[name] = input.type === "checkbox" ? input.checked : input.value.trim();
    }
    return out;
  }

  function showErrors(fieldErrors) {
    let first = null;
    for (const [name, errEl] of Object.entries(errors)) {
      const msg = fieldErrors[name];
      if (msg) {
        inputs[name].setAttribute("aria-invalid", "true");
        errEl.textContent = msg;
        errEl.hidden = false;
        if (!first) first = inputs[name];
      } else {
        inputs[name].removeAttribute("aria-invalid");
        errEl.textContent = "";
        errEl.hidden = true;
      }
    }
    return first;
  }

  function showSummary(text, kind = "error") {
    summary.className = `message message-${kind}`;
    summary.textContent = text;
    summary.hidden = !text;
  }

  // Clear a field's error as soon as it's changed.
  for (const [name, input] of Object.entries(inputs)) {
    input.addEventListener("input", () => {
      if (input.getAttribute("aria-invalid")) showErrors({ ...currentErrors(), [name]: "" });
    });
  }
  function currentErrors() {
    const out = {};
    for (const [name, errEl] of Object.entries(errors)) if (!errEl.hidden) out[name] = errEl.textContent;
    return out;
  }

  cancelBtn.addEventListener("click", () => onCancel());

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saveBtn.disabled) return;
    showSummary("");
    const result = validate(getValues());
    const first = showErrors(result.errors || {});
    if (first) {
      showSummary("Please fix the highlighted fields and try again.");
      first.focus();
      return;
    }
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    let saved = false;
    try {
      await save(result.data);
      dirty = false;
      saved = true;
    } catch (error) {
      console.error(error);
      showSummary(saveErrorText(error));
      summary.focus();
    } finally {
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
      saveBtn.textContent = submitLabel;
    }
    if (saved) onSaved();
  });

  return { form, inputs, isDirty: () => dirty, firstInput: () => Object.values(inputs)[0] };
}

// Checks a text field's length. Returns an error message or "".
export function checkText(value, { label, required, max }) {
  if (!value) return required ? `Please enter ${label}.` : "";
  if (value.length > max) return `This is too long. Please keep it under ${max} characters (it's ${value.length} now).`;
  return "";
}

// ---------- Confirmation box (delete, discard changes) ----------

const dialog = document.getElementById("confirm-dialog");

export function confirmBox({ heading, detail, note, yes, no }) {
  return new Promise((resolve) => {
    if (!dialog || typeof dialog.showModal !== "function") {
      resolve(window.confirm([heading, detail, note].filter(Boolean).join("\n\n")));
      return;
    }
    const yesBtn = el("button", { type: "button", class: "btn btn-danger" }, yes);
    const noBtn = el("button", { type: "button", class: "btn btn-secondary" }, no);
    dialog.replaceChildren(...[
      el("h2", { id: "confirm-heading", class: "confirm-heading", text: heading }),
      detail ? el("p", { class: "confirm-detail", text: detail }) : null,
      note ? el("p", { class: "confirm-note", text: note }) : null,
      el("div", { class: "confirm-actions" }, noBtn, yesBtn)
    ].filter(Boolean));
    dialog.setAttribute("aria-labelledby", "confirm-heading");
    const finish = (answer) => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.close();
      resolve(answer);
    };
    const onCancel = (e) => { e.preventDefault(); finish(false); };
    dialog.addEventListener("cancel", onCancel);   // Escape key = "No"
    yesBtn.addEventListener("click", () => finish(true));
    noBtn.addEventListener("click", () => finish(false));
    dialog.showModal();
    noBtn.focus();   // the safe choice is selected first
  });
}

export function confirmDelete(what, name) {
  return confirmBox({
    heading: `Are you sure you want to delete this ${what}?`,
    detail: name ? `“${name}”` : "",
    note: "This can't be undone.",
    yes: "Yes, delete it",
    no: "No, keep it"
  });
}

export function confirmDiscard() {
  return confirmBox({
    heading: "Discard your changes?",
    detail: "You have changes that haven't been saved.",
    note: "",
    yes: "Yes, discard changes",
    no: "No, keep editing"
  });
}

// ---------- Small list helpers ----------

// A button whose screen-reader name includes the item, e.g. "Edit: Fall leaf pickup".
export function itemButton(label, itemName, className, onClick) {
  const btn = el("button", { type: "button", class: className },
    label, el("span", { class: "visually-hidden", text: `: ${itemName}` }));
  btn.addEventListener("click", onClick);
  return btn;
}

export function tag(text, kind = "") {
  return el("span", { class: `portal-tag ${kind}`.trim(), text });
}
