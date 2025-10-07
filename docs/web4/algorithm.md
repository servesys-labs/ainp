/**
 * Web4 Proof of Usefulness (PoU) Scoring Algorithm
 * 
 * This algorithm calculates a node's usefulness score based on multiple dimensions
 * of contribution to the network. The score determines mining rewards, consensus weight,
 * and network privileges.
 */

// ============================================================================
// CORE TYPES
// ============================================================================

interface UsefulnessVector {
  memory: MemoryUsefulness;
  compute: ComputeUsefulness;
  routing: RoutingUsefulness;
  learning: LearningUsefulness;
  validation: ValidationUsefulness;
}

interface MemoryUsefulness {
  vectorsStored: bigint;          // Total vectors in storage
  storageBytes: bigint;           // Total bytes used
  retrievalCount: number;         // Queries served
  retrievalLatency: number;       // Avg milliseconds
  uniqueAccessors: Set<string>;   // Unique agents served
  specialization: number;         // Semantic clustering score (0-1)
  uptime: number;                 // Availability percentage (0-100)
  freshnessScore: number;         // How recent the memories are (0-1)
}

interface ComputeUsefulness {
  problemsSolved: number;          // Total problems solved
  solutionQuality: number;        // Avg quality score (0-1)
  problemDifficulty: number;      // Avg weighted difficulty
  beneficiariesServed: number;    // Unique agents served
  innovationScore: number;        // Novel solutions (0-1)
  successRate: number;            // Solutions accepted (0-1)
  computeContributed: bigint;     // FLOPs contributed
}

interface RoutingUsefulness {
  packetsRouted: bigint;          // Total packets forwarded
  bytesTransferred: bigint;       // Total data moved
  routeEfficiency: number;        // Optimal path percentage (0-1)
  semanticAccuracy: number;       // Correct semantic routing (0-1)
  latencyReduction: number;       // Time saved vs baseline
  reliabilityScore: number;       // Successful deliveries (0-1)
}

interface LearningUsefulness {
  patternsDiscovered: number;     // New patterns found
  modelImprovements: number;      // Model delta contributions
  knowledgeShared: number;        // Teachings propagated
  learningImpact: number;         // Downstream improvements
  dataContributed: bigint;        // Training data provided
  federatedRounds: number;        // Participation count
}

interface ValidationUsefulness {
  validationsPerformed: number;    // Total validations
  validationAccuracy: number;     // Correct validations (0-1)
  fraudsDetected: number;         // Bad actors caught
  consensusParticipation: number; // Rounds participated
  validationSpeed: number;        // Avg validation time
  disputesResolved: number;       // Conflicts resolved
}

// ============================================================================
// MAIN SCORING ALGORITHM
// ============================================================================

class ProofOfUsefulnessScorer {
  // Dynamic weights that evolve based on network needs
  private weights = {
    memory: 0.25,
    compute: 0.30,
    routing: 0.20,
    learning: 0.15,
    validation: 0.10
  };

  // Network-wide parameters for normalization
  private networkStats = {
    avgMemorySize: 1_000_000n,      // 1M vectors average
    avgProblemsolved: 100,
    avgPacketsRouted: 10_000n,
    avgPatternsFound: 10,
    avgValidations: 1000
  };

