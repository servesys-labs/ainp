-- Migration 016: Add payment_receipts table
-- Records provider confirmations and raw webhook data for audit

CREATE TABLE IF NOT EXISTS payment_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,                    -- coinbase|lightning|usdc
  tx_ref TEXT,                               -- tx hash / invoice id / charge id
  amount_atomic BIGINT NOT NULL CHECK (amount_atomic > 0),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw JSONB,                                 -- raw provider payload for audit/forensics
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_request ON payment_receipts(request_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_provider ON payment_receipts(provider, tx_ref);

COMMENT ON TABLE payment_receipts IS 'Provider confirmations for payment requests';
COMMENT ON COLUMN payment_receipts.amount_atomic IS 'Amount credited in atomic units';

