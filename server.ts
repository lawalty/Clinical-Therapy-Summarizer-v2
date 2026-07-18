import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import dotenv from "dotenv";
// @ts-ignore
import mammoth from "mammoth";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Enable trusting proxy headers for accurate client IP identification (Finding E)
app.set("trust proxy", 1);

// Configure Helmet security headers with real production CSP and dev flexibility (Finding F)
if (process.env.NODE_ENV === "production") {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://apis.google.com", "https://*.googleapis.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://*.googleusercontent.com"],
        connectSrc: ["'self'", "https://*.googleapis.com", "https://*.firebaseapp.com"],
        frameAncestors: ["'self'", "https://ai.studio", "https://*.google.com"],
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  }));
} else {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  }));
}

// Body parser with 15mb limit to restrict oversized payloads
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));

// Safely initialize Firebase Admin
let firebaseAdminInitialized = false;
try {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  if (projectId) {
    initializeApp({
      projectId: projectId
    });
    firebaseAdminInitialized = true;
    console.log(`[AUTH] Firebase Admin initialized successfully for project: ${projectId}`);
  } else {
    console.warn("[AUTH] No Firebase project ID specified. Operating in clinical local sandbox auth mode.");
  }
} catch (err) {
  console.error("[AUTH] Firebase Admin initialization failed:", err);
}

// Authentication Middleware (Finding A)
const authenticateUser = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization token is missing or invalid" });
  }

  const token = authHeader.split("Bearer ")[1];
  
  // Restrict sandbox token to the specific known client-side sandbox identifier
  // and only accept it in local development/sandbox mode when Firebase Admin is not initialized
  if (token === "sandbox-therapist-101") {
    if (!firebaseAdminInitialized) {
      req.user = { uid: token, email: "sandbox@example.com" };
      return next();
    } else {
      return res.status(401).json({ error: "Sandbox access is disabled on this production environment" });
    }
  }

  if (!firebaseAdminInitialized) {
    return res.status(401).json({ error: "Authentication service unconfigured on server and token format unrecognized" });
  }

  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (err: any) {
    console.error("[AUTH] Token verification error:", err.message);
    return res.status(401).json({ error: `Authentication failed: ${err.message}` });
  }
};

// Rate limiting on expensive endpoints (extract & summarize)
const expensiveApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each clinician session to 50 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req: any) => {
    // If the authenticated identity is the sandbox therapist, rate limit by IP to prevent token rotation abuse
    if (req.user?.uid === "sandbox-therapist-101") {
      return req.ip || "sandbox-ip";
    }
    return req.user?.uid || req.ip || "unknown-ip";
  },
  message: { error: "Too many clinical synthesis requests. Please try again in 15 minutes." }
});

// Initialize Gemini client safely
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Please set it in the Secrets panel.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

// Formats API errors cleanly to make them friendly and actionable for the user
const formatGeminiError = (error: any, defaultMessage: string): string => {
  const status = error.status || error.code || error.statusCode;
  const errMsg = error.message || defaultMessage;
  const errStr = errMsg.toLowerCase();
  
  if (status === 403 || errStr.includes("api_key_invalid") || errStr.includes("api key is invalid") || errStr.includes("suspended")) {
    return "Your Gemini API Key has been suspended or is invalid. Please check your billing details, payment status, or key configuration in the AI Studio Settings menu.";
  }
  if (status === 429 || errStr.includes("resource_exhausted") || errStr.includes("quota exceeded") || errStr.includes("rate limit")) {
    return "The rate limit or daily quota for your Gemini API key has been exceeded. Please check your usage metrics or upgrade your plan in the Google AI Studio console.";
  }
  return errMsg;
};

// Local storage paths for private fallback database
const DATA_DIR = path.join(process.cwd(), "data");
const ARCHIVES_FILE = path.join(DATA_DIR, "archives.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(ARCHIVES_FILE)) {
  fs.writeFileSync(ARCHIVES_FILE, JSON.stringify({}));
}
if (!fs.existsSync(SETTINGS_FILE)) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({}));
}

// ------------------- API ROUTES -------------------

