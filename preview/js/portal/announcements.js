// Spruce Meadows HOA - Board Portal: Announcements.

import {
  el, text, isIsoDate, todayIso, timestampToIso, timestampMillis, formatDate
} from "../utils.js";
import {
  listDocs, getOne, newId, createDoc, updateFields, removeDoc,
  buildForm, checkText, cleanUrl, confirmDelete, setFlash, messageBox,
  loadErrorBox, itemButton, tag, actionErrorText
} from "./common.js";

const NAME = "announcements";
const shortDate = (iso) => formatDate(iso, { month: "short", day: "numeric", year: "numeric" });

// Works with announcements from the old website too (title, body, createdAt only).
function normalize(raw) {
  return {
    id: raw.id,
    title: text(raw.title) || "(No title)",
    body: text(raw.body),
    publishDate: isIsoDate(raw.publishDate) ? raw.publishDate : (timestampToIso(raw.createdAt) || ""),
    expiresOn: isIsoDate(raw.expiresOn) ? raw.expiresOn : "",
    pinned: raw.pinned === true,
    buttonText: text(raw.buttonText),
    buttonUrl: text(raw.buttonUrl),
    created: timestampMillis(raw.createdAt)
  };
}

function compare(a, b) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return b.publishDate.localeCompare(a.publishDate) || b.created - a.created;
}

// ---------- List ----------

async function list(ctx) {
  const box = ctx.body;
  box.replaceChildren(el("p", { class: "status-text", text: "Loading announcements…" }));
  let items;
  try {
    items = (await listDocs(NAME)).map(normalize).sort(compare);
  } catch (error) {
    console.error(error);
    box.replaceChildren(loadErrorBox(() => list(ctx)));
    return;
  }
  if (!items.length) {
    box.replaceChildren(el("p", { class: "status-text", text: "There are no announcements yet. Click “+ Add Announcement” to post one." }));
    return;
  }

  const today = todayIso();
  const actionMessage = el("div", { "aria-live": "polite" });

  const rows = items.map((a) => {
    const expired = a.expiresOn && a.expiresOn < today;
    const tags = [
      a.pinned && tag("Pinned", "tag-pinned"),
      expired ? tag("Expired: hidden from residents", "tag-expired")
        : a.expiresOn ? tag(`Shows through ${shortDate(a.expiresOn)}`) : null
    ];
    const pinBtn = itemButton(a.pinned ? "Unpin" : "Pin to top", a.title, "btn btn-secondary btn-small", async () => {
      pinBtn.disabled = true;
      try {
        await updateFields(NAME, a.id, { pinned: !a.pinned });
        setFlash(a.pinned ? `“${a.title}” is no longer pinned.` : `“${a.title}” is now pinned to the top of the Home page.`);
        ctx.goList();
      } catch (error) {
        console.error(error);
        actionMessage.replaceChildren(messageBox(actionErrorText(error, "change the pin"), "error"));
        pinBtn.disabled = false;
      }
    });
    const delBtn = itemButton("Delete", a.title, "btn btn-danger btn-small", async () => {
      if (!(await confirmDelete("announcement", a.title))) { delBtn.focus(); return; }
      delBtn.disabled = true;
      try {
        await removeDoc(NAME, a.id);
        setFlash(`Announcement deleted: “${a.title}”.`);
        ctx.goList();
      } catch (error) {
        console.error(error);
        actionMessage.replaceChildren(messageBox(actionErrorText(error, "delete the announcement"), "error"));
        delBtn.disabled = false;
      }
    });

    return el("li", { class: "portal-item" + (expired ? " is-muted" : "") },
      el("div", { class: "portal-item-main" },
        el("h3", { class: "portal-item-title", text: a.title }),
        el("p", { class: "portal-item-meta" },
          a.publishDate ? `Posted ${shortDate(a.publishDate)}` : "No date",
          ...tags.filter(Boolean))),
      el("div", { class: "portal-item-actions" },
        itemButton("Edit", a.title, "btn btn-primary btn-small", () => ctx.goEdit(a.id)),
        pinBtn,
        delBtn)
    );
  });

  box.replaceChildren(actionMessage, el("ul", { class: "portal-list" }, rows));
}

