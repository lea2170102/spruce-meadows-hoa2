// Spruce Meadows HOA - Board Portal: Calendar events.

import { el, text, isIsoDate, isTime, todayIso, formatDate } from "../utils.js";
import { normalizeEvent, compareEvents, timeText, CATEGORY_LABELS } from "../events.js";
import {
  listDocs, getOne, newId, createDoc, updateFields, removeDoc,
  buildForm, checkText, cleanUrl, confirmDelete, setFlash, messageBox,
  loadErrorBox, itemButton, tag, actionErrorText
} from "./common.js";

const NAME = "events";

// ---------- List ----------

function eventRow(ev, ctx, actionMessage) {
  const when = formatDate(ev.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) +
    (ev.startTime ? ` · ${timeText(ev)}` : "");
  const delBtn = itemButton("Delete", ev.title, "btn btn-danger btn-small", async () => {
    if (!(await confirmDelete("event", ev.title))) { delBtn.focus(); return; }
    delBtn.disabled = true;
    try {
      await removeDoc(NAME, ev.id);
      setFlash(`Event deleted: “${ev.title}”.`);
      ctx.goList();
    } catch (error) {
      console.error(error);
      actionMessage.replaceChildren(messageBox(actionErrorText(error, "delete the event"), "error"));
      delBtn.disabled = false;
    }
  });
  return el("li", { class: "portal-item" },
    el("div", { class: "portal-item-main" },
      el("h4", { class: "portal-item-title", text: ev.title }),
      el("p", { class: "portal-item-meta" }, when, tag(CATEGORY_LABELS[ev.category]))),
    el("div", { class: "portal-item-actions" },
      itemButton("Edit", ev.title, "btn btn-primary btn-small", () => ctx.goEdit(ev.id)),
      delBtn)
  );
}

async function list(ctx) {
  const box = ctx.body;
  box.replaceChildren(el("p", { class: "status-text", text: "Loading events…" }));
  let events;
  try {
    events = (await listDocs(NAME)).map(normalizeEvent).filter(Boolean).sort(compareEvents);
  } catch (error) {
    console.error(error);
    box.replaceChildren(loadErrorBox(() => list(ctx)));
    return;
  }
  if (!events.length) {
    box.replaceChildren(el("p", { class: "status-text", text: "There are no events yet. Click “+ Add Event” to add one." }));
    return;
  }
  const today = todayIso();
  const upcoming = events.filter((e) => e.date >= today);
  const past = events.filter((e) => e.date < today).reverse();   // most recent first
  const actionMessage = el("div", { "aria-live": "polite" });

  box.replaceChildren(...[
    actionMessage,
    el("h3", { class: "list-group-heading", text: "Upcoming events" }),
    upcoming.length
      ? el("ul", { class: "portal-list" }, upcoming.map((e) => eventRow(e, ctx, actionMessage)))
      : el("p", { class: "status-text", text: "No upcoming events." }),
    past.length ? el("h3", { class: "list-group-heading", text: "Past events" }) : null,
    past.length ? el("p", { class: "screen-help", text: "Past events stay on the month calendar for residents. You can delete old ones if you like." }) : null,
    past.length ? el("ul", { class: "portal-list is-past" }, past.map((e) => eventRow(e, ctx, actionMessage))) : null
  ].filter(Boolean));
}

// ---------- Add / Edit form ----------

const FIELDS = [
  { name: "title", label: "Event title", type: "text", required: true, max: 150,
    hint: "For example: Fall HOA Board Meeting" },
  { name: "category", label: "Category", type: "select", required: true,
    options: [["meeting", "HOA Meeting"], ["community", "Community Event"], ["other", "Other"]] },
  { name: "date", label: "Date", type: "date", required: true },
  { name: "startTime", label: "Start time", type: "time",
    hint: "Leave blank if the time isn't set yet or it's an all-day event." },
  { name: "endTime", label: "End time", type: "time",
    hint: "Leave blank if there's no set end time." },
  { name: "location", label: "Location", type: "text", max: 200,
    hint: "For example: Spruce Meadows Clubhouse" },
  { name: "description", label: "Description", type: "textarea", max: 3000, rows: 5,
    hint: "Details residents should know, such as the agenda or what to bring." },
  { name: "url", label: "Link", type: "text", max: 2000,
    hint: "Optional web address for more information, for example a meeting agenda in Google Drive. It must start with https://" }
];

async function form(ctx, id) {
  const box = ctx.body;
  let original = { title: "", category: "meeting", date: "", startTime: "", endTime: "", location: "", description: "", url: "" };

  if (id) {
    box.replaceChildren(el("p", { class: "status-text", text: "Loading…" }));
    try {
      const raw = await getOne(NAME, id);
      const ev = raw && normalizeEvent(raw);
      if (!raw) {
        box.replaceChildren(messageBox("This event couldn't be found. It may have been deleted.", "error"));
        return null;
      }
      // normalizeEvent hides unsafe links; show the board exactly what is saved instead.
      original = ev
        ? { ...ev, url: text(raw.url) }
        : { ...original, title: text(raw.title), date: "" };
    } catch (error) {
      console.error(error);
      box.replaceChildren(loadErrorBox(() => form(ctx, id)));
      return null;
    }
  }

  const docId = id || newId(NAME);

  const built = buildForm({
    fields: FIELDS,
    values: original,
    submitLabel: id ? "Save Changes" : "Add Event",
    validate(v) {
      const errors = {};
      errors.title = checkText(v.title, { label: "an event title", required: true, max: 150 });
      if (!CATEGORY_LABELS[v.category]) errors.category = "Please choose a category.";
      if (!isIsoDate(v.date)) errors.date = "Please choose a date.";
      if (v.startTime && !isTime(v.startTime)) errors.startTime = "Please choose a valid time, or leave it blank.";
      if (v.endTime && !isTime(v.endTime)) errors.endTime = "Please choose a valid time, or leave it blank.";
      else if (v.endTime && !v.startTime) errors.endTime = "Please add a start time too, or clear the end time.";
      else if (v.endTime && v.startTime && v.endTime <= v.startTime) errors.endTime = "The end time must be after the start time.";
      errors.location = checkText(v.location, { label: "a location", required: false, max: 200 });
      errors.description = checkText(v.description, { label: "a description", required: false, max: 3000 });
      const url = cleanUrl(v.url);
      if (url.error) errors.url = url.error;
      return {
        errors,
        data: {
          title: v.title,
          category: v.category,
          date: v.date,
          startTime: v.startTime || "",
          endTime: v.endTime || "",
          location: v.location || "",
          description: v.description || "",
          url: url.value || ""
        }
      };
    },
    async save(data) {
      if (id) {
        await updateFields(NAME, id, data);
        setFlash(`Changes saved to “${data.title}”.`);
      } else {
        await createDoc(NAME, docId, data);
        setFlash(`Event added: “${data.title}” on ${formatDate(data.date)}. Residents can see it now.`);
      }
    },
    onSaved: () => ctx.goList(),
    onCancel: () => ctx.goList()
  });

  box.replaceChildren(built.form);
  return built;
}

export default {
  title: "Calendar",
  addLabel: "Add Event",
  addTitle: "Add Event",
  editTitle: "Edit Event",
  help: "HOA meetings and community events. Past events drop off the Upcoming list automatically.",
  list,
  form
};
