import test from "node:test";
import assert from "node:assert";
import { sanitizeClinicalOutput, toFormalClientTitleAndLastName } from "../src/lib/clinicalSanitizer.js";

test("therapist mandate: converts single quotes around quotes to double quotes while preserving contractions", () => {
  const input = "Mr. Smith stated, 'I feel overwhelmed at work.' He couldn't sleep and won't go to meetings.";
  const cleaned = sanitizeClinicalOutput(input, "John Smith");
  assert.strictEqual(cleaned, 'Mr. Smith stated, "I feel overwhelmed at work." He couldn\'t sleep and won\'t go to meetings.');
});

test("therapist mandate: converts 'the client' and 'client' to formal title and last name", () => {
  const input = "The client presented for teletherapy. Client reported feeling anxious. The client's symptoms improved.";
  const cleaned = sanitizeClinicalOutput(input, "Alex Morgan");
  assert.strictEqual(cleaned, "Mr. Morgan presented for teletherapy. Mr. Morgan reported feeling anxious. Mr. Morgan's symptoms improved.");
});

test("therapist mandate: strips all curly braces {} and square brackets []", () => {
  const input = "S: {Alex Morgan} presented with [anxiety]. Objective: {Mr. Morgan} was cooperative.";
  const cleaned = sanitizeClinicalOutput(input, "Alex Morgan");
  assert.strictEqual(cleaned, "S: Mr. Morgan presented with anxiety. Objective: Mr. Morgan was cooperative.");
});

test("therapist mandate: computes formal client title and last name correctly", () => {
  assert.strictEqual(toFormalClientTitleAndLastName("Alex Morgan"), "Mr. Morgan");
  assert.strictEqual(toFormalClientTitleAndLastName("Sarah Davis"), "Ms. Davis");
  assert.strictEqual(toFormalClientTitleAndLastName("Chavez, Ricardo"), "Mr. Chavez");
  assert.strictEqual(toFormalClientTitleAndLastName("Ms. Jane Doe"), "Ms. Jane Doe");
});
