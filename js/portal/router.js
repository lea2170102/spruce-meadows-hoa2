// Spruce Meadows HOA - Board Portal screens and navigation.
//
// The address bar remembers where you are (for example board.html#announcements),
// so the browser's Back button and page refresh work as expected.

import { el } from "../utils.js?v=2026-10-25-c4";
import { takeFlash, messageBox, confirmDiscard } from "./common.js?v=2026-10-25-c4";
import announcements from "./announcements.js?v=2026-10-25-c4";
import events from "./events.js?v=2026-10-25-c4";
import resources from "./resources.js?v=2026-10-25-c4";
import boardMembers from "./board-members.js?v=2026-10-25-c4";
import calendarSettings from "./calendar-settings.js?v=2026-10-25-c4";

const SECTIONS = { announcements, events, resources, board: boardMembers, settings: calendarSettings };

const portalHeading = document.getElementById("portal-heading");
const portalIntro = document.getElementById("portal-intro");
const portalMenu = document.getElementById("portal-menu");
const portalMessage = document.getElementById("portal-message");
const screen = document.getElementById("portal-screen");
const footer = document.getElementById("portal-footer");

let running = false;
let currentForm = null;     // the open form, if any (to warn about unsaved changes)
let currentHash = "";

function parseHash() {
  const [section, action, id] = location.hash.replace(/^#/, "").split("/");
  return { section: SECTIONS[section] ? section : "", action: action || "", id: id || "" };
}

// Moves to another screen. If a form has unsaved changes, asks first.
export async function go(hash) {
  if (currentForm && currentForm.isDirty()) {
    if (!(await confirmDiscard())) return;
    currentForm = null;
  }
  if (location.hash === hash || (hash === "" && !location.hash)) render();
  else if (hash === "") { history.pushState(null, "", location.pathname); render(); }
  else location.hash = hash;
}

function showDashboard(focus) {
  portalHeading.hidden = false;
  portalIntro.hidden = false;
  portalMenu.hidden = false;
  screen.hidden = true;
  screen.replaceChildren();
  footer.hidden = false;
  const f = takeFlash();
  if (f) {
    portalMessage.className = `message message-${f.kind}`;
    portalMessage.textContent = f.text;
    portalMessage.hidden = false;
  } else {
    portalMessage.hidden = true;
  }
  if (focus) portalHeading.focus();
}

function backButton(label, hash) {
  const btn = el("button", { type: "button", class: "link-button back-button" }, `← ${label}`);
  btn.addEventListener("click", () => go(hash));
  return btn;
}

function render() {
  if (!running) return;
  currentForm = null;
  currentHash = location.hash;
  const { section, action, id } = parseHash();

  if (!section) { showDashboard(true); return; }

  const mod = SECTIONS[section];
  portalHeading.hidden = true;
  portalIntro.hidden = true;
  portalMenu.hidden = true;
  portalMessage.hidden = true;
  screen.hidden = false;

  const body = el("div", { class: "portal-body" });
  const ctx = {
    body,
    goList: () => go(`#${section}`),
    goAdd: () => go(`#${section}/add`),
    goEdit: (docId) => go(`#${section}/edit/${docId}`),
    goAction: (name, docId) => go(`#${section}/${name}/${docId}`)
  };

  // Form screens: "add", "edit", plus any extra ones a section lists
  // (Announcements adds "edit-archived" and "repost").
  const formActions = ["edit", ...(mod.extraFormActions || [])];
  if (action === "add" || (formActions.includes(action) && id)) {
    footer.hidden = true;   // finish or cancel the form first
    const title = action === "add" ? mod.addTitle
      : (mod.formTitles && mod.formTitles[action]) || mod.editTitle;
    const heading = el("h2", { class: "screen-heading", tabindex: "-1", text: title });
    screen.replaceChildren(backButton(`Back to ${mod.title}`, `#${section}`), heading, body);
    heading.focus();
    Promise.resolve(mod.form(ctx, action === "add" ? null : id, action)).then((form) => {
      if (location.hash === currentHash) currentForm = form || null;
    });
  } else {
    footer.hidden = false;
    const heading = el("h2", { class: "screen-heading", tabindex: "-1", text: mod.title });
    let addBtn = null;
    if (mod.addLabel) {
      addBtn = el("button", { type: "button", class: "btn btn-primary" }, `+ ${mod.addLabel}`);
      addBtn.addEventListener("click", ctx.goAdd);
    }
    const f = takeFlash();
    screen.replaceChildren(...[
      backButton("Back to Board Portal", ""),
      heading,
      mod.help ? el("p", { class: "screen-help", text: mod.help }) : null,
      f ? messageBox(f.text, f.kind) : null,
      addBtn ? el("p", { class: "add-row" }, addBtn) : null,
      body
    ].filter(Boolean));
    heading.focus();
    mod.list(ctx);
  }
}

// The browser's Back/Forward buttons: if a form has unsaved changes,
// put the form back in the history and ask before leaving it.
async function onHashChange() {
  if (currentForm && currentForm.isDirty()) {
    history.pushState(null, "", currentHash);
    if (await confirmDiscard()) {
      currentForm = null;
      history.back();
    }
    return;
  }
  render();
}

function onBeforeUnload(event) {
  if (currentForm && currentForm.isDirty()) {
    event.preventDefault();
    event.returnValue = "";
  }
}

export function startPortal() {
  if (running) return;
  running = true;
  window.addEventListener("hashchange", onHashChange);
  window.addEventListener("beforeunload", onBeforeUnload);
  render();
}

export function stopPortal() {
  if (!running) return;
  running = false;
  currentForm = null;
  window.removeEventListener("hashchange", onHashChange);
  window.removeEventListener("beforeunload", onBeforeUnload);
  screen.replaceChildren();
  if (location.hash) history.replaceState(null, "", location.pathname);
  showDashboard(false);
}

// Dashboard buttons
portalMenu.querySelectorAll("[data-section]").forEach((button) => {
  button.addEventListener("click", () => go(`#${button.dataset.section}`));
});
