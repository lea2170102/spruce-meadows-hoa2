// Spruce Meadows HOA - Board Portal: Resources.
//
// The website only stores LINKS. The PDFs stay in Google Drive.
// Removing a resource here never deletes anything from Google Drive.

import { el, text, timestampMillis, safeUrl } from "../utils.js";
import {
  listDocs, getOne, newId, createDoc, updateFields, removeDoc,
  buildForm, checkText, cleanUrl, confirmDelete, setFlash, messageBox,
  loadErrorBox, itemButton, tag, actionErrorText
} from "./common.js";

const NAME = "resources";

const CATEGORIES = [
  ["governing", "Governing Documents"],
  ["minutes", "Meeting Minutes"],
  ["dues", "HOA Dues"],
  ["other", "Other Resources"]
];
const CATEGORY_NAMES = Object.fromEntries(CATEGORIES);
const LIST_ORDER = ["dues", "governing", "minutes", "other"];

function normalize(raw) {
  return {
    id: raw.id,
    title: text(raw.title) || "(No name)",
    category: CATEGORY_NAMES[raw.category] ? raw.category : "other",
    year: Number.isInteger(raw.year) ? raw.year : null,
    url: text(raw.url),
    description: text(raw.description),
    created: timestampMillis(raw.createdAt)
  };
}

