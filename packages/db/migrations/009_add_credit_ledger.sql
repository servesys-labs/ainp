-- Phase 3: Credit System - Off-chain PostgreSQL Ledger
-- Tracks credit balances and transaction history for economic incentives

CREATE TABLE IF NOT EXISTS credit_accounts (
  agent_did TEXT PRIMARY KEY REFERENCES agents(did) ON DELETE CASCADE,
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  reserved BIGINT NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  earned BIGINT NOT NULL DEFAULT 0 CHECK (earned >= 0),
  spent BIGINT NOT NULL DEFAULT 0 CHECK (spent >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT available_balance CHECK (balance >= reserved)
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_did TEXT NOT NULL REFERENCES agents(did) ON DELETE CASCADE,
  tx_type TEXT NOT NULL CHECK (tx_type IN (
    'deposit', 'earn', 'reserve', 'release', 'spend',
    'pou_compute', 'pou_memory', 'pou_routing', 'pou_validation', 'pou_pool_distribution'
  )),
  amount BIGINT NOT NULL,
  intent_id TEXT,
  usefulness_proof_id UUID REFERENCES usefulness_proofs(id),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_credit_accounts_balance ON credit_accounts(balance DESC);
CREATE INDEX IF NOT EXISTS idx_credit_tx_agent ON credit_transactions(agent_did, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_tx_intent ON credit_transactions(intent_id) WHERE intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_tx_usefulness ON credit_transactions(usefulness_proof_id) WHERE usefulness_proof_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_tx_type ON credit_transactions(tx_type, created_at DESC);

-- Trigger to update updated_at on balance changes
CREATE OR REPLACE FUNCTION update_credit_account_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_credit_account_update ON credit_accounts;
CREATE TRIGGER trg_credit_account_update
BEFORE UPDATE ON credit_accounts
FOR EACH ROW EXECUTE FUNCTION update_credit_account_timestamp();

-- Comments for documentation
COMMENT ON TABLE credit_accounts IS 'Phase 3: Off-chain credit balances per agent (1 credit = 1000 atomic units)';
COMMENT ON TABLE credit_transactions IS 'Phase 3: Credit transaction history for audit and analytics';
COMMENT ON COLUMN credit_accounts.balance IS 'Available balance in atomic units (balance - reserved = spendable)';
COMMENT ON COLUMN credit_accounts.reserved IS 'Reserved for pending intents (locked until release)';
COMMENT ON COLUMN credit_accounts.earned IS 'Total lifetime earnings from POU proofs';
COMMENT ON COLUMN credit_accounts.spent IS 'Total lifetime spend on routing/discovery';
COMMENT ON COLUMN credit_transactions.tx_type IS 'Transaction type: deposit, earn, reserve, release, spend, pou_*';
COMMENT ON COLUMN credit_transactions.intent_id IS 'Optional link to intent (for reserve/release/earn)';
COMMENT ON COLUMN credit_transactions.usefulness_proof_id IS 'Optional link to POU proof (for earn transactions)';
