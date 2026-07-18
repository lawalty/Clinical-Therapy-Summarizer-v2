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

// Read configuration from Vite environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
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

export async function logoutUser(): Promise<void> {
  if (isFirebaseEnabled && auth) {
    await signOut(auth);
  } else {
    localStorage.removeItem("sandbox_user");
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
        callback(null);
      }
    });
  } else {
    // Check local storage for sandbox login
    const stored = localStorage.getItem("sandbox_user");
    if (stored) {
      callback(JSON.parse(stored));
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
  if (isFirebaseEnabled && db) {
    const userDocRef = doc(db, "therapists", userUid, "archives", archive.id);
    await setDoc(userDocRef, archive);
  } else {
    // Sync with localStorage
    try {
      const localArchivesStr = localStorage.getItem(`sandbox_archives_${userUid}`) || "[]";
      const localArchives: ClinicalArchive[] = JSON.parse(localArchivesStr);
      const filtered = localArchives.filter(a => a.id !== archive.id);
      localStorage.setItem(`sandbox_archives_${userUid}`, JSON.stringify([...filtered, archive]));
    } catch (e) {
      console.error("Local storage sync error:", e);
    }

    // Call server local database endpoint with Auth header
    const headers = await getAuthHeaders(userUid);
    const response = await fetch("/api/archives", {
      method: "POST",
      headers,
      body: JSON.stringify(archive),
    });
    if (!response.ok) {
      throw new Error("Failed to save to secure local database");
    }
  }
}

// Retrieves all clinical archives for a therapist
export async function getClinicalArchives(userUid: string): Promise<ClinicalArchive[]> {
  if (isFirebaseEnabled && db) {
    const colRef = collection(db, "therapists", userUid, "archives");
    const snapshot = await getDocs(colRef);
    const archives: ClinicalArchive[] = [];
    snapshot.forEach((doc) => {
      archives.push(doc.data() as ClinicalArchive);
    });
    // Sort descending by date
    return archives.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } else {
    // Try localStorage first
    try {
      const localArchivesStr = localStorage.getItem(`sandbox_archives_${userUid}`);
      if (localArchivesStr) {
        const localArchives: ClinicalArchive[] = JSON.parse(localArchivesStr);
        if (localArchives.length > 0) {
          return localArchives.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }
      }
    } catch (e) {}

    // Fetch from server local database endpoint with Auth header
    const headers = await getAuthHeaders(userUid);
    const response = await fetch("/api/archives", { headers });
    if (!response.ok) {
      throw new Error("Failed to load clinical archives");
    }
    const data: ClinicalArchive[] = await response.json();
    if (data && data.length > 0) {
      localStorage.setItem(`sandbox_archives_${userUid}`, JSON.stringify(data));
    }
    return data;
  }
}

// Deletes a clinical archive
export async function deleteClinicalArchive(userUid: string, id: string): Promise<void> {
  if (isFirebaseEnabled && db) {
    const docRef = doc(db, "therapists", userUid, "archives", id);
    await deleteDoc(docRef);
  } else {
    // Delete from localStorage
    try {
      const localArchivesStr = localStorage.getItem(`sandbox_archives_${userUid}`);
      if (localArchivesStr) {
        const localArchives: ClinicalArchive[] = JSON.parse(localArchivesStr);
        const filtered = localArchives.filter(a => a.id !== id);
        localStorage.setItem(`sandbox_archives_${userUid}`, JSON.stringify(filtered));
      }
    } catch (e) {}

    // Delete from server local database endpoint with Auth header
    const headers = await getAuthHeaders(userUid);
    const response = await fetch(`/api/archives/${id}`, {
      method: "DELETE",
      headers,
    });
    if (!response.ok) {
      throw new Error("Failed to delete archive from local database");
    }
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
  if (isFirebaseEnabled && db) {
    const docRef = doc(db, "therapists", userUid, "settings", "directives");
    await setDoc(docRef, settings);
  } else {
    // Sync to localStorage
    localStorage.setItem(`sandbox_settings_${userUid}`, JSON.stringify(settings));

    const headers = await getAuthHeaders(userUid);
    const response = await fetch("/api/settings", {
      method: "POST",
      headers,
      body: JSON.stringify(settings),
    });
    if (!response.ok) {
      throw new Error("Failed to save therapist settings to secure local database");
    }
  }
}

// Retrieves custom clinical directives settings linked to user profile
export async function getTherapistSettings(userUid: string): Promise<TherapistSettings | null> {
  if (isFirebaseEnabled && db) {
    try {
      const docRef = doc(db, "therapists", userUid, "settings", "directives");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as TherapistSettings;
      }
    } catch (e) {
      console.error("Error retrieving settings from Firestore:", e);
      throw new Error(`Failed to load settings from cloud store: ${(e as Error).message || "Transient Network Error"}`);
    }
    return null;
  } else {
    // Try localStorage first
    const localBackup = localStorage.getItem(`sandbox_settings_${userUid}`);
    if (localBackup) {
      try {
        return JSON.parse(localBackup);
      } catch (e) {}
    }

    try {
      const headers = await getAuthHeaders(userUid);
      const response = await fetch("/api/settings", { headers });
      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }
      const data = await response.json();
      if (data) {
        localStorage.setItem(`sandbox_settings_${userUid}`, JSON.stringify(data));
      }
      return data;
    } catch (e) {
      console.error("Error retrieving settings from fallback server:", e);
      throw new Error(`Failed to load settings from secure storage: ${(e as Error).message || "Transient Connection Error"}`);
    }
  }
}
