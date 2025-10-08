# Database Migrations

This directory contains SQL migrations for the AINP database schema.

## Migration Order

Migrations should be applied in numerical order:

1. **001_add_agent_registration_fields.sql** - Agent registration fields
2. **002_add_trust_scores.sql** - Trust scoring system
3. **004_add_negotiation_sessions.sql** - Multi-round negotiation protocol (Phase 4.1)
4. **006_add_usefulness_proofs.sql** - Web4 POU-lite usefulness proofs
5. **007_add_usefulness_to_agents.sql** - Agent usefulness cache
6. **009_add_credit_ledger.sql** - Credit system ledger (Phase 3)
7. **008_rollback_usefulness.sql** - Rollback script (emergency only)
8. **010_rollback_credit_ledger.sql** - Rollback credit system (emergency only)
9. **011_rollback_negotiation_sessions.sql** - Rollback negotiations (emergency only)

## Migration Details

### Migration 001: Agent Registration Fields
- Adds registration fields to agents table
- Supports agent discovery and capability advertising

### Migration 002: Trust Scores
- Adds trust scoring system
- Enables reputation-based agent selection

### Migration 004: Negotiation Sessions (Phase 4.1)
- Adds `negotiations` table for multi-round negotiation protocol
- Tracks negotiation state machine (initiated → proposed → accepted/rejected/expired)
- Stores negotiation rounds, proposals, and convergence scores
- Economic terms tracking (incentive splits)
- Expiration management with auto-cleanup function
- 6 optimized indexes for performance
- Trigger for auto-updating timestamps

### Migration 006: Usefulness Proofs (Web4 POU-lite)
- Adds `usefulness_proofs` table for tracking productive agent work
- Supports compute, memory, routing, validation, learning work types
- JSONB metrics for flexible data storage
- Foreign key to agents table
- Optimized indexes for common query patterns

### Migration 007: Agent Usefulness Cache
- Adds `usefulness_score_cached` to agents table (30-day rolling average)
- Adds `usefulness_last_updated` timestamp
- Creates composite index for discovery ranking
- Enables fast agent leaderboard queries

### Migration 009: Credit Ledger (Phase 3)
- Adds `credit_accounts` table for agent balance tracking
- Adds `credit_transactions` table for transaction history
- Supports deposit, earn, reserve, release, spend operations
- POU-based earnings tracking
- Optimized indexes for balance queries

### Migration 008: Rollback Usefulness (Emergency)
- Drops all Web4 POU-lite schema additions
- Use only if rolling back to Phase 0.2
- Provides clean rollback path

### Migration 010: Rollback Credit Ledger (Emergency)
- Drops credit system tables
- Clean rollback for Phase 3 credit system
- Safe to run multiple times (idempotent)

### Migration 011: Rollback Negotiation Sessions (Emergency)
- Drops negotiations table and related functions
- Clean rollback for Phase 4.1 negotiation protocol
- Safe to run multiple times (idempotent)

## Running Migrations

### Manual Application

```bash
# Apply forward migrations (in order)
psql $DATABASE_URL -f 001_add_agent_registration_fields.sql
psql $DATABASE_URL -f 002_add_trust_scores.sql
psql $DATABASE_URL -f 004_add_negotiation_sessions.sql
psql $DATABASE_URL -f 006_add_usefulness_proofs.sql
psql $DATABASE_URL -f 007_add_usefulness_to_agents.sql
psql $DATABASE_URL -f 009_add_credit_ledger.sql

# Verify migrations
psql $DATABASE_URL -f verify_negotiation_sessions.sql
psql $DATABASE_URL -f verify_usefulness.sql
psql $DATABASE_URL -f verify_credit_ledger.sql

# Rollback (emergency only, reverse order)
psql $DATABASE_URL -f 011_rollback_negotiation_sessions.sql
psql $DATABASE_URL -f 010_rollback_credit_ledger.sql
psql $DATABASE_URL -f 008_rollback_usefulness.sql
```

### Automated Migration (via db-client)

```typescript
import { DatabaseClient } from '@ainp/db';

const db = new DatabaseClient();
await db.connect();
await db.runMigrations(); // Runs all pending migrations
```

## Schema Documentation

### negotiations Table (Phase 4.1)

Stores multi-round negotiation sessions between agents before accepting work.

**Columns:**
- `id` (UUID, PK) - Unique negotiation session identifier
- `intent_id` (UUID) - Related intent request
- `initiator_did` (TEXT) - Agent DID who initiated negotiation (requester)
- `responder_did` (TEXT) - Agent DID who is responding (provider)
- `state` (TEXT) - Current state: initiated, proposed, counter_proposed, accepted, rejected, expired
- `rounds` (JSONB) - Array of negotiation rounds with proposals
- `convergence_score` (NUMERIC) - Convergence metric (0-1), measures proximity to agreement
- `current_proposal` (JSONB) - Latest proposal under consideration
- `final_proposal` (JSONB) - Accepted proposal when state = accepted
- `incentive_split` (JSONB) - Economic terms (default: 70% agent, 10% broker, 10% validator, 10% pool)
- `max_rounds` (INTEGER) - Maximum negotiation rounds allowed (default: 10, range: 1-20)
- `created_at` (TIMESTAMPTZ) - Negotiation start timestamp
- `expires_at` (TIMESTAMPTZ) - Negotiation expiration timestamp (hard deadline)
- `updated_at` (TIMESTAMPTZ) - Last modification timestamp (auto-updated via trigger)

