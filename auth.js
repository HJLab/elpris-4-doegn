import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, updateDoc, setDoc,
  query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const cfg = window.ELPRIS_FIREBASE || { enabled: false };
const gate = document.getElementById("authGate");
const form = document.getElementById("loginForm");
const message = document.getElementById("authMessage");
const accountButton = document.getElementById("accountButton");
const usersButton = document.getElementById("usersButton");
const accountDialog = document.getElementById("accountDialog");
const usersDialog = document.getElementById("usersDialog");
const accountEmail = document.getElementById("accountEmail");
const usersList = document.getElementById("usersList");
const SETTINGS_KEY = "elpris-user-settings-v1";

let auth, db, currentUser = null, admin = false;
let resolveReady, rejectReady;
const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
window.elprisAuth = { ready, saveSettings, currentUser: () => currentUser, isAdmin: () => admin };

function normalizeEmail(value) { return String(value || "").trim().toLowerCase(); }
function setMessage(text, error = false) {
  message.textContent = text;
  message.style.color = error ? "#ffb2b2" : "";
}
function showGate(show) {
  gate.hidden = !show;
  document.body.classList.toggle("auth-pending", show);
}
async function isAdminUser(user) {
  return (await getDoc(doc(db, "admins", user.uid))).exists();
}
async function isAllowed(user) {
  if (await isAdminUser(user)) return true;
  const q = query(collection(db, "allowedUsers"), where("email", "==", normalizeEmail(user.email)), where("active", "==", true));
  return !(await getDocs(q)).empty;
}
async function loadUserSettings(user) {
  const snap = await getDoc(doc(db, "users", user.uid));
  if (snap.exists() && snap.data().settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(snap.data().settings));
    return;
  }
  const local = localStorage.getItem(SETTINGS_KEY);
  if (local) {
    try {
      const settings = JSON.parse(local);
      await setDoc(doc(db, "users", user.uid), { email: normalizeEmail(user.email), settings, updatedAt: serverTimestamp() }, { merge: true });
    } catch {}
  }
}
async function saveSettings(settings) {
  if (!currentUser || !db) return;
  await setDoc(doc(db, "users", currentUser.uid), {
    email: normalizeEmail(currentUser.email),
    settings,
    updatedAt: serverTimestamp()
  }, { merge: true });
}
async function finishLogin(user) {
  const allowed = await isAllowed(user);
  const bootstrap = normalizeEmail(cfg.bootstrapAdminEmail) && normalizeEmail(cfg.bootstrapAdminEmail) === normalizeEmail(user.email);
  if (!allowed && !bootstrap) {
    await signOut(auth);
    throw new Error("Denne e-mailadresse er ikke godkendt af administratoren.");
  }
  currentUser = user;
  admin = await isAdminUser(user);
  if (bootstrap && !admin) {
    setMessage(`Første administrator mangler opsætning. UID: ${user.uid}. Opret dokumentet admins/${user.uid} i Firestore og genindlæs siden.`, true);
    showGate(true);
    return false;
  }
  await loadUserSettings(user);
  accountEmail.textContent = user.email || "–";
  accountButton.hidden = false;
  usersButton.hidden = !admin;
  showGate(false);
  resolveReady();
  window.dispatchEvent(new Event("elpris-auth-ready"));
  return true;
}

if (!cfg.enabled) {
  setMessage("Login er klargjort, men Firebase er endnu ikke tilsluttet.", true);
  showGate(true);
  rejectReady(new Error("Firebase er ikke konfigureret"));
} else {
  const app = initializeApp(cfg.firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  await setPersistence(auth, browserLocalPersistence);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("Logger ind…");
    const email = normalizeEmail(document.getElementById("loginEmail").value);
    const password = document.getElementById("loginPassword").value;
    try {
      let credential;
      try {
        credential = await signInWithEmailAndPassword(auth, email, password);
      } catch (error) {
        if (!["auth/invalid-credential", "auth/user-not-found"].includes(error.code)) throw error;
        try {
          credential = await createUserWithEmailAndPassword(auth, email, password);
        } catch (createError) {
          if (createError.code === "auth/email-already-in-use") throw new Error("E-mailen findes allerede. Kontrollér password.");
          throw createError;
        }
      }
      await finishLogin(credential.user);
    } catch (error) {
      setMessage(error.message || "Login mislykkedes.", true);
    }
  });

  let firstAuthCheck = true;
  onAuthStateChanged(auth, async (user) => {
    if (!firstAuthCheck) return;
    firstAuthCheck = false;
    if (!user) { setMessage("Indtast din e-mail og dit password."); showGate(true); return; }
    try { await finishLogin(user); }
    catch (error) { setMessage(error.message, true); showGate(true); }
  });
}

accountButton.addEventListener("click", () => accountDialog.showModal());
document.getElementById("closeAccountButton").addEventListener("click", () => accountDialog.close());
document.getElementById("logoutButton").addEventListener("click", async () => { if (auth) await signOut(auth); location.reload(); });

usersButton.addEventListener("click", async () => {
  usersDialog.showModal();
  await renderUsers();
});
document.getElementById("closeUsersButton").addEventListener("click", () => usersDialog.close());

document.getElementById("copyAppLinkButton").addEventListener("click", async () => {
  const link = location.origin + location.pathname;
  await navigator.clipboard.writeText(link);
  const status = document.getElementById("copyLinkStatus");
  status.textContent = "Link kopieret ✓";
  setTimeout(() => status.textContent = "", 1800);
});

document.getElementById("addUserForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!admin) return;
  const email = normalizeEmail(document.getElementById("newUserEmail").value);
  const existing = await getDocs(query(collection(db, "allowedUsers"), where("email", "==", email)));
  if (existing.empty) {
    await addDoc(collection(db, "allowedUsers"), { email, active: true, createdAt: serverTimestamp() });
  } else {
    await updateDoc(existing.docs[0].ref, { active: true });
  }
  event.target.reset();
  await renderUsers();
});

async function renderUsers() {
  if (!admin || !db) return;
  const snap = await getDocs(query(collection(db, "allowedUsers"), orderBy("email")));
  usersList.replaceChildren();
  for (const item of snap.docs) {
    const data = item.data();
    const row = document.createElement("div");
    row.className = "admin-user-row";
    const email = document.createElement("strong");
    email.textContent = data.email;
    const status = document.createElement("small");
    status.className = "user-status";
    status.textContent = data.active ? "Aktiv" : "Deaktiveret";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "secondary-button";
    toggle.textContent = data.active ? "Deaktivér" : "Aktivér";
    toggle.addEventListener("click", async () => {
      await updateDoc(item.ref, { active: !data.active });
      await renderUsers();
    });
    row.append(email, status, toggle);
    usersList.append(row);
  }
}
