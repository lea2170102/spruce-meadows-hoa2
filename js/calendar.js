// Spruce Meadows HOA - Calendar page: Upcoming Events list + month calendar.

import { loadCollection } from "./db.js";
import { el, todayIso, formatDate, showStatus } from "./utils.js";
import { prepareEvents, upcomingOnly, eventCard } from "./events.js";

const upcomingBox = document.getElementById("upcoming-events");
const monthLabel = document.getElementById("month-label");
const monthBody = document.getElementById("month-body");
const monthStatus = document.getElementById("month-status");
const prevButton = document.getElementById("prev-month");
const nextButton = document.getElementById("next-month");
const thisMonthButton = document.getElementById("this-month");
const dayPanel = document.getElementById("day-panel");

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

const today = todayIso();
let year = Number(today.slice(0, 4));
let month = Number(today.slice(5, 7)) - 1; // 0-11
let eventsByDate = {};
let selectedDate = null;

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

  const rows = [];
  let cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(el("td", { class: "day-empty" }));

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${pad(month + 1)}-${pad(day)}`;
    const events = eventsByDate[iso] || [];
    const isToday = iso === today;
    const dayNum = el("span", { class: "day-num", text: String(day) });
    const td = el("td", { class: "day" + (isToday ? " is-today" : "") + (iso < today ? " is-past" : "") });

    if (events.length) {
      const label = `${formatDate(iso)}${isToday ? " (today)" : ""}: ` +
        `${events.length} ${events.length === 1 ? "event" : "events"}. Show details.`;
      const button = el("button", {
        type: "button",
        class: "day-button" + (iso === selectedDate ? " is-selected" : ""),
        "aria-label": label,
        "aria-pressed": iso === selectedDate ? "true" : "false",
        "data-date": iso
      },
        dayNum,
        el("span", { class: "day-chips", "aria-hidden": "true" },
          events.map((ev) => el("span", { class: `chip cat-${ev.category}`, text: ev.title })))
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

function selectDay(iso) {
  selectedDate = iso;
  renderMonth();
  const events = eventsByDate[iso] || [];
  const heading = el("h3", { class: "day-panel-heading", tabindex: "-1", text: `Events on ${formatDate(iso)}` });
  dayPanel.replaceChildren(
    heading,
    ...events.map((ev) => eventCard(ev, { headingLevel: "h4", showAddToCalendar: iso >= today }))
  );
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
  try {
    const events = prepareEvents(await loadCollection("events"));
    eventsByDate = {};
    for (const ev of events) (eventsByDate[ev.date] ||= []).push(ev);
    showUpcoming(events);
    renderMonth();
  } catch (error) {
    console.error(error);
    const msg = "We couldn't load the calendar. Please check your internet connection and refresh the page.";
    showStatus(upcomingBox, msg, "error");
    monthStatus.textContent = "Events couldn't be loaded.";
  }
}

start();
