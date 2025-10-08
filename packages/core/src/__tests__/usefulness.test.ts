import { describe, it, expect } from 'vitest';
import { calculateUsefulnessScore, UsefulnessProof } from '../types/envelope';

describe('UsefulnessProof', () => {
  it('should calculate compute score', () => {
    const proof: UsefulnessProof = {
      work_type: 'compute',
      metrics: { compute_ms: 5000 }, // 5 seconds
      trace_id: 'test',
      timestamp: Date.now()
    };
    const score = calculateUsefulnessScore(proof);
    expect(score).toBe(50); // 5000ms / 100 = 50
  });

  it('should calculate memory score', () => {
    const proof: UsefulnessProof = {
      work_type: 'memory',
      metrics: { memory_bytes: 2 * 1024 * 1024 }, // 2MB
      trace_id: 'test',
      timestamp: Date.now()
    };
    const score = calculateUsefulnessScore(proof);
    expect(score).toBe(2);
  });

  it('should cap score at 100', () => {
    const proof: UsefulnessProof = {
      work_type: 'compute',
      metrics: { compute_ms: 20000 }, // 20 seconds
      trace_id: 'test',
      timestamp: Date.now()
    };
    const score = calculateUsefulnessScore(proof);
    expect(score).toBe(100);
  });

  it('should boost score with attestations', () => {
    const proof: UsefulnessProof = {
      work_type: 'routing',
      metrics: { routing_hops: 5 },
      attestations: ['vc:attestation1'],
      trace_id: 'test',
      timestamp: Date.now()
    };
    const score = calculateUsefulnessScore(proof);
    expect(score).toBeCloseTo(55, 1); // (5 * 10) * 1.1 = 55 (allow floating point precision)
  });

  it('should calculate validation score', () => {
    const proof: UsefulnessProof = {
      work_type: 'validation',
      metrics: { validation_checks: 10 },
      trace_id: 'test',
      timestamp: Date.now()
    };
    const score = calculateUsefulnessScore(proof);
    expect(score).toBe(50); // 10 * 5 = 50
  });

  it('should calculate learning score', () => {
    const proof: UsefulnessProof = {
      work_type: 'learning',
      metrics: { learning_samples: 100 },
      trace_id: 'test',
      timestamp: Date.now()
    };
    const score = calculateUsefulnessScore(proof);
    expect(score).toBe(10); // 100 / 10 = 10
  });

  it('should handle missing metrics gracefully', () => {
    const proof: UsefulnessProof = {
      work_type: 'compute',
      metrics: {}, // No compute_ms
      trace_id: 'test',
      timestamp: Date.now()
    };
    const score = calculateUsefulnessScore(proof);
    expect(score).toBe(0);
  });

  it('should not produce negative scores', () => {
    const proof: UsefulnessProof = {
      work_type: 'memory',
      metrics: { memory_bytes: -1000 }, // Negative value
      trace_id: 'test',
      timestamp: Date.now()
    };
    const score = calculateUsefulnessScore(proof);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
