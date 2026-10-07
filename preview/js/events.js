// Spruce Meadows HOA - calendar events: cleanup, display, and "Add to my calendar".
// Used by the Home page (next event) and the Calendar page.

import {
  el, safeUrl, externalLink, text, isIsoDate, isTime,
  formatDate, formatTime, addDaysIso, boiseToUtc, todayIso
} from "./utils.js";

export const CATEGORY_LABELS = {
  meeting: "HOA Meeting",
  community: "Community Event",
  other: "Other"
};

// Turns a raw Firestore event into a clean object, or null if it has no valid date.
// Works with events from the old website too (they used "type": "hoa" / "community").
export function normalizeEvent(raw) {
  if (!isIsoDate(raw.date)) return null;
  let category = raw.category;
  if (!CATEGORY_LABELS[category]) {
    category = raw.type === "hoa" ? "meeting" : raw.type === "community" ? "community" : "other";
  }
  return {
    id: raw.id,
    title: text(raw.title) || "Untitled event",
    date: raw.date,
    startTime: isTime(raw.startTime) ? raw.startTime : "",
    endTime: isTime(raw.endTime) ? raw.endTime : "",
    location: text(raw.location),
    description: text(raw.description),
    url: safeUrl(raw.url),
    category
  };
}

export function compareEvents(a, b) {
  return a.date.localeCompare(b.date)
    || a.startTime.localeCompare(b.startTime)
    || a.title.localeCompare(b.title);
}

// Clean, sorted events. Upcoming = today or later (Boise time).
export function prepareEvents(rawList) {
  return rawList.map(normalizeEvent).filter(Boolean).sort(compareEvents);
}
export function upcomingOnly(events) {
  const today = todayIso();
  return events.filter((ev) => ev.date >= today);
}

export function timeText(ev) {
  if (!ev.startTime) return "";
  const start = formatTime(ev.startTime);
  return ev.endTime && ev.endTime > ev.startTime ? `${start} – ${formatTime(ev.endTime)}` : start;
}

// ---------- Event card ----------

export function eventCard(ev, { headingLevel = "h3", showAddToCalendar = true } = {}) {
  const day = String(Number(ev.date.slice(8, 10)));
  const time = timeText(ev);

  const dateBlock = el("div", { class: "date-block", "aria-hidden": "true" },
    el("span", { class: "date-month", text: formatDate(ev.date, { month: "short" }) }),
    el("span", { class: "date-day", text: day })
  );

  const actions = el("div", { class: "event-actions" },
    ev.url && externalLink(ev.url, "More information", "btn btn-secondary btn-small"),
    showAddToCalendar && addToCalendar(ev)
  );

  return el("article", { class: `event-card cat-${ev.category}` },
    dateBlock,
    el("div", { class: "event-details" },
      el("p", { class: "category-label" },
        el("span", { class: "category-dot", "aria-hidden": "true" }),
        CATEGORY_LABELS[ev.category]),
      el(headingLevel, { class: "event-title", text: ev.title }),
      el("p", { class: "event-when" },
        el("time", { datetime: ev.date, text: formatDate(ev.date) }),
        time && el("span", { class: "event-time", text: ` · ${time}` })),
      ev.location && el("p", { class: "event-where" },
        el("span", { class: "label", text: "Location: " }), ev.location),
      ev.description && el("p", { class: "event-description", text: ev.description }),
      actions.childNodes.length ? actions : null
    )
  );
}

// ---------- Add to my calendar ----------

function utcStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function eventRange(ev) {
  if (!ev.startTime) {
    return { allDay: true, start: ev.date.replace(/-/g, ""), end: addDaysIso(ev.date, 1).replace(/-/g, "") };
  }
  const start = boiseToUtc(ev.date, ev.startTime);
  const end = ev.endTime && ev.endTime > ev.startTime
    ? boiseToUtc(ev.date, ev.endTime)
    : new Date(start.getTime() + 60 * 60 * 1000); // no end time: assume 1 hour
  return { allDay: false, start: utcStamp(start), end: utcStamp(end) };
}

function detailsText(ev) {
  return [ev.description, ev.url].filter(Boolean).join("\n\n");
}

export function googleCalendarUrl(ev) {
  const r = eventRange(ev);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${r.start}/${r.end}`,
    details: detailsText(ev),
    location: ev.location
  });
  return "https://calendar.google.com/calendar/render?" + params.toString();
}

function icsEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function icsFold(line) {
  const out = [];
  while (line.length > 73) { out.push(line.slice(0, 73)); line = " " + line.slice(73); }
  out.push(line);
  return out.join("\r\n");
}

export function buildIcs(ev) {
  const r = eventRange(ev);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Spruce Meadows HOA//Website//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.id}@spruce-meadows-hoa`,
    `DTSTAMP:${utcStamp(new Date())}`,
    r.allDay ? `DTSTART;VALUE=DATE:${r.start}` : `DTSTART:${r.start}`,
    r.allDay ? `DTEND;VALUE=DATE:${r.end}` : `DTEND:${r.end}`,
    `SUMMARY:${icsEscape(ev.title)}`
  ];
  if (ev.location) lines.push(`LOCATION:${icsEscape(ev.location)}`);
  if (detailsText(ev)) lines.push(`DESCRIPTION:${icsEscape(detailsText(ev))}`);
  if (ev.url) lines.push(`URL:${ev.url}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

function fileName(title) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
  return (slug || "hoa-event") + ".ics";
}

export function addToCalendar(ev) {
  const icsHref = "data:text/calendar;charset=utf-8," + encodeURIComponent(buildIcs(ev));
  return el("details", { class: "add-to-cal" },
    el("summary", { text: "Add to my calendar" }),
    el("div", { class: "add-to-cal-options" },
      externalLink(googleCalendarUrl(ev), "Google Calendar", "btn btn-secondary btn-small"),
      el("a", { href: icsHref, download: fileName(ev.title), class: "btn btn-secondary btn-small" },
        "Apple or Outlook Calendar")
    )
  );
}
