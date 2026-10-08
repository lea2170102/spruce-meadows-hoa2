// Spruce Meadows HOA - Contact page: board positions + contact form.

import { loadCollection } from "./db.js";
import { el, text, showStatus } from "./utils.js";
import { HOA_EMAIL, WEB3FORMS_ACCESS_KEY } from "./site-settings.js";

// ---------- Board positions ----------

const boardBox = document.getElementById("board-list");

async function showBoard() {
  try {
    const members = (await loadCollection("boardMembers"))
      .map((m) => ({ role: text(m.role), name: text(m.name), order: Number(m.order) || 0 }))
      .filter((m) => m.role)
      .sort((a, b) => a.order - b.order || a.role.localeCompare(b.role));

    if (!members.length) {
      showStatus(boardBox, "Board member information will be posted soon.");
      return;
    }
    boardBox.replaceChildren(el("ul", { class: "board-list" }, members.map((m) =>
      el("li", { class: "board-member" },
        el("p", { class: "board-role", text: m.role }),
        el("p", { class: "board-name" + (m.name ? "" : " is-open"), text: m.name || "Position open" }))
    )));
  } catch (error) {
    console.error(error);
    showStatus(boardBox,
      "We couldn't load the board member list. Please check your internet connection and refresh the page.", "error");
  }
}

// ---------- Contact form ----------

const form = document.getElementById("contact-form");
const sendButton = document.getElementById("send-button");
const formMessage = document.getElementById("form-message");

const fields = {
  name: { input: document.getElementById("contact-name"), label: "your name", max: 100 },
  email: { input: document.getElementById("contact-email"), label: "your email address", max: 200 },
  subject: { input: document.getElementById("contact-subject"), label: "a subject", max: 150 },
  message: { input: document.getElementById("contact-message"), label: "a message", max: 5000 }
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function setFieldError(key, message) {
  const { input } = fields[key];
  const errorEl = document.getElementById(`${input.id}-error`);
  if (message) {
    input.setAttribute("aria-invalid", "true");
    errorEl.textContent = message;
    errorEl.hidden = false;
  } else {
    input.removeAttribute("aria-invalid");
    errorEl.textContent = "";
    errorEl.hidden = true;
  }
}

function validate() {
  let firstInvalid = null;
  for (const [key, f] of Object.entries(fields)) {
    const value = f.input.value.trim();
    let error = "";
    if (!value) error = `Please enter ${f.label}.`;
    else if (value.length > f.max) error = `This is too long. Please keep it under ${f.max} characters.`;
    else if (key === "email" && !EMAIL_PATTERN.test(value)) error = "Please enter a valid email address, like name@example.com.";
    setFieldError(key, error);
    if (error && !firstInvalid) firstInvalid = f.input;
  }
  return firstInvalid;
}

function showFormMessage(kind, ...content) {
  formMessage.className = `message message-${kind}`;
  formMessage.replaceChildren(...content);
  formMessage.hidden = false;
}

function emailLink() {
  return el("a", { href: `mailto:${HOA_EMAIL}`, text: HOA_EMAIL });
}

function showSendError() {
  showFormMessage("error",
    "Sorry, your message could not be sent. Please try again in a few minutes, or email the board directly at ",
    emailLink(), ".");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formMessage.hidden = true;

  const firstInvalid = validate();
  if (firstInvalid) {
    showFormMessage("error", "Please fix the highlighted fields and try again.");
    firstInvalid.focus();
    return;
  }

  // Hidden "honeypot" checkbox: real people never see or tick it; spam bots do.
  if (document.getElementById("contact-botcheck").checked) {
    form.reset();
    showFormMessage("success", "Thank you! Your message has been sent to the board.");
    return;
  }

  if (!WEB3FORMS_ACCESS_KEY) {
    showFormMessage("error", "The contact form isn't set up yet. Please email the board directly at ",
      emailLink(), ".");
    return;
  }

  sendButton.disabled = true;
  sendButton.textContent = "Sending…";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        access_key: WEB3FORMS_ACCESS_KEY,
        from_name: "Spruce Meadows HOA Website",
        subject: `HOA website message: ${fields.subject.input.value.trim()}`,
        name: fields.name.input.value.trim(),
        email: fields.email.input.value.trim(),
        message: fields.message.input.value.trim()
      }),
      signal: controller.signal
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.success) {
      form.reset();
      showFormMessage("success",
        "Thank you! Your message has been sent to the board. We'll reply to the email address you provided.");
      formMessage.focus();
    } else {
      console.error("Contact form error", response.status, result);
      showSendError();
    }
  } catch (error) {
    console.error(error);
    showSendError();
  } finally {
    clearTimeout(timer);
    sendButton.disabled = false;
    sendButton.textContent = "Send Message";
  }
});

// Clear a field's error as soon as the person fixes it.
for (const key of Object.keys(fields)) {
  fields[key].input.addEventListener("input", () => {
    if (fields[key].input.getAttribute("aria-invalid")) setFieldError(key, "");
  });
}

showBoard();