// ---------- Add / Edit form ----------

const FIELDS = [
  { name: "title", label: "Title", type: "text", required: true, max: 150,
    hint: "A short headline, for example: Annual Meeting on November 12" },
  { name: "body", label: "Message", type: "textarea", required: true, max: 5000, rows: 7,
    hint: "Web addresses you type here become clickable links. For a neat button instead, use the button fields below." },
  { name: "publishDate", label: "Date shown on the announcement", type: "date", required: true,
    hint: "Residents see this date. It doesn't schedule anything: the announcement appears as soon as you publish it." },
  { name: "pinned", label: "Pin to the top of the Home page", type: "checkbox",
    hint: "Pinned announcements always appear above the others." },
  { name: "expiresOn", label: "Stop showing after", type: "date",
    hint: "Residents see it through this date, and it hides automatically the next day. Leave blank to keep it up until you delete it." },
  { name: "buttonText", label: "Button text", type: "text", max: 60,
    hint: "For example: View Meeting Agenda" },
  { name: "buttonUrl", label: "Button link", type: "text", max: 2000,
    hint: "The web address the button opens, for example a Google Drive link. It must start with https://" }
];

async function form(ctx, id) {
  const box = ctx.body;
  let original = { title: "", body: "", publishDate: todayIso(), pinned: false, expiresOn: "", buttonText: "", buttonUrl: "" };

  if (id) {
    box.replaceChildren(el("p", { class: "status-text", text: "Loading…" }));
    try {
      const raw = await getOne(NAME, id);
      if (!raw) {
        box.replaceChildren(messageBox("This announcement couldn't be found. It may have been deleted.", "error"));
        return null;
      }
      original = normalize(raw);
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
    submitLabel: id ? "Save Changes" : "Publish Announcement",
    validate(v) {
      const errors = {};
      errors.title = checkText(v.title, { label: "a title", required: true, max: 150 });
      errors.body = checkText(v.body, { label: "a message", required: true, max: 5000 });
      if (!isIsoDate(v.publishDate)) errors.publishDate = "Please choose a date.";
      if (v.expiresOn && !isIsoDate(v.expiresOn)) errors.expiresOn = "Please choose a valid date, or leave it blank.";
      else if (v.expiresOn && v.expiresOn < todayIso() && v.expiresOn !== original.expiresOn) {
        errors.expiresOn = "This date is in the past, so residents would never see this announcement. Choose today or a later date, or leave it blank.";
      }
      errors.buttonText = checkText(v.buttonText, { label: "button text", required: false, max: 60 });
      const url = cleanUrl(v.buttonUrl);
      if (url.error) errors.buttonUrl = url.error;
      if (v.buttonText && !v.buttonUrl) errors.buttonUrl = "Please add the link the button should open, or clear the button text.";
      if (v.buttonUrl && !v.buttonText && !url.error) errors.buttonText = "Please add the words to show on the button, for example: View Meeting Agenda.";
      return {
        errors,
        data: {
          title: v.title,
          body: v.body,
          publishDate: v.publishDate,
          pinned: v.pinned,
          expiresOn: v.expiresOn || "",
          buttonText: v.buttonText || "",
          buttonUrl: url.value || ""
        }
      };
    },
    async save(data) {
      if (id) {
        await updateFields(NAME, id, data);
        setFlash(`Changes saved to “${data.title}”.`);
      } else {
        await createDoc(NAME, docId, data);
        setFlash(`Announcement published: “${data.title}”. Residents can see it now.`);
      }
    },
    onSaved: () => ctx.goList(),
    onCancel: () => ctx.goList()
  });

  box.replaceChildren(built.form);
  return built;
}

export default {
  title: "Announcements",
  addLabel: "Add Announcement",
  addTitle: "Add Announcement",
  editTitle: "Edit Announcement",
  help: "News for residents on the Home page. Pinned announcements show first; the rest show newest first.",
  list,
  form
};
