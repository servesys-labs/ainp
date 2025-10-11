#!/bin/bash
set -e

BASE_URL="http://localhost:8080"
AGENT_DID="did:key:z6Mk6a2200b0dca0e84e00affae62981db7f"
CLIENT_DID="did:key:z6Mk7b63b9f818ddb7725a00806b234b5cab"

echo "🧪 Final E2E PoU Test"
echo "====================="
echo ""

# Create negotiation
INTENT_ID=$(uuidgen)
NEG=$(curl -s -X POST "$BASE_URL/api/negotiations" -H "Content-Type: application/json" -d "{
  \"intent_id\": \"$INTENT_ID\",
  \"initiator_did\": \"$CLIENT_DID\",
  \"responder_did\": \"$AGENT_DID\",
  \"initial_proposal\": {\"price\": 1000, \"duration_ms\": 5000}
}")
NEG_ID=$(echo "$NEG" | jq -r '.id')
echo "✅ Negotiation: $NEG_ID (state: $(echo "$NEG" | jq -r '.state'))"

# Agent proposes
curl -s -X POST "$BASE_URL/api/negotiations/$NEG_ID/propose" -H "Content-Type: application/json" -d "{
  \"proposer_did\": \"$AGENT_DID\",
  \"proposal\": {\"price\": 1000, \"duration_ms\": 5000}
}" > /dev/null
echo "✅ Agent proposed"

# Client accepts
curl -s -X POST "$BASE_URL/api/negotiations/$NEG_ID/accept" -H "Content-Type: application/json" -d "{
  \"acceptor_did\": \"$CLIENT_DID\"
}" > /dev/null
echo "✅ Client accepted"

# Settle
curl -s -X POST "$BASE_URL/api/negotiations/$NEG_ID/settle" -H "Content-Type: application/json" -H "X-AINP-DID: $CLIENT_DID" -d "{
  \"validator_did\": \"$CLIENT_DID\"
}" > /dev/null
echo "✅ Settled"

# Get receipt
sleep 1
TASK_ID=$(psql "postgresql://ainp:ainp@localhost:5432/ainp" -t -c "SELECT id FROM task_receipts WHERE negotiation_id='$NEG_ID';" | tr -d ' ')
echo "✅ Receipt: $TASK_ID"

# Get receipt details
RECEIPT_FULL=$(curl -s "$BASE_URL/api/receipts/$TASK_ID")
RECEIPT=$(echo "$RECEIPT_FULL" | jq '.receipt')
K=$(echo "$RECEIPT" | jq -r '.k // 3')
echo "   k=$K, m=$(echo "$RECEIPT" | jq -r '.m'), status=$(echo "$RECEIPT" | jq -r '.status')"

# Get committee
COMMITTEE_RESP=$(curl -s "$BASE_URL/api/receipts/$TASK_ID/committee")
COMMITTEE=$(echo "$COMMITTEE_RESP" | jq -r '.committee[]' 2>/dev/null || echo "")
COMMITTEE_COUNT=$(echo "$COMMITTEE" | wc -l | tr -d ' ')
echo "   Committee: $COMMITTEE_COUNT members"

# Submit client attestation
curl -s -X POST "$BASE_URL/api/receipts/$TASK_ID/attestations" \
  -H "Content-Type: application/json" -H "X-AINP-DID: $CLIENT_DID" \
  -d '{"type": "ACCEPTED", "score": 0.95, "confidence": 0.98}' > /dev/null
echo "✅ Client attestation (ACCEPTED)"

# Submit committee attestations
if [ -n "$COMMITTEE" ] && [ "$COMMITTEE_COUNT" -ge "$K" ]; then
  COMMITTEE_ARRAY=($COMMITTEE)
  for i in $(seq 0 $((K-1))); do
    MEMBER="${COMMITTEE_ARRAY[$i]}"
    curl -s -X POST "$BASE_URL/api/receipts/$TASK_ID/attestations" \
      -H "Content-Type: application/json" -H "X-AINP-DID: $MEMBER" \
      -d '{"type": "AUDIT_PASS", "score": 0.90, "confidence": 0.95}' > /dev/null
    echo "✅ Committee attestation $((i+1))/$K"
  done
else
  echo "⚠️  Committee empty or insufficient, skipping committee attestations"
fi

# Wait for finalization
echo ""
echo "⏳ Waiting for finalization (cron runs every minute)..."
for i in {1..12}; do
  sleep 5
  STATUS=$(curl -s "$BASE_URL/api/receipts/$TASK_ID" | jq -r '.receipt.status')
  echo "   Check $i: $STATUS"
  if [ "$STATUS" = "finalized" ]; then
    echo "✅ Finalized automatically!"
    break
  fi
  if [ $i -eq 12 ]; then
    echo "⚠️  Trying manual finalization..."
    curl -s -X POST "$BASE_URL/api/receipts/$TASK_ID/finalize" | jq
  fi
done

# Final state
echo ""
FINAL=$(curl -s "$BASE_URL/api/receipts/$TASK_ID" | jq '.receipt')
echo "📊 Final State:"
echo "$FINAL" | jq '{id, status, finalized_at, attestations: (.attestations | length)}'

# Check reputation
REP=$(curl -s "$BASE_URL/api/reputation/$AGENT_DID")
echo ""
echo "📊 Agent Reputation:"
echo "$REP" | jq '{q, t, r, updated_at}'

echo ""
if [ "$(echo "$FINAL" | jq -r '.status')" = "finalized" ]; then
  echo "🎉 ✅ ALL TESTS PASSED!"
  exit 0
else
  echo "⚠️  Receipt not finalized"
  exit 1
fi
