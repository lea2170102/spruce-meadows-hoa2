// Spruce Meadows HOA - Board Portal: Announcements (active and archived).
//
// Active announcements live in "announcements" (what residents see).
// Archived announcements live in "announcementArchive" (board only).
// Archive and Restore MOVE a record between the two lists in one save
// (see moveDoc in common.js): all of its fields are kept exactly as stored.

import {
  el, text, isIsoDate, todayIso, timestampToIso, timestampMillis, formatDate
} from "../utils.js?v=2026-10-25-c4b";
import {
  listDocs, getOne, newId, createDoc, updateFields, removeDoc, moveDoc, now,
  buildForm, checkText, cleanUrl, confirmBox, setFlash, messageBox,
  loadErrorBox, itemButton, tag, actionErrorText
} from "./common.js?v=2026-10-25-c4b";

const NAME = "announcements";
const ARCHIVE = "announcementArchive";
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
    created: timestampMillis(raw.createdAt),
    archived: timestampMillis(raw.archivedAt),
    archivedOn: timestampToIso(raw.archivedAt) || ""
  };
}

function compareActive(a, b) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return b.publishDate.localeCompare(a.publishDate) || b.created - a.created;
}
const compareArchived = (a, b) => b.archived - a.archived || compareActive(a, b);

const isExpired = (a) => Boolean(a.expiresOn && a.expiresOn < todayIso());

// Confirmation for permanent deletes (the existing confirmation box, stronger wording).
function confirmPermanentDelete(a, archived) {
  return confirmBox({
    heading: "Delete this announcement permanently?",
    detail: `“${a.title}”`,
    note: archived
      ? "This can't be undone. If you might want it later, leave it in the archive instead."
      : "This can't be undone. If you might want it later, choose Archive instead.",
    yes: "Yes, delete permanently",
    no: "No, keep it"
  });
}

// ---------- Lists ----------

async function list(ctx) {
  const box = ctx.body;
  box.replaceChildren(el("p", { class: "status-text", text: "Loading announcements…" }));
  let active, archived;
  try {
    const [a, b] = await Promise.all([listDocs(NAME), listDocs(ARCHIVE)]);
    active = a.map(normalize).sort(compareActive);
    archived = b.map(normalize).sort(compareArchived);
  } catch (error) {
    console.error(error);
    box.replaceChildren(loadErrorBox(() => list(ctx)));
    return;
  }

  const actionMessage = el("div", { "aria-live": "polite" });

  // Runs a button's action, keeping the row's buttons disabled while it saves.
  function rowAction(row, errorWords, work) {
    return async () => {
      const buttons = row.querySelectorAll("button");
      buttons.forEach((b) => { b.disabled = true; });
      try {
        await work();
        ctx.goList();
      } catch (error) {
        console.error(error);
        actionMessage.replaceChildren(messageBox(actionErrorText(error, errorWords), "error"));
        buttons.forEach((b) => { b.disabled = false; });
      }
    };
  }

  function activeRow(a) {
    const expired = isExpired(a);
    const actions = el("div", { class: "portal-item-actions" });
    const row = el("li", { class: "portal-item" + (expired ? " is-muted" : "") },
      el("div", { class: "portal-item-main" },
        el("h4", { class: "portal-item-title", text: a.title }),
        el("p", { class: "portal-item-meta" },
          a.publishDate ? `Posted ${shortDate(a.publishDate)}` : "No date",
          a.pinned ? tag("Pinned", "tag-pinned") : null,
          expired ? tag("Expired: hidden from residents", "tag-expired")
            : a.expiresOn ? tag(`Shows through ${shortDate(a.expiresOn)}`) : null)),
      actions);

    actions.append(
      itemButton("Edit", a.title, "btn btn-primary btn-small", () => ctx.goEdit(a.id)),
      itemButton(a.pinned ? "Unpin" : "Pin to top", a.title, "btn btn-secondary btn-small",
        rowAction(row, "change the pin", async () => {
          await updateFields(NAME, a.id, { pinned: !a.pinned });
          setFlash(a.pinned ? `“${a.title}” is no longer pinned.`
            : `“${a.title}” is now pinned to the top of the Home page.`);
        })),
      itemButton("Archive", a.title, "btn btn-secondary btn-small",
        rowAction(row, "archive the announcement", async () => {
          await moveDoc(NAME, ARCHIVE, a.id, (stored) => ({ ...stored, archivedAt: now() }));
          setFlash(`Archived: “${a.title}”. It's hidden from residents. You can restore it any time from Archived Announcements.`);
        })),
      itemButton("Delete permanently", a.title, "btn btn-danger btn-small", async (event) => {
        const button = event.currentTarget;
        if (!(await confirmPermanentDelete(a, false))) { button.focus(); return; }
        await rowAction(row, "delete the announcement", async () => {
          await removeDoc(NAME, a.id);
          setFlash(`Announcement permanently deleted: “${a.title}”.`);
        })();
      })
    );
    return row;
  }

  function archivedRow(a) {
    const actions = el("div", { class: "portal-item-actions" });
    const row = el("li", { class: "portal-item is-archived" },
      el("div", { class: "portal-item-main" },
        el("h4", { class: "portal-item-title", text: a.title }),
        el("p", { class: "portal-item-meta" },
          a.publishDate ? `Posted ${shortDate(a.publishDate)}` : "No date",
          a.archivedOn ? tag(`Archived ${shortDate(a.archivedOn)}`, "tag-archived") : tag("Archived", "tag-archived"),
          a.pinned ? tag("Was pinned") : null)),
      actions);

    actions.append(
      itemButton("Edit", a.title, "btn btn-primary btn-small", () => ctx.goAction("edit-archived", a.id)),
      itemButton("Restore", a.title, "btn btn-secondary btn-small",
        rowAction(row, "restore the announcement", async () => {
          await moveDoc(ARCHIVE, NAME, a.id, (stored) => {
            const { archivedAt, ...original } = stored;
            return original;
          });
          setFlash(isExpired(a)
            ? `Restored: “${a.title}”. Its “stop showing after” date (${shortDate(a.expiresOn)}) has passed, so residents still won't see it. Edit it and change or clear that date to show it again.`
            : `Restored: “${a.title}”. It's active again with its original date${a.pinned ? " and pin" : ""}.`);
        })),
      itemButton("Repost as new", a.title, "btn btn-secondary btn-small", () => ctx.goAction("repost", a.id)),
      itemButton("Delete permanently", a.title, "btn btn-danger btn-small", async (event) => {
        const button = event.currentTarget;
        if (!(await confirmPermanentDelete(a, true))) { button.focus(); return; }
        await rowAction(row, "delete the announcement", async () => {
          await removeDoc(ARCHIVE, a.id);
          setFlash(`Archived announcement permanently deleted: “${a.title}”.`);
        })();
      })
    );
    return row;
  }

  box.replaceChildren(
    actionMessage,
    el("h3", { class: "list-group-heading", text: "Active Announcements" }),
    el("p", { class: "screen-help", text: "Archive hides an announcement from residents but keeps it below, so you can restore or repost it later." }),
    active.length
      ? el("ul", { class: "portal-list" }, active.map(activeRow))
      : el("p", { class: "status-text", text: "There are no active announcements. Click “+ Add Announcement” to post one." }),
    el("h3", { class: "list-group-heading", text: `Archived Announcements (${archived.length})` }),
    el("p", { class: "screen-help", text: "Hidden from residents. “Restore” brings back the original exactly as it was. “Repost as new” makes a fresh copy dated today for you to review before publishing; the archived original stays here." }),
    archived.length
      ? el("ul", { class: "portal-list is-archive" }, archived.map(archivedRow))
      : el("p", { class: "status-text", text: "No archived announcements." })
  );
}

