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

/**
 * Base Message Intent (unified agent-to-agent messaging)
 * All message types (email, chat, notifications) extend this base.
 * @context: 'https://schema.ainp.dev/message/v1'
 */

export interface MessageAttachment {
  filename: string;
  mime_type: string;
  size_bytes: number;
  content_hash: string; // sha256:... (hex) for content-addressable storage
  url?: string;         // Optional external storage URL
}

export interface MessageSemantics extends Record<string, unknown> {
  conversation_id?: string;  // Thread/conversation identifier (UUID)
  participants: string[];    // List of DIDs involved in conversation
  subject?: string;          // Optional subject/title
  content: string;           // Message body (text, markdown, or rich content)
  content_type?: string;     // MIME type of content (default: text/plain)
  content_hash?: string;     // sha256:... for dedupe/audit
  attachments?: MessageAttachment[];
  labels?: string[];         // User-defined labels (inbox, sent, archive, etc.)
  reply_to?: string;         // envelope_id of message being replied to

  // Optional encryption metadata (future)
  content_enc?: 'plain' | 'x25519-sealed';  // Encryption method
  enc_recipients?: Record<string, string>;  // DID → encrypted symmetric key
}

export interface MessageIntent extends AINPIntent {
  '@type': 'MESSAGE' | 'EMAIL_MESSAGE' | 'CHAT_MESSAGE' | 'NOTIFICATION';
  '@context': string; // e.g., https://schema.ainp.dev/message/v1
  semantics: MessageSemantics;
}

/**
 * Email Intent (agent-to-agent email messaging)
 * Extends MessageIntent with email-specific facets
 * @type: 'EMAIL_MESSAGE'
 * @context: 'https://schema.ainp.dev/email/v1'
 */

export interface EmailAttachment extends MessageAttachment {
  // Email attachments are identical to message attachments
}

export interface EmailSemantics extends MessageSemantics {
  email: true;              // Marker for email-specific rendering
  from?: string;            // Display name for sender (DID is canonical)
  to?: string[];            // Display names for recipients
  cc?: string[];            // Carbon copy recipients
  bcc?: string[];           // Blind carbon copy recipients
  headers?: Record<string, string>; // SMTP headers for bridge compatibility
}

export interface EmailIntent extends MessageIntent {
  '@type': 'EMAIL_MESSAGE';
  '@context': string; // e.g., https://schema.ainp.dev/email/v1
  semantics: EmailSemantics;
}