function shortLink(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ---------- List ----------

async function list(ctx) {
  const box = ctx.body;
  box.replaceChildren(el("p", { class: "status-text", text: "Loading resources…" }));
  let items;
  try {
    items = (await listDocs(NAME)).map(normalize);
  } catch (error) {
    console.error(error);
    box.replaceChildren(loadErrorBox(() => list(ctx)));
    return;
  }
  if (!items.length) {
    box.replaceChildren(el("p", { class: "status-text", text: "There are no resources yet. Click “+ Add Resource” to add a link." }));
    return;
  }

  const actionMessage = el("div", { "aria-live": "polite" });
  const groups = LIST_ORDER.map((cat) => {
    const inCat = items.filter((r) => r.category === cat).sort((a, b) =>
      cat === "minutes"
        ? (b.year ?? 0) - (a.year ?? 0) || b.created - a.created
        : a.title.localeCompare(b.title, "en", { numeric: true }));
    if (!inCat.length) return null;
    return [
      el("h3", { class: "list-group-heading", text: CATEGORY_NAMES[cat] }),
      el("ul", { class: "portal-list" }, inCat.map((r) => {
        const delBtn = itemButton("Remove", r.title, "btn btn-danger btn-small", async () => {
          const ok = await confirmDelete("resource", r.title);
          if (!ok) { delBtn.focus(); return; }
          delBtn.disabled = true;
          try {
            await removeDoc(NAME, r.id);
            setFlash(`Resource removed from the website: “${r.title}”. The file in Google Drive was not changed.`);
            ctx.goList();
          } catch (error) {
            console.error(error);
            actionMessage.replaceChildren(messageBox(actionErrorText(error, "remove the resource"), "error"));
            delBtn.disabled = false;
          }
        });
        return el("li", { class: "portal-item" },
          el("div", { class: "portal-item-main" },
            el("h4", { class: "portal-item-title", text: r.title }),
            el("p", { class: "portal-item-meta" },
              r.year ? tag(String(r.year)) : null,
              safeUrl(r.url)
                ? el("a", { href: safeUrl(r.url), target: "_blank", rel: "noopener noreferrer", class: "test-link" },
                    `Test link (${shortLink(r.url)})`,
                    el("span", { class: "visually-hidden", text: " (opens in a new tab)" }))
                : tag("Link problem: please edit and paste the link again", "tag-expired"))),
          el("div", { class: "portal-item-actions" },
            itemButton("Edit", r.title, "btn btn-primary btn-small", () => ctx.goEdit(r.id)),
            delBtn)
        );
      }))
    ];
  }).filter(Boolean).flat();

  box.replaceChildren(actionMessage, ...groups);
}

// ---------- Add / Edit form ----------

function driveReminder() {
  return el("div", { class: "drive-reminder", role: "note" },
    el("p", { class: "drive-reminder-title", text: "Before you add a Google Drive link" }),
    el("ol", {},
      el("li", {}, "In Google Drive, open the file's ", el("strong", { text: "Share" }), " menu."),
      el("li", {}, "Under “General access,” choose ", el("strong", { text: "Anyone with the link" }), "."),
      el("li", {}, "Set the role to ", el("strong", { text: "Viewer" }), "."),
      el("li", {}, "Click ", el("strong", { text: "Copy link" }), " and paste it below.")),
    el("p", { text: "If you skip this, residents will be asked to sign in to Google and won't be able to open the file." }),
    el("p", { text: "Removing a resource here only removes the link from the website. It never deletes the file from Google Drive." })
  );
}

const FIELDS = [
  { name: "title", label: "Display name", type: "text", required: true, max: 150,
    hint: "What residents click, for example: Spruce Meadows Covenants. For HOA Dues, this becomes the button text, for example: Pay HOA Dues Online." },
  { name: "category", label: "Category", type: "select", required: true, options: CATEGORIES },
  { name: "year", label: "Year", type: "year",
    hint: "Used to group Meeting Minutes by year, for example: 2026. Leave blank for other resources." },
  { name: "url", label: "Link", type: "text", required: true, max: 2000,
    hint: "Paste the Google Drive share link or website address. It must start with https://" },
  { name: "description", label: "Short description", type: "textarea", max: 500, rows: 3,
    hint: "One sentence residents see under the name." }
];

async function form(ctx, id) {
  const box = ctx.body;
  let original = { title: "", category: "governing", year: "", url: "", description: "" };

  if (id) {
    box.replaceChildren(el("p", { class: "status-text", text: "Loading…" }));
    try {
      const raw = await getOne(NAME, id);
      if (!raw) {
        box.replaceChildren(messageBox("This resource couldn't be found. It may have been removed.", "error"));
        return null;
      }
      const r = normalize(raw);
      original = { ...r, year: r.year ?? "" };
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
    intro: driveReminder(),
    submitLabel: id ? "Save Changes" : "Add Resource",
    validate(v) {
      const errors = {};
      errors.title = checkText(v.title, { label: "a display name", required: true, max: 150 });
      if (!CATEGORY_NAMES[v.category]) errors.category = "Please choose a category.";
      let year = null;
      if (v.year) {
        year = /^\d{4}$/.test(v.year) ? Number(v.year) : NaN;
        if (!(year >= 1950 && year <= 2100)) errors.year = "Please enter a four-digit year, like 2026, or leave it blank.";
      }
      const url = cleanUrl(v.url, { required: true });
      if (url.error) errors.url = url.error;
      errors.description = checkText(v.description, { label: "a description", required: false, max: 500 });
      return {
        errors,
        data: {
          title: v.title,
          category: v.category,
          year: Number.isInteger(year) ? year : null,
          url: url.value || "",
          description: v.description || ""
        }
      };
    },
    async save(data) {
      if (id) {
        await updateFields(NAME, id, data);
        setFlash(`Changes saved to “${data.title}”.`);
      } else {
        await createDoc(NAME, docId, data);
        setFlash(`Resource added: “${data.title}”. Residents can see it on the Resources page now. Use “Test link” to make sure it opens.`);
      }
    },
    onSaved: () => ctx.goList(),
    onCancel: () => ctx.goList()
  });

  box.replaceChildren(built.form);
  return built;
}

export default {
  title: "Resources",
  addLabel: "Add Resource",
  addTitle: "Add Resource",
  editTitle: "Edit Resource",
  help: "Links to HOA documents in Google Drive and other websites, including the HOA dues payment site. The files themselves stay in Google Drive.",
  list,
  form
};
