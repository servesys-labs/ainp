# Web4 Glossary and Shared Types

This document defines common terms and lightweight shared types used across the Web4 docs. It aligns terminology for Proof of Usefulness (POU), Proof of Memory (PoM), and AINP.

## Glossary

- POU (Proof of Usefulness): Consensus based on useful work (compute, memory, routing, learning, validation) rather than pure hashing or stake.
- PoM (Proof of Memory): A specialized usefulness domain where devices store, serve, and improve vector memories.
- AINP (AI‑Native Network Protocol): Semantic transport for discovery, negotiation, intents, and results among agents. See `docs/rfcs/001-SPEC.md`.
- Usefulness Score: Weighted measure of a node/agent’s net contribution to the network across usefulness domains.
- Usefulness Agent: An agent eligible to participate in usefulness consensus (solve problems, provide memory, route, validate, or improve models) with identity (DID), capabilities, and reputation.
- Discovery Index: An AINP‑compatible index that matches capability queries to agents using embeddings and trust.
- Escrow: Budgeted funds reserved during negotiation and released upon successful `RESULT` with proofs.

## Shared Types (Conceptual)

These types provide a shared vocabulary. Formal scoring structures are defined in `docs/web4/algorithm.md`.

```typescript
// An agent participating in POU
interface UsefulnessAgent {
  did: string;                        // W3C DID
  capabilities: string[];             // Human-readable tags
  embeddingRef?: string;              // Pointer to embedding/capability VC
  reputation: {
    usefulness: number;               // 0–1 aggregate
    reliability: number;              // 0–1
    innovation: number;               // 0–1
  };
}

// High-level score used for selection/routing
interface UsefulnessScoreSummary {
  total: number;                      // 0–100+ scaled
  memory?: number;                    // 0–10 
  compute?: number;                   // 0–10
  routing?: number;                   // 0–10
  learning?: number;                  // 0–10
  validation?: number;                // 0–10
}

// Wire-level mapping reference
// For detailed scoring, see: docs/web4/algorithm.md (UsefulnessScore)
```

## Cross‑References

- Unified view: `docs/web4/unified.md`
- POU architecture: `docs/web4/POU.md`
- PoM layer: `docs/web4/POM.md`
- Scoring algorithm: `docs/web4/algorithm.md`
- Transport (AINP): `docs/rfcs/001-SPEC.md`

