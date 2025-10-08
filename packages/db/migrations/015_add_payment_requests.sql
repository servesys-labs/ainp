-- Migration 015: Add payment_requests table
-- Tracks payment challenges/requests for top-ups and payable endpoints

CREATE TABLE IF NOT EXISTS payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_did TEXT NOT NULL,                   -- DID of the payer (account to credit)
  amount_atomic BIGINT NOT NULL CHECK (amount_atomic > 0),  -- amount in atomic units (1000 = 1 credit)
  currency TEXT NOT NULL DEFAULT 'credits',  -- credits, USD, USDC, BTC, etc.
  method TEXT NOT NULL,                      -- credits|coinbase|lightning|usdc
  status TEXT NOT NULL DEFAULT 'created',    -- created|pending|paid|expired|failed|cancelled
  provider TEXT,                             -- provider identifier (coinbase, ln, usdc)
  provider_id TEXT,                          -- provider charge/invoice/tx id
  provider_metadata JSONB DEFAULT '{}',      -- provider-specific data (payment URL, QR, notes)
  description TEXT,                          -- human-friendly description
  expires_at TIMESTAMPTZ,                    -- request expiration
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_owner ON payment_requests(owner_did);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_payment_requests_provider ON payment_requests(provider, provider_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_expires ON payment_requests(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE payment_requests IS 'Payment requests for account top-ups and payable endpoints with provider linkage';
COMMENT ON COLUMN payment_requests.amount_atomic IS 'Amount in atomic units (1000 = 1 credit)';
COMMENT ON COLUMN payment_requests.status IS 'created|pending|paid|expired|failed|cancelled';

