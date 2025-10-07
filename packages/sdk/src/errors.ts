/**
 * AINP SDK Error Classes
 * Custom error types for AINP operations
 */

export class AINPError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'AINPError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AINPError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', false);
    this.name = 'ValidationError';
  }
}

export class SignatureError extends AINPError {
  constructor(message: string) {
    super(message, 'SIGNATURE_ERROR', false);
    this.name = 'SignatureError';
  }
}

export class TimeoutError extends AINPError {
  constructor(message: string, retryable: boolean = true) {
    super(message, 'TIMEOUT', retryable);
    this.name = 'TimeoutError';
  }
}

export class DiscoveryError extends AINPError {
  constructor(message: string) {
    super(message, 'DISCOVERY_ERROR', true);
    this.name = 'DiscoveryError';
  }
}

export class NegotiationError extends AINPError {
  constructor(message: string, code: string = 'NEGOTIATION_ERROR') {
    super(message, code, false);
    this.name = 'NegotiationError';
  }
}

export class InsufficientCreditsError extends AINPError {
  constructor(message: string) {
    super(message, 'INSUFFICIENT_CREDITS', false);
    this.name = 'InsufficientCreditsError';
  }
}

export class RateLimitError extends AINPError {
  constructor(
    message: string,
    public retryAfterMs: number
  ) {
    super(message, 'RATE_LIMIT_EXCEEDED', true);
    this.name = 'RateLimitError';
  }
}

export class IntentError extends AINPError {
  constructor(
    message: string,
    code: string,
    public intentId?: string
  ) {
    super(message, code, false);
    this.name = 'IntentError';
  }
}

// Error factory for creating errors from error payloads
export function createErrorFromPayload(payload: {
  error_code: string;
  error_message: string;
  retry_after_ms?: number;
  intent_id?: string;
}): AINPError {
  const { error_code, error_message, retry_after_ms, intent_id } = payload;

  switch (error_code) {
    case 'RATE_LIMIT_EXCEEDED':
      return new RateLimitError(error_message, retry_after_ms || 0);
    case 'INSUFFICIENT_CREDITS':
      return new InsufficientCreditsError(error_message);
    case 'TIMEOUT':
      return new TimeoutError(error_message);
    case 'INVALID_SIGNATURE':
      return new SignatureError(error_message);
    default:
      return new IntentError(error_message, error_code, intent_id);
  }
}
