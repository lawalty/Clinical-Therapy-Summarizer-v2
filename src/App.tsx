/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Shield, 
  UploadCloud, 
  FolderLock, 
  FileDown, 
  ClipboardCheck, 
  Sparkles, 
  BookOpen, 
  LogOut, 
  CheckSquare, 
  Trash2, 
  Check, 
  RefreshCw, 
  AlertTriangle,
  Info,
  Lock,
  Plus,
  X
} from "lucide-react";

import { 
  TherapistUser, 
  ClinicalArchive, 
  subscribeToAuthChanges, 
  logoutUser, 
  saveClinicalArchive, 
  getClinicalArchives, 
  deleteClinicalArchive,
  saveTherapistSettings,
  getTherapistSettings,
  getAuthHeaders
} from "./lib/firebase";

import { encryptText, decryptText } from "./utils/crypto";
import { CLINICAL_TEMPLATES } from "./components/InstructionTemplates";
import LockScreen from "./components/LockScreen";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const [user, setUser] = useState<TherapistUser | null>(null);
  const [passcode, setPasscode] = useState<string | null>(null);
  const [archives, setArchives] = useState<ClinicalArchive[]>([]);
  const [currentArchive, setCurrentArchive] = useState<ClinicalArchive | null>(null);
  const [archiveNameInput, setArchiveNameInput] = useState("");
  
  // UI Loading States
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Clinical Inputs
  const [verbatimText, setVerbatimText] = useState("");
  const [generatedSummary, setGeneratedSummary] = useState("");
  const [framework, setFramework] = useState("SOAP");
  const [length, setLength] = useState("medium");
  const [quantity, setQuantity] = useState(2);
  const [tone, setTone] = useState("clinical");
  const [includeInsights, setIncludeInsights] = useState(true);
  const [hideSubtitles, setHideSubtitles] = useState(false);
  const [focusAreas, setFocusAreas] = useState<string[]>(["Client's Mental Status & Affect", "Progress Toward Treatment Goals"]);
  
  // Instruction custom style directives
  const [styleInstructions, setStyleInstructions] = useState(CLINICAL_TEMPLATES[0].instructions);
  const [activeTemplateName, setActiveTemplateName] = useState(CLINICAL_TEMPLATES[0].name);

  // Custom Profiles
  const [customTemplates, setCustomTemplates] = useState<Array<{ name: string; instructions: string }>>([]);
  const [isAddProfileOpen, setIsAddProfileOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [modalError, setModalError] = useState("");

  // Therapist profile customization states
  const [therapistName, setTherapistName] = useState("");
  const [therapistTitle, setTherapistTitle] = useState("");
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editProfileName, setEditProfileName] = useState("");
  const [editProfileTitle, setEditProfileTitle] = useState("");

  // Delete archive custom modal state
  const [archiveToDelete, setArchiveToDelete] = useState<{ id: string; name: string } | null>(null);

  // Therapist settings persistence states
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSavedStatus, setSettingsSavedStatus] = useState<"idle" | "saving" | "saved" | "unsaved">("idle");

  // Status Banners
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // Drag and drop helper
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync auth state
  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((authUser) => {
      setUser(authUser);
    });
    return () => unsubscribe();
  }, []);

  // Fetch archives once user is logged in & passcode is provided
  useEffect(() => {
    if (user && passcode) {
      loadArchives();
    }
  }, [user, passcode]);

  // Fetch therapist custom system instructions once logged in
  useEffect(() => {
    if (user) {
      loadTherapistSettings();
    }
  }, [user]);

  // Inactivity Auto-Lock (Locks session after 15 minutes of inactivity)
  useEffect(() => {
    if (!user || !passcode) return;
    
    let timer: NodeJS.Timeout;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        handleSignOut();
        setError("Workstation locked automatically due to 15 minutes of inactivity.");
      }, 15 * 60 * 1000);
    };

    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("keydown", resetTimer);
    window.addEventListener("click", resetTimer);

    resetTimer();

    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("keydown", resetTimer);
      window.removeEventListener("click", resetTimer);
    };
  }, [user, passcode]);

  const loadTherapistSettings = async () => {
    if (!user) return;
    try {
      const settings = await getTherapistSettings(user.uid);
      if (settings) {
        if (settings.styleInstructions) {
          setStyleInstructions(settings.styleInstructions);
        }
        if (settings.activeTemplateName) {
          setActiveTemplateName(settings.activeTemplateName);
        }
        if (settings.customTemplates) {
          setCustomTemplates(settings.customTemplates);
        } else {
          setCustomTemplates([]);
        }
        setTherapistName(settings.therapistName || `Dr. ${user.displayName || user.email.split("@")[0]}`);
        setTherapistTitle(settings.therapistTitle || "Clinical Psychologist");
        setSettingsSavedStatus("saved");
      } else {
        setSettingsSavedStatus("idle");
        setCustomTemplates([]);
        setTherapistName(`Dr. ${user.displayName || user.email.split("@")[0]}`);
        setTherapistTitle("Clinical Psychologist");
      }
    } catch (err: any) {
      console.error("Error loading therapist custom instructions:", err);
      setTherapistName(`Dr. ${user.displayName || user.email.split("@")[0]}`);
      setTherapistTitle("Clinical Psychologist");
    }
  };

  const handleSaveSettings = async (customStyle?: string, customName?: string, customTemplatesToSave?: Array<{ name: string; instructions: string }>) => {
    if (!user) {
      setError("You must be logged in to save settings.");
      return;
    }
    setIsSavingSettings(true);
    setSettingsSavedStatus("saving");
    try {
      const styleToSave = customStyle !== undefined ? customStyle : styleInstructions;
      const nameToSave = customName !== undefined ? customName : activeTemplateName;
      const listToSave = customTemplatesToSave !== undefined ? customTemplatesToSave : customTemplates;
      
      // Update this active template's instruction inside the templates list if it's a custom template
      let finalizedTemplates = [...listToSave];
      const matchIdx = finalizedTemplates.findIndex(t => t.name === nameToSave);
      if (matchIdx !== -1) {
        finalizedTemplates[matchIdx] = {
          name: nameToSave,
          instructions: styleToSave
        };
        setCustomTemplates(finalizedTemplates);
      }

      // Check current settings to preserve encryptedSentinel
      const currentSettings = await getTherapistSettings(user.uid);

      await saveTherapistSettings(user.uid, {
        styleInstructions: styleToSave,
        activeTemplateName: nameToSave,
        customTemplates: finalizedTemplates,
        therapistName,
        therapistTitle,
        encryptedSentinel: currentSettings?.encryptedSentinel
      });
      setSettingsSavedStatus("saved");
    } catch (err: any) {
      console.error(err);
      setSettingsSavedStatus("unsaved");
      setError(err.message || "Failed to save Clinical Directives.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSaveProfileCustomization = async (newName: string, newTitle: string) => {
    if (!user) return;
    try {
      const currentSettings = await getTherapistSettings(user.uid);
      await saveTherapistSettings(user.uid, {
        styleInstructions,
        activeTemplateName,
        customTemplates,
        therapistName: newName,
        therapistTitle: newTitle,
        encryptedSentinel: currentSettings?.encryptedSentinel
      });
      setTherapistName(newName);
      setTherapistTitle(newTitle);
      setSuccess("Therapist profile updated successfully.");
      setTimeout(() => setSuccess(""), 4000);
    } catch (err: any) {
      console.error(err);
      setError("Failed to save therapist profile changes.");
    }
  };

  const handleDeleteCustomTemplate = async (nameToDelete: string) => {
    const filtered = customTemplates.filter(t => t.name !== nameToDelete);
    setCustomTemplates(filtered);
    
    if (activeTemplateName === nameToDelete) {
      setStyleInstructions(CLINICAL_TEMPLATES[0].instructions);
      setActiveTemplateName(CLINICAL_TEMPLATES[0].name);
      await handleSaveSettings(CLINICAL_TEMPLATES[0].instructions, CLINICAL_TEMPLATES[0].name, filtered);
    } else {
      await handleSaveSettings(styleInstructions, activeTemplateName, filtered);
    }
  };

  const handleCreateCustomProfile = async () => {
    const trimmedName = newProfileName.trim();
    if (!trimmedName) {
      setModalError("Please provide a valid profile name.");
      return;
    }
    const existsInDefaults = CLINICAL_TEMPLATES.some(t => t.name.toLowerCase() === trimmedName.toLowerCase());
    const existsInCustoms = customTemplates.some(t => t.name.toLowerCase() === trimmedName.toLowerCase());
    if (existsInDefaults || existsInCustoms) {
      setModalError("A profile with this name already exists.");
      return;
    }

    const newProfile = {
      name: trimmedName,
      instructions: ""
    };

    const updatedList = [...customTemplates, newProfile];
    setCustomTemplates(updatedList);
    setStyleInstructions("");
    setActiveTemplateName(trimmedName);
    setIsAddProfileOpen(false);
    setNewProfileName("");
    setModalError("");

    await handleSaveSettings("", trimmedName, updatedList);
  };

  const loadArchives = async () => {
    if (!user) return;
    try {
      const docs = await getClinicalArchives(user.uid);
      setArchives(docs);
    } catch (err: any) {
      console.error(err);
      setError("Failed to retrieve clinical archives from the secure database.");
    }
  };

  const handleUnlock = (authUser: TherapistUser, secretPasscode: string) => {
    setUser(authUser);
    setPasscode(secretPasscode);
    setSuccess("Workspace secure session initialized.");
    setTimeout(() => setSuccess(""), 4000);
  };

  const handleSignOut = async () => {
    if (user) {
      // Clear sandbox-specific localized caches
      localStorage.removeItem(`sandbox_archives_${user.uid}`);
      localStorage.removeItem(`sandbox_settings_${user.uid}`);
    }
    localStorage.removeItem("sandbox_user");

    await logoutUser();
    
    // Clear state
    setUser(null);
    setPasscode(null);
    setArchives([]);
    setCurrentArchive(null);
    setVerbatimText("");
    setGeneratedSummary("");
    setArchiveNameInput("");
    setStyleInstructions(CLINICAL_TEMPLATES[0].instructions);
    setActiveTemplateName(CLINICAL_TEMPLATES[0].name);
    setTherapistName("");
    setTherapistTitle("");
    setCustomTemplates([]);
    setSettingsSavedStatus("idle");
  };

  // Extract text from dropped or uploaded files via Gemini 3.5 Flash
  const processFileUpload = async (file: File) => {
    if (!file) return;
    if (!user) return;
    setError("");
    setIsExtracting(true);
    setSuccess(`Parsing and transcribing "${file.name}"...`);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const base64Data = e.target?.result as string;
        if (!base64Data) throw new Error("Could not parse file data.");

        // Inject secure authorization token
        const headers = await getAuthHeaders(user.uid);

        const response = await fetch("/api/extract", {
          method: "POST",
          headers: { 
            ...headers,
            "Content-Type": "application/json" 
          },
          body: JSON.stringify({
            fileData: base64Data,
            mimeType: file.type,
            filename: file.name
          })
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Failed to process text extraction");
        }

        if (result.text) {
          setVerbatimText((prev) => 
            prev 
              ? `${prev}\n\n=== VERBATIM EXTRACTED FROM: ${file.name} ===\n${result.text}` 
              : `=== VERBATIM EXTRACTED FROM: ${file.name} ===\n${result.text}`
          );
          setSuccess(`Successfully transcribed "${file.name}". Original text added to repository.`);
        } else {
          setError("No readable text could be extracted from this document.");
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message || "An error occurred during OCR text extraction.");
      } finally {
        setIsExtracting(false);
      }
    };

    reader.onerror = () => {
      setError("Failed to read upload file.");
      setIsExtracting(false);
    };

    reader.readAsDataURL(file);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelectionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFileUpload(e.target.files[0]);
    }
  };

  // Generate Summary using gemini-3.1-pro-preview with HIGH thinking level
  const handleGenerateSummary = async () => {
    if (!verbatimText.trim()) {
      setError("Please input clinical notes or upload a repository document before generating.");
      return;
    }
    if (!user) return;
    setError("");
    setSuccess("");
    setIsSummarizing(true);

    try {
      // Inject secure authorization token
      const headers = await getAuthHeaders(user.uid);

      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: { 
          ...headers,
          "Content-Type": "application/json" 
        },
        body: JSON.stringify({
          extractedText: verbatimText,
          framework,
          styleInstructions,
          length,
          quantity,
          tone,
          includeInsights,
          focusAreas,
          hideSubtitles
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Model generation failed");
      }

      setGeneratedSummary(result.summary || "");
      if (!archiveNameInput.trim()) {
        const todayStr = new Date().toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric"
        });
        setArchiveNameInput(`Patient Note - ${framework} - ${todayStr}`);
      }
      if (result.fallbackUsed) {
        setSuccess("Session summary generated successfully (using optimized standard quota model).");
      } else {
        setSuccess("Session summary generated with high intelligence thinking.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Summarization synthesis failed.");
    } finally {
      setIsSummarizing(false);
    }
  };

  // Client-side Encrypt and Save/Update Archive
  const handleSaveArchive = async () => {
    if (!user || !passcode) return;
    if (!archiveNameInput.trim()) {
      setError("Please provide a custom name to archive this session.");
      return;
    }
    if (!generatedSummary && !verbatimText) {
      setError("Nothing to archive. Please generate a summary or input verbatim notes.");
      return;
    }

    setError("");
    setSuccess("");
    setIsSaving(true);

    try {
      // 1. Client-Side Encrypt cleartext fields using Master Passcode
      const encryptedContent = await encryptText(generatedSummary, passcode);
      const encryptedNotes = await encryptText(verbatimText, passcode);

      // Generate a collision-resistant UUID (HIPAA best practice)
      const archiveId = currentArchive?.id || window.crypto.randomUUID();
      const payload: ClinicalArchive = {
        id: archiveId,
        name: archiveNameInput,
        // Store canonical ISO Date string for proper, locale-independent sorting
        date: currentArchive?.date || new Date().toISOString(),
        framework,
        encryptedContent,
        encryptedNotes
      };

      // 2. Persist encrypted payload
      await saveClinicalArchive(user.uid, payload);
      
      // 3. Reload lists & refresh UI
      await loadArchives();
      setCurrentArchive(payload);
      setSuccess(`Archived successfully under "${archiveNameInput}". Records are encrypted.`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to encrypt and archive records.");
    } finally {
      setIsSaving(false);
    }
  };

  // Load and Decrypt Selected Archive
  const handleSelectArchive = async (archive: ClinicalArchive) => {
    if (!passcode) return;
    setError("");
    setSuccess("");
    
    try {
      // Decrypt client-side
      const decContent = await decryptText(archive.encryptedContent, passcode);
      const decNotes = await decryptText(archive.encryptedNotes, passcode);

      setCurrentArchive(archive);
      setArchiveNameInput(archive.name);
      setGeneratedSummary(decContent);
      setVerbatimText(decNotes);
      setFramework(archive.framework);
      setSuccess(`Decrypted and retrieved session record "${archive.name}".`);
      setTimeout(() => setSuccess(""), 4000);
    } catch (err: any) {
      console.error(err);
      setError("Failed to decrypt this archive. The Master Passcode used may be incorrect.");
    }
  };

  const handleConfirmDeleteArchive = async () => {
    if (!user || !archiveToDelete) return;

    setError("");
    setSuccess("");
    try {
      await deleteClinicalArchive(user.uid, archiveToDelete.id);
      if (currentArchive?.id === archiveToDelete.id) {
        setCurrentArchive(null);
        setArchiveNameInput("");
        setGeneratedSummary("");
        setVerbatimText("");
      }
      setSuccess(`Deleted "${archiveToDelete.name}" successfully.`);
      await loadArchives();
    } catch (err: any) {
      console.error(err);
      setError("Failed to delete the archive.");
    } finally {
      setArchiveToDelete(null);
    }
  };

  const handleNewSession = () => {
    setCurrentArchive(null);
    setArchiveNameInput("");
    setGeneratedSummary("");
    setVerbatimText("");
    setError("");
    setSuccess("Cleared workspace for a new clinical session.");
    setTimeout(() => setSuccess(""), 4000);
  };

  // Export & Download functions with safe ObjectURL revocation
  const handleDownloadTxt = () => {
    if (!generatedSummary) return;
    const element = document.createElement("a");
    const file = new Blob([generatedSummary], { type: "text/plain" });
    const url = URL.createObjectURL(file);
    element.href = url;
    element.download = `${archiveNameInput || "Therapy_Session_Note"}_Summary.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 150);
  };

  const handleCopyClipboard = async () => {
    if (!generatedSummary) return;
    try {
      await navigator.clipboard.writeText(generatedSummary);
      setSuccess("Summary copied to clinical clipboard.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Clipboard writing error:", err);
      setError("Failed to copy text to clipboard.");
    }
  };

  const toggleFocusArea = (area: string) => {
    setFocusAreas((prev) => 
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  };

  const formatDateForDisplay = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) {
        return dateStr.split(",")[0];
      }
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
      });
    } catch (e) {
      return dateStr;
    }
  };

  // If therapist hasn't unlocked the workstation, show lock screen
  if (!user || !passcode) {
    return <LockScreen onUnlock={handleUnlock} currentUser={user} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col antialiased" id="clinic-app-root">
      
      {/* ------------------- HEADER ------------------- */}
      <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center sticky top-0 z-45 shadow-xs shrink-0" id="app-header">
        <div className="max-w-7xl w-full mx-auto flex items-center justify-between" id="header-container">
          <div className="flex items-center space-x-3" id="header-brand-group">
            <div className="w-8 h-8 bg-indigo-700 rounded-md flex items-center justify-center text-white font-bold shadow-sm font-display" id="header-logo-wrapper">
              C
            </div>
            <h1 className="text-md font-semibold tracking-tight text-slate-800 flex items-center gap-2 font-display" id="header-title">
              ClinicianFlow <span className="text-indigo-600 font-bold">AI</span>
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[9px] font-bold uppercase rounded border border-indigo-200">
                Secure Browser-Based Encryption
              </span>
            </h1>
          </div>

          <div className="flex items-center space-x-6" id="header-user-group">
            <div className="hidden sm:flex items-center space-x-2 text-slate-500" id="header-sync-status">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-xs font-medium">Cloud Sync Active</span>
            </div>
            <div className="hidden sm:block h-8 w-[1px] bg-slate-200"></div>
            <div 
              role="button"
              tabIndex={0}
              onClick={() => {
                setEditProfileName(therapistName);
                setEditProfileTitle(therapistTitle);
                setIsEditProfileOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setEditProfileName(therapistName);
                  setEditProfileTitle(therapistTitle);
                  setIsEditProfileOpen(true);
                }
              }}
              className="flex items-center space-x-3 hover:bg-slate-50 border border-transparent hover:border-slate-100 p-1 px-2 rounded-xl transition-all cursor-pointer group" 
              id="header-user-badge"
              title="Customize Therapist Profile"
            >
              <div className="text-right">
                <p className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                  {therapistName || `Dr. ${(user.displayName || user.email.split("@")[0])}`}
                </p>
                <p className="text-[9px] text-slate-400">
                  {therapistTitle || "Clinical Psychologist"}
                </p>
              </div>
              <div className="w-9 h-9 bg-slate-200 rounded-full border border-slate-300 shadow-inner flex items-center justify-center font-bold text-sm text-indigo-700 font-display group-hover:scale-105 transition-transform" title={user.email}>
                {((therapistName || user.displayName || user.email).replace(/^Dr\.\s+/i, "")).charAt(0).toUpperCase()}
              </div>
            </div>
            
            <button
              onClick={handleSignOut}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-md transition-all cursor-pointer"
              title="Lock Workstation & Sign Out"
              id="header-signout-btn"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ------------------- NOTIFICATIONS / BANNERS ------------------- */}
      <AnimatePresence>
        {(error || success) && (
          <div className="max-w-7xl w-full mx-auto px-6 mt-4 shrink-0" id="banners-wrapper">
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-xl text-xs flex items-start gap-3 shadow-xs"
                id="error-banner"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-bold text-rose-900">Clinical Alert</h4>
                  <p className="text-rose-700 mt-0.5">{error}</p>
                </div>
                <button onClick={() => setError("")} className="text-rose-400 hover:text-rose-600 text-xs font-bold cursor-pointer">Dismiss</button>
              </motion.div>
            )}

            {success && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-indigo-50 border border-indigo-100 text-indigo-900 p-3.5 rounded-xl text-xs flex items-start gap-3 shadow-xs"
                id="success-banner"
              >
                <Check className="w-4 h-4 shrink-0 text-indigo-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-bold text-indigo-950 font-display">Secure Operation</h4>
                  <p className="text-indigo-800 mt-0.5">{success}</p>
                </div>
                <button onClick={() => setSuccess("")} className="text-indigo-400 hover:text-indigo-600 text-xs font-bold cursor-pointer">Dismiss</button>
              </motion.div>
            )}
          </div>
        )}
      </AnimatePresence>

      {/* ------------------- MAIN WORKING WINDOW ------------------- */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6 flex flex-col gap-6" id="app-workspace-main">
        
        {/* Grid: 3 columns for inputs */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch" id="workspace-grid">
          
          {/* ================= LEFT COLUMN: DOCUMENTS & REPOSITORY ================= */}
          <div className="lg:col-span-4 flex flex-col gap-6" id="left-column">
            
            {/* File Ingestion Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col" id="file-uploader-card">
              <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2" id="uploader-header">
                <UploadCloud className="w-3.5 h-3.5 text-indigo-600" />
                <span>Patient Documents</span>
              </h2>
              
              <div 
                role="button"
                tabIndex={0}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                className={`border border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  isDragging 
                    ? "border-indigo-500 bg-indigo-50/30" 
                    : "border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100"
                }`}
                id="drop-zone"
              >
                 <input 
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelectionChange}
                  accept=".pdf,image/png,image/jpeg,image/jpg,.txt,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  id="hidden-file-input"
                />
                
                {isExtracting ? (
                  <div className="flex flex-col items-center gap-2" id="extraction-loader">
                    <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
                    <p className="text-xs font-bold text-slate-800">Reading with Gemini intelligence...</p>
                    <p className="text-[10px] text-slate-500">Transcribing notes, checkboxes, and layout</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2" id="drop-prompt">
                    <div className="p-2 bg-indigo-50 text-indigo-700 rounded mb-1 font-mono text-[10px]" id="upload-icon-wrapper">
                      IMPORT FILE
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-700">Drag & drop session records</p>
                      <p className="text-[10px] text-slate-400 mt-1">PDFs, Word (.docx), Hand-written scans, images, or TXT</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Verbatim Repository Box */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col flex-1 min-h-[250px]" id="notes-repository-card">
              <div className="flex items-center justify-between mb-3" id="repository-header">
                <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Session Case Material</span>
                </h2>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-200/60 px-1.5 py-0.5 rounded">
                  {verbatimText.length} chars
                </span>
              </div>
              
              <textarea
                value={verbatimText}
                onChange={(e) => setVerbatimText(e.target.value)}
                placeholder="Paste hand-written drafts, session dictations, client self-reports, or verbatim transcriptions here. Documents processed above will automatically appear in this area."
                className="w-full flex-1 min-h-[150px] bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white resize-none font-sans leading-relaxed"
                id="verbatim-textarea"
              />
              <p className="text-[10px] text-slate-400 mt-2 leading-tight" id="notes-compliance-reminder">
                Note: This textbox represents the raw session details that the AI summarizer will analyze. Keep client names minimized to protect privacy.
              </p>
            </div>

            {/* Secure digital archives repository list */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col" id="archives-repository-card">
              <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2" id="archives-header">
                <FolderLock className="w-3.5 h-3.5 text-indigo-600" />
                <span>Secure Digital Archives</span>
              </h2>
              
              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1" id="archives-list">
                {archives.length === 0 ? (
                  <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl" id="empty-archives">
                    <Lock className="w-4 h-4 mx-auto text-slate-300" />
                    <p className="text-[11px] text-slate-400 mt-1">No encrypted records in database.</p>
                  </div>
                ) : (
                  archives.map((arch) => (
                    <div 
                      role="button"
                      tabIndex={0}
                      key={arch.id}
                      onClick={() => handleSelectArchive(arch)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSelectArchive(arch);
                        }
                      }}
                      className={`group flex items-center justify-between p-3 rounded-lg shadow-sm border transition-all cursor-pointer ${
                        currentArchive?.id === arch.id
                          ? "bg-white border-indigo-200 text-indigo-700 font-semibold"
                          : "bg-white border-slate-200 hover:border-slate-300"
                      }`}
                      id={`archive-${arch.id}`}
                    >
                      <div className="flex-1 min-w-0 flex items-start space-x-3" id={`archive-info-${arch.id}`}>
                        <div className={`p-2 rounded text-xs font-mono font-bold leading-none shrink-0 ${
                          currentArchive?.id === arch.id ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-600"
                        }`}>
                          {arch.framework}
                        </div>
                        <div className="flex-1 overflow-hidden" id={`archive-details-${arch.id}`}>
                          <p className="text-xs font-bold text-slate-700 truncate" id={`archive-name-text-${arch.id}`}>
                            {arch.name}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Uploaded {formatDateForDisplay(arch.date)}
                          </p>
                        </div>
                      </div>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setArchiveToDelete({ id: arch.id, name: arch.name });
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all cursor-pointer shrink-0 ml-2"
                        title="Delete encrypted summary"
                        id={`archive-delete-${arch.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* ================= MIDDLE COLUMN: TOGGLES & CLINICAL OPTIONS ================= */}
          <div className="lg:col-span-4 flex flex-col gap-6" id="middle-column">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col flex-1" id="settings-card">
              <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2" id="settings-header">
                <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                <span>Clinical Framework</span>
              </h2>

              {/* Framework Selector */}
              <div className="space-y-1.5 mb-5" id="framework-group">
                <div className="grid grid-cols-4 gap-2" id="framework-options">
                  {["SOAP", "DAP", "BIRP", "GIRP"].map((f) => (
                    <button
                      key={f}
                      onClick={() => setFramework(f)}
                      className={`py-2 text-xs font-bold rounded shadow-sm border transition-all cursor-pointer ${
                        framework === f 
                          ? "bg-indigo-600 text-white border-indigo-600" 
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                      id={`framework-btn-${f}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-[10px] text-slate-500 mt-2 leading-relaxed" id="framework-explanation">
                  {framework === "SOAP" && "SOAP format separates Subjective report, Objective findings, Assessment indices, and Plan details."}
                  {framework === "DAP" && "DAP format summarizes Data observations directly, followed by professional Assessment and clinical Plan."}
                  {framework === "BIRP" && "BIRP arranges session info around Behavior cues, Intervention types, Response rate, and Plan."}
                  {framework === "GIRP" && "GIRP aligns notes into Treatment Goals, Interventions triggered, Response observed, and Plan."}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between" id="subtitles-toggle-wrapper">
                  <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Remove Framework Sub-titles</span>
                  <button
                    type="button"
                    onClick={() => setHideSubtitles(!hideSubtitles)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      hideSubtitles ? "bg-indigo-600" : "bg-slate-200"
                    }`}
                    id="subtitles-toggle-btn"
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        hideSubtitles ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4" id="generation-settings-header">
                Generation Settings
              </h2>

              {/* Length of Paragraphs */}
              <div className="space-y-1.5 mb-5" id="length-group">
                <label className="text-[11px] font-medium text-slate-500 block">
                  Note Length
                </label>
                <div className="grid grid-cols-3 gap-2" id="length-options">
                  {["concise", "medium", "detailed"].map((l) => (
                    <button
                      key={l}
                      onClick={() => setLength(l)}
                      className={`py-1.5 text-xs font-semibold rounded border capitalize transition-all cursor-pointer ${
                        length === l 
                          ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-bold" 
                          : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
                      }`}
                      id={`length-btn-${l}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Paragraph Quantity */}
              <div className="space-y-1.5 mb-5" id="quantity-group">
                <div className="flex justify-between items-center" id="quantity-labels">
                  <label className="text-[11px] font-medium text-slate-500">
                    Paragraph Count
                  </label>
                  <span className="text-[11px] font-bold text-indigo-600">
                    {quantity} {quantity === 1 ? "paragraph" : "paragraphs"}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600 mt-2"
                  id="quantity-slider"
                />
              </div>

              {/* Tone style */}
              <div className="space-y-1.5 mb-5" id="tone-group">
                <label className="text-[11px] font-medium text-slate-500 block">
                  Clinical Dialect
                </label>
                <div className="grid grid-cols-3 gap-2" id="tone-options">
                  {[
                    { val: "clinical", label: "Objective" },
                    { val: "academic", label: "Academic" },
                    { val: "collaborative", label: "Relational" }
                  ].map((t) => (
                    <button
                      key={t.val}
                      onClick={() => setTone(t.val)}
                      className={`py-1.5 text-[10px] font-semibold rounded border transition-all cursor-pointer ${
                        tone === t.val 
                          ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-bold" 
                          : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
                      }`}
                      id={`tone-btn-${t.val}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Focus Areas Selection */}
              <div className="space-y-2 mb-5 flex-1 flex flex-col" id="focus-group">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Required Focus Areas
                </label>
                <div className="space-y-2 overflow-y-auto flex-1 max-h-[170px] pr-1" id="focus-checkboxes">
                  {[
                    "Client's Mental Status & Affect",
                    "Progress Toward Treatment Goals",
                    "Therapist Interventions Used",
                    "Symptom Severity & Frequency",
                    "Safety Concerns & Risk Assessment",
                    "Assigned Homework & Skill Review",
                    "Interpersonal Attachment Themes"
                  ].map((area) => (
                    <label 
                      key={area}
                      className="flex items-center space-x-2 cursor-pointer select-none"
                      id={`focus-label-${area.replace(/\s+/g, "-")}`}
                    >
                      <input 
                        type="checkbox"
                        checked={focusAreas.includes(area)}
                        onChange={() => toggleFocusArea(area)}
                        className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                        id={`focus-checkbox-${area.replace(/\s+/g, "-")}`}
                      />
                      <span className={`text-[11px] font-medium ${focusAreas.includes(area) ? "text-slate-800" : "text-slate-500"}`}>
                        {area}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Insights Option */}
              <div className="pt-4 border-t border-slate-100" id="insights-toggle-wrapper">
                <label className="flex items-center space-x-2 cursor-pointer" id="insights-label">
                  <input 
                    type="checkbox"
                    checked={includeInsights}
                    onChange={(e) => setIncludeInsights(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                    id="insights-checkbox"
                  />
                  <span className="text-[11px] text-slate-600 font-medium">Include Clinical Hypotheses & Insights</span>
                </label>
              </div>

            </div>
          </div>

          {/* ================= RIGHT COLUMN: CLINICAL SYSTEM INSTRUCTIONS ================= */}
          <div className="lg:col-span-4 flex flex-col gap-6" id="right-column">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col flex-1" id="style-instructions-card">
              <div className="flex items-center justify-between mb-2" id="style-instructions-header">
                <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Clinical Directives</span>
                </h2>

                <div className="flex items-center gap-2" id="settings-save-indicator-group">
                  {settingsSavedStatus === "saving" && (
                    <span className="text-[10px] text-indigo-600 font-medium animate-pulse">Saving...</span>
                  )}
                  {settingsSavedStatus === "saved" && (
                    <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-0.5">
                      <Check className="w-3 h-3" /> Saved Profile
                    </span>
                  )}
                  {settingsSavedStatus === "unsaved" && (
                    <button
                      onClick={() => handleSaveSettings()}
                      disabled={isSavingSettings}
                      className="text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-2.5 py-0.5 rounded shadow-sm transition-all flex items-center gap-1 cursor-pointer animate-pulse"
                      id="save-directives-profile-btn"
                    >
                      Save Profile
                    </button>
                  )}
                </div>
              </div>
              
              <p className="text-[10px] text-slate-400 mb-4 leading-relaxed" id="style-instructions-intro">
                Select a therapeutic modality template or customize instructions to align with your clinical practice standards.
              </p>

              {/* Template quick loader */}
              <div className="space-y-1.5 mb-4" id="template-quick-loader">
                <div className="flex flex-wrap gap-1.5 items-center" id="template-pills">
                  {CLINICAL_TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.name}
                      onClick={() => {
                        setStyleInstructions(tmpl.instructions);
                        setActiveTemplateName(tmpl.name);
                        setSettingsSavedStatus("unsaved");
                      }}
                      className={`px-2.5 py-1 text-[10px] font-bold rounded-full border transition-all cursor-pointer ${
                        activeTemplateName === tmpl.name
                          ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                          : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                      }`}
                      id={`template-btn-${tmpl.name.replace(/\s+/g, "-")}`}
                    >
                      {tmpl.name.replace(" (Cognitive Behavioral)", "").replace(" & Process", "")}
                    </button>
                  ))}

                  {/* Custom Profiles */}
                  {customTemplates.map((tmpl) => (
                    <div
                      key={tmpl.name}
                      className="inline-flex items-center"
                      id={`custom-template-group-${tmpl.name.replace(/\s+/g, "-")}`}
                    >
                      <button
                        onClick={() => {
                          setStyleInstructions(tmpl.instructions);
                          setActiveTemplateName(tmpl.name);
                          setSettingsSavedStatus("saved");
                        }}
                        className={`px-2.5 py-1 text-[10px] font-bold rounded-l-full border-y border-l transition-all cursor-pointer ${
                          activeTemplateName === tmpl.name
                            ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                            : "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
                        }`}
                        id={`custom-template-btn-${tmpl.name.replace(/\s+/g, "-")}`}
                      >
                        {tmpl.name}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCustomTemplate(tmpl.name);
                        }}
                        className={`px-1.5 py-1 text-[10px] rounded-r-full border-y border-r transition-all cursor-pointer flex items-center justify-center ${
                          activeTemplateName === tmpl.name
                            ? "bg-indigo-50 text-indigo-400 hover:text-indigo-600 border-indigo-200"
                            : "bg-purple-50 text-purple-400 hover:text-purple-600 border-purple-200 hover:bg-purple-100"
                        }`}
                        title="Delete this profile"
                        id={`delete-custom-template-${tmpl.name.replace(/\s+/g, "-")}`}
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}

                  {/* Add New Profile Pill */}
                  <button
                    onClick={() => {
                      setNewProfileName("");
                      setIsAddProfileOpen(true);
                    }}
                    className="px-2.5 py-1 text-[10px] font-bold rounded-full border border-dashed border-indigo-300 bg-indigo-50/30 text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer flex items-center gap-1"
                    id="add-new-profile-btn"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add New Profile</span>
                  </button>
                </div>
              </div>

              {/* Actual Instruction Field */}
              <textarea
                value={styleInstructions}
                onChange={(e) => {
                  setStyleInstructions(e.target.value);
                  const isCustom = customTemplates.some(t => t.name === activeTemplateName);
                  if (!isCustom) {
                    setActiveTemplateName("Custom Directive");
                  }
                  setSettingsSavedStatus("unsaved");
                }}
                placeholder="Instruct the summarization model on specific behavioral descriptors, compliance criteria, DSM-5 diagnostic mappings, or formatting constraints."
                className="w-full flex-1 min-h-[180px] bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white resize-none font-mono leading-relaxed"
                id="style-instructions-textarea"
              />
              
              <div className="mt-3 p-3 bg-amber-50/50 border border-amber-200 rounded-xl flex gap-2 text-[10px] text-amber-800 leading-normal" id="security-assurance">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  These instructions guide the deep-thinking engine. Live API synthesis is transient and subject to the platform's standard data data privacy terms.
                </p>
              </div>

            </div>
          </div>

        </div>

        {/* ================= BOTTOM MODULE: GENERATION CONTROL & OUTPUT ================= */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-5 shrink-0" id="bottom-generation-module">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4" id="generation-bar-header">
            <div id="generation-title-group">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 font-display">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>Clinical Synthesis Engine</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Formulates clean, secure progress summaries via Gemini high-reasoning thinking.
              </p>
            </div>

            {/* Action Trigger */}
            <button
              onClick={handleGenerateSummary}
              disabled={isSummarizing || isExtracting}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded shadow-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer self-start sm:self-auto shrink-0"
              id="generate-summary-button"
            >
              {isSummarizing ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Synthesizing Summary...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate Secure Session Summary</span>
                </>
              )}
            </button>
          </div>

          {/* Large output text field */}
          <div className="relative border border-slate-200 rounded-xl bg-slate-50/30 p-1 flex flex-col min-h-[300px]" id="output-text-container">
            
            {/* Thinking Overlay Loader */}
            {isSummarizing && (
              <div className="absolute inset-0 bg-white/98 z-10 flex flex-col items-center justify-center text-center p-6 rounded-xl" id="thinking-overlay">
                <div className="relative w-12 h-12 mb-3" id="spinning-loader-container">
                  <div className="absolute inset-0 border-3 border-indigo-500/15 rounded-full" />
                  <div className="absolute inset-0 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <Sparkles className="absolute inset-0 m-auto w-4 h-4 text-indigo-600 animate-pulse" />
                </div>
                <h4 className="text-xs font-bold text-slate-900 font-display">Activating Gemini Clinical Thinking Engine</h4>
                <p className="text-[10px] text-slate-500 max-w-xs mt-1 leading-relaxed">
                  Structuring material according to the {framework} protocol, checking clinical guidelines, and applying format constraints.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between border-b border-slate-200/60 px-4 py-2 bg-slate-50" id="output-utility-bar">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Clinical Note Output (Plain Text Format)
              </span>
              
              <div className="flex items-center gap-2" id="output-actions-group">
                <button
                  onClick={handleCopyClipboard}
                  disabled={!generatedSummary}
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded transition-colors cursor-pointer disabled:opacity-40"
                  title="Copy to clipboard"
                  id="copy-to-clipboard-btn"
                >
                  <ClipboardCheck className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDownloadTxt}
                  disabled={!generatedSummary}
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded transition-colors cursor-pointer disabled:opacity-40"
                  title="Download TXT Note"
                  id="download-txt-btn"
                >
                  <FileDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            <textarea
              value={generatedSummary}
              onChange={(e) => setGeneratedSummary(e.target.value)}
              placeholder="Your clinical progress notes will generate here. You can manually tweak, customize, or transcribe modifications into this box once complete."
              className="w-full flex-1 bg-transparent p-4 text-xs text-slate-800 placeholder-slate-400 focus:outline-none resize-none font-mono leading-relaxed"
              id="summary-output-textarea"
            />
            
            {/* Archive control bar */}
            <div className="border-t border-slate-200/60 px-4 py-3 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-b-xl" id="archive-control-bar">
              <div className="flex items-center gap-2 max-w-md w-full" id="archive-name-wrapper">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                  Custom Archive Name:
                </label>
                <input 
                  type="text"
                  placeholder="e.g. Patient J.S. - Session 10"
                  value={archiveNameInput}
                  onChange={(e) => setArchiveNameInput(e.target.value)}
                  className="flex-1 bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                  id="archive-name-field"
                />
              </div>

              <div className="flex items-center gap-2 self-end md:self-auto" id="archive-buttons-group">
                <button
                  onClick={handleNewSession}
                  className="px-3 py-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 border border-slate-200 text-xs font-semibold rounded transition-colors cursor-pointer"
                  id="new-session-btn"
                >
                  Clear Workspace
                </button>
                <button
                  onClick={handleSaveArchive}
                  disabled={isSaving || (!generatedSummary && !verbatimText)}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                  id="archive-save-btn"
                >
                  {isSaving ? (
                    <>
                      <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Encrypting...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3 h-3 text-white" />
                      <span>{currentArchive ? "Update Encrypted Archive" : "Encrypt & Save Archive"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>

        </div>

      </main>

      {/* ------------------- FOOTER ------------------- */}
      <footer className="bg-white border-t border-slate-200 py-6 px-6 text-center text-slate-500 text-xs shrink-0 mt-auto" id="app-footer">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4" id="footer-container">
          <div className="flex items-center justify-center md:justify-start gap-2" id="footer-logo-group">
            <div className="w-5 h-5 bg-indigo-100 rounded flex items-center justify-center text-indigo-700 font-bold text-[10px]">
              V
            </div>
            <span className="font-semibold text-slate-700">Clinical Workstation Vault</span>
          </div>
          <p id="footer-compliance-text" className="text-slate-400">
            Secure client-side database encryption. All session processing paths utilize transient, unlogged AI generation.
          </p>
        </div>
      </footer>

      {/* ------------------- CUSTOM STYLED DELETE CONFIRMATION MODAL ------------------- */}
      {archiveToDelete && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in" id="delete-archive-modal-overlay">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden transform transition-all scale-100 animate-in zoom-in duration-150" id="delete-archive-modal-content">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50" id="delete-archive-header">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Confirm Archive Deletion</span>
              </h3>
              <button 
                onClick={() => setArchiveToDelete(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                id="close-delete-archive-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-3" id="delete-archive-body">
              <p className="text-xs text-slate-700 font-medium leading-relaxed">
                Are you absolutely sure you want to permanently delete <strong className="text-slate-950 font-bold">"{archiveToDelete.name}"</strong>?
              </p>
              <p className="text-[11px] text-slate-400 leading-normal">
                This action is immediate and completely irreversible. The encrypted clinical payload will be permanently purged from the workspace backup records.
              </p>
            </div>

            <div className="border-t border-slate-100 px-6 py-4 bg-slate-50 flex items-center justify-end gap-3" id="delete-archive-footer">
              <button 
                onClick={() => setArchiveToDelete(null)}
                className="px-4 py-2 text-slate-500 hover:bg-slate-100 border border-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                id="cancel-delete-archive-btn"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmDeleteArchive}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                id="confirm-delete-archive-btn"
              >
                Delete Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------- ADD NEW PROFILE MODAL ------------------- */}
      {isAddProfileOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4" id="add-profile-modal-overlay">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden transform transition-all scale-100 animate-in fade-in zoom-in duration-200" id="add-profile-modal-content">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50" id="add-profile-modal-header">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-600" />
                <span>Create New Custom Profile</span>
              </h3>
              <button 
                onClick={() => {
                  setIsAddProfileOpen(false);
                  setNewProfileName("");
                  setModalError("");
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                id="close-add-profile-modal-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4" id="add-profile-modal-body">
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Provide a unique name for this profile (e.g., "SFT Solutions-Focused", "Teen Dialectical Behavior"). The new profile will start with empty directives so you can customize them completely.
              </p>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider" htmlFor="new-profile-name-input">
                  Profile Name
                </label>
                <input 
                  id="new-profile-name-input"
                  type="text"
                  placeholder="e.g. Solution-Focused Therapy"
                  value={newProfileName}
                  onChange={(e) => {
                    setNewProfileName(e.target.value);
                    setModalError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateCustomProfile();
                    }
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                  autoFocus
                />
              </div>

              {modalError && (
                <div className="flex items-start gap-1.5 p-2.5 bg-rose-50 border border-rose-100 rounded-lg text-[10px] text-rose-700 leading-normal" id="modal-error">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-500 mt-0.5" />
                  <span>{modalError}</span>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 px-6 py-4 bg-slate-50 flex items-center justify-end gap-3" id="add-profile-modal-footer">
              <button 
                onClick={() => {
                  setIsAddProfileOpen(false);
                  setNewProfileName("");
                  setModalError("");
                }}
                className="px-4 py-2 text-slate-500 hover:bg-slate-100 border border-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                id="cancel-add-profile-modal-btn"
              >
                Cancel
              </button>
              <button 
                onClick={handleCreateCustomProfile}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                id="confirm-add-profile-modal-btn"
              >
                Create Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------- EDIT THERAPIST PROFILE MODAL ------------------- */}
      {isEditProfileOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4" id="edit-profile-modal-overlay">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden transform transition-all scale-100 animate-in fade-in zoom-in duration-200" id="edit-profile-modal-content">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50" id="edit-profile-modal-header">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-600" />
                <span>Customize Therapist Profile</span>
              </h3>
              <button 
                onClick={() => {
                  setIsEditProfileOpen(false);
                  setEditProfileName("");
                  setEditProfileTitle("");
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                id="close-edit-profile-modal-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4" id="edit-profile-modal-body">
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Customize your professional display name and title. These values are used to label your workstation badge and identify your secure session records.
              </p>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider" htmlFor="edit-profile-name-input">
                  Therapist Name
                </label>
                <input 
                  id="edit-profile-name-input"
                  type="text"
                  placeholder="e.g. Dr. Lawal, LMFT"
                  value={editProfileName}
                  onChange={(e) => setEditProfileName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider" htmlFor="edit-profile-title-input">
                  Professional Designation / Title
                </label>
                <input 
                  id="edit-profile-title-input"
                  type="text"
                  placeholder="e.g. Clinical Psychologist"
                  value={editProfileTitle}
                  onChange={(e) => setEditProfileTitle(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="border-t border-slate-100 px-6 py-4 bg-slate-50 flex items-center justify-end gap-3" id="edit-profile-modal-footer">
              <button 
                onClick={() => {
                  setIsEditProfileOpen(false);
                  setEditProfileName("");
                  setEditProfileTitle("");
                }}
                className="px-4 py-2 text-slate-500 hover:bg-slate-100 border border-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                id="cancel-edit-profile-modal-btn"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  handleSaveProfileCustomization(editProfileName.trim(), editProfileTitle.trim());
                  setIsEditProfileOpen(false);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                id="confirm-edit-profile-modal-btn"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
