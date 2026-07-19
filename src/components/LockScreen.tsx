/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { ShieldCheck, KeyRound, Lock, UserCheck, AlertCircle, RefreshCw } from "lucide-react";
import { 
  loginWithEmail,
  registerWithEmail,
  TherapistUser, 
  getTherapistSettings, 
  saveTherapistSettings,
  logoutUser
} from "../lib/firebase";
import { encryptText, decryptText } from "../utils/crypto";
import { motion } from "motion/react";

interface LockScreenProps {
  onUnlock: (user: TherapistUser, passcode: string) => void;
  currentUser: TherapistUser | null;
  initialError?: string;
}

export default function LockScreen({ onUnlock, currentUser, initialError }: LockScreenProps) {
  const [emailMode, setEmailMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState(currentUser?.email || "");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(initialError || "");
  const [success, setSuccess] = useState("");

  // Update email if currentUser changes
  useEffect(() => {
    if (currentUser) {
      setEmail(currentUser.email);
    }
  }, [currentUser]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setSuccess("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      setIsLoading(false);
      return;
    }

    try {
      let activeUser: TherapistUser;
      const passcodeKey = password; // The password acts as the client-side AES-256 decryption key

      if (emailMode === "login") {
        setSuccess("Verifying workstation identity...");
        // 1. Authenticate with local workstation server
        activeUser = await loginWithEmail(email, password);

        setSuccess("Credentials verified. Initializing secure decryption...");

        // 2. Load therapist settings to decrypt sentinel
        const settings = await getTherapistSettings(activeUser.uid);
        
        if (settings?.encryptedSentinel) {
          try {
            const decrypted = await decryptText(settings.encryptedSentinel, passcodeKey);
            if (decrypted !== "VAULT-OK") {
              throw new Error("Incorrect password.");
            }
          } catch (decErr) {
            throw new Error("Incorrect Password. Please verify your clinical login credentials.");
          }
        } else {
          // If no sentinel exists, construct one dynamically using the password
          const encryptedSentinel = await encryptText("VAULT-OK", passcodeKey);
          await saveTherapistSettings(activeUser.uid, {
            styleInstructions: settings?.styleInstructions || "",
            activeTemplateName: settings?.activeTemplateName || "SOAP Focus",
            customTemplates: settings?.customTemplates || [],
            therapistName: settings?.therapistName || `Dr. ${activeUser.displayName || activeUser.email.split("@")[0]}`,
            therapistTitle: settings?.therapistTitle || "Clinical Psychologist",
            encryptedSentinel
          });
        }
        
        setSuccess("AES-256 workstation decrypted. Loading clinical profile...");
      } else {
        // Register Mode
        if (!displayName.trim()) {
          throw new Error("Please enter your name.");
        }
        
        setSuccess("Creating secure clinician account...");
        // 1. Register account in local database
        activeUser = await registerWithEmail(email, password, displayName);
        
        setSuccess("Account registered. Generating AES-256 security vault...");

        // 2. Establish initial sentinel for browser-side decryption
        const encryptedSentinel = await encryptText("VAULT-OK", passcodeKey);
        await saveTherapistSettings(activeUser.uid, {
          styleInstructions: "",
          activeTemplateName: "SOAP Focus",
          customTemplates: [],
          therapistName: displayName.trim(),
          therapistTitle: "Clinical Psychologist",
          encryptedSentinel
        });

        setSuccess("AES-256 clinical vault initialized. Launching workstation...");
      }

      // Unlock workspace!
      setTimeout(() => {
        onUnlock(activeUser, passcodeKey);
        setIsLoading(false);
      }, 800);

    } catch (err: any) {
      console.error("[AUTH_ERROR]", err);
      setError(err.message || "Workstation authentication failed. Please check your credentials.");
      setIsLoading(false);
    }
  };

  const handleResetSession = async () => {
    setIsLoading(true);
    try {
      await logoutUser();
      setEmail("");
      setPassword("");
      setDisplayName("");
      setError("");
      setSuccess("");
      window.location.reload();
    } catch (e) {
      setError("Failed to clear workstation session.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans" id="lock-screen-container">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-slate-800 animate-in fade-in slide-in-from-bottom-4 duration-300"
        id="lock-card"
      >
        <div className="flex flex-col items-center mb-6 text-center" id="lock-header">
          <div className="p-3 bg-indigo-50 text-indigo-700 rounded-full mb-3 shadow-xs" id="lock-logo-wrapper">
            <ShieldCheck className="w-10 h-10" id="lock-logo-icon" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-display" id="lock-title">
            {currentUser ? "Workstation Locked" : "Secure Clinic Workstation"}
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-xs" id="lock-subtitle">
            {currentUser 
              ? `Unlock active session: ${currentUser.email}` 
              : "HIPAA-Compliant Encrypted Therapist Portal"}
          </p>
        </div>

        <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 mb-6 text-xs text-slate-600 leading-relaxed space-y-2" id="security-explainer">
          <div className="flex items-center gap-2 text-indigo-700 font-bold mb-1" id="security-explainer-header">
            <KeyRound className="w-4 h-4 text-indigo-600 animate-pulse" id="security-explainer-icon" />
            <span>Strict Client-Side Encryption (AES-256)</span>
          </div>
          <p>
            To guarantee absolute patient data confidentiality, sensitive records are encrypted directly in your browser prior to server synchronization.
          </p>
          <p className="font-medium text-slate-700">
            Your workstation password acts as your local AES-256 decryption key. Only you hold the authority to decode your saved files.
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4 text-left" id="email-auth-form">
          {emailMode === "register" && (
            <div className="space-y-1.5" id="email-reg-name-group">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-450 block" htmlFor="email-reg-name">
                Therapist Name
              </label>
              <input
                type="text"
                required
                placeholder="Dr. Sarah Jenkins, LMFT"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-slate-950 text-sm focus:outline-none focus:border-indigo-600 transition-colors"
                id="email-reg-name"
              />
            </div>
          )}

          <div className="space-y-1.5" id="email-auth-group">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-450 block" htmlFor="email-auth-field">
              Clinical Email Address
            </label>
            <input
              type="email"
              required
              disabled={!!currentUser}
              placeholder="therapist@clinic.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-slate-950 text-sm focus:outline-none focus:border-indigo-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              id="email-auth-field"
            />
          </div>

          <div className="space-y-1.5" id="email-pass-group">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-450 block" htmlFor="email-pass-field">
              Workstation Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-slate-950 text-sm focus:outline-none focus:border-indigo-600 transition-colors font-mono"
              id="email-pass-field"
              autoFocus
            />
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-150 text-rose-700 text-xs rounded-xl flex items-start gap-2 animate-fade-in" id="lock-error-banner">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" id="lock-error-icon" />
              <div className="space-y-1 text-left">
                <p className="font-bold text-rose-800">Authentication Error</p>
                <p className="text-[11px] leading-relaxed text-rose-700">{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="p-3 bg-indigo-50 border border-indigo-150 text-indigo-750 text-xs rounded-xl flex items-center gap-2" id="lock-success-banner">
              <UserCheck className="w-4 h-4 shrink-0 text-indigo-600" id="lock-success-icon" />
              <span className="font-semibold">{success}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-xl shadow-md text-sm focus:outline-none flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            id="email-submit-button"
          >
            {isLoading ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <span>
                {currentUser 
                  ? "Unlock Workstation" 
                  : (emailMode === "login" ? "Verify & Unlock Workstation" : "Register & Create Vault")}
              </span>
            )}
          </button>

          <div className="text-center pt-2 border-t border-slate-100 flex flex-col gap-3" id="email-toggle-mode">
            {!currentUser ? (
              <button
                type="button"
                onClick={() => {
                  setEmailMode(emailMode === "login" ? "register" : "login");
                  setError("");
                  setSuccess("");
                }}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-bold transition-colors cursor-pointer"
                id="email-toggle-button"
              >
                {emailMode === "login" ? "First time using Email? Register here" : "Already registered? Sign in here"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleResetSession}
                className="text-xs text-rose-600 hover:text-rose-700 font-bold transition-colors cursor-pointer"
                id="switch-account-button"
              >
                Sign Out / Change User
              </button>
            )}
          </div>
        </form>
      </motion.div>
    </div>
  );
}