// 1. Text extraction from files (images, PDFs, documents)
app.post("/api/extract", authenticateUser, expensiveApiLimiter, async (req, res) => {
  try {
    const { fileData, mimeType, filename } = req.body;
    if (!fileData || !mimeType) {
      return res.status(400).json({ error: "Missing file data or mimeType" });
    }

    const ALLOWED_MIME_TYPES = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];

    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return res.status(400).json({ error: "Unsupported file type. Allowed formats: PDF, PNG, JPEG, TXT, DOCX" });
    }

    // Strip header if present in base64 string
    const base64Data = fileData.replace(/^data:.*?;base64,/, "");

    // Handle Word documents (.docx) using mammoth
    const isDocx = mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
                    filename?.toLowerCase().endsWith(".docx");

    if (isDocx) {
      try {
        const buffer = Buffer.from(base64Data, "base64");
        const result = await mammoth.extractRawText({ buffer });
        return res.json({ text: result.value || "" });
      } catch (err: any) {
        console.error("Mammoth word extraction error:", err);
        return res.status(500).json({ error: `Failed to parse Word document: ${err.message}` });
      }
    }

    const ai = getGeminiClient();
    
    const filePart = {
      inlineData: {
        data: base64Data,
        mimeType: mimeType,
      },
    };

    const textPart = {
      text: `You are an expert clinical OCR and transcription assistant. Your job is to extract all readable text, titles, structured tables, checkboxes, handwritten notes, and annotations from this file (${filename || "document"}) with perfect accuracy.
      
Rules:
1. Extract ALL text verbatim. Do not summarize, paraphrase, or omit any patient details, scores, dates, or clinical notes.
2. Maintain the layout, list structure, spacing, and tables as closely as possible using text/markdown.
3. If parts are handwritten, transcribe them with high accuracy. If some handwritten words are completely illegible, use "[illegible]" to denote them.
4. Output ONLY the extracted text. Do not write any conversational preamble or introduction.`,
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [filePart, textPart],
    });

    res.json({ text: response.text || "" });
  } catch (error: any) {
    console.error("Extraction error:", error);
    const friendlyError = formatGeminiError(error, "Failed to extract text from file");
    res.status(500).json({ error: friendlyError });
  }
});

