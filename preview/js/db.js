// Spruce Meadows HOA - reading public website content from Firestore.
// Public pages only READ. Writing is done in the Board Portal and is
// protected by the Firestore security rules.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const db = getFirestore(initializeApp(firebaseConfig));

const TIMEOUT_MS = 15000;

// Returns every document in a collection as plain objects: [{ id, ...fields }].
// Collections are small (an HOA of ~95 homes), so sorting and filtering
// happen in the browser. This avoids needing special Firestore indexes.
export async function loadCollection(name) {
  const request = getDocs(collection(db, name));
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)
  );
  const snap = await Promise.race([request, timeout]);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
