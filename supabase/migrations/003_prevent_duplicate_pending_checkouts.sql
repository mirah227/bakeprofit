-- BakeProfit Migration 003: Database-Level Partial Unique Index for Active Pending Checkouts
-- Safe & idempotent: retires any older duplicate pending rows to 'abandoned' (leaving all
-- successful transactions untouched) and enforces at most one active pending checkout per
-- user, plan, and environment across concurrent server instances.

BEGIN;

WITH ranked_pending AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, plan, environment
      ORDER BY created_at DESC
    ) AS rn
  FROM public.payment_transactions
  WHERE status = 'pending'
)
UPDATE public.payment_transactions pt
SET
  status = 'abandoned',
  gateway_response_message = COALESCE(
    pt.gateway_response_message,
    'Superseded by newer checkout attempt'
  )
FROM ranked_pending rp
WHERE pt.id = rp.id
  AND rp.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_transactions_active_pending
  ON public.payment_transactions (user_id, plan, environment)
  WHERE status = 'pending';

COMMIT;

NOTIFY pgrst, 'reload schema';
