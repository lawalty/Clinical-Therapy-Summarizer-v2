/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { 
  FileText, 
  Sparkles, 
  ClipboardCheck, 
  ArrowRight, 
  Scan, 
  CheckCircle2, 
  X,
  Stethoscope,
  FileSpreadsheet
} from "lucide-react";
import { motion } from "motion/react";

export type AppToolMode = "notes-extractor" | "summary-generator";

interface AppModeSelectorModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onSelectMode: (mode: AppToolMode) => void;
  currentMode?: AppToolMode;
}

export default function AppModeSelectorModal({
  isOpen,
  onClose,
  onSelectMode,
  currentMode
}: AppModeSelectorModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full p-6 sm:p-8 relative my-auto overflow-hidden"
      >
        {/* Background Subtle Gradient */}
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-indigo-50 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-64 h-64 bg-teal-50 rounded-full blur-3xl pointer-events-none" />

        {/* Close button if optional */}
        {onClose && (
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            title="Close tool selector"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Modal Header */}
        <div className="text-center max-w-xl mx-auto mb-8 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full border border-indigo-100 mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Clinician Workstation Suite</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight font-display">
            Select Workstation Tool
          </h2>
          <p className="text-slate-600 text-sm mt-2 leading-relaxed">
            Choose the clinical tool you wish to launch for this session. You can switch between tools anytime from the top navigation bar.
          </p>
        </div>

        {/* Tools Grid Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 relative z-10">
          
          {/* OPTION 1: Therapist Notes Extractor */}
          <div 
            onClick={() => onSelectMode("notes-extractor")}
            className={`group relative bg-white border-2 rounded-2xl p-6 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between ${
              currentMode === "notes-extractor" 
                ? "border-teal-600 bg-teal-50/20 ring-2 ring-teal-500/20" 
                : "border-slate-200 hover:border-teal-500 hover:bg-slate-50/50"
            }`}
          >
            <div>
              {/* Header Badge & Icon */}
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-teal-100 text-teal-700 rounded-xl flex items-center justify-center font-bold group-hover:scale-105 transition-transform">
                  <Scan className="w-6 h-6" />
                </div>
                <span className="text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 bg-teal-50 text-teal-700 rounded-full border border-teal-200/80">
                  OCR & 7-Field Format
                </span>
              </div>

              {/* Title & Description */}
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-teal-700 transition-colors flex items-center gap-1.5 font-display">
                1. Therapist Notes Extractor
              </h3>
              <p className="text-slate-600 text-xs mt-2 leading-relaxed">
                Designed for therapists to scan and upload handwritten session scribbles or documents. AI transcribes and formats notes into 7 structured fields:
              </p>

              {/* Bullet List */}
              <ul className="mt-4 space-y-2 text-xs text-slate-700">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                  <span><strong>7 Fields:</strong> Date, Title, Session Length, Header, Topic/Narrative, Interventions, Therapist</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                  <span><strong>SOAP Auto-Mapping:</strong> S&O go to Topic/Narrative; A&P go to Interventions</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                  <span><strong>Editable Output:</strong> Edit fields individually or copy full combined note</span>
                </li>
              </ul>
            </div>

            {/* Launch Button */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-teal-700 group-hover:text-teal-800">
              <span>Launch Notes Extractor</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* OPTION 2: Clinical Summary Notes Generator */}
          <div 
            onClick={() => onSelectMode("summary-generator")}
            className={`group relative bg-white border-2 rounded-2xl p-6 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between ${
              currentMode === "summary-generator" 
                ? "border-indigo-600 bg-indigo-50/20 ring-2 ring-indigo-500/20" 
                : "border-slate-200 hover:border-indigo-500 hover:bg-slate-50/50"
            }`}
          >
            <div>
              {/* Header Badge & Icon */}
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center font-bold group-hover:scale-105 transition-transform">
                  <ClipboardCheck className="w-6 h-6" />
                </div>
                <span className="text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200/80">
                  Full Progress Notes
                </span>
              </div>

              {/* Title & Description */}
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-700 transition-colors flex items-center gap-1.5 font-display">
                2. Clinical Summary Notes Generator
              </h3>
              <p className="text-slate-600 text-xs mt-2 leading-relaxed">
                Synthesize raw session text or audio into formal, compliant progress notes with deep clinical insights & custom directives:
              </p>

              {/* Bullet List */}
              <ul className="mt-4 space-y-2 text-xs text-slate-700">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <span><strong>Frameworks:</strong> SOAP, DAP, BIRP, GIRP, or Standard Session Summary</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <span><strong>High-Thinking AI:</strong> Detailed therapeutic analysis & clinical hypotheses</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <span><strong>Custom Directives:</strong> Save style profiles & humanized client references</span>
                </li>
              </ul>
            </div>

            {/* Launch Button */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-indigo-700 group-hover:text-indigo-800">
              <span>Launch Summary Generator</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="mt-8 pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
          <p>
            🔒 All clinical records remain encrypted locally in your browser workspace.
          </p>
        </div>

      </motion.div>
    </div>
  );
}
