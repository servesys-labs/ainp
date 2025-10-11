#!/bin/bash
set -e

# Test complete PoU flow
# 1. Create negotiation
# 2. Settle negotiation (creates receipt)
# 3. Submit attestations
# 4. Wait for automatic finalization
# 5. Verify reputation updated

BASE_URL="http://localhost:8080"
AGENT_DID="did:key:z6Mk6a2200b0dca0e84e00affae62981db7f"
CLIENT_DID="did:key:z6Mk7b63b9f818ddb7725a00806b234b5cab"

echo "🧪 Testing PoU Flow"
echo "===================="
echo ""

# Step 1: Create an intent
echo "📝 Step 1: Creating intent..."
INTENT_ID="test-intent-$(date +%s)"
curl -s -X POST "$BASE_URL/api/intents/publish" \
  -H "Content-Type: application/json" \
  -H "X-AINP-DID: $CLIENT_DID" \
  -d "{
    \"id\": \"$INTENT_ID\",
    \"type\": \"compute-task\",
    \"description\": \"Test compute task for PoU\",
    \"requirements\": {
      \"compute_ms\": 5000
    }
  }" | jq -r '.id' || echo "Intent creation may have failed"

echo "✅ Intent ID: $INTENT_ID"
echo ""

# Step 2: Create negotiation
echo "📝 Step 2: Creating negotiation session..."
NEGOTIATION_RESPONSE=$(curl -s -X POST "$BASE_URL/api/negotiations" \
  -H "Content-Type: application/json" \
  -d "{
    \"intent_id\": \"$INTENT_ID\",
    \"initiator_did\": \"$CLIENT_DID\",
    \"responder_did\": \"$AGENT_DID\"
  }")

NEGOTIATION_ID=$(echo "$NEGOTIATION_RESPONSE" | jq -r '.id')
echo "✅ Negotiation ID: $NEGOTIATION_ID"
echo ""

# Step 3: Agent proposes terms
echo "📝 Step 3: Agent proposing terms..."
curl -s -X POST "$BASE_URL/api/negotiations/$NEGOTIATION_ID/propose" \
  -H "Content-Type: application/json" \
  -d "{
    \"proposer_did\": \"$AGENT_DID\",
    \"proposal\": {
      \"price\": 1000,
      \"estimated_duration_ms\": 5000,
      \"quality_guarantee\": 0.95
    }
  }" | jq -r '.state'
echo "✅ Proposal submitted"
echo ""

# Step 4: Client accepts
echo "📝 Step 4: Client accepting proposal..."
curl -s -X POST "$BASE_URL/api/negotiations/$NEGOTIATION_ID/accept" \
  -H "Content-Type: application/json" \
  -d "{
    \"acceptor_did\": \"$CLIENT_DID\"
  }" | jq -r '.state'
echo "✅ Proposal accepted"
echo ""

# Step 5: Settle negotiation (creates receipt)
echo "📝 Step 5: Settling negotiation (creates receipt)..."
SETTLE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/negotiations/$NEGOTIATION_ID/settle" \
  -H "Content-Type: application/json" \
  -d "{
    \"validator_did\": \"$CLIENT_DID\"
  }")

TASK_ID=$(echo "$SETTLE_RESPONSE" | jq -r '.task_receipt_id // empty')
if [ -z "$TASK_ID" ]; then
  echo "⚠️  Settlement response: $SETTLE_RESPONSE"
  echo "⚠️  Task receipt may not have been created. Checking database..."

  # Query database for most recent receipt
  TASK_ID=$(psql "postgresql://ainp:ainp@localhost:5432/ainp" -t -c \
    "SELECT id FROM task_receipts ORDER BY created_at DESC LIMIT 1;" | tr -d ' ')

  if [ -z "$TASK_ID" ]; then
    echo "❌ No task receipt found in database"
    exit 1
  fi
fi

echo "✅ Settlement complete, receipt created: $TASK_ID"
echo ""

# Step 6: Get receipt details
echo "📝 Step 6: Fetching receipt details..."
RECEIPT=$(curl -s "$BASE_URL/api/receipts/$TASK_ID")
echo "$RECEIPT" | jq '{
  id,
  status,
  agent_did,
  client_did,
  k,
  m,
  committee: (.committee | length)
}'
echo ""

