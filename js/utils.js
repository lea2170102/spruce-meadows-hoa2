// Spruce Meadows HOA - shared helpers for the public pages.
//
// Safety note: all content from the database is inserted with textContent
// (never innerHTML), so typed text can never run as code on the page.

import { TIME_ZONE } from "./site-settings.js";

// ---------- Building page elements safely ----------

// el("p", { class: "x", text: "Hello" }, child1, child2)
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false || child === "") continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

// Only allow normal web links (blocks "javascript:" and other tricks).
export function safeUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

// A link that opens in a new tab, safely, and tells screen readers so.
export function externalLink(href, label, className) {
  return el(
    "a",
    { href, class: className, target: "_blank", rel: "noopener noreferrer" },
    label,
    el("span", { class: "visually-hidden", text: " (opens in a new tab)" })
  );
}

export function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Shows a simple message (loading, empty, or error) inside a container.
export function showStatus(container, message, kind = "info") {
  const cls = kind === "error" ? "message message-error" : "status-text";
  container.replaceChildren(el("p", { class: cls, role: kind === "error" ? "alert" : null }, message));
}

// ---------- Dates and times (Boise local time) ----------
// Dates are stored as "YYYY-MM-DD" and times as "HH:MM" (24-hour).

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^\d{2}:\d{2}$/;

export const isIsoDate = (s) => typeof s === "string" && ISO_DATE.test(s);
export const isTime = (s) => typeof s === "string" && HHMM.test(s);

function partsInZone(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).formatToParts(date);
  const out = {};
  for (const p of parts) out[p.type] = p.value;
  return out;
}

// Today's date in Boise, as "YYYY-MM-DD".
export function todayIso() {
  const p = partsInZone(new Date());
  return `${p.year}-${p.month}-${p.day}`;
}

// A Firestore timestamp (e.g. createdAt) as a Boise "YYYY-MM-DD" date.
export function timestampToIso(ts) {
  const date = ts && typeof ts.toDate === "function" ? ts.toDate() : null;
  if (!date) return null;
  const p = partsInZone(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function timestampMillis(ts) {
  return ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0;
}

function isoToDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

// "2026-10-14" -> "Wednesday, October 14, 2026"
export function formatDate(iso, options = { weekday: "long", month: "long", day: "numeric", year: "numeric" }) {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(isoToDate(iso));
}

// "19:00" -> "7:00 PM"
export function formatTime(hhmm) {
  if (!isTime(hhmm)) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function addDaysIso(iso, days) {
  const d = isoToDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// A Boise local date + time converted to the exact moment (handles daylight saving).
export function boiseToUtc(iso, hhmm) {
  const [y, mo, d] = iso.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const target = Date.UTC(y, mo - 1, d, h, mi);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = partsInZone(new Date(guess));
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    guess += target - shown;
  }
  return new Date(guess);
}
