#!/bin/bash
set -e

echo "============================================"
echo "AINP Development Environment Setup"
echo "Phase 0.1 - Foundation"
echo "============================================"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
  echo "❌ Docker not found. Please install Docker Desktop."
  exit 1
fi

if ! command -v docker-compose &> /dev/null; then
  echo "❌ docker-compose not found. Please install docker-compose."
  exit 1
fi

echo "✅ Prerequisites met"
echo ""

# Start Docker Compose
echo "Starting Docker Compose services..."
docker-compose -f docker-compose.dev.yml up -d

echo ""
echo "Waiting for services to start (30 seconds)..."
sleep 30

echo ""
echo "============================================"
echo "Initializing Services"
echo "============================================"
echo ""

# Initialize database
echo "Step 1/2: Initializing PostgreSQL with pgvector..."
bash scripts/init-db.sh
echo ""

# Initialize NATS
echo "Step 2/2: Initializing NATS..."
bash scripts/init-nats.sh
echo ""

# Verify Redis
echo "Verifying Redis..."
if docker exec ainp-redis redis-cli ping > /dev/null 2>&1; then
  echo "✅ Redis is running"
else
  echo "❌ Redis verification failed"
fi

echo ""
echo "============================================"
echo "Setup Complete!"
echo "============================================"
echo ""

# Print connection strings
echo "Connection Strings:"
echo "-------------------------------------------"
echo "PostgreSQL:"
echo "  URL: postgresql://ainp:ainp@localhost:5432/ainp"
echo "  Host: localhost:5432"
echo "  User: ainp"
echo "  Password: ainp"
echo "  Database: ainp"
echo ""
echo "NATS:"
echo "  URL: nats://localhost:4222"
echo "  Monitoring: http://localhost:8222"
echo ""
echo "Redis:"
echo "  URL: redis://localhost:6379"
echo ""
echo "Monitoring:"
echo "  Prometheus: http://localhost:9090"
echo "  Grafana: http://localhost:3000 (admin/admin)"
echo "-------------------------------------------"
echo ""

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
  echo "Creating .env file from .env.example..."
  cp .env.example .env
  echo "✅ .env file created"
  echo ""
  echo "⚠️  Please update .env with your API keys:"
  echo "  - OPENAI_API_KEY (required for embeddings)"
  echo "  - JWT_SECRET (required for authentication)"
  echo ""
fi

# Show next steps
echo "Next Steps:"
echo "-------------------------------------------"
echo "1. Update .env with your API keys"
echo "2. Install dependencies: npm install"
echo "3. Run tests: npm test"
echo "4. Start development: npm run dev"
echo ""
echo "To stop services: docker-compose -f docker-compose.dev.yml down"
echo "To view logs: docker-compose -f docker-compose.dev.yml logs -f"
echo ""
echo "Happy building! 🚀"
