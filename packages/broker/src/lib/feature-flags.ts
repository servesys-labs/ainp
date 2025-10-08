/**
 * Feature Flag System
 *
 * Type-safe feature flag management with environment-based configuration.
 * Provides runtime control over experimental features and gradual rollouts.
 *
 * @see docs/FEATURE_FLAGS.md for documentation
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Available feature flags in AINP
 */
export enum FeatureFlag {
  // Phase 0: Foundation
  SIGNATURE_VERIFICATION_ENABLED = 'SIGNATURE_VERIFICATION_ENABLED',
  WEB4_POU_DISCOVERY_ENABLED = 'WEB4_POU_DISCOVERY_ENABLED',

  // Phase 3: Credit System + Usefulness Aggregation
  CREDIT_LEDGER_ENABLED = 'CREDIT_LEDGER_ENABLED',
  USEFULNESS_AGGREGATION_ENABLED = 'USEFULNESS_AGGREGATION_ENABLED',

  // Monitoring & Observability
  ENABLE_MONITORING = 'ENABLE_MONITORING',
  ENABLE_TRACING = 'ENABLE_TRACING',

  // Future Phases (Phase 0.4+)
  NEGOTIATION_ENABLED = 'NEGOTIATION_ENABLED',
  MULTI_ROUND_NEGOTIATION_ENABLED = 'MULTI_ROUND_NEGOTIATION_ENABLED',
}

/**
 * Feature flag configuration with metadata
 */
interface FeatureFlagConfig {
  /** Feature flag key */
  key: FeatureFlag;
  /** Default value (used if env var not set) */
  defaultValue: boolean;
  /** Description of the feature flag */
  description: string;
  /** Environment where this flag is typically enabled */
  environments: ('production' | 'preview' | 'development' | 'test')[];
}

// ============================================================================
// Feature Flag Registry
// ============================================================================

/**
 * Central registry of all feature flags with defaults and metadata
 */
const FEATURE_FLAG_REGISTRY: FeatureFlagConfig[] = [
  // Phase 0: Foundation
  {
    key: FeatureFlag.SIGNATURE_VERIFICATION_ENABLED,
    defaultValue: true,
    description: 'Enable Ed25519 signature verification for intent envelopes',
    environments: ['production', 'preview', 'development'],
  },
  {
    key: FeatureFlag.WEB4_POU_DISCOVERY_ENABLED,
    defaultValue: false,
    description: 'Enable usefulness-weighted discovery ranking (requires aggregation)',
    environments: ['production', 'preview'],
  },

  // Phase 3: Credit System + Usefulness Aggregation
  {
    key: FeatureFlag.CREDIT_LEDGER_ENABLED,
    defaultValue: true,
    description: 'Enable PostgreSQL credit ledger for agent accounts',
    environments: ['production', 'preview', 'development'],
  },
  {
    key: FeatureFlag.USEFULNESS_AGGREGATION_ENABLED,
    defaultValue: true,
    description: 'Enable periodic usefulness score aggregation (cron job)',
    environments: ['production', 'preview', 'development'],
  },

  // Monitoring & Observability
  {
    key: FeatureFlag.ENABLE_MONITORING,
    defaultValue: true,
    description: 'Enable Prometheus metrics collection',
    environments: ['production', 'preview', 'development'],
  },
  {
    key: FeatureFlag.ENABLE_TRACING,
    defaultValue: false,
    description: 'Enable distributed tracing (optional, debug only)',
    environments: ['development', 'preview'],
  },

  // Future Phases (Phase 0.4+)
  {
    key: FeatureFlag.NEGOTIATION_ENABLED,
    defaultValue: false,
    description: 'Enable negotiation protocol (Phase 0.4)',
    environments: ['preview', 'development'],
  },
  {
    key: FeatureFlag.MULTI_ROUND_NEGOTIATION_ENABLED,
    defaultValue: false,
    description: 'Enable multi-round negotiation state machine (Phase 0.4)',
    environments: ['preview', 'development'],
  },
];

// ============================================================================
// Environment Detection
// ============================================================================

/**
 * Detect current environment from NODE_ENV
 */
function getCurrentEnvironment(): 'production' | 'preview' | 'development' | 'test' {
  const env = process.env.NODE_ENV?.toLowerCase() || 'development';

  switch (env) {
    case 'production':
      return 'production';
    case 'preview':
      return 'preview';
    case 'test':
      return 'test';
    case 'development':
    default:
      return 'development';
  }
}

// ============================================================================
// Core API
// ============================================================================

/**
 * Get a feature flag value from environment or default
 *
 * @param flag - Feature flag to check
 * @returns boolean value (true = enabled, false = disabled)
 *
 * @example
 * ```typescript
 * if (getFeatureFlag(FeatureFlag.SIGNATURE_VERIFICATION_ENABLED)) {
 *   await signatureService.verify(envelope);
 * }
 * ```
 */
