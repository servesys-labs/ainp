#!/bin/bash
# Railway Setup Script - AINP Phase 0.3
# This script automates Railway project setup via CLI
# Usage: bash scripts/railway-setup.sh

set -e  # Exit on error

echo "🚂 AINP Railway Deployment Setup"
echo "=================================="
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
    echo "✅ Railway CLI installed"
else
    echo "✅ Railway CLI already installed ($(railway --version))"
fi

# Login check
echo ""
echo "🔐 Checking Railway authentication..."
if railway whoami &> /dev/null; then
    echo "✅ Already logged in as $(railway whoami)"
else
    echo "🔑 Please login to Railway (browser will open)..."
    railway login
fi

# Initialize project
echo ""
echo "📦 Initializing Railway project..."
if [ -f ".railway" ]; then
    echo "⚠️  Railway project already initialized"
    echo "   To reinitialize, delete .railway file and run again"
else
    railway init
    echo "✅ Railway project initialized"
fi

# Add PostgreSQL
echo ""
echo "🐘 Adding PostgreSQL database..."
read -p "Add PostgreSQL? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    railway add --database postgresql
    echo "✅ PostgreSQL added"
    echo "⚠️  IMPORTANT: Run 'railway connect postgresql' and execute:"
    echo "   CREATE EXTENSION IF NOT EXISTS vector;"
else
    echo "⏭️  Skipped PostgreSQL setup"
fi

# Add Redis
echo ""
echo "📦 Adding Redis cache..."
read -p "Add Redis? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    railway add --database redis
    echo "✅ Redis added"
else
    echo "⏭️  Skipped Redis setup"
fi

# Set environment variables
echo ""
echo "🔧 Setting environment variables..."

# OpenAI API Key (required)
read -p "Enter OpenAI API Key (sk-proj-...): " OPENAI_KEY
if [ -n "$OPENAI_KEY" ]; then
    railway variables set OPENAI_API_KEY="$OPENAI_KEY"
    echo "✅ OPENAI_API_KEY set"
else
    echo "⚠️  No OpenAI API key provided. You must set this manually via dashboard."
fi

# NATS URL (internal Railway URL)
echo ""
read -p "Enter NATS internal URL (default: nats://nats.railway.internal:4222): " NATS_URL
NATS_URL=${NATS_URL:-nats://nats.railway.internal:4222}
railway variables set NATS_URL="$NATS_URL"
echo "✅ NATS_URL set to $NATS_URL"

# Production mode
railway variables set NODE_ENV=production
echo "✅ NODE_ENV set to production"

# Verify variables
echo ""
echo "📋 Current environment variables:"
railway variables

# Deploy NATS service
echo ""
echo "🚀 NATS JetStream deployment..."
read -p "Deploy NATS JetStream? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "⚠️  NATS deployment requires manual setup via Railway dashboard:"
    echo "   1. Create new service: + New → Empty Service"
    echo "   2. Name: nats-jetstream"
    echo "   3. Settings → Source → Dockerfile Path: Dockerfile.nats"
    echo "   4. Deploy"
    echo ""
    read -p "Press Enter when NATS service is deployed..."
else
    echo "⏭️  Skipped NATS deployment"
fi

# Run database migrations
echo ""
echo "🗄️  Database migrations..."
read -p "Run database migrations? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Running schema.sql..."
    railway run psql \$DATABASE_URL < packages/db/schema.sql
    echo "Running migration 001..."
    railway run psql \$DATABASE_URL < packages/db/migrations/001_add_agent_registration_fields.sql
    echo "✅ Database migrations complete"
else
    echo "⏭️  Skipped database migrations"
    echo "⚠️  Run manually: railway run psql \$DATABASE_URL < packages/db/schema.sql"
fi

# Deploy broker service
echo ""
echo "🚀 Deploying AINP broker service..."
read -p "Deploy broker now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    railway up
    echo "✅ Broker deployed"
    echo ""
    echo "📊 Watching deployment logs..."
    echo "   Press Ctrl+C to exit logs (deployment continues)"
    railway logs --follow
else
    echo "⏭️  Skipped broker deployment"
    echo "   Run 'railway up' when ready to deploy"
fi

# Final instructions
echo ""
echo "✅ Railway Setup Complete!"
echo "=========================="
echo ""
echo "📋 Next Steps:"
echo "1. Verify deployment: railway status"
echo "2. Get public URL: railway domain"
echo "3. Test health check: curl https://your-app.up.railway.app/health/ready"
echo "4. Run integration tests: export API_BASE=https://your-app.up.railway.app && npm test"
echo ""
echo "📚 Documentation: docs/RAILWAY_DEPLOYMENT.md"
echo "🆘 Rollback: railway rollback <deployment-id>"
echo ""