// ---------- Forms: add, edit, edit archived, repost ----------

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

function note(textContent) {
  return el("p", { class: "message message-info form-note", text: textContent });
}

async function form(ctx, id, action = id ? "edit" : "add") {
  const box = ctx.body;
  let original = { title: "", body: "", publishDate: todayIso(), pinned: false, expiresOn: "", buttonText: "", buttonUrl: "" };
  const source = action === "edit-archived" || action === "repost" ? ARCHIVE : NAME;

  if (id) {
    box.replaceChildren(el("p", { class: "status-text", text: "Loading…" }));
    try {
      const raw = await getOne(source, id);
      if (!raw) {
        box.replaceChildren(messageBox("This announcement couldn't be found. It may have been moved or deleted.", "error"));
        return null;
      }
      original = normalize(raw);
    } catch (error) {
      console.error(error);
      box.replaceChildren(loadErrorBox(() => form(ctx, id, action)));
      return null;
    }
  }

  let values = original;
  let intro = null;
  if (action === "repost") {
    // A NEW announcement: content copied, today's date, unpinned, no expiration.
    values = { ...original, publishDate: todayIso(), pinned: false, expiresOn: "" };
    original = { ...values };
    intro = note("You're making a new announcement from an archived one. It's dated today, unpinned, and has no “stop showing after” date. Check and edit it, then click Publish. Nothing is created until you publish, and the archived original won't change.");
  } else if (action === "edit-archived") {
    intro = note("This announcement is archived, so residents can't see it. Saving your changes keeps it archived. To show it again, use “Restore” on the Announcements screen.");
  }

  const isNew = action === "add" || action === "repost";
  const docId = isNew ? newId(NAME) : id;

  const built = buildForm({
    fields: FIELDS,
    values,
    intro,
    submitLabel: isNew ? "Publish Announcement" : "Save Changes",
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
      if (action === "edit") {
        await updateFields(NAME, id, data);
        setFlash(`Changes saved to “${data.title}”.`);
      } else if (action === "edit-archived") {
        await updateFields(ARCHIVE, id, data);
        setFlash(`Changes saved to the archived announcement “${data.title}”. It's still archived.`);
      } else {
        await createDoc(NAME, docId, data);
        setFlash(action === "repost"
          ? `Reposted as a new announcement: “${data.title}”. Residents can see it now. The archived original is unchanged.`
          : `Announcement published: “${data.title}”. Residents can see it now.`);
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
  extraFormActions: ["edit-archived", "repost"],
  formTitles: { "edit-archived": "Edit Archived Announcement", repost: "Repost as a New Announcement" },
  help: "News for residents on the Home page. Pinned announcements show first; the rest show newest first.",
  list,
  form
};
