// Spruce Meadows HOA - Resources page.
// The website only stores LINKS. The documents themselves live in the
// HOA's Google Drive (shared as "Anyone with the link - Viewer").

import { loadCollection } from "./db.js";
import { el, safeUrl, text, timestampMillis, showStatus } from "./utils.js";

const duesBox = document.getElementById("dues-links");
const governingBox = document.getElementById("governing-links");
const minutesBox = document.getElementById("minutes-links");
const otherBox = document.getElementById("other-links");

const CATEGORIES = ["governing", "minutes", "dues", "other"];

function normalizeResource(raw) {
  const url = safeUrl(raw.url);
  const title = text(raw.title);
  if (!url || !title) return null;
  return {
    id: raw.id,
    title,
    url,
    category: CATEGORIES.includes(raw.category) ? raw.category : "other",
    year: Number.isInteger(raw.year) ? raw.year : null,
    description: text(raw.description),
    created: timestampMillis(raw.createdAt)
  };
}

function isGoogleDocument(url) {
  const host = new URL(url).hostname;
  return host === "drive.google.com" || host === "docs.google.com";
}

// The whole card is one big link.
function resourceCard(r) {
  return el("a", { class: "resource-card", href: r.url, target: "_blank", rel: "noopener noreferrer" },
    el("span", { class: "resource-title", text: r.title }),
    r.description && el("span", { class: "resource-description", text: r.description }),
    el("span", { class: "resource-open", "aria-hidden": "true" },
      isGoogleDocument(r.url) ? "Open document ›" : "Open website ›"),
    el("span", { class: "visually-hidden", text: " (opens in a new tab)" })
  );
}

function cardGrid(items) {
  return el("div", { class: "resource-grid" }, items.map(resourceCard));
}

const byTitle = (a, b) => a.title.localeCompare(b.title, "en", { numeric: true });
const newestFirst = (a, b) => b.created - a.created || byTitle(a, b);

function showDues(items) {
  if (!items.length) {
    showStatus(duesBox, "The online payment link will be posted here soon. " +
      "In the meantime, please contact the board with any questions about dues.");
    return;
  }
  duesBox.replaceChildren(...items.sort(byTitle).map((r) =>
    el("div", { class: "dues-item" },
      el("a", { class: "btn btn-primary btn-large", href: r.url, target: "_blank", rel: "noopener noreferrer" },
        r.title, el("span", { class: "visually-hidden", text: " (opens in a new tab)" })),
      r.description && el("p", { class: "dues-description", text: r.description }))
  ));
}

function showList(box, items, emptyText) {
  if (!items.length) { showStatus(box, emptyText); return; }
  box.replaceChildren(cardGrid(items));
}

// Meeting minutes grouped by year, newest year first.
function showMinutes(items) {
  if (!items.length) { showStatus(minutesBox, "Meeting minutes will be posted here."); return; }
  const groups = new Map();
  for (const r of items) {
    const key = r.year ?? "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const years = [...groups.keys()].filter((k) => k !== "other").sort((a, b) => b - a);
  if (groups.has("other")) years.push("other");

  minutesBox.replaceChildren(...years.map((key) =>
    el("div", { class: "year-group" },
      el("h3", { class: "year-heading", text: key === "other" ? "Other Minutes" : `${key} Minutes` }),
      cardGrid(groups.get(key).sort(newestFirst)))
  ));
}

async function start() {
  try {
    const all = (await loadCollection("resources")).map(normalizeResource).filter(Boolean);
    const pick = (cat) => all.filter((r) => r.category === cat);
    showDues(pick("dues"));
    showList(governingBox, pick("governing").sort(byTitle), "Governing documents will be posted here.");
    showMinutes(pick("minutes"));
    showList(otherBox, pick("other").sort(byTitle), "Other helpful resources will be posted here.");
  } catch (error) {
    console.error(error);
    const msg = "We couldn't load the resources. Please check your internet connection and refresh the page.";
    for (const box of [duesBox, governingBox, minutesBox, otherBox]) box.replaceChildren();
    showStatus(duesBox, msg, "error");
  }
}

start();
