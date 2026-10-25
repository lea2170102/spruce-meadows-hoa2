// Spruce Meadows HOA - automatic holidays for the month calendar.
//
// Calculated in the browser every year. Nothing is stored in Firebase and no
// outside service is used. Holidays appear on the month calendar only (never
// in Upcoming Events, Coming Up Next or on the Home page).
//
// Each holiday is shown only on the date it actually falls on. Separate
// "observed" weekdays (when a holiday lands on a weekend) are not shown.

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;           // m is 1-12
const weekday = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday

// The nth given weekday of a month (n = 1..4), e.g. 3rd Monday of January.
function nthWeekday(y, m, wd, n) {
  const first = weekday(y, m, 1);
  return iso(y, m, 1 + ((wd - first + 7) % 7) + 7 * (n - 1));
}

// The last given weekday of a month, e.g. last Monday of May.
function lastWeekday(y, m, wd) {
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lastWd = weekday(y, m, lastDay);
  return iso(y, m, lastDay - ((lastWd - wd + 7) % 7));
}

// Easter Sunday (Western churches), standard Gregorian calculation.
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * mm + 114) / 31);
  const day = ((h + l - 7 * mm + 114) % 31) + 1;
  return iso(y, month, day);
}

// All holidays for one year. Each: { date, name, federal }
export function holidaysForYear(y) {
  const list = [];
  const add = (date, name, federal) => list.push({ date, name, federal });

  add(iso(y, 1, 1), "New Year's Day", true);
  add(iso(y, 6, 19), "Juneteenth", true);
  add(iso(y, 7, 4), "Independence Day", true);
  add(iso(y, 11, 11), "Veterans Day", true);
  add(iso(y, 12, 25), "Christmas Day", true);

  add(nthWeekday(y, 1, 1, 3), "Martin Luther King Jr. Day", true);
  add(nthWeekday(y, 2, 1, 3), "Presidents' Day", true);
  add(lastWeekday(y, 5, 1), "Memorial Day", true);
  add(nthWeekday(y, 9, 1, 1), "Labor Day", true);
  add(nthWeekday(y, 10, 1, 2), "Columbus Day", true);
  add(nthWeekday(y, 11, 4, 4), "Thanksgiving Day", true);

  add(iso(y, 2, 14), "Valentine's Day", false);
  add(easter(y), "Easter", false);
  add(nthWeekday(y, 5, 0, 2), "Mother's Day", false);
  add(nthWeekday(y, 6, 0, 3), "Father's Day", false);
  add(iso(y, 10, 31), "Halloween", false);

  return list;
}

// Holidays in one month as a Map: "YYYY-MM-DD" -> [holiday, ...]
export function holidaysInMonth(year, monthIndex) {
  const prefix = `${year}-${pad(monthIndex + 1)}-`;
  const out = new Map();
  for (const h of holidaysForYear(year)) {
    if (!h.date.startsWith(prefix)) continue;
    if (!out.has(h.date)) out.set(h.date, []);
    out.get(h.date).push(h);
  }
  return out;
}
