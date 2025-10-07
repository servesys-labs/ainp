/**
 * AINP Intent Type Definitions
 * Spec: RFC 001-SPEC Section 3.1
 */

export interface AINPIntent {
  "@context": string;
  "@type": string;
  version: string;
  embedding: string; // base64-encoded Float32Array
  semantics: Record<string, unknown>;
  budget: IntentBudget;
}

export interface IntentBudget {
  max_credits: number;
  max_rounds: number;
  timeout_ms: number;
}
