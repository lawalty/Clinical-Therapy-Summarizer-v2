# ClinicianFlow AI - Secure Psychotherapy Session Synthesizer

ClinicianFlow AI is a high-security, client-side encrypted psychotherapy session summarization assistant designed for licensed professional clinical therapists and counselors. It integrates a secure browser-based AES-GCM 256 encryption engine with high-reasoning Gemini models (utilizing Google AI Studio) to deliver clinician-designed session summaries in formats like SOAP, DAP, BIRP, and GIRP.

---

## 🔒 Key Security & Privacy Safeguards

- **Client-Side Encrypted Storage**: All sensitive patient data, session summaries, and clinician archives are encrypted directly in the clinician's browser via the Web Crypto API using AES-GCM 256 prior to being stored in the database.
- **Fail-Closed Passcode Sentinels**: Master passcode verification checks are carried out securely on every login via a salted, high-iteration (600,000 PBKDF2 iterations) cryptographic sentinel, with instant fall-closed safeguards on transient network failures.
- **Backwards Compatibility**: Cryptographic payload versioning dynamically falls back to 100,000 PBKDF2 iterations for legacy records while seamlessly securing new clinical documents at 600,000 iterations.
- **Server-Side Firebase Verification**: Authentic and verified user identity validation prevents token-rotation and sandbox auth bypasses, and rate limits heavy requests per clinical IP and account.
- **Secure Fallback Local Database**: Scoped, isolated patient storage ensures clinicians can access their encrypted logs only, with active protection against flat array leaks.
- **Inactivity Workstation Lock**: A 15-minute keydown/mousemove inactivity timer automatically locks the clinical workspace to prevent unauthorized physical access.

---

## 🛠️ Tech Stack & Framework Integration

- **Frontend**: React 18, Tailwind CSS, Lucide icons, Motion (AnimatePresence & layout transitions).
- **Backend / API proxy**: Node.js Express server with Vite middle-tier asset pipeline.
- **OCR Parser**: Mammoth (.docx extractor) & multi-modal Gemini-based transcription.
- **Security Tools**: Helmet (with conditional production CSP), express-rate-limit, Web Crypto API.

---

## 🚀 Setup & Run Instructions

### 1. Configure Environment Variables
Copy `.env.example` to create `.env`:
```bash
cp .env.example .env
```
Fill in your `GEMINI_API_KEY` and relevant Firebase configurations.

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Development Server
```bash
npm run dev
```

### 4. Build & Start in Production
```bash
npm run build
npm start
```
