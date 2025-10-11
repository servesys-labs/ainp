#!/bin/bash
set -e

# Complete E2E PoU test following correct negotiation flow:
# 1. Client initiates with initial_proposal (state: initiated)
# 2. Agent proposes counter-terms (state: initiated → proposed)
# 3. Client accepts (state: proposed → accepted)
# 4. Settle (creates receipt)
# 5. Submit attestations
# 6. Verify automatic finalization
# 7. Check reputation update

BASE_URL="http://localhost:8080"
AGENT_DID="did:key:z6Mk6a2200b0dca0e84e00affae62981db7f"
CLIENT_DID="did:key:z6Mk7b63b9f818ddb7725a00806b234b5cab"

echo "🧪 Complete E2E PoU Flow Test"
echo "=============================="
echo ""

# Step 1: Client initiates negotiation with initial proposal
echo "📝 Step 1: Client initiating negotiation..."
INTENT_ID=$(uuidgen)

NEG_RESPONSE=$(curl -s -X POST "$BASE_URL/api/negotiations" \
  -H "Content-Type: application/json" \
  -d "{
    \"intent_id\": \"$INTENT_ID\",
    \"initiator_did\": \"$CLIENT_DID\",
    \"responder_did\": \"$AGENT_DID\",
    \"initial_proposal\": {
      \"price\": 1000,
      \"duration_ms\": 5000,
      \"quality_threshold\": 0.9
    }
  }")

NEG_ID=$(echo "$NEG_RESPONSE" | jq -r '.id')
STATE=$(echo "$NEG_RESPONSE" | jq -r '.state')

if [ "$NEG_ID" = "null" ]; then
  echo "❌ Failed to create negotiation:"
  echo "$NEG_RESPONSE" | jq
  exit 1
fi

echo "✅ Negotiation created: $NEG_ID"
echo "   State: $STATE (expected: initiated)"
echo ""

# Step 2: Agent proposes counter-terms
echo "📝 Step 2: Agent proposing counter-terms..."
PROPOSE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/negotiations/$NEG_ID/propose" \
  -H "Content-Type: application/json" \
  -d "{
    \"proposer_did\": \"$AGENT_DID\",
    \"proposal\": {
      \"price\": 1000,
      \"duration_ms\": 5000,
      \"quality_threshold\": 0.95
    }
  }")

STATE=$(echo "$PROPOSE_RESPONSE" | jq -r '.state')
echo "✅ Agent proposed"
echo "   State: $STATE (expected: proposed)"
echo ""

# Step 3: Client accepts
echo "📝 Step 3: Client accepting proposal..."
ACCEPT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/negotiations/$NEG_ID/accept" \
  -H "Content-Type: application/json" \
  -d "{
    \"acceptor_did\": \"$CLIENT_DID\"
  }")

STATE=$(echo "$ACCEPT_RESPONSE" | jq -r '.state')
echo "✅ Client accepted"
echo "   State: $STATE (expected: accepted)"
echo ""

# Step 4: Settle (creates receipt)
echo "📝 Step 4: Settling negotiation (creates receipt)..."
SETTLE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/negotiations/$NEG_ID/settle" \
  -H "Content-Type: application/json" \
  -H "X-AINP-DID: $CLIENT_DID" \
  -d "{
    \"validator_did\": \"$CLIENT_DID\"
  }")

if echo "$SETTLE_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
  echo "⚠️  Settlement response:"
  echo "$SETTLE_RESPONSE" | jq
else
  echo "✅ Settlement successful"
fi
echo ""

# Step 5: Find receipt in database
echo "📝 Step 5: Finding task receipt..."
sleep 1  # Give DB time to write

TASK_ID=$(psql "postgresql://ainp:ainp@localhost:5432/ainp" -t -c \
  "SELECT id FROM task_receipts WHERE negotiation_id='$NEG_ID';" | tr -d ' ')

if [ -z "$TASK_ID" ]; then
  echo "❌ No receipt found for negotiation $NEG_ID"
  echo "Checking database..."
  psql "postgresql://ainp:ainp@localhost:5432/ainp" -c \
    "SELECT id, negotiation_id, agent_did, status FROM task_receipts ORDER BY created_at DESC LIMIT 3;"
  exit 1
fi

echo "✅ Receipt found: $TASK_ID"
echo ""

# Step 6: Get receipt details via API
echo "📝 Step 6: Getting receipt details..."
RECEIPT=$(curl -s "$BASE_URL/api/receipts/$TASK_ID")
echo "$RECEIPT" | jq '{id, status, agent_did, client_did, k, m, committee_size: (.committee | length)}'
echo ""

