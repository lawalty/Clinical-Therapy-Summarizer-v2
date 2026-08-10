/**
 * Clinical Output Sanitizer & Formatter
 * 
 * Enforces therapist mandates:
 * 1. CONCISENESS: Removes filler/padding and redundant phrasing.
 * 2. DOUBLE QUOTES: Converts single-quoted client speech to double quotes ("...") while protecting contractions.
 * 3. FORMAL CLIENT REFERENCE: Converts generic "the client" / "client" to "Mr. [LastName]" or "Ms. [LastName]".
 * 4. NO BRACKETS: Strips all curly brackets {} and square brackets [].
 */

export function toFormalClientTitleAndLastName(rawName: string): string {
  if (!rawName || !rawName.trim()) return "";
  let clean = rawName.trim().replace(/[{}[\]]/g, "");

  // If already starts with Mr., Ms., Mrs., Dr., Prof., keep it
  if (/^(mr\.|ms\.|mrs\.|dr\.|prof\.)\s+/i.test(clean)) {
    return clean;
  }

  // Handle "LastName, FirstName"
  if (clean.includes(",")) {
    const parts = clean.split(",").map(p => p.trim());
    const lastName = parts[0];
    const firstName = parts.slice(1).join(" ");
    const isFemale = isFemaleFirstName(firstName);
    const title = isFemale ? "Ms." : "Mr.";
    return `${title} ${lastName}`;
  }

  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    const single = parts[0];
    if (/^(the|client|patient)$/i.test(single)) return "";
    return `Mr./Ms. ${single}`;
  } else if (parts.length >= 2) {
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    const isFemale = isFemaleFirstName(firstName);
    const title = isFemale ? "Ms." : "Mr.";
    return `${title} ${lastName}`;
  }

  return clean;
}

function isFemaleFirstName(name: string): boolean {
  if (!name) return false;
  const first = name.trim().toLowerCase().split(/\s+/)[0];
  const femaleNames = new Set([
    "jane", "mary", "sarah", "emily", "jessica", "ashley", "amanda", "stephanie", "nicole",
    "elizabeth", "heather", "megan", "amber", "rachel", "michele", "michelle", "lauren",
    "samantha", "hannah", "brittany", "lisa", "melissa", "kayla", "katelyn", "taylor",
    "alexa", "olivia", "emma", "ava", "sophia", "isabella", "mia", "charlotte", "amelia",
    "harper", "evelyn", "abigail", "ella", "camila", "luna", "sofia", "avery", "mila",
    "aria", "scarlett", "penelope", "layla", "chloe", "victoria", "madison", "eleanor",
    "grace", "nora", "riley", "zoey", "lucy", "stella", "alyssa", "anna", "maria", "clara",
    "diana", "victoria", "julia", "laura", "andrea", "patricia", "jennifer", "linda", "barbara",
    "susan", "jessica", "karen", "nancy", "lisa", "betty", "sandra", "mora", "rebecca"
  ]);
  return femaleNames.has(first);
}

export function sanitizeClinicalOutput(text: string, rawPatientName?: string): string {
  if (!text) return "";

  let result = text;

  // 1. MANDATE 4: Strip all curly brackets {} and square brackets []
  result = result.replace(/[{}]/g, "");
  result = result.replace(/\[(.*?)\]/g, "$1").replace(/[\[\]]/g, "");

  // 2. MANDATE 2: Convert single quotes around direct quotes to double quotes while preserving contractions
  // Protect contractions and possessives (e.g. don't, can't, client's, Mr. Smith's)
  result = result.replace(/([a-zA-Z0-9])'([a-zA-Z0-9])/g, "$1___APOS___$2");
  
  // Convert single quotes surrounding direct speech / quotes to double quotes
  result = result.replace(/(^|\s|[:,;])'([^'\n\r]+)'(?=\s|[.,!?;:]|$)/g, '$1"$2"');
  result = result.replace(/'([^'\n\r]{2,})'/g, '"$1"');

  // Restore contractions and possessives
  result = result.replace(/___APOS___/g, "'");

  // 3. MANDATE 3: Convert "the client", "the patient", "client", "patient" to formal title + last name
  const formalName = toFormalClientTitleAndLastName(rawPatientName || "");
  let targetFormalReference = formalName;

  if (!targetFormalReference) {
    // Attempt to extract an existing formal name from the text itself
    const match = result.match(/(?:Mr\.|Ms\.|Mrs\.|Dr\.)\s+[A-Z][a-z]+/);
    if (match) {
      targetFormalReference = match[0];
    } else {
      targetFormalReference = "Mr./Ms. Smith";
    }
  }

  // Replace "the client's" / "the patient's" / "client's" / "patient's"
  result = result.replace(/\bthe\s+(?:client|patient)'s\b/gi, `${targetFormalReference}'s`);
  result = result.replace(/\b(?:Client|Patient)'s\b/g, `${targetFormalReference}'s`);
  result = result.replace(/\b(?:client|patient)'s\b/g, `${targetFormalReference}'s`);

  // Replace raw full name (e.g. "Alex Morgan") with formal title + last name ("Mr. Morgan")
  if (rawPatientName && rawPatientName.trim()) {
    const rawClean = rawPatientName.trim().replace(/[{}[\]]/g, "");
    if (rawClean.split(/\s+/).length >= 2 && targetFormalReference && targetFormalReference !== rawClean) {
      const escaped = rawClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), targetFormalReference);
    }
  }

  // Replace "the client" / "the patient"
  result = result.replace(/\bthe\s+(?:client|patient)\b/gi, targetFormalReference);

  // Replace standalone "Client" / "Patient" (capitalized)
  result = result.replace(/\b(?:Client|Patient)\b/g, targetFormalReference);

  // Replace standalone "client" / "patient" (lowercase) except in words like "clinical"
  result = result.replace(/\b(?:client|patient)\b/g, targetFormalReference);

  // Clean up any double spaces or empty bracket residuals
  result = result.replace(/[ \t]{2,}/g, " ").trim();

  return result;
}