**Indexes:**
- `idx_negotiations_intent` - Intent lookups (find all negotiations for an intent)
- `idx_negotiations_initiator` - Agent history (DESC order for recent-first)
- `idx_negotiations_responder` - Agent history (DESC order for recent-first)
- `idx_negotiations_state` - State filtering (find active/pending negotiations)
- `idx_negotiations_expires` - Expiration cleanup (partial index, non-terminal states only)
- `idx_negotiations_convergence` - Convergence analysis (DESC order, non-terminal states)

**Functions:**
- `update_negotiations_timestamp()` - Trigger function to auto-update updated_at
- `expire_stale_negotiations()` - Marks expired negotiations (returns count)

**Constraints:**
- `negotiation_participants_different` - Ensures initiator != responder
- State CHECK constraint - Only allows valid states
- Convergence score CHECK constraint - Must be 0.0-1.0
- Max rounds CHECK constraint - Must be 1-20

### usefulness_proofs Table

Stores proof of useful work for economic incentives.

**Columns:**
- `id` (UUID, PK) - Unique proof identifier
- `intent_id` (UUID) - Related intent request
- `agent_did` (TEXT, FK) - Agent DID (foreign key to agents.did)
- `work_type` (TEXT) - Type of work: compute, memory, routing, validation, learning
- `metrics` (JSONB) - Flexible work metrics storage
- `attestations` (TEXT[]) - Verifiable credentials (optional)
- `trace_id` (TEXT) - Traceability identifier
- `usefulness_score` (NUMERIC) - Calculated score (0-100)
- `created_at` (TIMESTAMPTZ) - Creation timestamp

**Indexes:**
- `idx_usefulness_agent` - Agent + timestamp (for agent history)
- `idx_usefulness_intent` - Intent lookups
- `idx_usefulness_work_type` - Work type filtering
- `idx_usefulness_score` - Score-based ranking
- `idx_usefulness_trace` - Trace lookups
- `idx_usefulness_agent_score` - Agent leaderboard (composite)
- `idx_usefulness_metrics` - JSONB metrics queries (GIN)

### agents Table Additions

**New Columns:**
- `usefulness_score_cached` (NUMERIC) - 30-day rolling average usefulness score
- `usefulness_last_updated` (TIMESTAMPTZ) - Last cache update timestamp

**New Indexes:**
- `idx_agents_usefulness` - Discovery ranking (usefulness + trust)

## Performance Considerations

- **GIN Index on JSONB**: Enables fast queries on metrics fields
- **Composite Indexes**: Optimized for common query patterns (agent leaderboard, discovery)
- **Foreign Key**: Ensures referential integrity (cascade delete)
- **CHECK Constraints**: Prevents invalid data at database level

## Rollback Strategy

If issues arise after migration, rollback in **reverse order** (newest to oldest):

### Negotiations (Phase 4.1)
1. Apply rollback migration: `psql $DATABASE_URL -f 011_rollback_negotiation_sessions.sql`
2. Restart services to clear cached schema
3. Verify schema with: `psql $DATABASE_URL -c "\d negotiations"` (should return "did not find")

### Credit Ledger (Phase 3)
1. Apply rollback migration: `psql $DATABASE_URL -f 010_rollback_credit_ledger.sql`
2. Restart services
3. Verify schema with: `psql $DATABASE_URL -c "\d credit_accounts"` (should return "did not find")

### Usefulness Proofs (Web4 POU-lite)
1. Apply rollback migration: `psql $DATABASE_URL -f 008_rollback_usefulness.sql`
2. Restart services to clear cached schema
3. Verify schema with: `psql $DATABASE_URL -c "\d usefulness_proofs"` (should return "did not find")

## Testing

### Automated Verification

Run SQL verification scripts (recommended):

```bash
# Verify negotiation sessions (Phase 4.1)
psql $DATABASE_URL -f packages/db/migrations/verify_negotiation_sessions.sql
# Expected: All 14 tests should show ✅ PASS

# Verify usefulness proofs (Web4 POU-lite)
psql $DATABASE_URL -f packages/db/migrations/verify_usefulness.sql
# Expected: All 10 tests should show ✅ PASS

# Verify credit ledger (Phase 3)
psql $DATABASE_URL -f packages/db/migrations/verify_credit_ledger.sql
# Expected: All tests should show ✅ PASS
```

### Unit Tests

Run TypeScript migration tests:

```bash
npm test -- usefulness-migration.test.ts
```

Note: May require fixing multiformats import in test environment

## Notes

- All migrations use `IF NOT EXISTS` / `IF EXISTS` for idempotency
- Rollback script is safe to run multiple times
- Foreign key uses `ON DELETE CASCADE` to maintain data integrity
- JSONB metrics allow flexible schema evolution without migrations
