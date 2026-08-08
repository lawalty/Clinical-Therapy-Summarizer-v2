/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { 
  Scan, 
  UploadCloud, 
  FileText, 
  Sparkles, 
  Copy, 
  Check, 
  ArrowRight, 
  Save, 
  Download, 
  RotateCcw, 
  AlertCircle,
  Stethoscope,
  Info,
  Calendar,
  Clock,
  User,
  Tag,
  CheckCircle2,
  FileCheck,
  Zap,
  Camera,
  Video,
  RefreshCw,
  Maximize2
} from "lucide-react";
import { TherapistUser, getAuthHeaders } from "../lib/firebase";
import { motion, AnimatePresence } from "motion/react";

export interface ExtractedTherapistNote {
  date: string;
  title: string;
  sessionLength: string;
  headerNote: string;
  topicNarrative: string;
  interventions: string;
  therapist: string;
}

interface TherapistNotesExtractorProps {
  user: TherapistUser | null;
  therapistName: string;
  onSendToSummaryGenerator: (formattedNote: string, patientName?: string) => void;
  onSaveArchive: (name: string, content: string, framework: string) => Promise<void>;
}

// Sample handwritten note template for demonstration
const SAMPLE_PATIENT_NOTE: ExtractedTherapistNote = {
  date: "June 30, 2026",
  title: "Individual Teletherapy Session",
  sessionLength: "45 min",
  headerNote: "Client Alex Morgan arrived 10 minutes early for the session and was actively engaged throughout.",
  topicNarrative: "Client reported feeling positive regarding recent workplace routine adjustments. Client discussed strategies for balancing personal responsibilities and setting healthy interpersonal boundaries. Client noted completing self-care goals and opening a dedicated budget savings account.",
  interventions: "Therapist utilized Cognitive Behavioral Therapy (CBT) principles to explore thought patterns around boundary setting and effective communication. Client practiced assertive dialogue techniques for workplace interactions. Therapist and client processed stress management strategies and established homework to track mood triggers before next session.",
  therapist: "Michele T. Walty, LPC"
};