  /**
   * Calculate the total usefulness score for a node
   */
  calculateScore(node: UsefulnessVector, context: NetworkContext): UsefulnessScore {
    // Calculate individual dimension scores
    const memoryScore = this.scoreMemory(node.memory, context);
    const computeScore = this.scoreCompute(node.compute, context);
    const routingScore = this.scoreRouting(node.routing, context);
    const learningScore = this.scoreLearning(node.learning, context);
    const validationScore = this.scoreValidation(node.validation, context);

    // Apply dynamic weights based on network needs
    const weights = this.getDynamicWeights(context);

    // Calculate weighted base score
    const baseScore = 
      memoryScore * weights.memory +
      computeScore * weights.compute +
      routingScore * weights.routing +
      learningScore * weights.learning +
      validationScore * weights.validation;

    // Apply multipliers
    const timeMultiplier = this.getTimeConsistencyMultiplier(node, context);
    const diversityMultiplier = this.getDiversityMultiplier(node);
    const impactMultiplier = this.getImpactMultiplier(node, context);
    const reputationMultiplier = this.getReputationMultiplier(node, context);

    // Calculate final score with logarithmic scaling to prevent runaway scores
    const rawScore = baseScore * timeMultiplier * diversityMultiplier * 
                     impactMultiplier * reputationMultiplier;
    
    const finalScore = this.logarithmicScale(rawScore);

    return {
      total: finalScore,
      breakdown: {
        memory: memoryScore,
        compute: computeScore,
        routing: routingScore,
        learning: learningScore,
        validation: validationScore
      },
      multipliers: {
        time: timeMultiplier,
        diversity: diversityMultiplier,
        impact: impactMultiplier,
        reputation: reputationMultiplier
      },
      rank: 0, // Will be set by network ranking
      rewards: this.calculateRewards(finalScore, context)
    };
  }

  /**
   * Score memory usefulness with quality adjustments
   */
  private scoreMemory(memory: MemoryUsefulness, context: NetworkContext): number {
    // Storage score (logarithmic to prevent gaming)
    const storageScore = Math.log10(Number(memory.vectorsStored) + 1) / 
                        Math.log10(Number(this.networkStats.avgMemorySize));

    // Retrieval score (weighted by unique accessors)
    const retrievalScore = (memory.retrievalCount * 
                           (memory.uniqueAccessors.size / memory.retrievalCount)) /
                           1000; // Normalize

    // Quality factors
    const latencyScore = Math.max(0, 1 - (memory.retrievalLatency / 1000)); // Under 1s is good
    const uptimeScore = memory.uptime / 100;
    const freshnessScore = memory.freshnessScore;
    const specializationBonus = Math.pow(memory.specialization, 2); // Reward specialization

    // Combine with quality weights
    const score = (storageScore * 0.3) +
                 (retrievalScore * 0.25) +
                 (latencyScore * 0.15) +
                 (uptimeScore * 0.15) +
                 (freshnessScore * 0.1) +
                 (specializationBonus * 0.05);

    // Apply scarcity multiplier if network needs more memory
    const scarcityMultiplier = context.memoryScarcity || 1.0;
    
    return Math.min(score * scarcityMultiplier, 10); // Cap at 10
  }

  /**
   * Score compute usefulness with innovation bonus
   */
  private scoreCompute(compute: ComputeUsefulness, context: NetworkContext): number {
    // Volume score
    const volumeScore = Math.log10(compute.problemsSolved + 1) / 
                       Math.log10(this.networkStats.avgProblemsolved);

    // Quality score
    const qualityScore = compute.solutionQuality * compute.successRate;

    // Difficulty-adjusted score (harder problems worth more)
    const difficultyScore = compute.problemDifficulty * volumeScore;

    // Innovation bonus (exponential reward for novel solutions)
    const innovationBonus = Math.pow(compute.innovationScore, 1.5);

    // Impact score (how many unique agents served)
    const impactScore = Math.log10(compute.beneficiariesServed + 1) / 
                       Math.log10(context.totalAgents || 1000);

    // Efficiency score (FLOPs per problem)
    const efficiencyScore = compute.problemsSolved > 0 ?
      Math.min(1, Number(compute.computeContributed) / 
                  (compute.problemsSolved * 1e12)) : 0; // 1TFLOP baseline

    // Combine scores
    const score = (volumeScore * 0.2) +
                 (qualityScore * 0.25) +
                 (difficultyScore * 0.2) +
                 (innovationBonus * 0.15) +
                 (impactScore * 0.15) +
                 (efficiencyScore * 0.05);

    return Math.min(score * (context.computeScarcity || 1.0), 10);
  }

