// Spruce Meadows HOA - Board Portal: Calendar Settings (recycling schedule).
//
// Everything is stored in ONE record: settings/recycling.
// Pickup dates are calculated on the Calendar page (see js/recycling.js),
// so nothing here needs re-entering each year.

import { el, formatDate, todayIso, isIsoDate, safeUrl } from "../utils.js?v=2026-10-25-c5b";
import {
  normalizeSchedule, isRegularPickup, nextPickups, weekdayName, daysBetween,
  RECYCLING_SETUP_DEFAULTS, MAX_DATE_CHANGES, MAX_MOVE_DAYS
} from "../recycling.js?v=2026-10-25-c5b";
import {
  getOne, putDoc, updateFields, buildForm, checkText, cleanUrl, confirmBox,
  setFlash, messageBox, loadErrorBox, itemButton, tag, actionErrorText
} from "./common.js?v=2026-10-25-c5b";

const NAME = "settings";
const ID = "recycling";
const shortDate = (iso) => formatDate(iso, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

function scheduleSentence(s) {
  const every = s.intervalWeeks === 2 ? "every other" : "every";
  return `Recycling: ${every} ${weekdayName(s.referenceDate)}, ${s.scheduleName} schedule, counting from ${formatDate(s.referenceDate)}.`;
}

function yearlyReminder() {
  return el("div", { class: "message message-info settings-reminder" },
    el("p", {}, el("strong", { text: "Once a year: " }),
      "when the City of Boise publishes next year's recycling calendar, review it and add any pickup-date changes the City has confirmed for the new year. The every-other-week Purple schedule continues automatically, so you don't need to re-enter it."),
    el("p", { text: "Only enter changes the City of Boise has confirmed. Holidays don't move recycling automatically." }));
}

// ---------- Main screen ----------

async function list(ctx) {
  const box = ctx.body;
  box.replaceChildren(el("p", { class: "status-text", text: "Loading recycling schedule…" }));
  let raw;
  try {
    raw = await getOne(NAME, ID);
  } catch (error) {
    console.error(error);
    box.replaceChildren(loadErrorBox(() => list(ctx)));
    return;
  }

  if (!raw) {
    const setupBtn = el("button", { type: "button", class: "btn btn-primary" }, "Set up recycling reminders");
    setupBtn.addEventListener("click", () => ctx.goAction("setup", ID));
    box.replaceChildren(
      el("h3", { class: "list-group-heading", text: "Recycling schedule" }),
      el("p", { class: "status-text", text: "Recycling reminders aren't set up yet, so they don't appear on the calendar." }),
      el("p", { class: "add-row" }, setupBtn),
      yearlyReminder());
    return;
  }

  const s = normalizeSchedule(raw);
  const editBtn = el("button", { type: "button", class: "btn btn-primary btn-small" }, "Edit schedule");
  editBtn.addEventListener("click", () => ctx.goAction("edit-schedule", ID));
  if (!s) {
    box.replaceChildren(
      messageBox("The saved recycling schedule can't be read, so recycling isn't showing on the calendar. Click “Edit schedule” to fix it.", "error"),
      el("p", {}, editBtn));
    return;
  }

  const actionMessage = el("div", { "aria-live": "polite" });
  const today = todayIso();

  // On / off switch
  const toggleBtn = el("button", { type: "button", class: "btn btn-secondary btn-small" },
    s.enabled ? "Turn reminders off" : "Turn reminders on");
  toggleBtn.addEventListener("click", async () => {
    toggleBtn.disabled = true;
    try {
      await updateFields(NAME, ID, { enabled: !s.enabled });
      setFlash(s.enabled
        ? "Recycling reminders are turned off. They're hidden from the calendar; the schedule is kept."
        : "Recycling reminders are turned on and showing on the calendar.");
      ctx.goList();
    } catch (error) {
      console.error(error);
      actionMessage.replaceChildren(messageBox(actionErrorText(error, "change the setting"), "error"));
      toggleBtn.disabled = false;
    }
  });

  const upcoming = nextPickups(s, today, 4);
  const link = safeUrl(s.officialUrl);

  const summary = el("div", { class: "card settings-card" },
    el("p", { class: "portal-item-meta" },
      s.enabled ? tag("Showing on the calendar", "tag-pinned") : tag("Turned off: hidden from residents", "tag-expired")),
    el("p", { class: "settings-sentence", text: scheduleSentence(s) }),
    el("p", {}, el("strong", { text: "Next pickups: " }),
      upcoming.map((p) => shortDate(p.iso) + (p.rescheduled ? " (rescheduled)" : "")).join(" · ")),
    el("p", {}, el("strong", { text: "Official calendar: " }),
      link
        ? el("a", { href: link, target: "_blank", rel: "noopener noreferrer", class: "test-link" },
            "Test link", el("span", { class: "visually-hidden", text: " (opens in a new tab)" }))
        : "no valid link saved"),
    el("div", { class: "portal-item-actions" }, editBtn, toggleBtn));

  // Date changes
  const addChangeBtn = el("button", { type: "button", class: "btn btn-primary btn-small" }, "+ Add a date change");
  addChangeBtn.addEventListener("click", () => ctx.goAction("add-change", ID));

  const isPast = (c) => (c.from > c.to ? c.from : c.to) < today;
  const current = s.changes.filter((c) => !isPast(c)).sort((a, b) => a.from.localeCompare(b.from));
  const past = s.changes.filter(isPast).sort((a, b) => b.from.localeCompare(a.from));

  function changeRow(c) {
    const matches = isRegularPickup(s, c.from);
    const name = `${shortDate(c.from)} moved to ${shortDate(c.to)}`;
    const removeBtn = itemButton("Remove", name, "btn btn-danger btn-small", async () => {
      const ok = await confirmBox({
        heading: "Remove this date change?",
        detail: `Normally ${formatDate(c.from)}, moved to ${formatDate(c.to)}`,
        note: "Recycling will show on the normal date again.",
        yes: "Yes, remove it",
        no: "No, keep it"
      });
      if (!ok) { removeBtn.focus(); return; }
      removeBtn.disabled = true;
      try {
        const fresh = normalizeSchedule(await getOne(NAME, ID));
        const remaining = (fresh ? fresh.changes : []).filter((x) => !(x.from === c.from && x.to === c.to));
        await updateFields(NAME, ID, { changes: remaining });
        setFlash(`Date change removed. Recycling shows on ${formatDate(c.from)} again.`);
        ctx.goList();
      } catch (error) {
        console.error(error);
        actionMessage.replaceChildren(messageBox(actionErrorText(error, "remove the date change"), "error"));
        removeBtn.disabled = false;
      }
    });
    return el("li", { class: "portal-item" + (matches ? "" : " is-muted") },
      el("div", { class: "portal-item-main" },
        el("h4", { class: "portal-item-title", text: `Moved to ${shortDate(c.to)}` }),
        el("p", { class: "portal-item-meta" }, `Normally ${shortDate(c.from)}`,
          matches ? null : tag("Doesn't match the schedule: check the date or remove it", "tag-expired"))),
      el("div", { class: "portal-item-actions" }, removeBtn));
  }

  box.replaceChildren(...[
    actionMessage,
    el("h3", { class: "list-group-heading", text: "Recycling schedule" }),
    summary,
    el("h3", { class: "list-group-heading", text: "Date changes" }),
    el("p", { class: "screen-help", text: "Use this only when the City of Boise confirms a different pickup date, for example after a holiday. The calendar shows the new date as “Rescheduled Recycling.”" }),
    el("p", { class: "add-row" }, addChangeBtn),
    current.length
      ? el("ul", { class: "portal-list" }, current.map(changeRow))
      : el("p", { class: "status-text", text: "No upcoming date changes." }),
    past.length ? el("h3", { class: "list-group-heading", text: `Past date changes (${past.length})` }) : null,
    past.length ? el("p", { class: "screen-help", text: "These no longer affect upcoming pickups. You can remove them to keep this list short." }) : null,
    past.length ? el("ul", { class: "portal-list is-past" }, past.map(changeRow)) : null,
    yearlyReminder()
  ].filter(Boolean));
}

// ---------- Forms ----------

const SCHEDULE_FIELDS = [
  { name: "referenceDate", label: "A pickup date to count from", type: "date", required: true,
    hint: "Any pickup date confirmed on the City's calendar. Its weekday becomes the pickup day." },
  { name: "intervalWeeks", label: "How often", type: "select", required: true,
    options: [["2", "Every other week (every 2 weeks)"], ["1", "Every week"]] },
  { name: "scheduleName", label: "Schedule name", type: "text", required: true, max: 30,
    hint: "As shown on the City's calendar, for example: Purple" },
  { name: "officialUrl", label: "Official City recycling calendar link", type: "text", required: true, max: 2000,
    hint: "The link to the City of Boise's recycling calendar. It must start with https://" },
  { name: "enabled", label: "Show recycling reminders on the calendar", type: "checkbox",
    hint: "Turn this off to hide recycling from the calendar without deleting the schedule." }
];

const CHANGE_FIELDS = [
  { name: "from", label: "Normal pickup date", type: "date", required: true,
    hint: "The date recycling would normally be picked up." },
  { name: "to", label: "New pickup date", type: "date", required: true,
    hint: `The date the City of Boise confirmed instead. It must be within ${MAX_MOVE_DAYS} days of the normal date.` }
];

function note(textContent) {
  return el("p", { class: "message message-info form-note", text: textContent });
}

async function form(ctx, id, action) {
  const box = ctx.body;
  box.replaceChildren(el("p", { class: "status-text", text: "Loading…" }));
  let raw;
  try {
    raw = await getOne(NAME, ID);
  } catch (error) {
    console.error(error);
    box.replaceChildren(loadErrorBox(() => form(ctx, id, action)));
    return null;
  }
  const existing = raw ? normalizeSchedule(raw) : null;

  if (action === "add-change") return changeForm(ctx, existing);

  // Set up (first time) or edit the schedule
  const isSetup = !raw;
  const values = isSetup
    ? { ...RECYCLING_SETUP_DEFAULTS, intervalWeeks: String(RECYCLING_SETUP_DEFAULTS.intervalWeeks) }
    : {
        referenceDate: existing ? existing.referenceDate : (raw.referenceDate || ""),
        intervalWeeks: String(existing ? existing.intervalWeeks : 2),
        scheduleName: existing ? existing.scheduleName : (raw.scheduleName || ""),
        officialUrl: (existing && existing.officialUrl) || raw.officialUrl || "",
        enabled: existing ? existing.enabled : true
      };

  const built = buildForm({
    fields: SCHEDULE_FIELDS,
    values,
    intro: isSetup
      ? note("These are the confirmed Spruce Meadows recycling settings. Check them against the City's calendar, then click Save. Recycling labels appear on the calendar as soon as you save.")
      : (existing && existing.changes.length
          ? note("Changing the pickup date or how often may make some date changes stop matching the schedule. Any that no longer match will be flagged so you can check or remove them.")
          : null),
    submitLabel: isSetup ? "Save and Turn On" : "Save Changes",
    validate(v) {
      const errors = {};
      if (!isIsoDate(v.referenceDate)) errors.referenceDate = "Please choose a pickup date.";
      const interval = Number(v.intervalWeeks);
      if (interval !== 1 && interval !== 2) errors.intervalWeeks = "Please choose how often.";
      errors.scheduleName = checkText(v.scheduleName, { label: "a schedule name", required: true, max: 30 });
      const url = cleanUrl(v.officialUrl, { required: true });
      if (url.error) errors.officialUrl = url.error;
      return {
        errors,
        data: {
          enabled: v.enabled === true,
          referenceDate: v.referenceDate,
          intervalWeeks: interval,
          scheduleName: v.scheduleName,
          officialUrl: url.value || ""
        }
      };
    },
    async save(data) {
      const now = await getOne(NAME, ID);
      if (now) {
        await updateFields(NAME, ID, data);       // keeps any date changes
      } else {
        await putDoc(NAME, ID, { ...data, changes: [] });
      }
      const every = data.intervalWeeks === 2 ? "every other" : "every";
      setFlash(`Recycling schedule saved: ${every} ${weekdayName(data.referenceDate)}, ${data.scheduleName} schedule. ` +
        (data.enabled ? "It's showing on the calendar." : "Reminders are turned off."));
    },
    onSaved: () => ctx.goList(),
    onCancel: () => ctx.goList()
  });
  box.replaceChildren(built.form);
  return built;
}

function changeForm(ctx, s) {
  const box = ctx.body;
  if (!s) {
    box.replaceChildren(messageBox("Please set up the recycling schedule first.", "error"));
    return null;
  }
  const upcoming = nextPickups(s, todayIso(), 6).filter((p) => !p.rescheduled).map((p) => shortDate(p.iso));

  const built = buildForm({
    fields: CHANGE_FIELDS,
    values: { from: "", to: "" },
    intro: note(`Only enter a change the City of Boise has confirmed. Upcoming normal pickups: ${upcoming.join(" · ")}.`),
    submitLabel: "Save Date Change",
    validate(v) {
      const errors = {};
      if (!isIsoDate(v.from)) errors.from = "Please choose the normal pickup date.";
      else if (!isRegularPickup(s, v.from)) {
        errors.from = `That isn't a normal pickup day on this schedule (pickups are ${s.intervalWeeks === 2 ? "every other" : "every"} ${weekdayName(s.referenceDate)}). Upcoming normal pickups: ${upcoming.slice(0, 4).join(", ")}.`;
      } else if (s.changes.some((c) => c.from === v.from)) {
        errors.from = "This pickup already has a date change. Remove that change first if you need a different date.";
      }
      if (!isIsoDate(v.to)) errors.to = "Please choose the new pickup date.";
      else if (v.to === v.from) errors.to = "The new date must be different from the normal date.";
      else if (isIsoDate(v.from) && Math.abs(daysBetween(v.from, v.to)) > MAX_MOVE_DAYS) {
        errors.to = `The new date must be within ${MAX_MOVE_DAYS} days of the normal pickup date. Please check both dates.`;
      } else if (isRegularPickup(s, v.to)) errors.to = "That date is already a normal pickup day.";
      else if (s.changes.some((c) => c.to === v.to)) errors.to = "Another date change already moves a pickup to this date.";
      if (s.changes.length >= MAX_DATE_CHANGES) {
        errors.from = "There are too many saved date changes. Please remove some past date changes first.";
      }
      return { errors, data: { from: v.from, to: v.to } };
    },
    async save(change) {
      const fresh = normalizeSchedule(await getOne(NAME, ID));
      const changes = [...(fresh ? fresh.changes : []), change].sort((a, b) => a.from.localeCompare(b.from));
      await updateFields(NAME, ID, { changes });
      setFlash(`Date change saved: recycling normally on ${formatDate(change.from)} will show on ${formatDate(change.to)} as “Rescheduled Recycling.”`);
    },
    onSaved: () => ctx.goList(),
    onCancel: () => ctx.goList()
  });
  box.replaceChildren(built.form);
  return built;
}

export default {
  title: "Calendar Settings",
  addLabel: null,               // this screen has its own buttons
  editTitle: "Edit Recycling Schedule",
  extraFormActions: ["setup", "edit-schedule", "add-change"],
  formTitles: {
    setup: "Set Up Recycling Reminders",
    "edit-schedule": "Edit Recycling Schedule",
    "add-change": "Add a Recycling Date Change"
  },
  help: "Recycling reminders on the Calendar page. Recycling never appears in Upcoming Events or on the Home page.",
  list,
  form
};
