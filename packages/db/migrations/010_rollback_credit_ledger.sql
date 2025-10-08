-- Rollback Phase 3 Credit System

DROP TRIGGER IF EXISTS trg_credit_account_update ON credit_accounts;
DROP FUNCTION IF EXISTS update_credit_account_timestamp();

DROP INDEX IF EXISTS idx_credit_tx_type;
DROP INDEX IF EXISTS idx_credit_tx_usefulness;
DROP INDEX IF EXISTS idx_credit_tx_intent;
DROP INDEX IF EXISTS idx_credit_tx_agent;
DROP INDEX IF EXISTS idx_credit_accounts_balance;

DROP TABLE IF EXISTS credit_transactions;
DROP TABLE IF EXISTS credit_accounts;
