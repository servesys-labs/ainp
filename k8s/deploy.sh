#!/bin/bash
set -euo pipefail

# AINP Kubernetes Deployment Script
# Usage: ./k8s/deploy.sh [dev|prod]

ENVIRONMENT="${1:-dev}"
PROJECT_ID="${GCP_PROJECT_ID:-singulare-ai}"
REGION="${GCP_REGION:-us-central1}"
CLUSTER="${GKE_CLUSTER:-singulare-cluster}"

echo "🚀 Deploying AINP to Kubernetes"
echo "   Environment: $ENVIRONMENT"
echo "   Project: $PROJECT_ID"
echo "   Cluster: $CLUSTER"
echo ""

# Check prerequisites
command -v kubectl >/dev/null 2>&1 || { echo "❌ kubectl not found"; exit 1; }
command -v gcloud >/dev/null 2>&1 || { echo "❌ gcloud not found"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ docker not found"; exit 1; }

# Authenticate with GKE
echo "🔐 Authenticating with GKE..."
gcloud container clusters get-credentials "$CLUSTER" \
  --region="$REGION" \
  --project="$PROJECT_ID"

# Build and push broker image
echo "🏗️  Building AINP broker image..."
IMAGE_TAG="gcr.io/$PROJECT_ID/ainp-broker:$(git rev-parse --short HEAD || echo 'latest')"

docker build -t "$IMAGE_TAG" -f Dockerfile.broker .
docker push "$IMAGE_TAG"

echo "✅ Image pushed: $IMAGE_TAG"

# Image already configured in broker-deployment.yaml
# Using: gcr.io/singulare-ai/ainp-broker:latest

# Create namespace
echo "📦 Creating namespace..."
kubectl apply -f k8s/base/namespace.yaml

# Create secrets (if not exist)
if ! kubectl get secret ainp-secrets -n ainp >/dev/null 2>&1; then
  echo "🔑 Creating secrets..."
  echo "⚠️  Please ensure you have set the following environment variables:"
  echo "   - DATABASE_PASSWORD"
  echo "   - OPENAI_API_KEY"
  echo "   - ANTHROPIC_API_KEY"
  echo "   - GOOGLE_AI_API_KEY"

  kubectl create secret generic ainp-secrets -n ainp \
    --from-literal=DATABASE_PASSWORD="${DATABASE_PASSWORD:-SecurePass2024}" \
    --from-literal=OPENAI_API_KEY="${OPENAI_API_KEY:-}" \
    --from-literal=ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
    --from-literal=GOOGLE_AI_API_KEY="${GOOGLE_AI_API_KEY:-}" \
    --from-literal=PINECONE_API_KEY="${PINECONE_API_KEY:-}" \
    --from-literal=PINECONE_INDEX_NAME="${PINECONE_INDEX_NAME:-ainp-vectors}"
fi

# Apply all resources
echo "☸️  Applying Kubernetes resources..."
kubectl apply -f k8s/base/configmap.yaml
kubectl apply -f k8s/base/redis-deployment.yaml
kubectl apply -f k8s/base/nats-statefulset.yaml
kubectl apply -f k8s/base/broker-deployment.yaml

# Wait for deployments
echo "⏳ Waiting for deployments to be ready..."

echo "   Waiting for Redis..."
kubectl rollout status deployment/ainp-redis -n ainp --timeout=5m

echo "   Waiting for NATS..."
kubectl rollout status statefulset/ainp-nats -n ainp --timeout=5m

echo "   Waiting for Broker..."
kubectl rollout status deployment/ainp-broker -n ainp --timeout=5m

# Show pod status
echo ""
echo "📊 Pod Status:"
kubectl get pods -n ainp -o wide

# Show services
echo ""
echo "🌐 Services:"
kubectl get svc -n ainp

# Run smoke test
echo ""
echo "🧪 Running smoke tests..."
BROKER_POD=$(kubectl get pod -n ainp -l app=ainp-broker -o jsonpath='{.items[0].metadata.name}')

if kubectl exec -n ainp "$BROKER_POD" -- wget -q -O- http://localhost:3001/health; then
  echo "✅ Health check passed!"
else
  echo "❌ Health check failed!"
  kubectl logs -n ainp "$BROKER_POD" --tail=50
  exit 1
fi

echo ""
echo "✅ AINP deployment complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Check logs: kubectl logs -n ainp -l app=ainp-broker -f"
echo "   2. Port-forward: kubectl port-forward -n ainp svc/ainp-broker 3001:3001"
echo "   3. Test API: curl http://localhost:3001/health"
echo ""
