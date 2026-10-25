// Spruce Meadows HOA - Calendar page: month calendar + Upcoming Events list.
// The month calendar also shows recycling reminders (settings/recycling).
// Recycling never appears in Upcoming Events or on the Home page.

import { loadCollection } from "./db.js?v=2026-10-25-c4";
import { el, todayIso, formatDate, showStatus, isIsoDate, externalLink } from "./utils.js?v=2026-10-25-c4";
import { prepareEvents, upcomingOnly, eventCard } from "./events.js?v=2026-10-25-c4";
import { normalizeSchedule, pickupsInMonth, pickupsBetween, recycleIcon } from "./recycling.js?v=2026-10-25-c4";

const upcomingBox = document.getElementById("upcoming-events");
const monthLabel = document.getElementById("month-label");
const monthBody = document.getElementById("month-body");
const monthStatus = document.getElementById("month-status");
const prevButton = document.getElementById("prev-month");
const nextButton = document.getElementById("next-month");
const thisMonthButton = document.getElementById("this-month");
const dayPanel = document.getElementById("day-panel");
const legendRecycling = document.getElementById("legend-recycling");

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

const today = todayIso();

// Opened from "View on Calendar" on the Home page (calendar.html?date=YYYY-MM-DD):
// start on that date's month and show that day's details.
const requested = new URLSearchParams(location.search).get("date");
const startDate = isIsoDate(requested) ? requested : null;

let year = Number((startDate || today).slice(0, 4));
let month = Number((startDate || today).slice(5, 7)) - 1; // 0-11
let eventsByDate = {};
let recycling = null;   // the recycling schedule, when turned on
let selectedDate = null;

const MAX_ITEMS_IN_DAY = 3; // more than this: show the first 2, then "+N more"

// ---------- Upcoming list ----------

function showUpcoming(events) {
  const upcoming = upcomingOnly(events);
  if (!upcoming.length) {
    showStatus(upcomingBox, "No upcoming meetings or events are scheduled right now. Please check back soon.");
    return;
  }
  upcomingBox.replaceChildren(...upcoming.map((ev) => eventCard(ev, { headingLevel: "h3" })));
}

// ---------- Month calendar ----------

const pad = (n) => String(n).padStart(2, "0");

