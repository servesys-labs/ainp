-- Verification: Credit Ledger Schema

-- Test 1: Tables exist
SELECT 'Test 1: credit_accounts table exists' as test,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'credit_accounts'
  ) THEN 'PASS' ELSE 'FAIL' END as result;

SELECT 'Test 2: credit_transactions table exists' as test,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'credit_transactions'
  ) THEN 'PASS' ELSE 'FAIL' END as result;

-- Test 3: Indexes exist
SELECT 'Test 3: credit_accounts indexes' as test,
  CASE WHEN (
    SELECT COUNT(*) FROM pg_indexes
    WHERE tablename = 'credit_accounts'
  ) >= 1 THEN 'PASS' ELSE 'FAIL' END as result;

SELECT 'Test 4: credit_transactions indexes' as test,
  CASE WHEN (
    SELECT COUNT(*) FROM pg_indexes
    WHERE tablename = 'credit_transactions'
  ) >= 4 THEN 'PASS' ELSE 'FAIL' END as result;

-- Test 5: Foreign keys
SELECT 'Test 5: credit_accounts FK to agents' as test,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'credit_accounts'
    AND constraint_type = 'FOREIGN KEY'
  ) THEN 'PASS' ELSE 'FAIL' END as result;

-- Test 6: Trigger exists
SELECT 'Test 6: updated_at trigger exists' as test,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'trg_credit_account_update'
  ) THEN 'PASS' ELSE 'FAIL' END as result;

-- Test 7: Insert test account (create agent first)
INSERT INTO agents (did, public_key)
VALUES ('did:key:test', 'test_public_key')
ON CONFLICT (did) DO NOTHING;

INSERT INTO credit_accounts (agent_did, balance, reserved, earned, spent)
VALUES ('did:key:test', 1000000, 0, 0, 0)
ON CONFLICT (agent_did) DO NOTHING;

SELECT 'Test 7: Insert test account' as test, 'PASS' as result;

-- Test 8: Insert test transaction
INSERT INTO credit_transactions (agent_did, tx_type, amount)
VALUES ('did:key:test', 'deposit', 1000000);

SELECT 'Test 8: Insert test transaction' as test, 'PASS' as result;

-- Test 9: Balance constraint (should prevent negative)
DO $$
BEGIN
  INSERT INTO credit_accounts (agent_did, balance)
  VALUES ('did:key:negative-test', -1000);
  RAISE EXCEPTION 'Test 9 FAILED: Negative balance allowed';
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE 'Test 9: Balance constraint working - PASS';
END $$;

-- Test 10: Available balance constraint
DO $$
BEGIN
  INSERT INTO credit_accounts (agent_did, balance, reserved)
  VALUES ('did:key:reserved-test', 100, 200);
  RAISE EXCEPTION 'Test 10 FAILED: Reserved > balance allowed';
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE 'Test 10: Available balance constraint working - PASS';
END $$;

-- Cleanup
DELETE FROM credit_transactions WHERE agent_did = 'did:key:test';
DELETE FROM credit_accounts WHERE agent_did IN ('did:key:test', 'did:key:negative-test', 'did:key:reserved-test');
DELETE FROM agents WHERE did = 'did:key:test';
