/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ClinicalTemplate {
  name: string;
  description: string;
  instructions: string;
}

export const CLINICAL_TEMPLATES: ClinicalTemplate[] = [
  {
    name: "General Clinical High-Compliance",
    description: "Standard formal clinical documentation conforming to legal and insurance requirements.",
    instructions: `Write with objective, third-person terminology. Use clinical action verbs (e.g., "reported," "expressed," "described," "evidenced").
Do not use informal phrasing. Quantify observations where possible (e.g., "gaze maintained 80% of session").
Distinguish clearly between patient's self-report and therapist's clinical assessment.
Ensure safety is explicitly stated. Refer to the client using their formal title and last name (e.g., "Mr. Smith" or "Ms. Davis").`
  },
  {
    name: "CBT (Cognitive Behavioral)",
    description: "Focuses on identifying cognitive distortions, automatic thoughts, core beliefs, and homework.",
    instructions: `Focus documentation on cognitive distortions (e.g., catastrophizing, all-or-nothing thinking) identified during the session.
Document specific automatic thoughts and the core beliefs being challenged.
Clearly outline the cognitive restructuring exercises practiced.
Explicitly document the CBT homework assigned (e.g., thought logs, behavioral experiments) and review progress from previous homework.`
  },
  {
    name: "Trauma-Informed & EMDR",
    description: "Focuses on window of tolerance, nervous system regulation, and bilateral stimulation protocols.",
    instructions: `Note the client's current nervous system state (e.g., hyperaroused, hypoaroused, within window of tolerance).
Document grounding techniques deployed (e.g., 5-4-3-2-1, diaphragmatic breathing).
For EMDR sessions, document the active target, negative/positive cognitions (NC/PC), VOC (Validity of Cognition) score, SUDs (Subjective Units of Distress) score, bilateral stimulation used, and post-session regulation.`
  },
  {
    name: "Psychodynamic & Process",
    description: "Focuses on insight development, defense mechanisms, transference, and developmental patterns.",
    instructions: `Document the client's defense mechanisms observed (e.g., projection, intellectualization, denial).
Incorporate observations regarding transference or countertransference themes occurring in the session.
Link current emotional reactions to historical developmental patterns, attachment styles, or early childhood relationships discussed.`
  },
  {
    name: "Somatic & Mindfulness-Based",
    description: "Focuses on mind-body connection, somatic sensations, and present-moment awareness.",
    instructions: `Document client's physical sensations and somatic awareness reported (e.g., "tightness in chest," "shallow breathing").
Note mindfulness, body scans, or somatic experiencing interventions guided during the session.
Track the client's ability to self-regulate and stay present during emotionally activated topics.`
  }
];
