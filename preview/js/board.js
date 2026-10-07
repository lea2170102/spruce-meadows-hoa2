// Spruce Meadows HOA - Board Login and Board Portal
//
// Login uses Firebase Authentication. The password is checked by Google's
// servers; it is never stored in this code. Only the board account can
// change website content - that is enforced by the Firestore security rules.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserSessionPersistence,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
import { firebaseConfig, BOARD_EMAIL } from "./firebase-config.js";
import { startPortal, stopPortal } from "./portal/router.js";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ---------- Page elements ----------
const loadingView   = document.getElementById("loading-view");
const loginView     = document.getElementById("login-view");
const portalView    = document.getElementById("portal-view");

const loginForm     = document.getElementById("login-form");
const passwordInput = document.getElementById("board-password");
const loginButton   = document.getElementById("login-button");
const forgotButton  = document.getElementById("forgot-button");
const loginMessage  = document.getElementById("login-message");

const portalHeading = document.getElementById("portal-heading");
const portalMessage = document.getElementById("portal-message");
const logoutButton  = document.getElementById("logout-button");

document.body.dataset.state = "ready";

// ---------- Helpers ----------
function showMessage(el, text, kind) {
  el.textContent = text;
  el.className = "message message-" + kind;
  el.hidden = false;
}

function clearMessage(el) {
  el.textContent = "";
  el.hidden = true;
}

function showView(view) {
  loadingView.hidden = view !== "loading";
  loginView.hidden   = view !== "login";
  portalView.hidden  = view !== "portal";
}

function setBusy(button, busy, busyText, normalText) {
  button.disabled = busy;
  button.textContent = busy ? busyText : normalText;
}

// Plain-English messages for Firebase error codes.
function loginErrorText(code) {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
      return "That password isn't correct. Please try again.";
    case "auth/too-many-requests":
      return "Too many login attempts. For security, login is paused for a few minutes. " +
             "Please wait and try again, or use \"Forgot password?\" below.";
    case "auth/network-request-failed":
      return "We couldn't connect. Please check your internet connection and try again.";
    case "auth/user-disabled":
      return "The board account has been turned off in Firebase. " +
             "Please contact whoever manages the HOA's Firebase account.";
    case "auth/user-not-found":
      return "The board account could not be found in Firebase. " +
             "Please contact whoever manages the HOA's Firebase account.";
    default:
      return "Something went wrong while logging in. Please try again. " +
             "(Error: " + (code || "unknown") + ")";
  }
}

// ---------- Login state ----------
// Firebase tells us whether the board is logged in when the page loads,
// and again whenever that changes.
onAuthStateChanged(auth, (user) => {
  if (user) {
    showView("portal");
    startPortal();   // opens the dashboard (or the screen in the address bar)
  } else {
    showView("login");
    stopPortal();
  }
});

// ---------- Log in ----------
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(loginMessage);
  passwordInput.removeAttribute("aria-invalid");

  const password = passwordInput.value;
  if (!password) {
    passwordInput.setAttribute("aria-invalid", "true");
    showMessage(loginMessage, "Please enter the board password.", "error");
    passwordInput.focus();
    return;
  }

  setBusy(loginButton, true, "Logging in…", "Log In");
  try {
    // Stay logged in only until the browser is closed.
    await setPersistence(auth, browserSessionPersistence);
    await signInWithEmailAndPassword(auth, BOARD_EMAIL, password);
    passwordInput.value = "";
    // onAuthStateChanged (above) switches to the portal.
  } catch (error) {
    passwordInput.setAttribute("aria-invalid", "true");
    showMessage(loginMessage, loginErrorText(error.code), "error");
    passwordInput.select();
    passwordInput.focus();
  } finally {
    setBusy(loginButton, false, "Logging in…", "Log In");
  }
});

// ---------- Forgot password ----------
forgotButton.addEventListener("click", async () => {
  clearMessage(loginMessage);
  const ok = window.confirm(
    "Send a password reset link to the HOA board email?\n\n" +
    "Whoever opens that email can choose a new board password."
  );
  if (!ok) return;

  setBusy(forgotButton, true, "Sending…", "Forgot password?");
  try {
    await sendPasswordResetEmail(auth, BOARD_EMAIL);
    showMessage(
      loginMessage,
      "A password reset link has been sent to the HOA board email. " +
      "It can take a few minutes to arrive. Please check the spam folder too.",
      "success"
    );
  } catch (error) {
    let text = "We couldn't send the reset email. Please try again in a few minutes.";
    if (error.code === "auth/network-request-failed") {
      text = "We couldn't connect. Please check your internet connection and try again.";
    } else if (error.code === "auth/too-many-requests") {
      text = "Too many reset requests. Please wait a while before trying again.";
    }
    showMessage(loginMessage, text, "error");
  } finally {
    setBusy(forgotButton, false, "Sending…", "Forgot password?");
  }
});

// ---------- Log out ----------
logoutButton.addEventListener("click", async () => {
  setBusy(logoutButton, true, "Logging out…", "Log Out");
  try {
    await signOut(auth);
    clearMessage(portalMessage);
    showView("login");
    showMessage(loginMessage, "You have been logged out.", "success");
    passwordInput.focus();
  } catch (error) {
    showMessage(portalMessage, "We couldn't log you out. Please try again, or close your browser.", "error");
  } finally {
    setBusy(logoutButton, false, "Logging out…", "Log Out");
  }
});

// The portal screens (Announcements, Calendar, Resources, Board Members)
// are in the js/portal/ folder.