// 2. High-Thinking Psychotherapy Summary Generator
app.post("/api/summarize", authenticateUser, expensiveApiLimiter, async (req, res) => {
  try {
    const {
      extractedText,
      framework,
      styleInstructions,
      length = "medium",
      quantity = 2,
      tone = "clinical",
      includeInsights = true,
      focusAreas = [],
      hideSubtitles = false,
      patientName,
    } = req.body;

    if (!extractedText) {
      return res.status(400).json({ error: "No text provided for summarization" });
    }

    const ai = getGeminiClient();

    // Humanized patient reference instruction
    const humanizedDirective = patientName && patientName.trim()
      ? `7. HUMANIZED CLIENT REFERENCE (CRITICAL): To establish a humanized clinical connection, refer to the client/patient directly as "${patientName.trim()}" throughout the generated progress note and insights sections (e.g. use "S: ${patientName.trim()} stated...", "O: ${patientName.trim()} presented with...", etc.). Do NOT refer to them using cold or generic placeholders like "the client", "the patient", "Client", or "Patient". Refer to them by name or appropriate third-person pronouns (e.g. he/she/they) as grammatically suited.`
      : `7. Maintain professional documentation standards: Refer to the client/patient respectfully using third-person phrasing (e.g. "the client", "the patient").`;

    // Construct framework descriptions and system prompt
    let frameworkPrompt = "";
    if (framework === "SOAP") {
      frameworkPrompt = hideSubtitles
        ? `Format the output according to the SOAP framework (Subjective, Objective, Assessment, Plan). Do NOT write the titles/labels (e.g., "S (Subjective):") themselves. Just generate the raw paragraph content for each category in order, separated by blank lines.`
        : `Format the output strictly according to the SOAP framework. Use plain headers with no asterisks or markdown format:
S (Subjective): Patient's reported symptoms, emotions, life updates, quotes, and subjective complaints.
O (Objective): Clinical observations, appearance, affect, motor activity, speech, orientation, and mental status exam details.
A (Assessment): Clinical analysis, interpretation, progress, diagnostic insights, and working hypotheses.
P (Plan): Future treatment targets, interventions, homework assigned, referrals, and next session details.`;
    } else if (framework === "DAP") {
      frameworkPrompt = hideSubtitles
        ? `Format the output according to the DAP framework (Data, Assessment, Plan). Do NOT write the titles/labels (e.g., "D (Data):") themselves. Just generate the raw paragraph content for each category in order, separated by blank lines.`
        : `Format the output strictly according to the DAP framework. Use plain headers with no asterisks or markdown format:
D (Data): Objective and subjective observations of the session, what took place, reported symptoms, behaviors, and therapist interventions.
A (Assessment): Clinical interpretation of findings, mental status, progress, and therapeutic analysis.
P (Plan): Follow-up actions, target goals, homework, and session schedule.`;
    } else if (framework === "BIRP") {
      frameworkPrompt = hideSubtitles
        ? `Format the output according to the BIRP framework (Behavior, Intervention, Response, Plan). Do NOT write the titles/labels (e.g., "B (Behavior):") themselves. Just generate the raw paragraph content for each category in order, separated by blank lines.`
        : `Format the output strictly according to the BIRP framework. Use plain headers with no asterisks or markdown format:
B (Behavior): Client's presenting mood, behavior, and reported symptoms.
I (Intervention): Therapist's actions, methods, and modalities utilized during the session.
R (Response): Client's direct response, engagement, and reception of the therapist's interventions.
P (Plan): Next therapeutic steps, interventions, and scheduled follow-ups.`;
    } else if (framework === "GIRP") {
      frameworkPrompt = hideSubtitles
        ? `Format the output according to the GIRP framework (Goal, Intervention, Response, Plan). Do NOT write the titles/labels (e.g., "G (Goal):") themselves. Just generate the raw paragraph content for each category in order, separated by blank lines.`
        : `Format the output strictly according to the GIRP framework. Use plain headers with no asterisks or markdown format:
G (Goal): The treatment goals addressed or focused on during the session.
I (Intervention): Specific clinical actions, strategies, and techniques deployed by the therapist.
R (Response): The patient's response, cognitive processing, behavioral shifts, and feedback.
P (Plan): Continuation of treatment, modifications, or future intervention plan.`;
    } else {
      frameworkPrompt = hideSubtitles
        ? `Format the output as a professional Clinical Session Summary covering Session Overview, Therapeutic Interventions, Patient Progress, and Next Steps. Do NOT write any section titles/labels themselves. Just generate the raw paragraphs in order, separated by blank lines.`
        : `Format the output as a professional Clinical Session Summary with clear sections covering Session Overview, Therapeutic Interventions, Patient Progress, and Next Steps. Use plain text headers with no asterisks or markdown format.`;
    }

    const focusAreasStr = focusAreas.length > 0 
      ? `Ensure you pay close attention and dedicate comprehensive coverage to: ${focusAreas.join(", ")}.` 
      : "";

    const subtitlesConstraint = hideSubtitles
      ? "6. REMOVE ALL FRAMEWORK SUB-TITLES/LABELS: You must NOT write any category prefix labels, section titles, headers, or sub-titles (e.g., do NOT write 'S (Subjective):', 'O (Objective):', 'D (Data):', 'A (Assessment):', 'P (Plan):', 'B (Behavior):', 'I (Intervention):', 'R (Response):', or 'G (Goal):'). Just output the structured paragraphs in order, separated by clean blank lines. This is a critical requirement from the therapist for copy-paste compatibility."
      : "6. Include plain category prefix labels/sub-titles at the start of each section matching the selected framework (e.g. S (Subjective):, O (Objective):, etc.). Do not use any asterisks or markdown format for these headers.";

    const systemInstruction = `You are a licensed professional clinical therapist and expert clinical documenter. 
Your task is to synthesize the provided session notes, files, or transcript into a top-tier, compliant, professional psychotherapy progress note.

Strict Clinical Guidelines:
1. Maintain professional, formal, objective language. Avoid emotional descriptions of your own; instead, describe therapist interventions objectively.
2. Maintain high-level privacy: focus purely on clinical progress.
3. Tone of the output: ${tone} (e.g., clinical, academic, collaborative).
4. Desired length: ${length} (strictly adhere to generating approximately ${quantity} paragraphs or equivalent sub-sections per category).
5. ABSOLUTE CONSTRAINT: Do NOT use ANY markdown formatting in your response. Do not use double asterisks (**), single asterisks (*), markdown headers (#, ##, etc.), markdown lists, bolding, italics, or any other markdown syntax. All headers or section titles must be plain text capital letters followed by a colon or a simple line break (for example, use "S (Subjective):" or "O (Objective):" instead of "**S (Subjective)**:" or "**O (Objective)**:"). Ensure the entire text is clean, pure text ready for direct copying and pasting into standard text areas without any syntax clutter.

${humanizedDirective}

${subtitlesConstraint}

${frameworkPrompt}

${focusAreasStr}

Additional Custom Style Instructions (System Prompts):
"""
${styleInstructions || "No custom instructions provided. Maintain general professional clinical standards."}
"""

${includeInsights ? `Include an additional section at the very end called ${hideSubtitles ? "unlabelled and separated by a blank line" : "'Clinical Insights and Therapeutic Hypotheses'"} containing deep clinical reasoning, psychological themes, potential barriers to progress, and recommendations. This section should also use no markdown or asterisks.` : ""}`;

    // Prompt for the model
    const userPrompt = `Here is the raw extracted text, forms, or session notes to summarize:
------------------------------------------
${extractedText}
------------------------------------------

Generate the highly secure, pristine session summary note below following your clinical system instructions:`;

    let response;
    let fallbackUsed = false;
    try {
      response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: userPrompt,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
          },
        },
      });
    } catch (err: any) {
      const status = err.status || err.code || err.statusCode;
      const errStr = (err.message || "").toLowerCase();
      const isQuotaOrAuthError = 
        status === 429 ||
        errStr.includes("resource_exhausted") ||
        errStr.includes("quota exceeded") ||
        errStr.includes("rate limit") ||
        errStr.includes("billing not enabled");
        
      if (isQuotaOrAuthError) {
        console.warn("Pro model quota exceeded or billing not enabled. Falling back to gemini-3.5-flash...");
        response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: userPrompt,
          config: {
            systemInstruction,
          },
        });
        fallbackUsed = true;
      } else {
        throw err;
      }
    }

    res.json({ 
      summary: response.text || "",
      fallbackUsed
    });
  } catch (error: any) {
    console.error("Summarization error:", error);
    const friendlyError = formatGeminiError(error, "Failed to generate summary with high reasoning model");
    res.status(500).json({ error: friendlyError });
  }
});

