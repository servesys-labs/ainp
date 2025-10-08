# AINP Scripts

This directory contains utility scripts for the AINP monorepo.

## Available Scripts

### generate-test-keypairs.ts

Generates Ed25519 keypairs in DID:key format for the test suite.

**Usage:**
```bash
npx tsx scripts/generate-test-keypairs.ts
```

**Output:**
- Creates `tests/fixtures/test-keypairs.json` with 5 test keypairs
- Each keypair includes:
  - `role`: Test role identifier (e.g., 'test-caller', 'test-calendar-agent')
  - `did`: DID:key identifier (e.g., 'did:key:z6Mk...')
  - `privateKey`: Hex-encoded Ed25519 private key (32 bytes)
  - `publicKey`: Hex-encoded Ed25519 public key (32 bytes)

**Test Roles:**
- `test-caller` - For intent caller tests
- `test-calendar-agent` - For calendar agent tests
- `test-email-agent` - For email agent tests
- `test-payment-agent` - For payment agent tests
- `test-validator` - For signature validation tests

**Dependencies:**
- `@noble/ed25519` - Ed25519 signing/verification
- `multiformats` - DID:key encoding (base58btc)

**See Also:**
- `tests/helpers/crypto-helpers.ts` - Helper functions to use test keypairs in tests
- RFC 001-SPEC Section 6 - AINP cryptographic operations specification

---

## Deployment Scripts

### deploy-railway.sh

**Purpose**: Automated deployment to Railway with validation and smoke testing.

**Prerequisites**:
- Railway CLI installed: `npm i -g @railway/cli`
- Railway authentication: `railway login`
- Clean git status (or confirmation to proceed)

**What it does**:
1. Validates Railway CLI installation and authentication
2. Checks git status for uncommitted changes
3. Runs pre-deployment checks (lint, typecheck, build, tests)
4. Deploys to Railway (`railway up`)
5. Waits for deployment to stabilize (30 seconds)
6. Verifies health endpoint (with 3 retries)
7. Runs smoke tests automatically

**Usage**:
```bash
bash scripts/deploy-railway.sh
```

**Exit Codes**:
- `0`: Deployment successful
- `1`: Deployment failed (see error message)

---

### smoke-test.sh

**Purpose**: End-to-end smoke test suite to verify deployment health.

**Prerequisites**:
- Target deployment running (Railway or localhost)
- Optional: `jq` for better JSON parsing (`brew install jq`)

**What it tests**:
1. Health endpoint (PostgreSQL, Redis, NATS connectivity)
2. Agent registration endpoint
3. Intent submission endpoint
4. Agent discovery endpoint

**Usage**:
```bash
# Test against Railway deployment (auto-detected)
bash scripts/smoke-test.sh

# Test against specific URL
RAILWAY_URL="https://ainp.railway.app" bash scripts/smoke-test.sh

# Test against localhost
RAILWAY_URL="http://localhost:8080" bash scripts/smoke-test.sh
```

**Exit Codes**:
- `0`: All tests passed
- `1`: Some tests failed

**Example Output**:
```
🧪 AINP Smoke Test Suite
========================
Testing against: https://ainp-production.railway.app

1️⃣  Testing health endpoint...
   ✅ PostgreSQL: healthy
   ✅ Redis: healthy
   ✅ NATS: healthy
✅ Health check passed

2️⃣  Testing agent registration...
✅ Agent registration passed

3️⃣  Testing intent submission...
✅ Intent submission passed

4️⃣  Testing agent discovery...
✅ Agent discovery passed

========================
Smoke Test Summary
========================
   Tests Passed:  4
   Tests Failed:  0
   Tests Skipped: 0

✅ All tests passed
```

---

## Development Workflow

**Recommended deployment workflow**:
1. Make changes to broker code
2. Test locally: `pnpm test`
3. Commit changes: `git add . && git commit -m "..."`
4. Deploy: `bash scripts/deploy-railway.sh`
5. Monitor: `railway logs --follow`

The deployment script automatically runs all quality checks, deploys, verifies health, and runs smoke tests.

---

## CI/CD Integration

These scripts can be integrated into GitHub Actions:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Railway
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: bash scripts/deploy-railway.sh
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```
