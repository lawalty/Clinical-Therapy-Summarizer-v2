/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  User as FirebaseUser
} from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  deleteDoc, 
  getDocs, 
  Firestore
} from "firebase/firestore";

// Read configuration from Vite environment variables and resolve authDomain dynamically on custom domains to leverage first-party cookies via reverse proxy
const rawAuthDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
export const host = typeof window !== "undefined" ? window.location.host : "";
export const isCustomDomain = !!(
  host && 
  !host.includes("localhost") && 
  !host.includes("127.0.0.1") && 
  !host.includes("192.168.")
);

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: isCustomDomain ? host : (rawAuthDomain || `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Check if we have a valid configuration to initialize Firebase
const isFirebaseEnabled = !!(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId
);

let app;
let auth: any = null;
let db: Firestore | null = null;
const provider = new GoogleAuthProvider();

if (isFirebaseEnabled) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    db = getFirestore(app);
    console.log("Firebase successfully initialized on client side.");
  } catch (error) {
    console.error("Firebase initialization failed:", error);
  }
} else {
  console.log("Firebase variables missing. Running in Clinical Local Sandbox Mode.");
}

export { auth, db, isFirebaseEnabled };

export interface TherapistUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  isSandbox?: boolean;
}

// Helper to construct secure authentication headers containing a Firebase ID token
export async function getAuthHeaders(userUid?: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  
  if (isFirebaseEnabled && auth?.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      headers["Authorization"] = `Bearer ${token}`;
    } catch (err) {
      console.error("Error fetching Firebase ID token:", err);
    }
  } else if (userUid) {
    headers["Authorization"] = `Bearer ${userUid}`;
  } else {
    const stored = localStorage.getItem("sandbox_user");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.uid) {
          headers["Authorization"] = `Bearer ${parsed.uid}`;
        }
      } catch (e) {}
    }
  }
  return headers;
}

// ------------------- AUTHENTICATION INTEGRATION -------------------

export async function loginWithGoogle(): Promise<TherapistUser> {
  if (isFirebaseEnabled && auth) {
    const result = await signInWithPopup(auth, provider);
    return {
      uid: result.user.uid,
      email: result.user.email || "",
      displayName: result.user.displayName || "Licensed Therapist",
      photoURL: result.user.photoURL || undefined,
    };
  } else {
    // Return standard sandbox clinician account with clean placeholders
    const sandboxUser: TherapistUser = {
      uid: "sandbox-therapist-101",
      email: "sandbox@example.com",
      displayName: "Sandbox Therapist, LMFT",
      isSandbox: true,
    };
    localStorage.setItem("sandbox_user", JSON.stringify(sandboxUser));
    return sandboxUser;
  }
}

export async function loginWithEmail(email: string, password: string): Promise<TherapistUser> {
  // Use our secure local workstation API endpoints to authenticate.
  // This bypasses Firebase Auth completely for email-based login (Solution 3),
  // preventing configuration blocks and popup domain issues inside dynamic containers.
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to authenticate workstation credentials");
  }
  
  const user = await response.json();
  const therapistUser: TherapistUser = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    isSandbox: true,
  };
  
  localStorage.setItem("sandbox_user", JSON.stringify(therapistUser));
  return therapistUser;
}

export async function registerWithEmail(email: string, password: string, displayName: string): Promise<TherapistUser> {
  // Use our secure local workstation API endpoints to register.
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName }),
  });
  
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to register local clinician account");
  }
  
  const user = await response.json();
  const therapistUser: TherapistUser = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    isSandbox: true,
  };
  
  localStorage.setItem("sandbox_user", JSON.stringify(therapistUser));
  return therapistUser;
}

export async function logoutUser(): Promise<void> {
  localStorage.removeItem("sandbox_user");
  if (isFirebaseEnabled && auth) {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Firebase signOut error:", e);
    }
  }
}

export function subscribeToAuthChanges(callback: (user: TherapistUser | null) => void): () => void {
  if (isFirebaseEnabled && auth) {
    return onAuthStateChanged(auth, (user: FirebaseUser | null) => {
      if (user) {
        callback({
          uid: user.uid,
          email: user.email || "",
          displayName: user.displayName || "Licensed Therapist",
          photoURL: user.photoURL || undefined,
        });
      } else {
        // Fall back to check if there is a logged-in local workstation user
        const stored = localStorage.getItem("sandbox_user");
        if (stored) {
          try {
            callback(JSON.parse(stored));
          } catch (e) {
            callback(null);
          }
        } else {
          callback(null);
        }
      }
    });
  } else {
    // Check local storage for sandbox login
    const stored = localStorage.getItem("sandbox_user");
    if (stored) {
      try {
        callback(JSON.parse(stored));
      } catch (e) {
        callback(null);
      }
    } else {
      callback(null);
    }
    // Return no-op cleanup
    return () => {};
  }
}

// ------------------- DATA PERSISTENCE -------------------

export interface ClinicalArchive {
  id: string;
  name: string;
  date: string;
  framework: string;
  encryptedContent: string;
  encryptedNotes: string;
}

// Saves a clinical archive to either Firestore or Fallback Local Database
export async function saveClinicalArchive(userUid: string, archive: ClinicalArchive): Promise<void> {
  // 1. Sync with localStorage for immediate local cache
  try {
    const localArchivesStr = localStorage.getItem(`sandbox_archives_${userUid}`) || "[]";
    const localArchives: ClinicalArchive[] = JSON.parse(localArchivesStr);
    const filtered = localArchives.filter(a => a.id !== archive.id);
    localStorage.setItem(`sandbox_archives_${userUid}`, JSON.stringify([...filtered, archive]));
  } catch (e) {
    console.error("Local storage sync error:", e);
  }

  // 2. Client Firestore write if available
  if (isFirebaseEnabled && db && auth?.currentUser) {
    try {
      const userDocRef = doc(db, "therapists", userUid, "archives", archive.id);
      await setDoc(userDocRef, archive);
    } catch (e) {
      console.warn("Client Firestore archive save failed, relying on server route:", e);
    }
  }

  // 3. Call server database endpoint
  const headers = await getAuthHeaders(userUid);
  const response = await fetch("/api/archives", {
    method: "POST",
    headers,
    body: JSON.stringify(archive),
  });
  if (!response.ok) {
    throw new Error("Failed to save clinical archive");
  }
}

// Retrieves all clinical archives for a therapist
export async function getClinicalArchives(userUid: string): Promise<ClinicalArchive[]> {
  let archives: ClinicalArchive[] = [];

  // 1. Try server endpoint first (server queries Firestore via Admin SDK)
  try {
    const headers = await getAuthHeaders(userUid);
    const response = await fetch("/api/archives", { headers });
    if (response.ok) {
      const data: ClinicalArchive[] = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        localStorage.setItem(`sandbox_archives_${userUid}`, JSON.stringify(data));
        return data;
      }
    }
  } catch (e) {
    console.warn("Server archives fetch error:", e);
  }

  // 2. Try client Firestore if available
  if (isFirebaseEnabled && db && auth?.currentUser) {
    try {
      const colRef = collection(db, "therapists", userUid, "archives");
      const snapshot = await getDocs(colRef);
      snapshot.forEach((doc) => {
        archives.push(doc.data() as ClinicalArchive);
      });
      if (archives.length > 0) {
        archives.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        localStorage.setItem(`sandbox_archives_${userUid}`, JSON.stringify(archives));
        return archives;
      }
    } catch (e) {
      console.warn("Client Firestore getDocs failed:", e);
    }
  }

  // 3. Try localStorage
  try {
    const localArchivesStr = localStorage.getItem(`sandbox_archives_${userUid}`);
    if (localArchivesStr) {
      const localArchives: ClinicalArchive[] = JSON.parse(localArchivesStr);
      if (localArchives.length > 0) {
        return localArchives.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      }
    }
  } catch (e) {}

  // 4. Migrate legacy keys if present
  if (userUid !== "sandbox-therapist-101") {
    const legacyKeys = ["sandbox_archives", "sandbox_archives_sandbox-therapist-101"];
    for (const legacyKey of legacyKeys) {
      const oldArchivesStr = localStorage.getItem(legacyKey);
      if (oldArchivesStr) {
        try {
          const oldArchives: ClinicalArchive[] = JSON.parse(oldArchivesStr);
          if (Array.isArray(oldArchives) && oldArchives.length > 0) {
            localStorage.setItem(`sandbox_archives_${userUid}`, oldArchivesStr);
            for (const arch of oldArchives) {
              saveClinicalArchive(userUid, arch).catch((err) => 
                console.error("Background migration upload failed for archive:", err)
              );
            }
            return oldArchives.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          }
        } catch (e) {}
      }
    }
  }

  return [];
}

// Deletes a clinical archive
export async function deleteClinicalArchive(userUid: string, id: string): Promise<void> {
  // 1. Delete from localStorage
  try {
    const localArchivesStr = localStorage.getItem(`sandbox_archives_${userUid}`);
    if (localArchivesStr) {
      const localArchives: ClinicalArchive[] = JSON.parse(localArchivesStr);
      const filtered = localArchives.filter(a => a.id !== id);
      localStorage.setItem(`sandbox_archives_${userUid}`, JSON.stringify(filtered));
    }
  } catch (e) {}

  // 2. Client Firestore delete if active
  if (isFirebaseEnabled && db && auth?.currentUser) {
    try {
      const docRef = doc(db, "therapists", userUid, "archives", id);
      await deleteDoc(docRef);
    } catch (e) {}
  }

  // 3. Delete from server endpoint
  const headers = await getAuthHeaders(userUid);
  const response = await fetch(`/api/archives/${id}`, {
    method: "DELETE",
    headers,
  });
  if (!response.ok) {
    throw new Error("Failed to delete archive");
  }
}

export interface TherapistSettings {
  styleInstructions: string;
  activeTemplateName: string;
  customTemplates?: Array<{ name: string; instructions: string }>;
  therapistName?: string;
  therapistTitle?: string;
  encryptedSentinel?: string;
}

// Saves custom clinical directives settings linked to user profile
export async function saveTherapistSettings(userUid: string, settings: TherapistSettings): Promise<void> {
  // 1. Always sync to localStorage
  localStorage.setItem(`sandbox_settings_${userUid}`, JSON.stringify(settings));

  // 2. Client Firestore write if available
  if (isFirebaseEnabled && db && auth?.currentUser) {
    try {
      const docRef = doc(db, "therapists", userUid, "settings", "directives");
      await setDoc(docRef, settings);
    } catch (e) {
      console.warn("Client Firestore save settings failed, relying on server route:", e);
    }
  }

  // 3. Save to server endpoint (which uses Admin SDK and local storage fallback)
  const headers = await getAuthHeaders(userUid);
  const response = await fetch("/api/settings", {
    method: "POST",
    headers,
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error("Failed to save therapist settings");
  }
}

// Retrieves custom clinical directives settings linked to user profile
export async function getTherapistSettings(userUid: string): Promise<TherapistSettings | null> {
  // 1. Fetch from server endpoint first (server checks Admin Firestore)
  try {
    const headers = await getAuthHeaders(userUid);
    const response = await fetch("/api/settings", { headers });
    if (response.ok) {
      const data = await response.json();
      if (data && (data.styleInstructions || data.activeTemplateName || data.customTemplates?.length > 0 || data.therapistName || data.encryptedSentinel)) {
        localStorage.setItem(`sandbox_settings_${userUid}`, JSON.stringify(data));
        return data;
      }
    }
  } catch (e) {
    console.warn("Server /api/settings fetch error:", e);
  }

  // 2. Client Firestore read if active
  if (isFirebaseEnabled && db && auth?.currentUser) {
    try {
      const docRef = doc(db, "therapists", userUid, "settings", "directives");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as TherapistSettings;
        localStorage.setItem(`sandbox_settings_${userUid}`, JSON.stringify(data));
        return data;
      }
    } catch (e) {
      console.warn("Client Firestore getDoc failed:", e);
    }
  }

  // 3. Local storage fallback
  const localBackup = localStorage.getItem(`sandbox_settings_${userUid}`);
  if (localBackup) {
    try {
      const parsed = JSON.parse(localBackup);
      if (parsed) {
        // Sync to server in background if server didn't have it
        saveTherapistSettings(userUid, parsed).catch((err) =>
          console.error("Background settings sync to server failed:", err)
        );
        return parsed;
      }
    } catch (e) {}
  }

  // 4. Legacy migration fallback
  if (userUid !== "sandbox-therapist-101") {
    const legacyKeys = ["sandbox_settings", "sandbox_settings_sandbox-therapist-101"];
    for (const legacyKey of legacyKeys) {
      const oldData = localStorage.getItem(legacyKey);
      if (oldData) {
        try {
          const parsed = JSON.parse(oldData);
          if (parsed && (parsed.styleInstructions || parsed.customTemplates?.length > 0)) {
            localStorage.setItem(`sandbox_settings_${userUid}`, oldData);
            saveTherapistSettings(userUid, parsed).catch((err) => 
              console.error("Background migration upload failed for settings:", err)
            );
            return parsed;
          }
        } catch (e) {}
      }
    }
  }

  return null;
}
