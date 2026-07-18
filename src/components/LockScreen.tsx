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

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError("");
    setSuccess("");
    try {
      const activeUser = await loginWithGoogle();
      setSuccess(`Identity verified as ${activeUser.email}`);
    } catch (err: any) {
      console.error("[GOOGLE_SIGNIN_ERROR]", err);
      // Clean up user-friendly error messages as requested:
      if (err.message && (err.message.includes("auth/unauthorized-domain") || err.code === "auth/unauthorized-domain")) {
        setError("Domain Authorization Required. This web domain is not registered in your clinical Firebase console. Please contact your workstation administrator to authorize this URL.");
      } else {
        setError(err.message || "Google Authentication failed. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthAndUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (passcode.length < 6) {
      setError("Secret Passcode must be at least 6 characters long.");
      return;
    }

    if (isNewUser && passcode !== confirmPasscode) {
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
        <div className="flex flex-col items-center mb-6 text-center" id="lock-header">
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
            <span>Dual-Layer Security Model</span>
          </div>
          <p>
            To protect patient confidentiality and comply with HIPAA security guidelines, access requires two separate keys:
          </p>
          <ul className="list-disc pl-4 space-y-1 text-slate-600">
            <li>
              <strong className="font-semibold text-slate-800">1. Verified Identity:</strong> Authenticates your clinical email via Google Sign-In.
            </li>
            <li>
              <strong className="font-semibold text-slate-800">2. Master Passcode:</strong> Standard AES-GCM 256 local decryption key. Sensitive records are encrypted in-browser before upload, meaning only you hold the key.
            </li>
          </ul>
        </div>

        {!currentUser ? (
          /* STEP 1: Google Identity Verification */
          <div className="space-y-5" id="auth-step-1">
            <div className="text-center">
              <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase rounded-full border border-indigo-100">
                Step 1: Authenticate Identity
              </span>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Please sign in with your clinic's authorized Google account to verify your therapist identity.
              </p>
            </div>

            <button
              type="button"
              disabled={isLoading}
              onClick={handleGoogleSignIn}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl shadow-md text-sm focus:outline-none flex items-center justify-center gap-3 transition-all disabled:opacity-50 cursor-pointer hover:scale-[1.01]"
              id="google-signin-button"
            >
              {isLoading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <svg className="w-5 h-5 shrink-0 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  <span>Sign In with Google</span>
                </>
              )}
            </button>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2" id="lock-error-banner">
                <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5 text-rose-600" id="lock-error-icon" />
                <div className="space-y-1 text-left">
                  <p className="font-semibold">Authentication Error</p>
                  <p>{error}</p>
                  <p className="text-[11px] text-rose-600 mt-1">
                    If this error persists, please get ahold of your clinic or workstation administrator.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* STEP 2: Master Passcode input to decrypt */
          <div className="space-y-5" id="auth-step-2">
            <div className="text-center">
              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 text-[10px] font-bold uppercase rounded-full border border-emerald-100 flex items-center justify-center gap-1.5 w-fit mx-auto">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Verified Practitioner: {currentUser.email}
              </span>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Provide your secure personal key to unlock and decrypt your workstation files.
              </p>
            </div>

            <form onSubmit={handleAuthAndUnlock} className="space-y-4" id="lock-form">
              <div className="space-y-2" id="passcode-input-group">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  {isNewUser ? "Choose Master Passcode" : "Enter Master Passcode"}
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

              {isNewUser && (
                <div className="space-y-2" id="confirm-passcode-input-group">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-450 block">
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
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2" id="lock-error-banner-step2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" id="lock-error-icon-step2" />
                  <div className="space-y-1 text-left">
                    <p className="font-semibold">Decryption Failed</p>
                    <p>{error}</p>
                  </div>
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
                      {isNewUser ? "Create Key & Unlock Workspace" : "Decrypt Workstation"}
                    </span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-100 text-center flex flex-col gap-3" id="lock-toggle-mode">
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
                {isNewUser ? "Have existing clinical key? Enter passcode" : "First time visiting? Establish clinical secret passcode"}
              </button>

              <button
                type="button"
                onClick={handleResetSession}
                className="text-xs text-rose-600 hover:text-rose-700 transition-colors font-semibold cursor-pointer border-t border-slate-100 pt-3"
                id="switch-account-button"
              >
                Sign out of {currentUser.email}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