  /**
   * Score routing usefulness with efficiency focus
   */
  private scoreRouting(routing: RoutingUsefulness, context: NetworkContext): number {
    // Volume score (logarithmic)
    const volumeScore = Math.log10(Number(routing.packetsRouted) + 1) / 
                       Math.log10(Number(this.networkStats.avgPacketsRouted));

    // Efficiency scores
    const routeEfficiency = routing.routeEfficiency;
    const semanticAccuracy = routing.semanticAccuracy;
    const reliability = routing.reliabilityScore;

    // Latency improvement score
    const latencyScore = Math.max(0, routing.latencyReduction / 100); // 100ms reduction = 1.0

    // Bandwidth contribution
    const bandwidthScore = Math.log10(Number(routing.bytesTransferred) + 1) / 15; // 1PB = 1.0

    // Strategic position bonus (nodes in important positions)
    const positionBonus = this.calculatePositionBonus(routing, context);

    const score = (volumeScore * 0.2) +
                 (routeEfficiency * 0.2) +
                 (semanticAccuracy * 0.2) +
                 (reliability * 0.15) +
                 (latencyScore * 0.15) +
                 (bandwidthScore * 0.05) +
                 (positionBonus * 0.05);

    return Math.min(score * (context.routingScarcity || 1.0), 10);
  }

  /**
   * Score learning usefulness with compound effects
   */
  private scoreLearning(learning: LearningUsefulness, context: NetworkContext): number {
    // Discovery score (new patterns are valuable)
    const discoveryScore = Math.log10(learning.patternsDiscovered + 1) / 
                          Math.log10(this.networkStats.avgPatternsFound);

    // Model improvement score
    const modelScore = Math.log10(learning.modelImprovements + 1) / 
                      Math.log10(context.avgModelImprovements || 10);

    // Knowledge propagation score
    const propagationScore = Math.log10(learning.knowledgeShared + 1) / 
                           Math.log10(context.avgKnowledgeShared || 100);

    // Impact score (downstream effects)
    const impactScore = learning.learningImpact / 100; // Normalized

    // Participation score
    const participationScore = Math.min(1, learning.federatedRounds / 100);

    // Data contribution score
    const dataScore = Math.log10(Number(learning.dataContributed) + 1) / 12; // 1TB = 1.0

    const score = (discoveryScore * 0.25) +
                 (modelScore * 0.2) +
                 (propagationScore * 0.15) +
                 (impactScore * 0.25) +
                 (participationScore * 0.1) +
                 (dataScore * 0.05);

    return Math.min(score * (context.learningScarcity || 1.0), 10);
  }

  /**
   * Score validation usefulness with accuracy focus
   */
  private scoreValidation(validation: ValidationUsefulness, context: NetworkContext): number {
    // Volume score
    const volumeScore = Math.log10(validation.validationsPerformed + 1) / 
                       Math.log10(this.networkStats.avgValidations);

    // Accuracy is critical for validation
    const accuracyScore = Math.pow(validation.validationAccuracy, 2); // Quadratic penalty for errors

    // Security contribution (catching bad actors)
    const securityScore = Math.log10(validation.fraudsDetected + 1) / 
                         Math.log10(context.avgFraudsDetected || 10);

    // Consensus participation
    const consensusScore = Math.min(1, validation.consensusParticipation / 
                                      (context.totalConsensusRounds || 1000));

    // Speed score (faster validation is better)
    const speedScore = Math.max(0, 1 - (validation.validationSpeed / 5000)); // Under 5s is good

    // Dispute resolution bonus
    const disputeBonus = Math.log10(validation.disputesResolved + 1) / 
                        Math.log10(context.avgDisputes || 10);

    const score = (volumeScore * 0.15) +
                 (accuracyScore * 0.35) + // Accuracy is most important
                 (securityScore * 0.2) +
                 (consensusScore * 0.15) +
                 (speedScore * 0.1) +
                 (disputeBonus * 0.05);

    return Math.min(score * (context.validationScarcity || 1.0), 10);
  }

  /**
   * Calculate dynamic weights based on network needs
   */
  private getDynamicWeights(context: NetworkContext): typeof this.weights {
    const needs = context.currentNeeds;
    
    // Adjust weights based on scarcity
    const weights = { ...this.weights };
    
    if (needs.memoryUrgent) weights.memory *= 1.5;
    if (needs.computeUrgent) weights.compute *= 1.5;
    if (needs.routingUrgent) weights.routing *= 1.5;
    if (needs.learningUrgent) weights.learning *= 1.5;
    if (needs.validationUrgent) weights.validation *= 1.5;
    
    // Normalize weights to sum to 1
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const key in weights) {
      weights[key as keyof typeof weights] /= sum;
    }
    
