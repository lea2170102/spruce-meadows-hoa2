// Spruce Meadows HOA - Board Portal: Board Members (positions on the Contact page).

import { el, text, timestampMillis } from "../utils.js";
import {
  listDocs, getOne, newId, createDoc, updateFields, updateMany, removeDoc,
  buildForm, checkText, confirmDelete, setFlash, messageBox,
  loadErrorBox, itemButton, actionErrorText
} from "./common.js";

const NAME = "boardMembers";

function normalize(raw) {
  return {
    id: raw.id,
    role: text(raw.role) || "(No position title)",
    name: text(raw.name),
    order: Number.isFinite(raw.order) ? raw.order : 0,
    created: timestampMillis(raw.createdAt)
  };
}

const compare = (a, b) => a.order - b.order || a.created - b.created || a.role.localeCompare(b.role);

async function loadSorted() {
  return (await listDocs(NAME)).map(normalize).sort(compare);
}

// ---------- List ----------

async function list(ctx) {
  const box = ctx.body;
  box.replaceChildren(el("p", { class: "status-text", text: "Loading board positions…" }));
  let items;
  try {
    items = await loadSorted();
  } catch (error) {
    console.error(error);
    box.replaceChildren(loadErrorBox(() => list(ctx)));
    return;
  }
  if (!items.length) {
    box.replaceChildren(el("p", { class: "status-text", text: "There are no board positions yet. Click “+ Add Board Position” to add one, for example President." }));
    return;
  }

  const actionMessage = el("div", { "aria-live": "polite" });

  // Moves one position up or down. All positions are renumbered 1, 2, 3…
  // and saved together, so the order can never end up half-changed.
  async function move(index, delta, button) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const reordered = items.slice();
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const changes = reordered
      .map((m, i) => ({ id: m.id, data: { order: i + 1 }, changed: m.order !== i + 1 }))
      .filter((c) => c.changed)
      .map(({ id, data }) => ({ id, data }));
    box.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    try {
      await updateMany(NAME, changes);
      setFlash(`Moved “${items[index].role}” ${delta < 0 ? "up" : "down"}.`);
      ctx.goList();
    } catch (error) {
      console.error(error);
      box.querySelectorAll("button").forEach((b) => { b.disabled = false; });
      actionMessage.replaceChildren(messageBox(actionErrorText(error, "change the order"), "error"));
      button.focus();
    }
  }

  const rows = items.map((m, i) => {
    const label = m.name ? `${m.role}, ${m.name}` : m.role;
    const upBtn = itemButton("Move up", m.role, "btn btn-secondary btn-small", () => move(i, -1, upBtn));
    const downBtn = itemButton("Move down", m.role, "btn btn-secondary btn-small", () => move(i, 1, downBtn));
    if (i === 0) upBtn.disabled = true;
    if (i === items.length - 1) downBtn.disabled = true;
    const delBtn = itemButton("Remove", m.role, "btn btn-danger btn-small", async () => {
      if (!(await confirmDelete("board position", label))) { delBtn.focus(); return; }
      delBtn.disabled = true;
      try {
        await removeDoc(NAME, m.id);
        setFlash(`Board position removed: “${m.role}”.`);
        ctx.goList();
      } catch (error) {
        console.error(error);
        actionMessage.replaceChildren(messageBox(actionErrorText(error, "remove the position"), "error"));
        delBtn.disabled = false;
      }
    });
    return el("li", { class: "portal-item" },
      el("div", { class: "portal-item-main" },
        el("h3", { class: "portal-item-title", text: m.role }),
        el("p", { class: "portal-item-meta" }, m.name || el("em", { text: "Position open" }))),
      el("div", { class: "portal-item-actions" },
        itemButton("Edit", m.role, "btn btn-primary btn-small", () => ctx.goEdit(m.id)),
        upBtn, downBtn, delBtn)
    );
  });

  box.replaceChildren(actionMessage, el("ol", { class: "portal-list" }, rows));
}

// ---------- Add / Edit form ----------

const FIELDS = [
  { name: "role", label: "Position title", type: "text", required: true, max: 80,
    hint: "For example: President, Vice President, Treasurer, Secretary" },
  { name: "name", label: "Name", type: "text", max: 80,
    hint: "The person who holds this position. Leave blank if the position is open." }
];

async function form(ctx, id) {
  const box = ctx.body;
  let original = { role: "", name: "" };

  if (id) {
    box.replaceChildren(el("p", { class: "status-text", text: "Loading…" }));
    try {
      const raw = await getOne(NAME, id);
      if (!raw) {
        box.replaceChildren(messageBox("This board position couldn't be found. It may have been removed.", "error"));
        return null;
      }
      original = { role: text(raw.role), name: text(raw.name) };
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
    submitLabel: id ? "Save Changes" : "Add Position",
    validate(v) {
      const errors = {
        role: checkText(v.role, { label: "a position title", required: true, max: 80 }),
        name: checkText(v.name, { label: "a name", required: false, max: 80 })
      };
      return { errors, data: { role: v.role, name: v.name || "" } };
    },
    async save(data) {
      if (id) {
        await updateFields(NAME, id, data);
        setFlash(`Changes saved: ${data.role}${data.name ? `, ${data.name}` : " (position open)"}.`);
      } else {
        // New positions go at the end of the list.
        const existing = await loadSorted();
        const order = existing.length ? Math.max(...existing.map((m) => m.order)) + 1 : 1;
        await createDoc(NAME, docId, { ...data, order });
        setFlash(`Board position added: ${data.role}. Use “Move up” to change where it appears.`);
      }
    },
    onSaved: () => ctx.goList(),
    onCancel: () => ctx.goList()
  });

  box.replaceChildren(built.form);
  return built;
}

export default {
  title: "Board Members",
  addLabel: "Add Board Position",
  addTitle: "Add Board Position",
  editTitle: "Edit Board Position",
  help: "The positions and names residents see on the Contact page, in this order.",
  list,
  form
};