export function getFeatureFlag(flag: FeatureFlag): boolean {
  const config = FEATURE_FLAG_REGISTRY.find((f) => f.key === flag);

  if (!config) {
    console.warn(`[FeatureFlags] Unknown feature flag: ${flag} - defaulting to false`);
    return false;
  }

  // Read from environment variable (process.env)
  const envValue = process.env[flag];

  if (envValue !== undefined) {
    // Parse boolean from string (supports "true"/"false", "1"/"0")
    return envValue === 'true' || envValue === '1';
  }

  // Fall back to default value
  return config.defaultValue;
}

/**
 * Check if a feature is enabled (alias for getFeatureFlag)
 *
 * @param flag - Feature flag to check
 * @returns true if enabled, false otherwise
 *
 * @example
 * ```typescript
 * if (isFeatureEnabled(FeatureFlag.CREDIT_LEDGER_ENABLED)) {
 *   await creditService.createAccount(agentId);
 * }
 * ```
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return getFeatureFlag(flag);
}

/**
 * Get all feature flags with their current values
 *
 * Useful for debugging and health checks.
 *
 * @returns Record of all feature flags and their current values
 *
 * @example
 * ```typescript
 * const flags = getAllFeatureFlags();
 * console.log('Active flags:', flags);
 * ```
 */
export function getAllFeatureFlags(): Record<string, boolean> {
  const flags: Record<string, boolean> = {};

  for (const config of FEATURE_FLAG_REGISTRY) {
    flags[config.key] = getFeatureFlag(config.key);
  }

  return flags;
}

/**
 * Get feature flag metadata (for documentation and debugging)
 *
 * @param flag - Feature flag to inspect
 * @returns Configuration metadata or null if not found
 */
export function getFeatureFlagConfig(flag: FeatureFlag): FeatureFlagConfig | null {
  return FEATURE_FLAG_REGISTRY.find((f) => f.key === flag) || null;
}

/**
 * Get recommended feature flag values for current environment
 *
 * @returns Record of recommended flag values based on environment
 *
 * @example
 * ```typescript
 * const recommended = getRecommendedFlags();
 * console.log('Recommended for production:', recommended);
 * ```
 */
export function getRecommendedFlags(): Record<string, boolean> {
  const env = getCurrentEnvironment();
  const recommended: Record<string, boolean> = {};

  for (const config of FEATURE_FLAG_REGISTRY) {
    // Flag is recommended if current env is in the environments list
    recommended[config.key] = config.environments.includes(env);
  }

  return recommended;
}

/**
 * Validate feature flag configuration
 *
 * Checks for misconfigured flags and logs warnings.
 * Useful for startup health checks.
 *
 * @returns Array of validation warnings (empty if all ok)
 */
export function validateFeatureFlags(): string[] {
  const warnings: string[] = [];
  const env = getCurrentEnvironment();
  const current = getAllFeatureFlags();
  const recommended = getRecommendedFlags();

  for (const config of FEATURE_FLAG_REGISTRY) {
    const key = config.key;
    const currentValue = current[key];
    const recommendedValue = recommended[key];

    // Warn if flag is enabled in environment where it's not recommended
    if (currentValue && !recommendedValue) {
      warnings.push(
        `${key} is enabled but not recommended for ${env} environment`
      );
    }

    // Warn if flag is disabled in production where it should be enabled
    if (env === 'production' && !currentValue && recommendedValue) {
      warnings.push(
        `${key} is disabled but recommended for production environment`
      );
    }
  }

  return warnings;
}

// ============================================================================
// Discovery Weight Validation (Web4 POU)
// ============================================================================

/**
 * Get discovery ranking weights with validation
 *
 * Ensures weights sum to 1.0 for proper ranking calculation.
 *
 * @returns Validated discovery weights
 * @throws Error if weights don't sum to 1.0
 */
export function getDiscoveryWeights(): {
  similarity: number;
  trust: number;
  usefulness: number;
} {
  const similarity = parseFloat(process.env.DISCOVERY_SIMILARITY_WEIGHT || '0.6');
  const trust = parseFloat(process.env.DISCOVERY_TRUST_WEIGHT || '0.3');
  const usefulness = parseFloat(process.env.DISCOVERY_USEFULNESS_WEIGHT || '0.1');

  const sum = similarity + trust + usefulness;

  // Validate sum is 1.0 (with small epsilon for floating point)
  if (Math.abs(sum - 1.0) > 0.001) {
    throw new Error(
      `Discovery weights must sum to 1.0 (got ${sum}). ` +
        `Check DISCOVERY_SIMILARITY_WEIGHT (${similarity}), ` +
        `DISCOVERY_TRUST_WEIGHT (${trust}), ` +
        `DISCOVERY_USEFULNESS_WEIGHT (${usefulness})`
    );
  }

  return { similarity, trust, usefulness };
}

// ============================================================================
// Exports
// ============================================================================

export default {
  FeatureFlag,
  getFeatureFlag,
  isFeatureEnabled,
  getAllFeatureFlags,
  getFeatureFlagConfig,
  getRecommendedFlags,
  validateFeatureFlags,
  getDiscoveryWeights,
};
