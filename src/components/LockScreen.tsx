/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { ShieldCheck, KeyRound, Lock, UserCheck, AlertCircle } from "lucide-react";
import { 
  loginWithGoogle, 
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
  const [passcode, setPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [isNewUser, setIsNewUser] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(initialError || "");
  const [success, setSuccess] = useState("");

  const handleAuthAndUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (passcode.length < 6) {
      setError("Secret Passcode must be at least 6 characters long.");
      return;
    }

    if (!currentUser && isNewUser && passcode !== confirmPasscode) {
      setError("Passcodes do not match. Please verify.");
      return;
    }

    setIsLoading(true);

    try {
      let activeUser: TherapistUser;

      // 1. Authenticate user if not already logged in
      if (currentUser) {
        activeUser = currentUser;
      } else {
        activeUser = await loginWithGoogle();
      }

      setSuccess("Authenticating secure workstation session...");

      // 2. Load therapist settings to verify master passcode against sentinel
      const settings = await getTherapistSettings(activeUser.uid);

      if (settings?.encryptedSentinel) {
        // Attempt to decrypt sentinel
        try {
          const decrypted = await decryptText(settings.encryptedSentinel, passcode);
          if (decrypted !== "VAULT-OK") {
            throw new Error("Sentinel mismatch");
          }
        } catch (decErr) {
          // If already logged in, do not clear the user, but block unlock.
          // If we just authenticated, log them out to keep state clean.
          if (!currentUser) {
            await logoutUser();
          }
          throw new Error("Incorrect Master Passcode. Please ensure your key is entered correctly.");
        }
      } else {
        // No sentinel exists yet in storage!
        // To prevent accidental setup and enforce fail-closed security, require isNewUser to be true to establish a new sentinel.
        if (!isNewUser) {
          if (!currentUser) {
            await logoutUser();
          }
          throw new Error("No secure workstation profile found for this therapist. If this is your first time, please click 'Establish clinical secret passcode' below to set up your master key.");
        }

        // Establish passcode sentinel for new user or returning migrated user
        const encryptedSentinel = await encryptText("VAULT-OK", passcode);
        const updatedSettings = {
          styleInstructions: settings?.styleInstructions || "",
          activeTemplateName: settings?.activeTemplateName || "SOAP Focus",
          customTemplates: settings?.customTemplates || [],
          therapistName: settings?.therapistName || `Dr. ${activeUser.displayName || activeUser.email.split("@")[0]}`,
          therapistTitle: settings?.therapistTitle || "Clinical Psychologist",
          encryptedSentinel
        };
        await saveTherapistSettings(activeUser.uid, updatedSettings);
      }

      setSuccess("Workstation decrypted. Loading clinical profile...");
      
      setTimeout(() => {
        onUnlock(activeUser, passcode);
        setIsLoading(false);
      }, 800);

    } catch (err: any) {
      console.error("[LOCK_ERROR]", err);
      setError(err.message || "Authentication failed. Please check network connection.");
      setIsLoading(false);
    }
  };

  const handleResetSession = async () => {
    setIsLoading(true);
    try {
      await logoutUser();
      window.location.reload();
    } catch (e) {
      setError("Failed to reset session.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans" id="lock-screen-container">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-slate-800"
        id="lock-card"
      >
        <div className="flex flex-col items-center mb-8 text-center" id="lock-header">
          <div className="p-3 bg-indigo-50 text-indigo-700 rounded-full mb-3" id="lock-logo-wrapper">
            <ShieldCheck className="w-10 h-10" id="lock-logo-icon" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-display" id="lock-title">
            {currentUser ? "Workstation Locked" : "Secure Clinic Workstation"}
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-xs" id="lock-subtitle">
            {currentUser ? `Active Session: ${currentUser.email}` : "Licensed Therapist & Counselor Portal"}
          </p>
        </div>

        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 text-xs text-slate-600 leading-relaxed space-y-2" id="security-explainer">
          <div className="flex items-center gap-2 text-indigo-700 font-bold mb-1" id="security-explainer-header">
            <KeyRound className="w-4 h-4" id="security-explainer-icon" />
            <span>Secure Browser-Based Encryption</span>
          </div>
          <p>
            Your clinical archives are encrypted <strong className="font-semibold text-slate-800">directly in your browser</strong> using AES-GCM 256 prior to database storage.
          </p>
          <p className="font-semibold text-slate-800">
            Crucial: Choose a unique passcode. If forgotten, your secure cloud notes cannot be recovered by anyone, maintaining absolute privacy compliance.
          </p>
        </div>

        <form onSubmit={handleAuthAndUnlock} className="space-y-4" id="lock-form">
          <div className="space-y-2" id="passcode-input-group">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
              {currentUser 
                ? "Enter Master Passcode to Unlock" 
                : isNewUser 
                  ? "Choose Master Passcode" 
                  : "Enter Master Passcode"
              }
            </label>
            <div className="relative" id="passcode-input-wrapper">
              <Lock className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-400" id="passcode-input-icon" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-slate-950 text-sm focus:outline-none focus:border-indigo-600 transition-colors"
                id="passcode-field"
              />
            </div>
          </div>

          {!currentUser && isNewUser && (
            <div className="space-y-2" id="confirm-passcode-input-group">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                Confirm Master Passcode
              </label>
              <div className="relative" id="confirm-passcode-input-wrapper">
                <Lock className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-400" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={confirmPasscode}
                  onChange={(e) => setConfirmPasscode(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-slate-950 text-sm focus:outline-none focus:border-indigo-600 transition-colors"
                  id="confirm-passcode-field"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2" id="lock-error-banner">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" id="lock-error-icon" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs rounded-xl flex items-start gap-2" id="lock-success-banner">
              <UserCheck className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600" id="lock-success-icon" />
              <span>{success}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-md text-sm focus:outline-none flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            id="unlock-button"
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {currentUser 
                    ? "Decrypt Workstation" 
                    : isNewUser 
                      ? "Create Key & Unlock Workspace" 
                      : "Authorize & Unlock Workspace"
                  }
                </span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 text-center flex flex-col gap-2" id="lock-toggle-mode">
          {currentUser ? (
            <button
              type="button"
              onClick={handleResetSession}
              className="text-xs text-rose-600 hover:text-rose-700 transition-colors font-semibold cursor-pointer"
              id="switch-account-button"
            >
              Sign out of this clinician account
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsNewUser(!isNewUser);
                setError("");
                setSuccess("");
              }}
              className="text-xs text-indigo-600 hover:text-indigo-700 transition-colors font-semibold cursor-pointer"
              id="toggle-mode-button"
            >
              {isNewUser ? "Existing therapist? Enter session passcode" : "First time visiting? Establish clinical secret passcode"}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
