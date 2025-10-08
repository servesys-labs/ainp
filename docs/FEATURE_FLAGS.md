# Feature Flags

This document describes all feature flags available in AINP.

## Phase 0: Foundation

### Signature Verification
- **SIGNATURE_VERIFICATION_ENABLED** (default: `true`)
  - Enable Ed25519 signature verification for intent envelopes
  - When disabled, signatures are NOT verified (NOT recommended for production)

### Web4 POU Discovery Ranking
- **WEB4_POU_DISCOVERY_ENABLED** (default: `false`)
  - Enable usefulness-weighted discovery ranking
  - Requires usefulness_score_cached to be populated
  - Enable after aggregation service is working

### Discovery Ranking Weights
- **DISCOVERY_SIMILARITY_WEIGHT** (default: `0.6`)
- **DISCOVERY_TRUST_WEIGHT** (default: `0.3`)
- **DISCOVERY_USEFULNESS_WEIGHT** (default: `0.1`)
  - Discovery ranking formula weights (must sum to 1.0)
  - Only used when WEB4_POU_DISCOVERY_ENABLED=true

## Phase 3: Credit System + Usefulness Aggregation

### Credit Ledger
- **CREDIT_LEDGER_ENABLED** (default: `true`)
  - Enable PostgreSQL credit ledger for agent accounts
  - When disabled, agent registration skips credit account creation
  - Recommended: keep enabled for production

- **INITIAL_CREDITS** (default: `1000000`)
  - Initial credit balance for new agents in atomic units
  - 1 credit = 1000 atomic units
  - Default: 1,000,000 atomic units = 1000 credits
  - Can be configured per deployment

### Usefulness Aggregation
- **USEFULNESS_AGGREGATION_ENABLED** (default: `true`)
  - Enable periodic usefulness score aggregation
  - When disabled, cron job does not run
  - Recommended: keep enabled for production

- **USEFULNESS_AGGREGATION_INTERVAL_HOURS** (default: `1`)
  - Aggregation frequency in hours
  - Recommended values: 1 (hourly), 6, or 24
  - Lower values = more up-to-date scores but higher DB load

## Monitoring & Observability

### Monitoring
- **ENABLE_MONITORING** (default: `true`)
  - Enable Prometheus metrics collection
  - Recommended: keep enabled for production

- **ENABLE_TRACING** (default: `false`)
  - Enable distributed tracing
  - Optional: can be enabled for debugging

## Development & Testing

### Environment
- **NODE_ENV** (default: `development`)
  - Set to `production` for production deployments
  - Set to `test` for running test suites

### Logging
- **LOG_LEVEL** (default: `debug`)
  - Options: `debug`, `info`, `warn`, `error`
  - Recommended: `info` for production, `debug` for development

## Rate Limiting

### Rate Limits
- **RATE_LIMIT_INTENTS_PER_MIN** (default: `100`)
  - Maximum intents per minute per DID
  - Adjust based on expected load

- **RATE_LIMIT_BURST** (default: `200`)
  - Maximum burst capacity
  - Should be >= RATE_LIMIT_INTENTS_PER_MIN

## Vector Search

### Vector Search Parameters
- **VECTOR_SIMILARITY_THRESHOLD** (default: `0.7`)
  - Minimum cosine similarity for semantic matching
  - Range: 0.0 to 1.0
  - Higher = more strict matching

- **VECTOR_SEARCH_LIMIT** (default: `10`)
  - Maximum number of results returned
  - Adjust based on use case

## Testing Flags

When running tests, these flags are automatically configured:

```bash
# Test environment
NODE_ENV=test
SIGNATURE_VERIFICATION_ENABLED=true
CREDIT_LEDGER_ENABLED=true
USEFULNESS_AGGREGATION_ENABLED=false  # Disabled in tests (use manual aggregation)
WEB4_POU_DISCOVERY_ENABLED=false      # Disabled in tests (not yet fully tested)
```

## Migration Guide

### Enabling Credit Ledger (Phase 3A)

1. Ensure PostgreSQL schema is up-to-date: `pnpm run db:migrate`
2. Set `CREDIT_LEDGER_ENABLED=true` in `.env`
3. Optionally configure `INITIAL_CREDITS` (default: 1000000)
4. Restart broker service

### Enabling Usefulness Aggregation (Phase 3B)

1. Set `USEFULNESS_AGGREGATION_ENABLED=true` in `.env`
2. Configure `USEFULNESS_AGGREGATION_INTERVAL_HOURS` (default: 1)
3. Restart broker service
4. Verify aggregation job starts: check logs for `[UsefulnessAggregator]`

### Enabling POU Discovery Ranking (Phase 3B+)

1. Ensure usefulness aggregation is running and populated
2. Set `WEB4_POU_DISCOVERY_ENABLED=true` in `.env`
3. Optionally adjust weights (must sum to 1.0):
   - `DISCOVERY_SIMILARITY_WEIGHT=0.6`
   - `DISCOVERY_TRUST_WEIGHT=0.3`
   - `DISCOVERY_USEFULNESS_WEIGHT=0.1`
4. Restart broker service
5. Verify discovery ranking includes usefulness scores

## Troubleshooting

### Credit accounts not being created

- Check `CREDIT_LEDGER_ENABLED=true` in `.env`
- Verify PostgreSQL schema has `credit_accounts` and `credit_transactions` tables
- Check logs for `[Credits]` errors during agent registration

### Usefulness aggregation not running

- Check `USEFULNESS_AGGREGATION_ENABLED=true` in `.env`
- Verify cron job started: look for `[UsefulnessAggregator] Cron job started` in logs
- Check aggregation interval: `USEFULNESS_AGGREGATION_INTERVAL_HOURS`

### Discovery ranking not using usefulness scores

- Check `WEB4_POU_DISCOVERY_ENABLED=true` in `.env`
- Verify `usefulness_score_cached` column is populated: `SELECT COUNT(*) FROM agents WHERE usefulness_score_cached IS NOT NULL;`
- Ensure aggregation job has run at least once
- Check weight sum = 1.0: `SIMILARITY + TRUST + USEFULNESS = 1.0`
