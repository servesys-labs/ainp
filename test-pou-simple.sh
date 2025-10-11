#!/bin/bash
set -e

# Simplified PoU flow test
BASE_URL="http://localhost:8080"

# Use existing agent DIDs
AGENT_DID="did:key:z6Mk6a2200b0dca0e84e00affae62981db7f"
CLIENT_DID="did:key:z6Mk7b63b9f818ddb7725a00806b234b5cab"

echo "🧪 Simplified PoU Flow Test"
echo "=============================="
echo ""

# Step 1: Create negotiation with initial proposal
echo "📝 Step 1: Creating negotiation..."
INTENT_ID=$(uuidgen)

NEG_RESPONSE=$(curl -s -X POST "$BASE_URL/api/negotiations" \
  -H "Content-Type: application/json" \
  -d "{
    \"intent_id\": \"$INTENT_ID\",
    \"initiator_did\": \"$CLIENT_DID\",
    \"responder_did\": \"$AGENT_DID\",
    \"initial_proposal\": {
      \"price\": 1000,
      \"duration_ms\": 5000
    }
  }")

NEG_ID=$(echo "$NEG_RESPONSE" | jq -r '.id')

if [ "$NEG_ID" = "null" ] || [ -z "$NEG_ID" ]; then
  echo "❌ Failed to create negotiation:"
  echo "$NEG_RESPONSE" | jq
  exit 1
fi

echo "✅ Negotiation created: $NEG_ID"
echo ""

# Step 2: Agent accepts (or we accept as client)
echo "📝 Step 2: Accepting negotiation..."
ACCEPT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/negotiations/$NEG_ID/accept" \
  -H "Content-Type: application/json" \
  -d "{
    \"acceptor_did\": \"$AGENT_DID\"
  }")

STATE=$(echo "$ACCEPT_RESPONSE" | jq -r '.state')
echo "✅ State after accept: $STATE"
echo ""

# Step 3: Settle (creates receipt)
echo "📝 Step 3: Settling negotiation..."
SETTLE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/negotiations/$NEG_ID/settle" -H "X-AINP-DID: $CLIENT_DID" \
  -H "Content-Type: application/json" \
  -d '{}')

echo "Settlement response:"
echo "$SETTLE_RESPONSE" | jq

# Get task receipt ID from database
echo ""
echo "📝 Step 4: Finding task receipt in database..."
TASK_ID=$(psql "postgresql://ainp:ainp@localhost:5432/ainp" -t -c \
  "SELECT id FROM task_receipts WHERE negotiation_id='$NEG_ID';" | tr -d ' ')

if [ -z "$TASK_ID" ]; then
  echo "❌ No receipt found for negotiation $NEG_ID"
  echo "Checking all recent receipts..."
  psql "postgresql://ainp:ainp@localhost:5432/ainp" -c \
    "SELECT id, negotiation_id, agent_did, status, created_at FROM task_receipts ORDER BY created_at DESC LIMIT 3;"
  exit 1
fi

echo "✅ Receipt found: $TASK_ID"
echo ""

# Step 5: Get receipt via API
echo "📝 Step 5: Getting receipt details..."
RECEIPT=$(curl -s "$BASE_URL/api/receipts/$TASK_ID")
echo "$RECEIPT" | jq '{id, status, agent_did, client_did, k, m, committee_size: (.committee | length)}'
echo ""

# Step 6: Get committee
echo "📝 Step 6: Getting committee..."
COMMITTEE=$(curl -s "$BASE_URL/api/receipts/$TASK_ID/committee")
echo "$COMMITTEE" | jq '{ committee_count: (.committee | length), committee: .committee[0:3] }'
COMMITTEE_MEMBERS=$(echo "$COMMITTEE" | jq -r '.committee[]')
echo ""

# Step 7: Submit client attestation
echo "📝 Step 7: Submitting client attestation (ACCEPTED)..."
ATTEST1=$(curl -s -X POST "$BASE_URL/api/receipts/$TASK_ID/attestations" \
  -H "Content-Type: application/json" \
  -H "X-AINP-DID: $CLIENT_DID" \
  -d '{
    "type": "ACCEPTED",
    "score": 0.95,
    "confidence": 0.98
  }')

echo "$ATTEST1" | jq
echo ""

# Step 8: Submit committee attestations
echo "📝 Step 8: Submitting committee attestations..."
K=$(echo "$RECEIPT" | jq -r '.k // 3')
COMMITTEE_ARRAY=($COMMITTEE_MEMBERS)

for i in $(seq 0 $((K-1))); do
  MEMBER_DID="${COMMITTEE_ARRAY[$i]}"
  echo "  Attestation $((i+1))/$K from: ${MEMBER_DID:0:30}..."

  curl -s -X POST "$BASE_URL/api/receipts/$TASK_ID/attestations" \
    -H "Content-Type: application/json" \
    -H "X-AINP-DID: $MEMBER_DID" \
    -d '{
      "type": "AUDIT_PASS",
      "score": 0.90,
      "confidence": 0.95
    }' > /dev/null

  echo "    ✅ Submitted"
done
echo ""

# Step 9: Check attestations
echo "📝 Step 9: Checking attestations..."
UPDATED_RECEIPT=$(curl -s "$BASE_URL/api/receipts/$TASK_ID")
ATTEST_COUNT=$(echo "$UPDATED_RECEIPT" | jq '.attestations | length')
echo "  Total attestations: $ATTEST_COUNT"
echo ""

# Step 10: Wait for finalization
echo "📝 Step 10: Waiting for automatic finalization..."
for i in {1..6}; do
  sleep 10
  STATUS=$(curl -s "$BASE_URL/api/receipts/$TASK_ID" | jq -r '.status')
  echo "  Check $i: status=$STATUS"

  if [ "$STATUS" = "finalized" ]; then
    echo "✅ Receipt automatically finalized!"
    break
  fi

  if [ $i -eq 6 ]; then
    echo "⚠️  Still pending after 60s, trying manual finalization..."
    MANUAL=$(curl -s -X POST "$BASE_URL/api/receipts/$TASK_ID/finalize")
    echo "$MANUAL" | jq
  fi
done
echo ""

# Step 11: Final state
echo "📝 Step 11: Final receipt state..."
FINAL=$(curl -s "$BASE_URL/api/receipts/$TASK_ID")
echo "$FINAL" | jq '{
  id,
  status,
  finalized_at,
  attestations: (.attestations | length),
  types: [.attestations[].type] | unique
}'
echo ""

# Step 12: Check reputation
echo "📝 Step 12: Agent reputation..."
REP=$(curl -s "$BASE_URL/api/reputation/$AGENT_DID")
echo "$REP" | jq '{
  q: .q,
  t: .t,
  r: .r,
  updated_at
}'
echo ""

echo "🎉 Test Complete!"
echo "Receipt: $TASK_ID"
echo "Status: $(echo "$FINAL" | jq -r '.status')"
