-- BakeProfit Supabase Schema & Row Level Security (RLS) Migration
-- Run this entire script in your Supabase Dashboard -> SQL Editor

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. User Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  business_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Saved Recipes Table (connected to authenticated user)
CREATE TABLE IF NOT EXISTS public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  yield_count numeric NOT NULL DEFAULT 1 CHECK (yield_count > 0),
  yield_unit_label text NOT NULL DEFAULT 'cake',
  desired_margin_percent numeric NOT NULL DEFAULT 40 CHECK (desired_margin_percent >= 0 AND desired_margin_percent < 100),
  packaging_cost numeric NOT NULL DEFAULT 0 CHECK (packaging_cost >= 0),
  labour_cost numeric NOT NULL DEFAULT 0 CHECK (labour_cost >= 0),
  electricity_cost numeric NOT NULL DEFAULT 0 CHECK (electricity_cost >= 0),
  other_cost numeric NOT NULL DEFAULT 0 CHECK (other_cost >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipes_user_updated
  ON public.recipes(user_id, updated_at DESC);

-- 4. Recipe Ingredients Table (child table of recipes)
CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  quantity_used numeric NOT NULL DEFAULT 0 CHECK (quantity_used >= 0),
  used_unit text NOT NULL DEFAULT 'g',
  purchase_quantity numeric NOT NULL DEFAULT 0 CHECK (purchase_quantity >= 0),
  purchase_unit text NOT NULL DEFAULT 'kg',
  purchase_price numeric NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_order
  ON public.recipe_ingredients(recipe_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_user
  ON public.recipe_ingredients(user_id);

-- 5. Payment Transactions Table (separate from recipe records)
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_reference text NOT NULL UNIQUE,
  requested_reference text,
  plan text NOT NULL CHECK (plan IN ('onetime', 'monthly')),
  expected_amount numeric NOT NULL,
  charged_amount numeric,
  currency text NOT NULL DEFAULT 'NGN',
  environment text NOT NULL CHECK (environment IN ('test', 'live')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'successful', 'failed', 'abandoned', 'reversed')),
  novac_transaction_id bigint,
  channel text,
  gateway_response_code text,
  gateway_response_message text,
  customer_email text NOT NULL,
  verification_source text,
  webhook_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_created
  ON public.payment_transactions(user_id, created_at DESC);

-- 6. Premium Subscriptions / Access Status Table (separate from recipe records)
CREATE TABLE IF NOT EXISTS public.premium_subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_premium boolean NOT NULL DEFAULT false,
  plan text CHECK (plan IN ('onetime', 'monthly')),
  transaction_reference text REFERENCES public.payment_transactions(transaction_reference),
  amount_paid numeric,
  currency text NOT NULL DEFAULT 'NGN',
  environment text CHECK (environment IN ('test', 'live')),
  status text,
  unlocked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Updated-at trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_recipes_updated_at ON public.recipes;
CREATE TRIGGER trg_recipes_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_payment_transactions_updated_at ON public.payment_transactions;
CREATE TRIGGER trg_payment_transactions_updated_at
  BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_premium_subscriptions_updated_at ON public.premium_subscriptions;
CREATE TRIGGER trg_premium_subscriptions_updated_at
  BEFORE UPDATE ON public.premium_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8. Auto-create profile and default non-premium subscription row on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, business_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'business_name', '')), '')
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        business_name = COALESCE(EXCLUDED.business_name, public.profiles.business_name);

  INSERT INTO public.premium_subscriptions (user_id, is_premium)
  VALUES (NEW.id, false)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 9. Enable Row Level Security (RLS) on ALL user data tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_subscriptions ENABLE ROW LEVEL SECURITY;

-- 10. Policies: Profiles
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

-- 11. Policies: Recipes
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

-- 12. Policies: Recipe Ingredients
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

-- 13. Policies: Payment Transactions & Premium Subscriptions
DROP POLICY IF EXISTS "Users can view own payment transactions" ON public.payment_transactions;
CREATE POLICY "Users can view own payment transactions"
  ON public.payment_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own premium subscription" ON public.premium_subscriptions;
CREATE POLICY "Users can view own premium subscription"
  ON public.premium_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
