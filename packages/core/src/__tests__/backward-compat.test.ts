import { describe, it, expect } from 'vitest';
import { Proposal } from '../types/envelope';
import { IncentiveSplit, validateIncentiveSplit, DEFAULT_INCENTIVE_SPLIT } from '../types/negotiation';

describe('Backward Compatibility', () => {
  it('should allow Proposal without incentive_split (backward compatible)', () => {
    const oldProposal: Proposal = {
      price: 100,
      latency_ms: 50,
      confidence: 0.95
    };

    expect(oldProposal.price).toBe(100);
    expect(oldProposal.incentive_split).toBeUndefined();
  });

  it('should allow Proposal with incentive_split (new feature)', () => {
    const newProposal: Proposal = {
      price: 100,
      latency_ms: 50,
      confidence: 0.95,
      incentive_split: DEFAULT_INCENTIVE_SPLIT
    };

    expect(newProposal.incentive_split).toBeDefined();
    expect(newProposal.incentive_split?.agent).toBe(0.70);
  });

  it('should allow custom incentive split', () => {
    const customSplit: IncentiveSplit = {
      agent: 0.80,
      broker: 0.10,
      validator: 0.05,
      pool: 0.05
    };

    const proposal: Proposal = {
      price: 150,
      latency_ms: 100,
      confidence: 0.90,
      incentive_split: customSplit
    };

    expect(validateIncentiveSplit(customSplit)).toBe(true);
    expect(proposal.incentive_split).toEqual(customSplit);
  });

  it('should work with optional terms field', () => {
    const proposal: Proposal = {
      price: 100,
      latency_ms: 50,
      confidence: 0.95,
      terms: { foo: 'bar' },
      incentive_split: DEFAULT_INCENTIVE_SPLIT
    };

    expect(proposal.terms).toEqual({ foo: 'bar' });
    expect(proposal.incentive_split).toBeDefined();
  });
});
