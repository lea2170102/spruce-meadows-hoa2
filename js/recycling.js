// Spruce Meadows HOA - recycling reminders.
//
// The schedule is ONE small settings record in Firebase (settings/recycling).
// Pickup dates are calculated here in the browser from:
//   - a reference pickup date (for example Monday, October 12, 2026)
//   - how often pickup happens (every 2 weeks, or every week)
// There is no year boundary: the pattern simply continues forever, so nothing
// needs to be re-entered each January. Board-entered date changes move a single
// pickup ("Rescheduled Recycling"). Nothing moves automatically for holidays.

import { isIsoDate, safeUrl, text, addDaysIso } from "./utils.js?v=2026-10-25-c5b";

// The confirmed City of Boise schedule, used only to pre-fill the first-time
// setup form in the Board Portal. The calendar never uses these directly.
export const RECYCLING_SETUP_DEFAULTS = {
  enabled: true,
  referenceDate: "2026-10-12",
  intervalWeeks: 2,
  scheduleName: "Purple",
  officialUrl: "https://www.cityofboise.org/recycling/"
};

export const MAX_DATE_CHANGES = 60;
export const MAX_MOVE_DAYS = 7;

// ---------- Plain date arithmetic (calendar dates only, so daylight saving can't interfere) ----------

const DAY_MS = 86400000;
const toUtc = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

export function daysBetween(fromIso, toIso) {
  return Math.round((toUtc(toIso) - toUtc(fromIso)) / DAY_MS);
}

export function weekdayName(iso) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(toUtc(iso)));
}

// ---------- The schedule ----------

// Cleans the stored settings. Returns null if they can't be used.
// Malformed date-change entries are ignored rather than breaking the calendar.
export function normalizeSchedule(raw) {
  if (!raw || !isIsoDate(raw.referenceDate)) return null;
  const intervalWeeks = raw.intervalWeeks === 1 || raw.intervalWeeks === 2 ? raw.intervalWeeks : null;
  if (!intervalWeeks) return null;
  const changes = (Array.isArray(raw.changes) ? raw.changes : [])
    .filter((c) => c && isIsoDate(c.from) && isIsoDate(c.to) && c.from !== c.to)
    .map((c) => ({ from: c.from, to: c.to }));
  return {
    enabled: raw.enabled === true,
    referenceDate: raw.referenceDate,
    intervalWeeks,
    scheduleName: text(raw.scheduleName) || "Recycling",
    officialUrl: safeUrl(raw.officialUrl),
    changes
  };
}

// True if the date is a normal pickup under the every-N-weeks pattern
// (before or after the reference date, in any year).
export function isRegularPickup(schedule, iso) {
  const step = 7 * schedule.intervalWeeks;
  const d = daysBetween(schedule.referenceDate, iso);
  return ((d % step) + step) % step === 0;
}

// All pickups from startIso to endIso (inclusive), after date changes.
// Returns a Map: "YYYY-MM-DD" -> { rescheduled: false }
//                             or { rescheduled: true, movedFrom: "YYYY-MM-DD" }
export function pickupsBetween(schedule, startIso, endIso) {
  const out = new Map();
  const step = 7 * schedule.intervalWeeks;
  const firstOffset = Math.ceil(daysBetween(schedule.referenceDate, startIso) / step) * step;
  for (let offset = firstOffset; ; offset += step) {
    const iso = addDaysIso(schedule.referenceDate, offset);
    if (iso > endIso) break;
    out.set(iso, { rescheduled: false });
  }
  for (const change of schedule.changes) {
    if (!isRegularPickup(schedule, change.from)) continue; // no longer matches the schedule: ignored
    const current = out.get(change.from);
    if (current && !current.rescheduled) out.delete(change.from);
    if (change.to >= startIso && change.to <= endIso) {
      out.set(change.to, { rescheduled: true, movedFrom: change.from });
    }
  }
  return out;
}

export function pickupsInMonth(schedule, year, monthIndex) {
  const mm = String(monthIndex + 1).padStart(2, "0");
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return pickupsBetween(schedule, `${year}-${mm}-01`, `${year}-${mm}-${String(last).padStart(2, "0")}`);
}

// The next few pickups on or after a date (date changes included), in order.
export function nextPickups(schedule, fromIso, count = 4) {
  const span = 7 * schedule.intervalWeeks * (count + 3) + MAX_MOVE_DAYS;
  return [...pickupsBetween(schedule, fromIso, addDaysIso(fromIso, span)).entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([iso, info]) => ({ iso, ...info }));
}

// ---------- The drawn recycling symbol (an image, not an emoji character) ----------

const SVG_NS = "http://www.w3.org/2000/svg";

export function recycleIcon(className = "recycle-icon") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  // Three arrows chasing each other around a triangle.
  const corners = [[12, 2.6], [21.4, 19.2], [2.6, 19.2]];
  for (let i = 0; i < 3; i++) {
    const [ax, ay] = corners[i];
    const [bx, by] = corners[(i + 1) % 3];
    const at = (t) => [ax + (bx - ax) * t, ay + (by - ay) * t];
    const len = Math.hypot(bx - ax, by - ay);
    const [ux, uy] = [(bx - ax) / len, (by - ay) / len];
    const [nx, ny] = [-uy, ux];
    const [sx, sy] = at(0.13);
    const [ex, ey] = at(0.62);
    const [tx, ty] = at(0.89);
    const line = document.createElementNS(SVG_NS, "path");
    line.setAttribute("d", `M${sx.toFixed(2)} ${sy.toFixed(2)} L${ex.toFixed(2)} ${ey.toFixed(2)}`);
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "currentColor");
    line.setAttribute("stroke-width", "3.2");
    line.setAttribute("stroke-linecap", "round");
    const head = document.createElementNS(SVG_NS, "path");
    const w = 4.1;
    head.setAttribute("d",
      `M${tx.toFixed(2)} ${ty.toFixed(2)} L${(ex + nx * w).toFixed(2)} ${(ey + ny * w).toFixed(2)} ` +
      `L${(ex - nx * w).toFixed(2)} ${(ey - ny * w).toFixed(2)} Z`);
    head.setAttribute("fill", "currentColor");
    svg.append(line, head);
  }
  return svg;
}