// 3. Fallback Local Storage APIs (CRUD - scoped by verified uid)
app.get("/api/archives", authenticateUser, (req: any, res) => {
  try {
    const uid = req.user.uid;
    const data = fs.readFileSync(ARCHIVES_FILE, "utf-8");
    const db = JSON.parse(data);
    
    let userArchives = [];
    if (Array.isArray(db)) {
      // Discard global legacy array to prevent data leak (Finding D) and rewrite immediately
      userArchives = [];
      fs.writeFileSync(ARCHIVES_FILE, JSON.stringify({}));
    } else {
      userArchives = db[uid] || [];
    }
    res.json(userArchives);
  } catch (error) {
    res.status(500).json({ error: "Failed to read archives" });
  }
});

app.post("/api/archives", authenticateUser, (req: any, res) => {
  try {
    const uid = req.user.uid;
    const { id, name, date, framework, encryptedContent, encryptedNotes } = req.body;
    if (!id || !name) {
      return res.status(400).json({ error: "Missing archive details" });
    }

    const currentData = JSON.parse(fs.readFileSync(ARCHIVES_FILE, "utf-8"));
    let db: Record<string, any[]> = {};
    if (Array.isArray(currentData)) {
      // Discard legacy structure and rewrite immediately to protect data privacy
      db = {};
      fs.writeFileSync(ARCHIVES_FILE, JSON.stringify({}));
    } else {
      db = currentData;
    }

    const userArchives = db[uid] || [];
    const newArchive = { id, name, date, framework, encryptedContent, encryptedNotes };
    
    // Check if updating
    const existingIndex = userArchives.findIndex((item: any) => item.id === id);
    if (existingIndex >= 0) {
      userArchives[existingIndex] = newArchive;
    } else {
      userArchives.unshift(newArchive);
    }

    db[uid] = userArchives;
    fs.writeFileSync(ARCHIVES_FILE, JSON.stringify(db, null, 2));
    res.json({ success: true, archive: newArchive });
  } catch (error) {
    res.status(500).json({ error: "Failed to save archive" });
  }
});

app.delete("/api/archives/:id", authenticateUser, (req: any, res) => {
  try {
    const uid = req.user.uid;
    const { id } = req.params;
    const currentData = JSON.parse(fs.readFileSync(ARCHIVES_FILE, "utf-8"));
    
    let db: Record<string, any[]> = {};
    if (Array.isArray(currentData)) {
      db = {};
      fs.writeFileSync(ARCHIVES_FILE, JSON.stringify({}));
    } else {
      db = currentData;
      if (db[uid]) {
        db[uid] = db[uid].filter((item: any) => item.id !== id);
      }
    }
    
    fs.writeFileSync(ARCHIVES_FILE, JSON.stringify(db, null, 2));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete archive" });
  }
});

// 4. Therapist Settings APIs (per-therapist custom directives persistence - scoped by verified uid)
app.get("/api/settings", authenticateUser, (req: any, res) => {
  try {
    const uid = req.user.uid;
    const currentSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    const therapistSettings = currentSettings[uid] || null;
    res.json(therapistSettings);
  } catch (error) {
    res.status(500).json({ error: "Failed to read settings" });
  }
});

app.post("/api/settings", authenticateUser, (req: any, res) => {
  try {
    const uid = req.user.uid;
    const { styleInstructions, activeTemplateName, customTemplates, therapistName, therapistTitle, encryptedSentinel } = req.body;
    const currentSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    
    currentSettings[uid] = { 
      styleInstructions, 
      activeTemplateName, 
      customTemplates, 
      therapistName, 
      therapistTitle,
      encryptedSentinel
    };
    
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2));
    res.json({ success: true, settings: currentSettings[uid] });
  } catch (error) {
    res.status(500).json({ error: "Failed to save settings" });
  }
});

// ------------------- VITE ASSET SERVING -------------------

const startServer = async () => {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
