import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const firebaseClientPath = new URL("../src/lib/firebase.ts", import.meta.url);
const lockScreenPath = new URL("../src/components/LockScreen.tsx", import.meta.url);
const serverPath = new URL("../server.ts", import.meta.url);

test("email authentication and recovery use Firebase Authentication", async () => {
  const source = await readFile(firebaseClientPath, "utf8");

  assert.match(source, /signInWithEmailAndPassword\(/);
  assert.match(source, /createUserWithEmailAndPassword\(/);
  assert.match(source, /sendPasswordResetEmail\(/);
  assert.match(source, /\/api\/auth\/password-reset\/prepare/);
  assert.doesNotMatch(source, /fetch\("\/api\/auth\/login"/);
  assert.doesNotMatch(source, /fetch\("\/api\/auth\/register"/);
});

test("legacy account bridge preserves the existing UID and removes plaintext passwords", async () => {
  const source = await readFile(serverPath, "utf8");

  assert.match(source, /uid: legacyUid/);
  assert.match(source, /password: FieldValue\.delete\(\)/);
  assert.match(source, /\/api\/auth\/profile/);
  assert.match(source, /status\(410\)/);
  assert.doesNotMatch(source, /startsWith\("local-"\)/);
  assert.doesNotMatch(source, /password:\s*password\b/);
});

test("recovery UI distinguishes account reset from clinical vault recovery", async () => {
  const source = await readFile(lockScreenPath, "utf8");

  assert.match(source, /Forgot password\?/);
  assert.match(source, /Send password reset email/);
  assert.match(source, /Account recovered; vault still locked/);
  assert.match(source, /Existing clinical archives will not be deleted/);
  assert.match(source, /No administrator or AI can recover that encryption key/);
});
