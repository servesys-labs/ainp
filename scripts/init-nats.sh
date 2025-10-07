#!/bin/bash
set -e

echo "Initializing NATS JetStream..."

# Wait for NATS to be ready
echo "Waiting for NATS to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0

until curl -s http://localhost:8222/healthz > /dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "❌ NATS failed to start after ${MAX_RETRIES} attempts"
    exit 1
  fi
  echo "  NATS is unavailable - sleeping (attempt $RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done

echo "NATS is ready!"

# Install nats CLI if not present (macOS)
if ! command -v nats &> /dev/null; then
  echo "Installing NATS CLI..."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    brew install nats-io/nats-tools/nats
  else
    echo "⚠️  Please install NATS CLI manually: https://github.com/nats-io/natscli"
    echo "Skipping stream creation (will be created by client on first connection)"
    exit 0
  fi
fi

# Create AINP_INTENTS stream
echo "Creating AINP_INTENTS stream..."
nats stream add AINP_INTENTS \
  --subjects "ainp.agent.*.intents" \
  --retention limits \
  --max-age 7d \
  --max-bytes 10GB \
  --storage file \
  --duplicate-window 2m \
  --server nats://localhost:4222 \
  --defaults 2>/dev/null || echo "  Stream AINP_INTENTS may already exist"

# Create AINP_NEGOTIATIONS stream
echo "Creating AINP_NEGOTIATIONS stream..."
nats stream add AINP_NEGOTIATIONS \
  --subjects "ainp.negotiations.*" \
  --retention limits \
  --max-age 7d \
  --max-bytes 5GB \
  --storage file \
  --duplicate-window 2m \
  --server nats://localhost:4222 \
  --defaults 2>/dev/null || echo "  Stream AINP_NEGOTIATIONS may already exist"

# Create AINP_RESULTS stream
echo "Creating AINP_RESULTS stream..."
nats stream add AINP_RESULTS \
  --subjects "ainp.agent.*.results" \
  --retention limits \
  --max-age 7d \
  --max-bytes 10GB \
  --storage file \
  --duplicate-window 2m \
  --server nats://localhost:4222 \
  --defaults 2>/dev/null || echo "  Stream AINP_RESULTS may already exist"

# Verify streams
echo ""
echo "Verifying streams..."
STREAMS=$(nats stream list --server nats://localhost:4222 2>/dev/null | grep -c "AINP_" || echo "0")

if [ "$STREAMS" -ge 3 ]; then
  echo "✅ NATS JetStream initialized successfully with $STREAMS streams"
else
  echo "⚠️  NATS may not have all streams (found $STREAMS/3)"
  echo "Streams will be auto-created by client on first connection"
fi

# Show stream info
echo ""
echo "Stream Summary:"
nats stream info AINP_INTENTS --server nats://localhost:4222 2>/dev/null | grep -E "(State|Messages|Bytes|Subjects)" || echo "  AINP_INTENTS: info unavailable"
echo ""
nats stream info AINP_NEGOTIATIONS --server nats://localhost:4222 2>/dev/null | grep -E "(State|Messages|Bytes|Subjects)" || echo "  AINP_NEGOTIATIONS: info unavailable"
echo ""
nats stream info AINP_RESULTS --server nats://localhost:4222 2>/dev/null | grep -E "(State|Messages|Bytes|Subjects)" || echo "  AINP_RESULTS: info unavailable"

echo ""
echo "NATS Server: nats://localhost:4222"
echo "NATS Monitoring: http://localhost:8222"
