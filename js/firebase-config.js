// Spruce Meadows HOA - Firebase settings
//
// These values identify our Firebase project. They are NOT secret:
// Firebase is designed for them to appear in public web pages.
// Security comes from Firebase Authentication and the Firestore rules.
//
// NEVER put a password in this file (or anywhere in the website code).

export const firebaseConfig = {
  apiKey:            "AIzaSyBs9GbpkE8xsjtMNSYkrDz3avhRtkJ7fh0",
  authDomain:        "spruce-meadows-hoa.firebaseapp.com",
  projectId:         "spruce-meadows-hoa",
  storageBucket:     "spruce-meadows-hoa.firebasestorage.app",
  messagingSenderId: "206198878383",
  appId:             "1:206198878383:web:3810140a3facb0c761a45a"
};

// The single shared board login. Board members only type the password;
// this email is filled in automatically. Password resets are sent here.
export const BOARD_EMAIL = "spruce.meadows83713@gmail.com";
