#!/bin/bash
set -e

# Direct PoU test: Create receipt in DB → submit attestations → verify finalization
BASE_URL="http://localhost:8080"
AGENT_DID="did:key:z6Mk6a2200b0dca0e84e00affae62981db7f"
CLIENT_DID="did:key:z6Mk7b63b9f818ddb7725a00806b234b5cab"

echo "🧪 Direct PoU Flow Test (Database → API)"
echo "=========================================="
echo ""

# Step 1: Create receipt directly in database
echo "📝 Step 1: Creating task receipt in database..."
TASK_ID=$(psql "postgresql://ainp:ainp@localhost:5432/ainp" -t -c "
INSERT INTO task_receipts (
  agent_did,
  client_did,
  intent_type,
  metrics,
  amount_atomic,
  status,
  k,
  m
) VALUES (
  '$AGENT_DID',
  '$CLIENT_DID',
  'compute-task',
  '{\"compute_ms\": 5000}'::jsonb,
  1000,
  'pending',
  3,
  5
)
RETURNING id;
" | tr -d ' ')

echo "✅ Receipt created: $TASK_ID"
echo ""

# Step 2: Get receipt via API
echo "📝 Step 2: Fetching receipt via API..."
RECEIPT=$(curl -s "$BASE_URL/api/receipts/$TASK_ID")
echo "$RECEIPT" | jq '{id, status, agent_did, client_did, k, m}'
echo ""

# Step 3: Get committee
echo "📝 Step 3: Getting committee members..."
COMMITTEE=$(curl -s "$BASE_URL/api/receipts/$TASK_ID/committee")
COMMITTEE_COUNT=$(echo "$COMMITTEE" | jq -r '.committee | length')
echo "✅ Committee size: $COMMITTEE_COUNT"
COMMITTEE_MEMBERS=$(echo "$COMMITTEE" | jq -r '.committee[]')
echo "Committee members:"
echo "$COMMITTEE_MEMBERS" | head -5
echo ""

# Step 4: Submit client attestation (ACCEPTED)
echo "📝 Step 4: Submitting client attestation..."
curl -s -X POST "$BASE_URL/api/receipts/$TASK_ID/attestations" \
  -H "Content-Type: application/json" \
  -H "X-AINP-DID: $CLIENT_DID" \
  -d '{
    "type": "ACCEPTED",
    "score": 0.95,
    "confidence": 0.98
  }' | jq
echo "✅ Client attestation submitted"
echo ""

# Step 5: Submit committee attestations
echo "📝 Step 5: Submitting committee attestations (need k=3)..."
K=$(echo "$RECEIPT" | jq -r '.k // 3')
COMMITTEE_ARRAY=($COMMITTEE_MEMBERS)

for i in $(seq 0 $((K-1))); do
  MEMBER_DID="${COMMITTEE_ARRAY[$i]}"
  if [ -z "$MEMBER_DID" ]; then
    echo "⚠️  Not enough committee members (need $K, have $i)"
    break
  fi

  echo "  Attestation $((i+1))/$K from: ${MEMBER_DID:0:40}..."

  RESULT=$(curl -s -X POST "$BASE_URL/api/receipts/$TASK_ID/attestations" \
    -H "Content-Type: application/json" \
    -H "X-AINP-DID: $MEMBER_DID" \
    -d '{
      "type": "AUDIT_PASS",
      "score": 0.90,
      "confidence": 0.95
    }')

  if echo "$RESULT" | jq -e '.ok' > /dev/null 2>&1; then
    echo "    ✅ Submitted"
  else
    echo "    ⚠️  Response: $RESULT"
  fi
done
echo ""

# Step 6: Check attestation count
echo "📝 Step 6: Verifying attestations..."
UPDATED=$(curl -s "$BASE_URL/api/receipts/$TASK_ID")
ATTEST_COUNT=$(echo "$UPDATED" | jq '.attestations | length')
ATTEST_TYPES=$(echo "$UPDATED" | jq -r '[.attestations[].type] | unique | join(", ")')
echo "  Total attestations: $ATTEST_COUNT"
echo "  Types: $ATTEST_TYPES"
echo ""

# Step 7: Wait for automatic finalization
echo "📝 Step 7: Waiting for automatic finalization (PoU Finalizer cron runs every minute)..."
for i in {1..12}; do
  sleep 5
  STATUS=$(curl -s "$BASE_URL/api/receipts/$TASK_ID" | jq -r '.status')
  echo "  Check $i (${i}x5s): status=$STATUS"

  if [ "$STATUS" = "finalized" ]; then
    echo "✅ Receipt automatically finalized by cron!"
    break
  fi

  if [ $i -eq 12 ]; then
    echo "⚠️  Still pending after 60 seconds. Trying manual finalization..."
    MANUAL=$(curl -s -X POST "$BASE_URL/api/receipts/$TASK_ID/finalize")
    echo "$MANUAL" | jq
  fi
done
echo ""

# Step 8: Final state
echo "📝 Step 8: Final receipt state..."
FINAL=$(curl -s "$BASE_URL/api/receipts/$TASK_ID")
echo "$FINAL" | jq '{
  id,
  status,
  finalized_at,
  attestations: (.attestations | length),
  types: [.attestations[].type] | unique
}'
echo ""

# Step 9: Check reputation
echo "📝 Step 9: Checking agent reputation..."
REP=$(curl -s "$BASE_URL/api/reputation/$AGENT_DID")
if echo "$REP" | jq -e '.q' > /dev/null 2>&1; then
  echo "$REP" | jq '{
    quality: .q,
    timeliness: .t,
    reliability: .r,
    updated_at
  }'
else
  echo "⚠️  Reputation response: $REP"
fi
echo ""

echo "🎉 Direct PoU Test Complete!"
echo "============================"
echo "Receipt ID: $TASK_ID"
echo "Final Status: $(echo "$FINAL" | jq -r '.status')"
echo "Attestations: $ATTEST_COUNT"
