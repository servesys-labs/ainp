# AINP Roadmap

## Phase 0.1 - MVP (Current)
**Status**: ✅ Complete
- Core envelope protocol
- DID-based identity
- Basic broker routing
- Intent/negotiate/result message types
- Trust scoring framework
- WebSocket delivery

## Phase 0.2 - Production Readiness (In Progress)
**Status**: 🚧 Active
- Structured logging (Logger class) ✅
- Type safety enforcement
- Integration testing
- Performance benchmarks
- Error handling refinement
- Production deployment guides

## Phase 0.3 - Discovery Enhancements (Planned)
**Status**: 📋 Planned

### Cost & Latency Metadata
- **Issue**: Discovery matching lacks cost/latency filtering
- **Goal**: Add cost and latency fields to Capability type
- **Impact**: Enable SLA-aware agent selection
- **Related**: `packages/sdk/src/discovery.ts:149-151`
- **Acceptance Criteria**:
  - Add `cost?: number` and `latencyMs?: number` to Capability interface
  - Implement filterByConstraints() logic for these fields
  - Update discovery index to track these metrics
  - Add capability benchmarking utilities

### Automatic Capability Advertisement
- **Issue**: Agents cannot auto-register capabilities with broker
- **Goal**: Implement periodic heartbeat-based capability advertising
- **Impact**: Dynamic agent discovery without manual registration
- **Related**: `packages/sdk/src/agent.ts:413-417`
- **Acceptance Criteria**:
  - Implement advertise() method in Agent class
  - Add periodic heartbeat mechanism (configurable interval)
  - Create broker endpoint for receiving advertisements
  - Handle capability expiration (TTL-based)
  - Add capability withdrawal on agent disconnect

### Enhanced Trust Signals
- **Goal**: Expand trust scoring beyond basic reputation
- **Features**:
  - Historical performance tracking
  - SLA compliance metrics
  - Agent specialization scoring
  - Community feedback integration

## Phase 0.4 - Horizontal Scaling (Planned)
- Multi-broker federation
- Gossip-based discovery synchronization
- Distributed trust consensus
- Geographic routing optimization

## Phase 0.5 - Advanced Features (Planned)
- Capability composition (multi-agent workflows)
- Transaction rollback protocols
- Economic incentive layer
- Privacy-preserving discovery (ZKPs)

## Phase 1.0 - Stable Release
- Full backward compatibility guarantees
- Comprehensive documentation
- Reference implementations in 3+ languages
- Industry adoption case studies

---

**Note**: This roadmap is subject to change based on community feedback and implementation discoveries. Phases 0.3+ are aspirational and may be reprioritized.