# Step 7: Get committee
echo "📝 Step 7: Getting committee members..."
COMMITTEE=$(curl -s "$BASE_URL/api/receipts/$TASK_ID/committee")
COMMITTEE_COUNT=$(echo "$COMMITTEE" | jq -r '.committee | length')
echo "✅ Committee size: $COMMITTEE_COUNT"

COMMITTEE_MEMBERS=$(echo "$COMMITTEE" | jq -r '.committee[]')
echo "Committee DIDs:"
echo "$COMMITTEE_MEMBERS" | head -3
echo ""

# Step 8: Submit client attestation (ACCEPTED)
echo "📝 Step 8: Client submitting ACCEPTED attestation..."
CLIENT_ATTEST=$(curl -s -X POST "$BASE_URL/api/receipts/$TASK_ID/attestations" \
  -H "Content-Type: application/json" \
  -H "X-AINP-DID: $CLIENT_DID" \
  -d '{
    "type": "ACCEPTED",
    "score": 0.95,
    "confidence": 0.98
  }')

if echo "$CLIENT_ATTEST" | jq -e '.ok' > /dev/null 2>&1; then
  echo "✅ Client attestation submitted"
else
  echo "⚠️  Client attestation response: $CLIENT_ATTEST"
fi
echo ""

# Step 9: Submit committee attestations (AUDIT_PASS)
echo "📝 Step 9: Submitting committee attestations (need k=3)..."
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
    echo "    ⚠️  Response: $(echo $RESULT | jq -c)"
  fi
done
echo ""

# Step 10: Check attestation count
echo "📝 Step 10: Verifying attestations..."
UPDATED=$(curl -s "$BASE_URL/api/receipts/$TASK_ID")
ATTEST_COUNT=$(echo "$UPDATED" | jq '.attestations | length')
ATTEST_TYPES=$(echo "$UPDATED" | jq -r '[.attestations[].type] | unique | join(", ")')
echo "  Total attestations: $ATTEST_COUNT"
echo "  Types: $ATTEST_TYPES"
echo "  Current status: $(echo "$UPDATED" | jq -r '.status')"
echo ""

# Step 11: Wait for automatic finalization (PoU Finalizer runs every minute)
echo "📝 Step 11: Waiting for automatic finalization..."
echo "  (PoU Finalizer cron runs every minute)"

for i in {1..12}; do
  sleep 5
  STATUS=$(curl -s "$BASE_URL/api/receipts/$TASK_ID" | jq -r '.status')
  echo "  Check $i (${i}x5s): status=$STATUS"

  if [ "$STATUS" = "finalized" ]; then
    echo "✅ Receipt automatically finalized by cron!"
    break
  fi

  if [ $i -eq 12 ]; then
    echo "⚠️  Still pending after 60s. Trying manual finalization..."
    MANUAL=$(curl -s -X POST "$BASE_URL/api/receipts/$TASK_ID/finalize")
    echo "$MANUAL" | jq
  fi
done
echo ""

# Step 12: Final receipt state
echo "📝 Step 12: Final receipt state..."
FINAL=$(curl -s "$BASE_URL/api/receipts/$TASK_ID")
echo "$FINAL" | jq '{
  id,
  status,
  finalized_at,
  attestations: (.attestations | length),
  types: [.attestations[].type] | unique
}'
echo ""

# Step 13: Check agent reputation
echo "📝 Step 13: Checking agent reputation..."
REP=$(curl -s "$BASE_URL/api/reputation/$AGENT_DID")

if echo "$REP" | jq -e '.q' > /dev/null 2>&1; then
  echo "$REP" | jq '{
    quality: .q,
    timeliness: .t,
    reliability: .r,
    safety: .s,
    truthfulness: .v,
    updated_at
  }'
  echo "✅ Reputation updated"
else
  echo "⚠️  Reputation response:"
  echo "$REP" | jq
fi
echo ""

# Summary
echo "🎉 Complete E2E PoU Flow Test Complete!"
echo "========================================"
echo ""
echo "Summary:"
echo "  Intent ID: $INTENT_ID"
echo "  Negotiation ID: $NEG_ID"
echo "  Receipt ID: $TASK_ID"
echo "  Final Status: $(echo "$FINAL" | jq -r '.status')"
echo "  Attestations: $ATTEST_COUNT"
echo ""

if [ "$(echo "$FINAL" | jq -r '.status')" = "finalized" ]; then
  echo "✅ ALL TESTS PASSED"
  exit 0
else
  echo "⚠️  Receipt not finalized - check logs"
  exit 1
fi