function renderMonth() {
  monthLabel.textContent = `${MONTHS[month]} ${year}`;
  const isCurrentMonth = year === Number(today.slice(0, 4)) && month === Number(today.slice(5, 7)) - 1;
  thisMonthButton.hidden = isCurrentMonth;

  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const recyclingDays = recycling ? pickupsInMonth(recycling, year, month) : new Map();

  const rows = [];
  let cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(el("td", { class: "day-empty" }));

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${pad(month + 1)}-${pad(day)}`;
    const events = eventsByDate[iso] || [];
    const isToday = iso === today;
    const dayNum = el("span", { class: "day-num", text: String(day) });
    const td = el("td", { class: "day" + (isToday ? " is-today" : "") + (iso < today ? " is-past" : "") });

    const rec = recyclingDays.get(iso);

    if (events.length || rec) {
      // Always in this order: HOA events, then recycling.
      const items = [
        ...events.map((ev) => el("span", { class: `chip cat-${ev.category}`, text: ev.title })),
        ...(rec ? [recyclingChip(rec)] : [])
      ];
      const shown = items.length > MAX_ITEMS_IN_DAY
        ? [...items.slice(0, 2), el("span", { class: "chip chip-more" }, `+${items.length - 2}`, el("span", { class: "more-word", text: " more" }))]
        : items;
      const parts = [];
      if (rec) parts.push(rec.rescheduled ? "rescheduled recycling day" : "recycling day");
      if (events.length) parts.push(`${events.length} ${events.length === 1 ? "event" : "events"}`);
      const label = `${formatDate(iso)}${isToday ? " (today)" : ""}: ${parts.join(", ")}. Show details.`;
      const button = el("button", {
        type: "button",
        class: "day-button" + (iso === selectedDate ? " is-selected" : ""),
        "aria-label": label,
        "aria-pressed": iso === selectedDate ? "true" : "false",
        "data-date": iso
      },
        dayNum,
        el("span", { class: "day-chips", "aria-hidden": "true" }, shown)
      );
      button.addEventListener("click", () => selectDay(iso));
      td.append(button);
    } else {
      if (isToday) dayNum.setAttribute("aria-label", `${day} (today)`);
      td.append(dayNum);
    }
    if (isToday) td.setAttribute("aria-current", "date");
    cells.push(td);

    if (cells.length === 7) { rows.push(el("tr", {}, cells)); cells = []; }
  }
  if (cells.length) {
    while (cells.length < 7) cells.push(el("td", { class: "day-empty" }));
    rows.push(el("tr", {}, cells));
  }
  monthBody.replaceChildren(...rows);

  const count = Object.keys(eventsByDate).filter((d) => d.startsWith(`${year}-${pad(month + 1)}`))
    .reduce((n, d) => n + eventsByDate[d].length, 0);
  monthStatus.textContent = count
    ? `${count} ${count === 1 ? "event" : "events"} this month. Select a highlighted day to see details.`
    : "No events this month.";
}

// ---------- Recycling ----------

function recyclingChip(rec) {
  return el("span", { class: "chip chip-recycling" + (rec.rescheduled ? " is-rescheduled" : "") },
    recycleIcon("recycle-icon"),
    el("span", { class: "chip-text", text: rec.rescheduled ? "Rescheduled" : "Recycling" }));
}

function recyclingBox(rec) {
  return el("section", { class: "recycle-box" + (rec.rescheduled ? " is-rescheduled" : "") },
    el("h4", { class: "recycle-title" },
      recycleIcon("recycle-icon"),
      rec.rescheduled ? "Rescheduled Recycling" : "Recycling Day"),
    el("p", { class: "recycle-schedule", text: `${recycling.scheduleName} recycling schedule` }),
    rec.rescheduled ? el("p", { class: "recycle-moved", text: `Moved from ${formatDate(rec.movedFrom)}.` }) : null,
    recycling.officialUrl
      ? el("p", { class: "recycle-action" },
          externalLink(recycling.officialUrl, "View Official Recycling Calendar", "btn btn-primary btn-small"))
      : null
  );
}

function selectDay(iso) {
  selectedDate = iso;
  renderMonth();
  const events = eventsByDate[iso] || [];
  const rec = recycling ? pickupsBetween(recycling, iso, iso).get(iso) : null;
  const heading = el("h3", { class: "day-panel-heading", tabindex: "-1", text: formatDate(iso) });
  dayPanel.replaceChildren(...[
    heading,
    ...events.map((ev) => eventCard(ev, { headingLevel: "h4", showAddToCalendar: iso >= today })),
    rec ? recyclingBox(rec) : null
  ].filter(Boolean));
  dayPanel.hidden = false;
  heading.focus({ preventScroll: true });
  dayPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function changeMonth(delta) {
  month += delta;
  if (month < 0) { month = 11; year--; }
  if (month > 11) { month = 0; year++; }
  renderMonth();
}

prevButton.addEventListener("click", () => changeMonth(-1));
nextButton.addEventListener("click", () => changeMonth(1));
thisMonthButton.addEventListener("click", () => {
  year = Number(today.slice(0, 4));
  month = Number(today.slice(5, 7)) - 1;
  renderMonth();
});

// ---------- Load ----------

async function start() {
  renderMonth();
  const [eventsResult, settingsResult] = await Promise.allSettled([
    loadCollection("events"),
    loadCollection("settings")
  ]);

  // Recycling: optional. If it can't load, the calendar works normally without it.
  if (settingsResult.status === "fulfilled") {
    const schedule = normalizeSchedule(settingsResult.value.find((d) => d.id === "recycling"));
    recycling = schedule && schedule.enabled ? schedule : null;
  } else {
    console.warn("Recycling schedule couldn't be loaded.", settingsResult.reason);
  }
  legendRecycling.hidden = !recycling;
  if (recycling) document.getElementById("legend-recycling-icon").replaceChildren(recycleIcon("recycle-icon"));

  if (eventsResult.status === "fulfilled") {
    const events = prepareEvents(eventsResult.value);
    eventsByDate = {};
    for (const ev of events) (eventsByDate[ev.date] ||= []).push(ev);
    showUpcoming(events);
    renderMonth();
    if (startDate && eventsByDate[startDate]) selectDay(startDate);
  } else {
    console.error(eventsResult.reason);
    renderMonth();
    const msg = "We couldn't load the calendar. Please check your internet connection and refresh the page.";
    showStatus(upcomingBox, msg, "error");
    monthStatus.textContent = "Events couldn't be loaded.";
  }
}

start();
