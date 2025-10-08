/**
 * Feature Flag System Tests
 *
 * Tests for type-safe feature flag management.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  FeatureFlag,
  getFeatureFlag,
  isFeatureEnabled,
  getAllFeatureFlags,
  getFeatureFlagConfig,
  getRecommendedFlags,
  validateFeatureFlags,
  getDiscoveryWeights,
} from './feature-flags';

describe('Feature Flags', () => {
  // Store original env vars
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env vars before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original env vars
    process.env = originalEnv;
  });

  describe('getFeatureFlag', () => {
    it('should return default value when env var not set', () => {
      delete process.env[FeatureFlag.SIGNATURE_VERIFICATION_ENABLED];
      const result = getFeatureFlag(FeatureFlag.SIGNATURE_VERIFICATION_ENABLED);
      expect(result).toBe(true); // Default is true
    });

    it('should return true when env var is "true"', () => {
      process.env[FeatureFlag.SIGNATURE_VERIFICATION_ENABLED] = 'true';
      const result = getFeatureFlag(FeatureFlag.SIGNATURE_VERIFICATION_ENABLED);
      expect(result).toBe(true);
    });

    it('should return true when env var is "1"', () => {
      process.env[FeatureFlag.SIGNATURE_VERIFICATION_ENABLED] = '1';
      const result = getFeatureFlag(FeatureFlag.SIGNATURE_VERIFICATION_ENABLED);
      expect(result).toBe(true);
    });

    it('should return false when env var is "false"', () => {
      process.env[FeatureFlag.SIGNATURE_VERIFICATION_ENABLED] = 'false';
      const result = getFeatureFlag(FeatureFlag.SIGNATURE_VERIFICATION_ENABLED);
      expect(result).toBe(false);
    });

    it('should return false when env var is "0"', () => {
      process.env[FeatureFlag.SIGNATURE_VERIFICATION_ENABLED] = '0';
      const result = getFeatureFlag(FeatureFlag.SIGNATURE_VERIFICATION_ENABLED);
      expect(result).toBe(false);
    });

    it('should return false for unknown feature flags', () => {
      const result = getFeatureFlag('UNKNOWN_FLAG' as FeatureFlag);
      expect(result).toBe(false);
    });

    it('should use default false for WEB4_POU_DISCOVERY_ENABLED', () => {
      delete process.env[FeatureFlag.WEB4_POU_DISCOVERY_ENABLED];
      const result = getFeatureFlag(FeatureFlag.WEB4_POU_DISCOVERY_ENABLED);
      expect(result).toBe(false); // Default is false
    });

    it('should override default when env var is set', () => {
      process.env[FeatureFlag.WEB4_POU_DISCOVERY_ENABLED] = 'true';
      const result = getFeatureFlag(FeatureFlag.WEB4_POU_DISCOVERY_ENABLED);
      expect(result).toBe(true);
    });
  });

  describe('isFeatureEnabled', () => {
    it('should be alias for getFeatureFlag', () => {
      process.env[FeatureFlag.CREDIT_LEDGER_ENABLED] = 'true';
      expect(isFeatureEnabled(FeatureFlag.CREDIT_LEDGER_ENABLED)).toBe(true);
      expect(getFeatureFlag(FeatureFlag.CREDIT_LEDGER_ENABLED)).toBe(true);
    });

    it('should return false when disabled', () => {
      process.env[FeatureFlag.CREDIT_LEDGER_ENABLED] = 'false';
      expect(isFeatureEnabled(FeatureFlag.CREDIT_LEDGER_ENABLED)).toBe(false);
    });
  });

  describe('getAllFeatureFlags', () => {
    it('should return all flags with current values', () => {
      process.env[FeatureFlag.SIGNATURE_VERIFICATION_ENABLED] = 'true';
      process.env[FeatureFlag.WEB4_POU_DISCOVERY_ENABLED] = 'false';

      const flags = getAllFeatureFlags();

      expect(flags).toHaveProperty(FeatureFlag.SIGNATURE_VERIFICATION_ENABLED);
      expect(flags).toHaveProperty(FeatureFlag.WEB4_POU_DISCOVERY_ENABLED);
      expect(flags[FeatureFlag.SIGNATURE_VERIFICATION_ENABLED]).toBe(true);
      expect(flags[FeatureFlag.WEB4_POU_DISCOVERY_ENABLED]).toBe(false);
    });

    it('should include all registered feature flags', () => {
      const flags = getAllFeatureFlags();
      const expectedFlags = Object.values(FeatureFlag);

      for (const flag of expectedFlags) {
        expect(flags).toHaveProperty(flag);
      }
    });
  });

  describe('getFeatureFlagConfig', () => {
    it('should return config for valid feature flag', () => {
      const config = getFeatureFlagConfig(FeatureFlag.SIGNATURE_VERIFICATION_ENABLED);

      expect(config).not.toBeNull();
      expect(config?.key).toBe(FeatureFlag.SIGNATURE_VERIFICATION_ENABLED);
      expect(config?.description).toBeTruthy();
      expect(config?.defaultValue).toBeDefined();
      expect(config?.environments).toBeInstanceOf(Array);
    });

    it('should return null for unknown feature flag', () => {
      const config = getFeatureFlagConfig('UNKNOWN_FLAG' as FeatureFlag);
      expect(config).toBeNull();
    });

    it('should include metadata for all flags', () => {
      const config = getFeatureFlagConfig(FeatureFlag.CREDIT_LEDGER_ENABLED);

      expect(config?.description).toContain('credit ledger');
      expect(config?.environments).toContain('production');
    });
  });

  describe('getRecommendedFlags', () => {
    it('should recommend flags for production environment', () => {
      process.env.NODE_ENV = 'production';
      const recommended = getRecommendedFlags();

      expect(recommended[FeatureFlag.SIGNATURE_VERIFICATION_ENABLED]).toBe(true);
      expect(recommended[FeatureFlag.CREDIT_LEDGER_ENABLED]).toBe(true);
      expect(recommended[FeatureFlag.ENABLE_MONITORING]).toBe(true);
    });

    it('should not recommend experimental flags for production', () => {
      process.env.NODE_ENV = 'production';
      const recommended = getRecommendedFlags();

      expect(recommended[FeatureFlag.ENABLE_TRACING]).toBe(false);
      expect(recommended[FeatureFlag.NEGOTIATION_ENABLED]).toBe(false);
    });

    it('should recommend different flags for development', () => {
      process.env.NODE_ENV = 'development';
      const recommended = getRecommendedFlags();

      expect(recommended[FeatureFlag.SIGNATURE_VERIFICATION_ENABLED]).toBe(true);
      expect(recommended[FeatureFlag.ENABLE_TRACING]).toBe(true);
    });

    it('should handle preview environment', () => {
      process.env.NODE_ENV = 'preview';
      const recommended = getRecommendedFlags();

      expect(recommended[FeatureFlag.WEB4_POU_DISCOVERY_ENABLED]).toBe(true);
      expect(recommended[FeatureFlag.NEGOTIATION_ENABLED]).toBe(true);
    });
  });

  describe('validateFeatureFlags', () => {
    it('should return no warnings when flags match recommendations', () => {
      process.env.NODE_ENV = 'production';
      // Set all production-recommended flags to true
      process.env[FeatureFlag.SIGNATURE_VERIFICATION_ENABLED] = 'true';
      process.env[FeatureFlag.CREDIT_LEDGER_ENABLED] = 'true';
      process.env[FeatureFlag.USEFULNESS_AGGREGATION_ENABLED] = 'true';
      process.env[FeatureFlag.ENABLE_MONITORING] = 'true';
      process.env[FeatureFlag.WEB4_POU_DISCOVERY_ENABLED] = 'true'; // Recommended for production per registry
      // Set non-recommended flags to false
      process.env[FeatureFlag.ENABLE_TRACING] = 'false';
      process.env[FeatureFlag.NEGOTIATION_ENABLED] = 'false';
      process.env[FeatureFlag.MULTI_ROUND_NEGOTIATION_ENABLED] = 'false';

      const warnings = validateFeatureFlags();
      expect(warnings).toHaveLength(0);
    });

    it('should warn when experimental flag enabled in production', () => {
      process.env.NODE_ENV = 'production';
      // Set all recommended flags properly to avoid other warnings
      process.env[FeatureFlag.SIGNATURE_VERIFICATION_ENABLED] = 'true';
      process.env[FeatureFlag.CREDIT_LEDGER_ENABLED] = 'true';
      process.env[FeatureFlag.USEFULNESS_AGGREGATION_ENABLED] = 'true';
      process.env[FeatureFlag.ENABLE_MONITORING] = 'true';
      process.env[FeatureFlag.WEB4_POU_DISCOVERY_ENABLED] = 'false';
      process.env[FeatureFlag.NEGOTIATION_ENABLED] = 'false';
      process.env[FeatureFlag.MULTI_ROUND_NEGOTIATION_ENABLED] = 'false';
      // Enable experimental flag (this should trigger warning)
      process.env[FeatureFlag.ENABLE_TRACING] = 'true';

      const warnings = validateFeatureFlags();
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((w) => w.includes('ENABLE_TRACING'))).toBe(true);
      expect(warnings.some((w) => w.includes('not recommended for production'))).toBe(true);
    });

    it('should warn when required flag disabled in production', () => {
      process.env.NODE_ENV = 'production';
      process.env[FeatureFlag.CREDIT_LEDGER_ENABLED] = 'false';

      const warnings = validateFeatureFlags();
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((w) => w.includes('CREDIT_LEDGER_ENABLED'))).toBe(true);
    });

    it('should not warn in development environment', () => {
      process.env.NODE_ENV = 'development';
      process.env[FeatureFlag.ENABLE_TRACING] = 'true';

      const warnings = validateFeatureFlags();
      expect(
        warnings.filter((w) => w.includes('ENABLE_TRACING')).length
      ).toBe(0);
    });
  });

  describe('getDiscoveryWeights', () => {
    it('should return default weights when env vars not set', () => {
      delete process.env.DISCOVERY_SIMILARITY_WEIGHT;
      delete process.env.DISCOVERY_TRUST_WEIGHT;
      delete process.env.DISCOVERY_USEFULNESS_WEIGHT;

      const weights = getDiscoveryWeights();

      expect(weights.similarity).toBe(0.6);
      expect(weights.trust).toBe(0.3);
      expect(weights.usefulness).toBe(0.1);
    });

    it('should use custom weights from env vars', () => {
      process.env.DISCOVERY_SIMILARITY_WEIGHT = '0.5';
      process.env.DISCOVERY_TRUST_WEIGHT = '0.3';
      process.env.DISCOVERY_USEFULNESS_WEIGHT = '0.2';

      const weights = getDiscoveryWeights();

      expect(weights.similarity).toBe(0.5);
      expect(weights.trust).toBe(0.3);
      expect(weights.usefulness).toBe(0.2);
    });

    it('should throw error if weights do not sum to 1.0', () => {
      process.env.DISCOVERY_SIMILARITY_WEIGHT = '0.5';
      process.env.DISCOVERY_TRUST_WEIGHT = '0.5';
      process.env.DISCOVERY_USEFULNESS_WEIGHT = '0.5';

      expect(() => getDiscoveryWeights()).toThrow(/must sum to 1\.0/);
    });

    it('should throw error with detailed message on invalid sum', () => {
      // Weights sum to 1.0 exactly, should NOT throw
      process.env.DISCOVERY_SIMILARITY_WEIGHT = '0.8';
      process.env.DISCOVERY_TRUST_WEIGHT = '0.1';
      process.env.DISCOVERY_USEFULNESS_WEIGHT = '0.1';

      expect(() => getDiscoveryWeights()).not.toThrow();

      // Now test invalid sum (0.8 + 0.2 + 0.2 = 1.2)
      process.env.DISCOVERY_SIMILARITY_WEIGHT = '0.8';
      process.env.DISCOVERY_TRUST_WEIGHT = '0.2';
      process.env.DISCOVERY_USEFULNESS_WEIGHT = '0.2';

      expect(() => getDiscoveryWeights()).toThrow(/must sum to 1\.0/);
      expect(() => getDiscoveryWeights()).toThrow(/DISCOVERY_SIMILARITY_WEIGHT/);
    });

    it('should accept weights that sum to 1.0 within epsilon', () => {
      // Floating point precision test
      process.env.DISCOVERY_SIMILARITY_WEIGHT = '0.33333';
      process.env.DISCOVERY_TRUST_WEIGHT = '0.33333';
      process.env.DISCOVERY_USEFULNESS_WEIGHT = '0.33334';

      expect(() => getDiscoveryWeights()).not.toThrow();
    });
  });

  describe('Phase-specific flags', () => {
    it('should handle Phase 0 flags', () => {
      const phase0Flags = [
        FeatureFlag.SIGNATURE_VERIFICATION_ENABLED,
        FeatureFlag.WEB4_POU_DISCOVERY_ENABLED,
      ];

      for (const flag of phase0Flags) {
        const config = getFeatureFlagConfig(flag);
        expect(config).not.toBeNull();
        expect(config?.description).toBeTruthy();
      }
    });

    it('should handle Phase 3 flags', () => {
      const phase3Flags = [
        FeatureFlag.CREDIT_LEDGER_ENABLED,
        FeatureFlag.USEFULNESS_AGGREGATION_ENABLED,
      ];

      for (const flag of phase3Flags) {
        const config = getFeatureFlagConfig(flag);
        expect(config).not.toBeNull();
        expect(config?.description).toBeTruthy();
      }
    });

    it('should handle future phase flags', () => {
      const futureFlags = [
        FeatureFlag.NEGOTIATION_ENABLED,
        FeatureFlag.MULTI_ROUND_NEGOTIATION_ENABLED,
      ];

      for (const flag of futureFlags) {
        const config = getFeatureFlagConfig(flag);
        expect(config).not.toBeNull();
        expect(config?.defaultValue).toBe(false); // Future flags default to off
      }
    });
  });

  describe('Integration scenarios', () => {
    it('should support gradual rollout pattern', () => {
      // Start with flag disabled
      process.env[FeatureFlag.WEB4_POU_DISCOVERY_ENABLED] = 'false';
      expect(isFeatureEnabled(FeatureFlag.WEB4_POU_DISCOVERY_ENABLED)).toBe(false);

      // Enable in preview first
      process.env.NODE_ENV = 'preview';
      process.env[FeatureFlag.WEB4_POU_DISCOVERY_ENABLED] = 'true';
      expect(isFeatureEnabled(FeatureFlag.WEB4_POU_DISCOVERY_ENABLED)).toBe(true);

      // Then enable in production
      process.env.NODE_ENV = 'production';
      expect(isFeatureEnabled(FeatureFlag.WEB4_POU_DISCOVERY_ENABLED)).toBe(true);
    });

    it('should support emergency disable pattern', () => {
      // Flag enabled by default
      process.env[FeatureFlag.CREDIT_LEDGER_ENABLED] = 'true';
      expect(isFeatureEnabled(FeatureFlag.CREDIT_LEDGER_ENABLED)).toBe(true);

      // Emergency disable via env var
      process.env[FeatureFlag.CREDIT_LEDGER_ENABLED] = 'false';
      expect(isFeatureEnabled(FeatureFlag.CREDIT_LEDGER_ENABLED)).toBe(false);
    });

    it('should support A/B testing pattern', () => {
      // Control group: flag disabled
      process.env[FeatureFlag.WEB4_POU_DISCOVERY_ENABLED] = 'false';
      const controlResult = isFeatureEnabled(FeatureFlag.WEB4_POU_DISCOVERY_ENABLED);

      // Treatment group: flag enabled
      process.env[FeatureFlag.WEB4_POU_DISCOVERY_ENABLED] = 'true';
      const treatmentResult = isFeatureEnabled(FeatureFlag.WEB4_POU_DISCOVERY_ENABLED);

      expect(controlResult).toBe(false);
      expect(treatmentResult).toBe(true);
    });
  });
});