export default function TherapistNotesExtractor({
  user,
  therapistName,
  onSendToSummaryGenerator,
  onSaveArchive
}: TherapistNotesExtractorProps) {
  const [inputTab, setInputTab] = useState<"scanner" | "upload" | "text">("upload");
  const [rawTextInput, setRawTextInput] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copied, setCopied] = useState(false);
  const [isSavingArchive, setIsSavingArchive] = useState(false);

  // Live Connected Scanner / Camera Capture State
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Stop current camera/scanner feed
  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  // Start video stream from selected USB Scanner device or camera
  const startCameraStream = async (deviceId?: string) => {
    setCameraError("");
    stopCameraStream();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("Your browser does not support live scanner video capture. Please use file upload.");
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId 
          ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setIsCameraActive(true);

      // List all video inputs (USB document cameras, webcams, overhead scanners)
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      setVideoDevices(videoInputs);
      if (videoInputs.length > 0 && !selectedDeviceId) {
        const activeTrackDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId;
        setSelectedDeviceId(activeTrackDeviceId || videoInputs[0].deviceId);
      }
    } catch (err: any) {
      console.error("Camera/Scanner access error:", err);
      setCameraError(
        err.name === "NotAllowedError" || err.name === "PermissionDeniedError"
          ? "Scanner/Camera access was denied by your browser. Please allow camera permissions or upload a scanned image file."
          : "Could not connect to live scanner feed. Ensure your USB document camera or webcam is connected, or choose file upload."
      );
      setIsCameraActive(false);
    }
  };

  // Manage video stream lifecycle when tab changes
  useEffect(() => {
    if (inputTab === "scanner") {
      startCameraStream(selectedDeviceId);
    } else {
      stopCameraStream();
    }
    return () => stopCameraStream();
  }, [inputTab]);

  // Extracted Note Fields
  const [noteData, setNoteData] = useState<ExtractedTherapistNote>({
    date: "",
    title: "",
    sessionLength: "",
    headerNote: "",
    topicNarrative: "",
    interventions: "",
    therapist: therapistName || "Michele T. Walty, LPC"
  });

  const [hasExtractedData, setHasExtractedData] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to format combined note string matching exact user clinical format:
  // [Date] [Title] [Session Length]
  //
  // [Header Note]
  //
  // Topic/Narrative: [topicNarrative]
  //
  // Interventions: [interventions]
  //
  // [Therapist]
  const getCombinedFormattedNote = (note: ExtractedTherapistNote): string => {
    const blocks: string[] = [];

    // Top header line: Date Title Session Length
    const topHeader = [note.date, note.title, note.sessionLength].filter(Boolean).join(" ");
    if (topHeader) {
      blocks.push(topHeader);
    }

    // Header Note
    if (note.headerNote) {
      const cleanHeaderNote = note.headerNote.replace(/^(Header Note|Header|Arrival Note):\s*/i, "");
      blocks.push(cleanHeaderNote);
    }

    // Topic/Narrative
    if (note.topicNarrative) {
      const cleanTopic = note.topicNarrative.replace(/^Topic\/Narrative:\s*/i, "");
      blocks.push(`Topic/Narrative: ${cleanTopic}`);
    }

    // Interventions
    if (note.interventions) {
      const cleanInterventions = note.interventions.replace(/^Interventions:\s*/i, "");
      blocks.push(`Interventions: ${cleanInterventions}`);
    }

    // Therapist
    if (note.therapist) {
      const cleanTherapist = note.therapist.replace(/^(Therapist|Provider):\s*/i, "");
      blocks.push(cleanTherapist);
    }

    return blocks.join("\n\n");
  };

  // Perform AI Extraction via /api/extract-therapist-notes
  const performExtraction = async (payload: { fileData?: string; mimeType?: string; filename?: string; rawText?: string }) => {
    if (!user) {
      setError("Please log in to use the Therapist Notes Extractor.");
      return;
    }

    setIsProcessing(true);
    setError("");
    setSuccess("AI Analyzing Handwritten Notes & Mapping SOAP Structure...");

    try {
      const headers = await getAuthHeaders(user.uid);
      const response = await fetch("/api/extract-therapist-notes", {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...payload,
          therapistName: therapistName || "Michele T. Walty, LPC"
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned status ${response.status}`);
      }

      const data = await response.json();
      if (data.extractedNote) {
        const result: ExtractedTherapistNote = {
          date: data.extractedNote.date || "",
          title: data.extractedNote.title || "",
          sessionLength: data.extractedNote.sessionLength || "",
          headerNote: data.extractedNote.headerNote || "",
          topicNarrative: data.extractedNote.topicNarrative || "",
          interventions: data.extractedNote.interventions || "",
          therapist: data.extractedNote.therapist || therapistName || "Michele T. Walty, LPC"
        };

        setNoteData(result);
        setHasExtractedData(true);
        setSuccess("Handwritten notes successfully transcribed and structured into 7 clinical fields!");
        setTimeout(() => setSuccess(""), 4000);
      } else {
        throw new Error("No extracted note returned from AI service.");
      }
    } catch (err: any) {
      console.error("Extraction error:", err);
      setError(err.message || "Failed to transcribe handwritten notes.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Capture Frame directly from live Scanner/Camera Feed
  const handleCaptureFromScanner = () => {
    if (!videoRef.current) {
      setError("Scanner camera feed is not ready.");
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement("canvas");
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) {
        setError("Failed to capture image frame from scanner feed.");
        return;
      }
      const timestamp = new Date().toLocaleTimeString().replace(/[:\s]/g, "-");
      const filename = `Direct_Scanned_Session_Note_${timestamp}.png`;
      const file = new File([blob], filename, { type: "image/png" });
      handleFileUpload(file);
    }, "image/png", 0.95);
  };

  // Process File Upload
  const handleFileUpload = (file: File) => {
    if (!file) return;
    setUploadedFileName(file.name);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Data = e.target?.result as string;
      await performExtraction({
        fileData: base64Data,
        mimeType: file.type || "image/jpeg",
        filename: file.name
      });
    };
    reader.onerror = () => {
      setError("Failed to read selected image/document file.");
    };
    reader.readAsDataURL(file);
  };

  // Handle Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Handle Text Submission
  const handleProcessText = async () => {
    if (!rawTextInput.trim()) {
      setError("Please paste or type your raw handwritten notes before extracting.");
      return;
    }
    await performExtraction({ rawText: rawTextInput.trim() });
  };

  // Load Example Note (Alex Morgan)
  const handleLoadSampleNote = () => {
    setError("");
    setUploadedFileName("Sample_Handwritten_Session_Note.jpg");
    setNoteData(SAMPLE_PATIENT_NOTE);
    setHasExtractedData(true);
    setSuccess("Loaded sample handwritten session note!");
    setTimeout(() => setSuccess(""), 4000);
  };

  // Field updates
  const updateField = (field: keyof ExtractedTherapistNote, value: string) => {
    setNoteData(prev => ({ ...prev, [field]: value }));
  };

  // Copy combined formatted note
  const handleCopyCombined = async () => {
    const text = getCombinedFormattedNote(noteData);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setSuccess("Formatted note copied to clinical clipboard!");
      setTimeout(() => {
        setCopied(false);
        setSuccess("");
      }, 3000);
    } catch (err) {
      setError("Failed to copy text to clipboard.");
    }
  };

  // Download .txt file
  const handleDownloadTxt = () => {
    const text = getCombinedFormattedNote(noteData);
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Therapist_Note_${noteData.date.replace(/[^a-zA-Z0-9]/g, "_") || "Session"}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 150);
  };

  // Save to Archives
  const handleSaveToArchive = async () => {
    const text = getCombinedFormattedNote(noteData);
    if (!text) return;
    setIsSavingArchive(true);
    try {
      const archiveTitle = `${noteData.title || "Therapist Note"} - ${noteData.date || "Session"}`;
      await onSaveArchive(archiveTitle, text, "Therapist Note (7 Fields)");
      setSuccess("Saved extracted therapist note to secure archives!");
      setTimeout(() => setSuccess(""), 4000);
    } catch (err: any) {
      setError(err.message || "Failed to save archive.");
    } finally {
      setIsSavingArchive(false);
    }
  };

  // Clear workspace
  const handleClear = () => {
    setNoteData({
      date: "",
      title: "",
      sessionLength: "",
      headerNote: "",
      topicNarrative: "",
      interventions: "",
      therapist: therapistName || "Michele T. Walty, LPC"
    });
    setHasExtractedData(false);
    setRawTextInput("");
    setUploadedFileName("");
    setError("");
    setSuccess("Cleared Therapist Notes Extractor workspace.");
    setTimeout(() => setSuccess(""), 3000);
  };

  const combinedNoteText = getCombinedFormattedNote(noteData);

  return (
    <div className="space-y-6">
      
      {/* Banner / Header */}
      <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-6 sm:p-8 shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-72 h-72 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-teal-500/20 text-teal-300 text-xs font-semibold rounded-full border border-teal-400/30">
              <Scan className="w-3.5 h-3.5" />
              <span>Handwritten OCR & SOAP Field Structuring</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight font-display text-white">
              Therapist Notes Extractor
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              Scan or upload handwritten session notes. Advanced AI transcribes your scribbles and organizes them into 7 editable clinical fields with SOAP note mapping (Subjective & Objective → Topic/Narrative; Assessment & Plan → Interventions).
            </p>
          </div>

          <button
            onClick={handleLoadSampleNote}
            className="shrink-0 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 border border-teal-400/30 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Load Sample Note</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError("")} className="text-rose-500 hover:text-rose-700 font-bold ml-2">×</button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-teal-50 border border-teal-200 text-teal-800 rounded-xl text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess("")} className="text-teal-500 hover:text-teal-700 font-bold ml-2">×</button>
        </div>
      )}

      {/* Main Grid: Left = Input / OCR Upload, Right = Extracted Form & Formatted View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Upload / Input Tools */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 font-display">
                <UploadCloud className="w-4 h-4 text-teal-600" />
                <span>1. Upload or Paste Notes</span>
              </h3>
              
              {/* Tab Selector */}
              <div className="flex bg-slate-100 p-1 rounded-lg text-xs font-semibold overflow-x-auto gap-0.5">
                <button
                  type="button"
                  onClick={() => setInputTab("scanner")}
                  className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 shrink-0 ${
                    inputTab === "scanner"
                      ? "bg-teal-700 text-white shadow-2xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Live Scanner</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInputTab("upload")}
                  className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 shrink-0 ${
                    inputTab === "upload"
                      ? "bg-white text-teal-700 shadow-2xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>File Scan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInputTab("text")}
                  className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 shrink-0 ${
                    inputTab === "text"
                      ? "bg-white text-teal-700 shadow-2xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Raw Text</span>
                </button>
              </div>
            </div>

            {/* TAB 1: Live Connected Scanner / Camera Feed */}
            {inputTab === "scanner" && (
              <div className="space-y-4">
                {cameraError && (
                  <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">{cameraError}</p>
                        <p className="mt-1 text-[11px] text-amber-700">
                          Connect a USB document scanner or camera, or switch to file upload below.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInputTab("upload")}
                      className="text-xs font-bold text-amber-900 underline"
                    >
                      Switch to File Upload
                    </button>
                  </div>
                )}

                {/* Device Selector dropdown if multiple video devices exist */}
                {videoDevices.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-slate-700 shrink-0 flex items-center gap-1">
                      <Video className="w-3.5 h-3.5 text-teal-600" />
                      <span>Scanner Device:</span>
                    </label>
                    <select
                      value={selectedDeviceId}
                      onChange={(e) => {
                        setSelectedDeviceId(e.target.value);
                        startCameraStream(e.target.value);
                      }}
                      className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-800 outline-none focus:ring-2 focus:ring-teal-500 w-full font-medium"
                    >
                      {videoDevices.map((dev, idx) => (
                        <option key={dev.deviceId || idx} value={dev.deviceId}>
                          {dev.label || `Connected Scanner / Camera #${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Live Scanner Video Feed Viewport */}
                <div className="relative bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-inner flex items-center justify-center min-h-[220px]">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-56 object-cover"
                  />

                  {/* Document Target Alignment Guide Overlay */}
                  <div className="absolute inset-3 border-2 border-dashed border-teal-400/80 rounded-lg pointer-events-none flex flex-col justify-between p-2 bg-teal-950/10">
                    <div className="flex justify-between items-center text-[10px] font-bold text-teal-200 bg-slate-950/80 px-2 py-0.5 rounded backdrop-blur-xs w-max border border-teal-500/30">
                      <span>DOC SCANNER ALIGNED</span>
                    </div>
                    <div className="text-[11px] font-semibold text-teal-200 bg-slate-950/80 px-2.5 py-1 rounded text-center backdrop-blur-xs self-center border border-teal-500/30">
                      Place handwritten note under scanner camera
                    </div>
                  </div>

                  {!isCameraActive && !cameraError && (
                    <div className="absolute inset-0 bg-slate-900/90 text-slate-300 text-xs flex flex-col items-center justify-center p-4 text-center space-y-2">
                      <RefreshCw className="w-5 h-5 text-teal-400 animate-spin" />
                      <span>Initializing connected scanner feed...</span>
                    </div>
                  )}
                </div>

                {/* Hidden canvas for image frame snapshot capture */}
                <canvas ref={canvasRef} className="hidden" />

                <button
                  type="button"
                  onClick={handleCaptureFromScanner}
                  disabled={isProcessing || !isCameraActive}
                  className="w-full py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>{isProcessing ? "Transcribing Scanned Note..." : "Capture & Scan Note Directly"}</span>
                </button>

                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    onClick={() => startCameraStream(selectedDeviceId)}
                    className="text-teal-700 hover:text-teal-900 font-semibold flex items-center gap-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reconnect Scanner</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputTab("upload")}
                    className="text-slate-500 hover:text-slate-800 underline font-medium"
                  >
                    Use File Upload Fallback
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: File / Image Scan */}
            {inputTab === "upload" && (
              <div className="space-y-4">
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[220px] ${
                    isDragging
                      ? "border-teal-500 bg-teal-50/50 scale-[1.01]"
                      : "border-slate-200 hover:border-teal-500 hover:bg-slate-50/50"
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                    accept="image/*,application/pdf,.docx,text/plain"
                    className="hidden"
                  />

                  <div className="w-12 h-12 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center mb-3 shadow-2xs">
                    <Scan className="w-6 h-6" />
                  </div>

                  <p className="text-sm font-semibold text-slate-800">
                    {uploadedFileName ? (
                      <span className="text-teal-700 font-bold truncate block max-w-xs">{uploadedFileName}</span>
                    ) : (
                      "Click to upload or drag & drop handwritten notes"
                    )}
                  </p>

                  <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    Supports handwritten photos (JPEG, PNG), scanned PDFs, Word documents (.docx), or text files.
                  </p>

                  <div className="mt-4 px-3 py-1.5 bg-teal-50 text-teal-700 rounded-lg text-xs font-semibold border border-teal-200/80 inline-flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" />
                    <span>Gemini 3.5 Multimodal OCR Active</span>
                  </div>
                </div>

                {/* Direct Scanner Quick Action */}
                <div className="p-3 bg-teal-50/80 border border-teal-200/80 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4 text-teal-700 shrink-0" />
                    <span className="text-xs font-medium text-teal-900">Have a connected USB document scanner or camera?</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInputTab("scanner")}
                    className="px-2.5 py-1 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-lg shrink-0 transition-colors shadow-2xs cursor-pointer ml-2"
                  >
                    Open Live Scanner
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-slate-500">Need a quick test?</span>
                  <button
                    type="button"
                    onClick={handleLoadSampleNote}
                    className="text-xs font-bold text-teal-700 hover:text-teal-900 underline flex items-center gap-1"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Load Sample Note
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: Raw Text Input */}
            {inputTab === "text" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Type or Paste Raw Handwritten Transcription:
                  </label>
                  <textarea
                    rows={8}
                    value={rawTextInput}
                    onChange={(e) => setRawTextInput(e.target.value)}
                    placeholder="Example: June 30, 2026 Teletherapy session 45 min. Client Alex Morgan arrived 10 min early... S: positive job update... O: daily routine... A/P: CBT review..."
                    className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
                  />
                </div>

                <button
                  type="button"
                  disabled={isProcessing || !rawTextInput.trim()}
                  onClick={handleProcessText}
                  className="w-full py-2.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Extracting 7 Structured Fields...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Transcribe & Extract 7 SOAP Fields</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Quick Explanation & SOAP Mapping Rules Box */}
          <div className="bg-teal-50/60 border border-teal-200/80 rounded-2xl p-5 text-xs text-slate-700 space-y-3">
            <div className="flex items-center gap-2 font-bold text-teal-900 text-xs">
              <Info className="w-4 h-4 text-teal-600 shrink-0" />
              <span>SOAP Note Mapping Specification</span>
            </div>
            <ul className="space-y-2 list-disc list-inside text-slate-600 pl-1">
              <li>
                <strong className="text-slate-800">Topic/Narrative:</strong> Receives all Subjective (S) & Objective (O) notes (client statements, life updates, daily activities, self-care).
              </li>
              <li>
                <strong className="text-slate-800">Interventions:</strong> Receives all Assessment (A) & Plan (P) notes (therapist CBT strategies, processed feelings, boundaries, schedule shifts).
              </li>
              <li>
                <strong className="text-slate-800">Header & Session Details:</strong> Date, Title, Session Length, Header Note, and Therapist name are automatically parsed.
              </li>
            </ul>
          </div>
        </div>

        {/* RIGHT COLUMN: Extracted Form & Formatted Output */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-800 font-display">
                  2. Extracted 7 Clinical Fields
                </h3>
              </div>

              {hasExtractedData && (
                <button
                  onClick={handleClear}
                  className="text-xs text-slate-500 hover:text-rose-600 flex items-center gap-1 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear Fields</span>
                </button>
              )}
            </div>

            {/* Loading Indicator Overlay */}
            {isProcessing && (
              <div className="p-8 text-center space-y-3 bg-teal-50/50 rounded-xl border border-teal-100">
                <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-bold text-teal-900">
                  AI Transcribing Handwritten Notes & Structuring SOAP Fields...
                </p>
                <p className="text-[11px] text-teal-700">
                  Parsing Date, Title, Session Length, Header Note, Subjective/Objective, Interventions, and Therapist Name.
                </p>
              </div>
            )}

            {!isProcessing && !hasExtractedData && (
              <div className="py-12 px-6 text-center text-slate-400 space-y-3 border-2 border-dashed border-slate-200 rounded-xl">
                <Scan className="w-10 h-10 mx-auto text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">
                  No extracted therapist notes loaded yet.
                </p>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                  Upload a scanned photo of your handwritten notes on the left or click <strong>"Load Sample Note"</strong> to test.
                </p>
              </div>
            )}

            {/* Editable Form Fields (7 Fields) */}
            {hasExtractedData && !isProcessing && (
              <div className="space-y-4">
                
                {/* Field 1, 2, 3: Date, Title, Session Length */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-teal-600" />
                      1. Date:
                    </label>
                    <input
                      type="text"
                      value={noteData.date}
                      onChange={(e) => updateField("date", e.target.value)}
                      placeholder="e.g. June 30, 2026"
                      className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:bg-white outline-none font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-teal-600" />
                      2. Title:
                    </label>
                    <input
                      type="text"
                      value={noteData.title}
                      onChange={(e) => updateField("title", e.target.value)}
                      placeholder="e.g. Individual Teletherapy Session"
                      className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:bg-white outline-none font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-teal-600" />
                      3. Session Length:
                    </label>
                    <input
                      type="text"
                      value={noteData.sessionLength}
                      onChange={(e) => updateField("sessionLength", e.target.value)}
                      placeholder="e.g. 30 min"
                      className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:bg-white outline-none font-medium"
                    />
                  </div>
                </div>

                {/* Field 4: Header Note */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Stethoscope className="w-3 h-3 text-teal-600" />
                    4. Header Note:
                  </label>
                  <textarea
                    rows={2}
                    value={noteData.headerNote}
                    onChange={(e) => updateField("headerNote", e.target.value)}
                    placeholder="e.g. Client arrived 10 minutes early and was engaged in the session."
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:bg-white outline-none font-normal leading-relaxed"
                  />
                </div>

                {/* Field 5: Topic/Narrative (SOAP: S & O) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                      <FileText className="w-3 h-3 text-teal-600" />
                      5. Topic/Narrative:
                    </label>
                    <span className="text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 bg-teal-100 text-teal-800 rounded">
                      SOAP: Subjective & Objective (S & O)
                    </span>
                  </div>
                  <textarea
                    rows={5}
                    value={noteData.topicNarrative}
                    onChange={(e) => updateField("topicNarrative", e.target.value)}
                    placeholder="Subjective client statements, objective life updates, goal tracking, self-care, etc."
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:bg-white outline-none font-normal leading-relaxed"
                  />
                </div>

                {/* Field 6: Interventions (SOAP: A & P) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-indigo-600" />
                      6. Interventions:
                    </label>
                    <span className="text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded">
                      SOAP: Assessment & Plan (A & P)
                    </span>
                  </div>
                  <textarea
                    rows={5}
                    value={noteData.interventions}
                    onChange={(e) => updateField("interventions", e.target.value)}
                    placeholder="Therapist CBT interventions, processed feelings, setting boundaries, schedule shifts, etc."
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:bg-white outline-none font-normal leading-relaxed"
                  />
                </div>

                {/* Field 7: Therapist */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <User className="w-3 h-3 text-teal-600" />
                    7. Therapist:
                  </label>
                  <input
                    type="text"
                    value={noteData.therapist}
                    onChange={(e) => updateField("therapist", e.target.value)}
                    placeholder="e.g. Michele T. Walty, LPC"
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:bg-white outline-none font-semibold text-slate-800"
                  />
                </div>

                {/* COMBINED FORMATTED OUTPUT BOX */}
                <div className="mt-6 pt-4 border-t border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5 font-display">
                      <CheckCircle2 className="w-4 h-4 text-teal-600" />
                      Combined Formatted Clinical String
                    </span>
                    <button
                      onClick={handleCopyCombined}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md transition-colors flex items-center gap-1"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? "Copied!" : "Copy Text"}</span>
                    </button>
                  </div>

                  <div className="p-3.5 bg-slate-900 text-slate-100 text-xs font-mono rounded-xl leading-relaxed select-all max-h-56 overflow-y-auto border border-slate-800 whitespace-pre-wrap">
                    {combinedNoteText || "Fill or extract fields above to preview formatted note..."}
                  </div>
                </div>

                {/* ACTION BUTTONS BAR */}
                <div className="pt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyCombined}
                      className="px-3 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-bold rounded-xl border border-teal-200 transition-colors flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Note</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveToArchive}
                      disabled={isSavingArchive}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl border border-slate-300 transition-colors flex items-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSavingArchive ? "Saving..." : "Save to Archive"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadTxt}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl border border-slate-300 transition-colors flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download .txt</span>
                    </button>
                  </div>

                  {/* Send to Clinical Summary Notes Generator */}
                  <button
                    type="button"
                    onClick={() => onSendToSummaryGenerator(combinedNoteText, noteData.headerNote.includes("Alex") ? "Alex Morgan" : undefined)}
                    className="px-4 py-2.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer ml-auto"
                  >
                    <span>Send to Clinical Summary Generator</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

              </div>
            )}

          </div>
        </div>

      </div>

    </div>
  );
}
