# AINP Kubernetes Deployment Guide

Production-ready Kubernetes deployment for AI-Native Network Protocol (AINP).

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│              GKE Cluster (singulare-cluster)             │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Namespace: ainp                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │                                                    │ │
│  │  NATS StatefulSet (3 replicas)                    │ │
│  │  ├─ ainp-nats-0  (10Gi PV)                        │ │
│  │  ├─ ainp-nats-1  (10Gi PV)                        │ │
│  │  └─ ainp-nats-2  (10Gi PV)                        │ │
│  │                                                    │ │
│  │  Redis Deployment (1 replica)                     │ │
│  │  └─ ainp-redis   (5Gi PVC)                        │ │
│  │                                                    │ │
│  │  AINP Broker Deployment (2 replicas)              │ │
│  │  ├─ broker container                              │ │
│  │  └─ cloud-sql-proxy sidecar                       │ │
│  │                                                    │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  External:                                               │
│  └─ CloudSQL PostgreSQL (nexus instance)                │
│     └─ 10.35.0.7:5432                                   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Prerequisites

1. **GKE Cluster Access**
   ```bash
   gcloud container clusters get-credentials singulare-cluster \
     --region=us-central1 \
     --project=YOUR_PROJECT_ID
   ```

2. **Environment Variables**
   ```bash
   export GCP_PROJECT_ID="your-project-id"
   export GCP_REGION="us-central1"
   export GKE_CLUSTER="singulare-cluster"

   # Database (CloudSQL)
   export DATABASE_PASSWORD="SecurePass2024"

   # AI Provider API Keys
   export OPENAI_API_KEY="sk-..."
   export ANTHROPIC_API_KEY="sk-ant-..."
   export GOOGLE_AI_API_KEY="AIza..."

   # Optional: Vector Database
   export PINECONE_API_KEY="your-pinecone-key"
   export PINECONE_INDEX_NAME="ainp-vectors"
   ```

3. **Tools**
   - kubectl 1.27+
   - docker
   - gcloud CLI
   - (Optional) kustomize

## Quick Deploy

### Option 1: Automated Deployment

```bash
cd /home/dev/workspace/ainp

# Set environment variables (see above)
# Then run:
./k8s/deploy.sh
```

### Option 2: Manual Deployment

```bash
cd /home/dev/workspace/ainp

# 1. Update placeholders in manifests
#    Replace in k8s/base/broker-deployment.yaml:
#    - YOUR_PROJECT_ID
#    - YOUR_REGION
#    - YOUR_INSTANCE (CloudSQL connection name)

# 2. Build and push image
IMAGE_TAG="gcr.io/$GCP_PROJECT_ID/ainp-broker:latest"
docker build -t "$IMAGE_TAG" -f Dockerfile.broker .
docker push "$IMAGE_TAG"

# 3. Create namespace
kubectl apply -f k8s/base/namespace.yaml

# 4. Create secrets
kubectl create secret generic ainp-secrets -n ainp \
  --from-literal=DATABASE_PASSWORD="$DATABASE_PASSWORD" \
  --from-literal=OPENAI_API_KEY="$OPENAI_API_KEY" \
  --from-literal=ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  --from-literal=GOOGLE_AI_API_KEY="$GOOGLE_AI_API_KEY"

# 5. Apply resources
kubectl apply -f k8s/base/configmap.yaml
kubectl apply -f k8s/base/redis-deployment.yaml
kubectl apply -f k8s/base/nats-statefulset.yaml
kubectl apply -f k8s/base/broker-deployment.yaml

# 6. Wait for ready
kubectl rollout status deployment/ainp-redis -n ainp
kubectl rollout status statefulset/ainp-nats -n ainp
kubectl rollout status deployment/ainp-broker -n ainp
```

## CloudSQL Configuration

### Connection Method: Cloud SQL Proxy Sidecar

The AINP broker uses a Cloud SQL Proxy sidecar container to securely connect to the shared CloudSQL instance.

**Setup:**

1. **Create GCP Service Account**
   ```bash
   gcloud iam service-accounts create ainp-broker \
     --display-name="AINP Broker Service Account" \
     --project=$GCP_PROJECT_ID

   # Grant CloudSQL Client role
   gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \
     --member="serviceAccount:ainp-broker@$GCP_PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/cloudsql.client"
   ```