# Step 7: Get committee members
echo "📝 Step 7: Fetching committee..."
COMMITTEE=$(curl -s "$BASE_URL/api/receipts/$TASK_ID/committee")
COMMITTEE_MEMBERS=$(echo "$COMMITTEE" | jq -r '.committee[]')
echo "✅ Committee members:"
echo "$COMMITTEE_MEMBERS" | head -5
echo ""

# Step 8: Submit client attestation (ACCEPTED)
echo "📝 Step 8: Client submitting ACCEPTED attestation..."
curl -s -X POST "$BASE_URL/api/receipts/$TASK_ID/attestations" \
  -H "Content-Type: application/json" \
  -H "X-AINP-DID: $CLIENT_DID" \
  -d "{
    \"type\": \"ACCEPTED\",
    \"score\": 0.95,
    \"confidence\": 0.98
  }" | jq
echo "✅ Client attestation submitted"
echo ""

# Step 9: Submit committee attestations (AUDIT_PASS from k=3 committee members)
echo "📝 Step 9: Submitting committee attestations (need k=3)..."
COMMITTEE_ARRAY=($(echo "$COMMITTEE_MEMBERS"))
K=$(echo "$RECEIPT" | jq -r '.k // 3')

for i in $(seq 0 $((K-1))); do
  COMMITTEE_DID="${COMMITTEE_ARRAY[$i]}"
  echo "  Attestation $((i+1))/$K from: $COMMITTEE_DID"

  curl -s -X POST "$BASE_URL/api/receipts/$TASK_ID/attestations" \
    -H "Content-Type: application/json" \
    -H "X-AINP-DID: $COMMITTEE_DID" \
    -d "{
      \"type\": \"AUDIT_PASS\",
      \"score\": 0.90,
      \"confidence\": 0.95
    }" | jq -r '.ok // "submitted"'
done
echo "✅ All committee attestations submitted"
echo ""

# Step 10: Check current receipt status
echo "📝 Step 10: Checking receipt status before finalization..."
curl -s "$BASE_URL/api/receipts/$TASK_ID" | jq '{
  status,
  attestation_count: (.attestations | length)
}'
echo ""

# Step 11: Wait for automatic finalization (cron runs every minute)
echo "📝 Step 11: Waiting for automatic finalization (max 90 seconds)..."
for i in {1..9}; do
  sleep 10
  STATUS=$(curl -s "$BASE_URL/api/receipts/$TASK_ID" | jq -r '.status')
  echo "  Check $i: status=$STATUS"

  if [ "$STATUS" = "finalized" ]; then
    echo "✅ Receipt automatically finalized!"
    break
  fi

  if [ $i -eq 9 ]; then
    echo "⚠️  Receipt not finalized after 90 seconds, trying manual finalization..."
    curl -s -X POST "$BASE_URL/api/receipts/$TASK_ID/finalize" | jq
  fi
done
echo ""

# Step 12: Verify final state
echo "📝 Step 12: Verifying final receipt state..."
FINAL_RECEIPT=$(curl -s "$BASE_URL/api/receipts/$TASK_ID")
echo "$FINAL_RECEIPT" | jq '{
  id,
  status,
  finalized_at,
  attestation_count: (.attestations | length),
  attestation_types: [.attestations[].type]
}'
echo ""

# Step 13: Check reputation updated
echo "📝 Step 13: Checking agent reputation..."
curl -s "$BASE_URL/api/reputation/$AGENT_DID" | jq '{
  agent_did,
  reputation: {
    quality: .q,
    timeliness: .t,
    reliability: .r,
    safety: .s,
    truthfulness: .v
  },
  updated_at
}'
echo ""

echo "🎉 PoU Flow Test Complete!"
echo "=========================="
echo "Summary:"
echo "  - Intent ID: $INTENT_ID"
echo "  - Negotiation ID: $NEGOTIATION_ID"
echo "  - Receipt ID: $TASK_ID"
echo "  - Final Status: $(echo "$FINAL_RECEIPT" | jq -r '.status')"