    return weights;
  }

  /**
   * Time consistency multiplier - rewards consistent contribution
   */
  private getTimeConsistencyMultiplier(node: UsefulnessVector, context: NetworkContext): number {
    // Get historical data (would come from blockchain)
    const history = context.nodeHistory?.get(node) || [];
    
    if (history.length < 2) return 1.0;
    
    // Calculate variance in contribution over time
    const mean = history.reduce((a, b) => a + b, 0) / history.length;
    const variance = history.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / history.length;
    const consistency = Math.max(0, 1 - (Math.sqrt(variance) / mean));
    
    // Long-term contributors get bonus
    const longevityBonus = Math.min(1.5, 1 + (history.length / 365)); // Max 1.5x after a year
    
    return consistency * longevityBonus;
  }

  /**
   * Diversity multiplier - rewards nodes that contribute in multiple ways
   */
  private getDiversityMultiplier(node: UsefulnessVector): number {
    const contributions = [
      node.memory.vectorsStored > 0n,
      node.compute.problemsSolved > 0,
      node.routing.packetsRouted > 0n,
      node.learning.patternsDiscovered > 0,
      node.validation.validationsPerformed > 0
    ];
    
    const diversityCount = contributions.filter(c => c).length;
    
    // Bonus for contributing in multiple dimensions
    return 1 + (diversityCount - 1) * 0.1; // 10% bonus per additional dimension
  }

  /**
   * Impact multiplier - rewards high-impact contributions
   */
  private getImpactMultiplier(node: UsefulnessVector, context: NetworkContext): number {
    // Calculate total unique beneficiaries
    const uniqueBeneficiaries = new Set([
      ...Array.from(node.memory.uniqueAccessors),
      ...Array(node.compute.beneficiariesServed).fill('').map((_, i) => `compute_${i}`)
    ]).size;
    
    // Impact score based on reach
    const reachScore = Math.log10(uniqueBeneficiaries + 1) / 
                      Math.log10(context.totalAgents || 1000);
    
    // Quality impact (high-quality contributions have more impact)
    const qualityImpact = (
      node.compute.solutionQuality +
      node.memory.freshnessScore +
      node.routing.semanticAccuracy +
      node.validation.validationAccuracy
    ) / 4;
    
    return 1 + (reachScore * 0.3) + (qualityImpact * 0.2); // Max 1.5x multiplier
  }

  /**
   * Reputation multiplier - based on historical performance
   */
  private getReputationMultiplier(node: UsefulnessVector, context: NetworkContext): number {
    const reputation = context.reputationScores?.get(node) || {
      usefulness: 0.5,
      reliability: 0.5,
      innovation: 0.5
    };
    
    // Weighted reputation score
    const repScore = (reputation.usefulness * 0.5) +
                    (reputation.reliability * 0.3) +
                    (reputation.innovation * 0.2);
    
    // Reputation provides 0.5x to 2x multiplier
    return 0.5 + (repScore * 1.5);
  }

  /**
   * Logarithmic scaling to prevent score inflation
   */
  private logarithmicScale(rawScore: number): number {
    // Use logarithmic scaling with base 2
    // This maps scores to a reasonable range while preserving relative differences
    return Math.log2(rawScore + 1) * 100;
  }

  /**
   * Calculate strategic position bonus for routing nodes
   */
  private calculatePositionBonus(routing: RoutingUsefulness, context: NetworkContext): number {
    // Nodes in critical positions get bonuses
    // This would be calculated based on network topology analysis
    const centralityScore = context.centralityScores?.get(routing) || 0;
    const bridgeScore = context.bridgeScores?.get(routing) || 0;
    
    return (centralityScore + bridgeScore) / 2;
  }

  /**
   * Calculate token rewards based on score
   */
  private calculateRewards(score: number, context: NetworkContext): TokenReward {
    const baseReward = context.blockReward || 1000;
    const scorePercentile = this.getScorePercentile(score, context);
    
    // Exponential reward curve - top contributors earn disproportionately more
    const rewardMultiplier = Math.pow(scorePercentile, 2);
    
    const tokenAmount = Math.floor(baseReward * rewardMultiplier);
    
    return {
      immediate: Math.floor(tokenAmount * 0.7), // 70% immediate
      vested: Math.floor(tokenAmount * 0.2),    // 20% vested over time
      bonus: Math.floor(tokenAmount * 0.1)      // 10% performance bonus pool
    };
  }

  /**
   * Get score percentile ranking
   */
  private getScorePercentile(score: number, context: NetworkContext): number {
    const allScores = context.allNodeScores || [];
    const rank = allScores.filter(s => s < score).length;
    return rank / Math.max(1, allScores.length);
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

interface NetworkContext {
  totalAgents: number;
  currentNeeds: {
    memoryUrgent?: boolean;
    computeUrgent?: boolean;
    routingUrgent?: boolean;
    learningUrgent?: boolean;
    validationUrgent?: boolean;
  };
  memoryScarcity?: number;
  computeScarcity?: number;
  routingScarcity?: number;
  learningScarcity?: number;
  validationScarcity?: number;
  nodeHistory?: Map<UsefulnessVector, number[]>;
  reputationScores?: Map<UsefulnessVector, ReputationScore>;
  centralityScores?: Map<any, number>;
  bridgeScores?: Map<any, number>;
  avgModelImprovements?: number;
  avgKnowledgeShared?: number;
  avgFraudsDetected?: number;
  totalConsensusRounds?: number;
  avgDisputes?: number;
  blockReward?: number;
  allNodeScores?: number[];
}

interface ReputationScore {
  usefulness: number;
  reliability: number;
  innovation: number;
}

interface UsefulnessScore {
  total: number;
  breakdown: {
    memory: number;
    compute: number;
    routing: number;
    learning: number;
    validation: number;
  };
  multipliers: {
    time: number;
    diversity: number;
    impact: number;
    reputation: number;
  };
  rank: number;
  rewards: TokenReward;
}

interface TokenReward {
  immediate: number;
  vested: number;
  bonus: number;
}

// ============================================================================
// USAGE EXAMPLE
// ============================================================================

// Example: Calculate score for a node
const scorer = new ProofOfUsefulnessScorer();

const nodeUsefulness: UsefulnessVector = {
  memory: {
    vectorsStored: 1_000_000n,
    storageBytes: 4_000_000_000n,
    retrievalCount: 5000,
    retrievalLatency: 50,
    uniqueAccessors: new Set(['agent1', 'agent2', 'agent3']),
    specialization: 0.8,
    uptime: 95,
    freshnessScore: 0.9
  },
  compute: {
    problemsSolved: 150,
    solutionQuality: 0.85,
    problemDifficulty: 0.7,
    beneficiariesServed: 50,
    innovationScore: 0.3,
    successRate: 0.9,
    computeContributed: 1_000_000_000_000n
  },
  routing: {
    packetsRouted: 50_000n,
    bytesTransferred: 10_000_000_000n,
    routeEfficiency: 0.85,
    semanticAccuracy: 0.9,
    latencyReduction: 20,
    reliabilityScore: 0.95
  },
  learning: {
    patternsDiscovered: 5,
    modelImprovements: 10,
    knowledgeShared: 100,
    learningImpact: 75,
    dataContributed: 1_000_000_000n,
    federatedRounds: 50
  },
  validation: {
    validationsPerformed: 1000,
    validationAccuracy: 0.98,
    fraudsDetected: 2,
    consensusParticipation: 100,
    validationSpeed: 500,
    disputesResolved: 5
  }
};

const context: NetworkContext = {
  totalAgents: 10000,
  currentNeeds: {
    memoryUrgent: true,
    computeUrgent: false
  },
  memoryScarcity: 1.2,
  blockReward: 1000
};

const score = scorer.calculateScore(nodeUsefulness, context);
console.log('Usefulness Score:', score);

export { ProofOfUsefulnessScorer, UsefulnessVector, UsefulnessScore, NetworkContext };
