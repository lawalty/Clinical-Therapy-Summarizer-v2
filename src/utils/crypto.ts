/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Web Crypto API helpers for clinical-grade client-side encryption (AES-GCM 256)
// This ensures that sensitive clinical session data remains strictly confidential (Zero-Knowledge).

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Helper to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper to convert Base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Derive a cryptographic key from a passcode using PBKDF2 (raised to 600,000 iterations for OWASP/HIPAA alignment)
async function deriveKey(passcode: string, salt: Uint8Array, iterations: number = 600000): Promise<CryptoKey> {
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(passcode),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations, // Supports variable iterations for backwards compatibility with v1 data (100k)
      hash: "SHA-256",
    },
    baseKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts cleartext with a passcode.
 * Returns a JSON-stringified object containing the ciphertext, salt, and iv in Base64.
 */
export async function encryptText(cleartext: string, passcode: string): Promise<string> {
  if (!cleartext) return "";
  try {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const iterations = 600000;
    const key = await deriveKey(passcode, salt, iterations);

    const ciphertextBuffer = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      encoder.encode(cleartext)
    );

    const payload = {
      ciphertext: arrayBufferToBase64(ciphertextBuffer),
      salt: arrayBufferToBase64(salt.buffer),
      iv: arrayBufferToBase64(iv.buffer),
      iterations,
    };

    return JSON.stringify(payload);
  } catch (error) {
    console.error("Encryption failed:", error);
    throw new Error("Client-side encryption failed. Please verify passcode integrity.");
  }
}

/**
 * Decrypts a JSON-stringified encryption payload back to cleartext.
 */
export async function decryptText(encryptedPayload: string, passcode: string): Promise<string> {
  if (!encryptedPayload) return "";
  
  let isEncryptedFormat = false;
  let payload: any = null;
  try {
    payload = JSON.parse(encryptedPayload);
    if (payload && typeof payload === "object" && payload.ciphertext && payload.salt && payload.iv) {
      isEncryptedFormat = true;
    }
  } catch (e) {
    // Parsing failed, must be raw plain text
  }

  if (!isEncryptedFormat) {
    // Deliver the raw text but clearly designate it as unencrypted
    return `[STORED UNENCRYPTED] ${encryptedPayload}`;
  }

  try {
    const ciphertext = base64ToArrayBuffer(payload.ciphertext);
    const salt = new Uint8Array(base64ToArrayBuffer(payload.salt));
    const iv = new Uint8Array(base64ToArrayBuffer(payload.iv));
    const iterations = payload.iterations ?? 100000; // Fallback to 100,000 for v1-encrypted records

    const key = await deriveKey(passcode, salt, iterations);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      ciphertext
    );

    return decoder.decode(decryptedBuffer);
  } catch (error) {
    console.error("Decryption failed:", error);
    throw new Error("Decryption failed. Please ensure your secret Master Passcode is correct.");
  }
}
