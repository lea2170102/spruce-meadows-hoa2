// Spruce Meadows HOA - Home page: next event + community announcements.

import { loadCollection } from "./db.js";
import {
  el, safeUrl, externalLink, text, isIsoDate, todayIso,
  timestampToIso, timestampMillis, formatDate, showStatus
} from "./utils.js";
import { prepareEvents, upcomingOnly, eventCard } from "./events.js";

const nextEventBox = document.getElementById("next-event");
const announcementsBox = document.getElementById("announcements");

// ---------- Announcements ----------

// Works with announcements from the old website too (title, body, createdAt only).
function normalizeAnnouncement(raw) {
  const title = text(raw.title);
  const body = text(raw.body);
  if (!title && !body) return null;
  return {
    id: raw.id,
    title: title || "Announcement",
    body,
    date: isIsoDate(raw.publishDate) ? raw.publishDate : timestampToIso(raw.createdAt),
    expiresOn: isIsoDate(raw.expiresOn) ? raw.expiresOn : "",
    pinned: raw.pinned === true,
    buttonText: text(raw.buttonText),
    buttonUrl: safeUrl(raw.buttonUrl),
    created: timestampMillis(raw.createdAt)
  };
}

// Shown through the expiration date; hidden starting the day after.
// No expiration date = shown until the board deletes it.
function isVisible(a, today) {
  return !a.expiresOn || a.expiresOn >= today;
}

// Pinned first, then newest first.
function compareAnnouncements(a, b) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return (b.date || "").localeCompare(a.date || "") || b.created - a.created;
}

// Turns web addresses in announcement text into clickable links.
// Only http:// and https:// addresses become links (checked again by safeUrl);
// everything else stays plain text. Built with text nodes, never innerHTML.
const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"]+/gi;

function linkify(body) {
  const parts = [];
  let last = 0;
  for (const match of body.matchAll(URL_IN_TEXT)) {
    let url = match[0];
    // Leave sentence punctuation after a link as normal text, e.g. "(see https://x.org)."
    while (/[.,;:!?'"\])]$/.test(url)) {
      if (url.endsWith(")") && (url.match(/\(/g) || []).length >= (url.match(/\)/g) || []).length) break;
      url = url.slice(0, -1);
    }
    const href = safeUrl(url);
    if (!href) continue;
    parts.push(body.slice(last, match.index));
    parts.push(externalLink(href, url, "text-link"));
    last = match.index + url.length;
  }
  parts.push(body.slice(last));
  return parts;
}

function announcementCard(a) {
  return el("article", { class: "announcement" + (a.pinned ? " is-pinned" : "") },
    a.pinned && el("p", { class: "pinned-label", text: "Pinned" }),
    el("h3", { class: "announcement-title", text: a.title }),
    a.date && el("p", { class: "meta" }, "Posted ",
      el("time", { datetime: a.date, text: formatDate(a.date, { month: "long", day: "numeric", year: "numeric" }) })),
    a.body && el("p", { class: "announcement-body" }, linkify(a.body)),
    a.buttonUrl && el("p", { class: "announcement-action" },
      externalLink(a.buttonUrl, a.buttonText || "More information", "btn btn-primary"))
  );
}

async function showAnnouncements() {
  try {
    const today = todayIso();
    const list = (await loadCollection("announcements"))
      .map(normalizeAnnouncement)
      .filter((a) => a && isVisible(a, today))
      .sort(compareAnnouncements);

    if (!list.length) {
      showStatus(announcementsBox, "There are no announcements right now. Please check back soon.");
      return;
    }
    announcementsBox.replaceChildren(...list.map(announcementCard));
  } catch (error) {
    console.error(error);
    showStatus(announcementsBox,
      "We couldn't load the announcements. Please check your internet connection and refresh the page.", "error");
  }
}

// ---------- Next event ----------

async function showNextEvent() {
  try {
    const next = upcomingOnly(prepareEvents(await loadCollection("events")))[0];
    if (!next) {
      showStatus(nextEventBox, "No upcoming meetings or events are scheduled right now.");
      return;
    }
    nextEventBox.replaceChildren(eventCard(next, { headingLevel: "h3" }));
  } catch (error) {
    console.error(error);
    showStatus(nextEventBox,
      "We couldn't load the calendar. Please check your internet connection and refresh the page.", "error");
  }
}

showNextEvent();
showAnnouncements();
