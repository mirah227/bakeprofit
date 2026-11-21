-- BakeProfit Migration 002: Least-Privilege Schema & Table Grants + RLS Verification
-- Safe & idempotent: does NOT drop tables, disable RLS, or delete any existing data.
-- Run this script in Supabase Dashboard -> SQL Editor.

BEGIN;

-- 1. Ensure PostgREST / authenticated role can resolve objects in public schema
GRANT USAGE ON SCHEMA public TO authenticated;
REVOKE ALL ON public.profiles,
  public.recipes,
  public.recipe_ingredients,
  public.payment_transactions,
  public.premium_subscriptions FROM PUBLIC, anon;

-- 2. Grant least-privilege table permissions to authenticated users ONLY
-- Profiles: users can view, create, and update their own profile (no DELETE)
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;

-- Recipes & Recipe Ingredients: users can manage their own recipes
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recipes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recipe_ingredients TO authenticated;

-- Payment & Premium tables: read-only for authenticated users; writes are server-only via SUPABASE_SECRET_KEY
GRANT SELECT ON TABLE public.payment_transactions TO authenticated;
GRANT SELECT ON TABLE public.premium_subscriptions TO authenticated;

-- Ensure backend service_role retains full access
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON TABLE
  public.profiles,
  public.recipes,
  public.recipe_ingredients,
  public.payment_transactions,
  public.premium_subscriptions TO service_role;

-- 3. Enforce Row Level Security (RLS) on all five tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_subscriptions ENABLE ROW LEVEL SECURITY;

-- 4. Re-assert least-privilege RLS policies
-- Profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Recipes
DROP POLICY IF EXISTS "Users can view own recipes" ON public.recipes;
CREATE POLICY "Users can view own recipes"
  ON public.recipes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own recipes" ON public.recipes;
CREATE POLICY "Users can create own recipes"
  ON public.recipes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own recipes" ON public.recipes;
CREATE POLICY "Users can update own recipes"
  ON public.recipes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own recipes" ON public.recipes;
CREATE POLICY "Users can delete own recipes"
  ON public.recipes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Recipe Ingredients
DROP POLICY IF EXISTS "Users can view own recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "Users can view own recipe ingredients"
  ON public.recipe_ingredients FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_id AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "Users can insert own recipe ingredients"
  ON public.recipe_ingredients FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_id AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "Users can update own recipe ingredients"
  ON public.recipe_ingredients FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_id AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_id AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "Users can delete own recipe ingredients"
  ON public.recipe_ingredients FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_id AND r.user_id = auth.uid()
    )
  );

-- Payment Transactions (SELECT only for authenticated users; never client-writable)
DROP POLICY IF EXISTS "Users can view own payment transactions" ON public.payment_transactions;
CREATE POLICY "Users can view own payment transactions"
  ON public.payment_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Premium Subscriptions (SELECT only for authenticated users; never client-writable)
DROP POLICY IF EXISTS "Users can view own premium subscription" ON public.premium_subscriptions;
CREATE POLICY "Users can view own premium subscription"
  ON public.premium_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMIT;

-- 5. Refresh PostgREST schema & role privilege cache immediately
NOTIFY pgrst, 'reload schema';