2. **Enable Workload Identity**
   ```bash
   # Bind K8s SA to GCP SA
   gcloud iam service-accounts add-iam-policy-binding \
     ainp-broker@$GCP_PROJECT_ID.iam.gserviceaccount.com \
     --role="roles/iam.workloadIdentityUser" \
     --member="serviceAccount:$GCP_PROJECT_ID.svc.id.goog[ainp/ainp-broker-sa]"
   ```

3. **Update broker-deployment.yaml**
   - Replace `YOUR_PROJECT_ID:YOUR_REGION:YOUR_INSTANCE` with actual CloudSQL connection name
   - Example: `my-project:us-central1:nexus-db`

## Verification

### Check Pod Status

```bash
kubectl get pods -n ainp
```

Expected output:
```
NAME                           READY   STATUS    RESTARTS   AGE
ainp-broker-xxx-yyy            2/2     Running   0          2m
ainp-broker-xxx-zzz            2/2     Running   0          2m
ainp-nats-0                    1/1     Running   0          5m
ainp-nats-1                    1/1     Running   0          5m
ainp-nats-2                    1/1     Running   0          5m
ainp-redis-xxx-yyy             1/1     Running   0          5m
```

### Check Logs

```bash
# Broker logs
kubectl logs -n ainp -l app=ainp-broker -f

# NATS logs
kubectl logs -n ainp -l app=ainp-nats -f

# Redis logs
kubectl logs -n ainp -l app=ainp-redis -f
```

### Test API

```bash
# Port-forward
kubectl port-forward -n ainp svc/ainp-broker 3001:3001

# Test health endpoint
curl http://localhost:3001/health

# Expected response:
# {"status":"ok","timestamp":"2025-10-11T..."}
```

### Test NATS

```bash
# Port-forward NATS
kubectl port-forward -n ainp svc/ainp-nats-lb 4222:4222

# Test connection (from dev-pod or local)
nats-cli -s nats://localhost:4222 stream ls
```

## Monitoring

### View Metrics

```bash
# NATS monitoring
kubectl port-forward -n ainp svc/ainp-nats-lb 8222:8222
curl http://localhost:8222/varz

# Pod resource usage
kubectl top pods -n ainp
```

### View Events

```bash
kubectl get events -n ainp --sort-by='.lastTimestamp'
```

## Scaling

### Scale Broker Replicas

```bash
kubectl scale deployment/ainp-broker -n ainp --replicas=5
```

### Scale NATS Cluster

```bash
kubectl scale statefulset/ainp-nats -n ainp --replicas=5
```

## Troubleshooting

### Pod Not Starting

```bash
# Describe pod
kubectl describe pod <pod-name> -n ainp

# Check events
kubectl get events -n ainp --field-selector involvedObject.name=<pod-name>
```

### Cloud SQL Connection Issues

```bash
# Check proxy logs
kubectl logs -n ainp <broker-pod> -c cloud-sql-proxy

# Common issues:
# 1. Wrong connection name format
# 2. Service account missing cloudsql.client role
# 3. Workload Identity not configured
```

### NATS Cluster Not Forming

```bash
# Check NATS logs
kubectl logs -n ainp ainp-nats-0

# Verify DNS resolution
kubectl exec -n ainp ainp-nats-0 -- nslookup ainp-nats-0.ainp-nats.ainp.svc.cluster.local
```

## Cleanup

```bash
# Delete all AINP resources
kubectl delete namespace ainp

# Delete PVCs (if needed)
kubectl delete pvc -n ainp --all
```

## Next Steps

After successful deployment:

1. **Integrate with god-code**: Configure god-code agents to use AINP for context sharing
2. **Set up monitoring**: Deploy Prometheus/Grafana for metrics
3. **Configure ingress**: Expose broker API externally if needed
4. **Enable autoscaling**: Configure HPA for broker deployment

## Production Checklist

Before going to production:

- [ ] Update all `YOUR_PROJECT_ID` placeholders
- [ ] Configure proper secrets management (GCP Secret Manager)
- [ ] Set up backup for Redis data
- [ ] Configure resource quotas and limits
- [ ] Enable network policies
- [ ] Set up alerting (PagerDuty, Slack)
- [ ] Document runbooks for common issues
- [ ] Load test the broker API
- [ ] Configure log aggregation (Cloud Logging)

## Support

For issues:
1. Check logs: `kubectl logs -n ainp -l app=ainp-broker`
2. Check events: `kubectl get events -n ainp`
3. Review AINP documentation: `/home/dev/workspace/ainp/README.md`
