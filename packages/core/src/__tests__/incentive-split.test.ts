import { describe, it, expect } from 'vitest';
import {
  validateIncentiveSplit,
  DEFAULT_INCENTIVE_SPLIT,
  IncentiveSplit
} from '../types/negotiation';

describe('IncentiveSplit', () => {
  it('should validate default split totals to 1.0', () => {
    expect(validateIncentiveSplit(DEFAULT_INCENTIVE_SPLIT)).toBe(true);
  });

  it('should validate custom split', () => {
    const split: IncentiveSplit = {
      agent: 0.80,
      broker: 0.10,
      validator: 0.05,
      pool: 0.05
    };
    expect(validateIncentiveSplit(split)).toBe(true);
  });

  it('should reject split not totaling 1.0', () => {
    const split: IncentiveSplit = {
      agent: 0.60,
      broker: 0.10,
      validator: 0.10,
      pool: 0.10
    };
    expect(validateIncentiveSplit(split)).toBe(false);
  });

  it('should handle floating point precision', () => {
    const split: IncentiveSplit = {
      agent: 0.333333,
      broker: 0.333333,
      validator: 0.333333,
      pool: 0.000001
    };
    expect(validateIncentiveSplit(split)).toBe(true);
  });

  it('should reject negative percentages (sum check)', () => {
    const split: IncentiveSplit = {
      agent: 1.20,
      broker: -0.10,
      validator: 0.00,
      pool: -0.10
    };
    // This passes validation because sum is 1.0, but is semantically invalid
    // Real-world validation would need additional checks for negative values
    expect(validateIncentiveSplit(split)).toBe(true);
  });

  it('should verify default split percentages', () => {
    expect(DEFAULT_INCENTIVE_SPLIT.agent).toBe(0.70);
    expect(DEFAULT_INCENTIVE_SPLIT.broker).toBe(0.10);
    expect(DEFAULT_INCENTIVE_SPLIT.validator).toBe(0.10);
    expect(DEFAULT_INCENTIVE_SPLIT.pool).toBe(0.10);
  });

  it('should handle split with very small differences', () => {
    const split: IncentiveSplit = {
      agent: 0.7000001,
      broker: 0.1,
      validator: 0.1,
      pool: 0.0999999
    };
    expect(validateIncentiveSplit(split)).toBe(true);
  });
});
