/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { User } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { AuthModal } from './components/AuthModal';
import { CalculatorView } from './components/CalculatorView';
import { Footer } from './components/Footer';
import { LandingPage } from './components/LandingPage';
import { Navbar } from './components/Navbar';
import { PaymentNotification, PremiumView } from './components/PremiumView';
import { PricingView } from './components/PricingView';
import { RecipesView } from './components/RecipesView';
import { createBlankRecipe, createStarterRecipe } from './data/presets';
import {
  fetchSupabaseHealth,
  initSupabaseClient,
  type SupabaseHealthStatus,
} from './lib/supabase';
import {
  NavTab,
  PaymentConfigResponse,
  PremiumStatusResponse,
  Recipe,
} from './types/bakery';
import {
  fetchPaymentConfig,
  fetchPremiumStatus,
  verifyNovacPaymentOnServer,
} from './utils/payments';
import {
  deleteUserRecipe,
  fetchUserProfile,
  fetchUserRecipes,
  saveUserRecipe,
} from './utils/recipesDb';
import {
  loadActiveDraftRecipe,
  persistActiveDraftRecipe,
} from './utils/storage';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [userFullName, setUserFullName] = useState<string | null>(null);
  const [authModalState, setAuthModalState] = useState<{
    open: boolean;
    mode: 'login' | 'signup';
    promptMessage?: string | null;
  }>({ open: false, mode: 'login', promptMessage: null });

  const [savedRecipes, setSavedRecipes] = useState<Recipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipesError, setRecipesError] = useState<string | null>(null);

  const [activeRecipe, setActiveRecipe] = useState<Recipe>(
    () => loadActiveDraftRecipe() ?? createStarterRecipe()
  );

  const [paymentConfig, setPaymentConfig] = useState<PaymentConfigResponse | null>(null);
  const [premiumStatus, setPremiumStatus] = useState<PremiumStatusResponse | null>(null);
  const [supabaseHealth, setSupabaseHealth] = useState<SupabaseHealthStatus | null>(null);
  const [paymentNotification, setPaymentNotification] = useState<PaymentNotification | null>(
    null
  );

  const refreshPremiumData = useCallback(async () => {
    try {
      const [cfg, status] = await Promise.all([
        fetchPaymentConfig(),
        fetchPremiumStatus(),
      ]);
      setPaymentConfig(cfg);
      setPremiumStatus(status);
    } catch {
      // Keep UI functional if backend payment check temporarily fails
    }
  }, []);

  const loadAuthenticatedUserData = useCallback(async (user: User) => {
    const supabase = await initSupabaseClient();
    if (!supabase) return;

    setRecipesLoading(true);
    setRecipesError(null);
    try {
      const [recipes, profile] = await Promise.all([
        fetchUserRecipes(supabase, user.id),
        fetchUserProfile(supabase, user.id),
      ]);
      setSavedRecipes(recipes);
      setUserFullName(
        profile?.fullName ||
          (typeof user.user_metadata?.full_name === 'string'
            ? user.user_metadata.full_name
            : null)
      );
    } catch (err) {
      setRecipesError(
        err instanceof Error
          ? err.message
          : 'Could not load your saved recipes from Supabase.'
      );
    } finally {
      setRecipesLoading(false);
    }
  }, []);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;
    let active = true;

    const setup = async () => {
      try {
        const health = await fetchSupabaseHealth();
        if (active) setSupabaseHealth(health);
      } catch {
        // Ignore health check errors on mount
      }

      const supabase = await initSupabaseClient();
      if (!active) return;

      if (supabase) {
        const { data } = await supabase.auth.getSession();
        const sessionUser = data.session?.user ?? null;
        if (active) {
          setAuthUser(sessionUser);
          if (sessionUser) {
            await loadAuthenticatedUserData(sessionUser);
          } else {
            setSavedRecipes([]);
            setUserFullName(null);
          }
        }

        const listener = supabase.auth.onAuthStateChange(async (_event, session) => {
          const nextUser = session?.user ?? null;
          setAuthUser(nextUser);
          if (nextUser) {
            await Promise.all([
              loadAuthenticatedUserData(nextUser),
              refreshPremiumData(),
            ]);
          } else {
            setSavedRecipes([]);
            setUserFullName(null);
            setRecipesError(null);
            await refreshPremiumData();
          }
        });
        subscription = listener.data.subscription;
      }

      await refreshPremiumData();

      const params = new URLSearchParams(window.location.search);
      const outcome = params.get('payment_outcome');
      const reference = params.get('reference') || '';

      if (outcome && active) {
        setActiveTab('premium');

        if (outcome === 'successful') {
          setPaymentNotification({
            type: 'successful',
            message: 'Payment verified with Novac. BakeProfit Premium is now unlocked.',
            reference: reference || undefined,
          });
        } else if (outcome === 'failed') {
          setPaymentNotification({
            type: 'failed',
            message: 'Your payment could not be completed. No charge was confirmed.',
            reference: reference || undefined,
          });
        } else if (outcome === 'cancelled' || outcome === 'abandoned') {
          setPaymentNotification({
            type: 'cancelled',
            message: 'Payment was cancelled before completion.',
            reference: reference || undefined,
          });
        } else if (reference) {
          try {
            const verified = await verifyNovacPaymentOnServer(reference);
            await refreshPremiumData();
            if (verified.outcome === 'successful') {
              setPaymentNotification({
                type: 'successful',
                message: 'Payment verified with Novac. BakeProfit Premium is now unlocked.',
                reference,
              });
            } else {
              setPaymentNotification({
                type: verified.outcome === 'failed' ? 'failed' : 'pending',
                message: verified.message,
                reference,
              });
            }
          } catch {
            setPaymentNotification({
              type: 'error',
              message: 'Could not verify payment status automatically. Use Verify Now below.',
              reference,
            });
          }
        }

        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };

    void setup();

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [loadAuthenticatedUserData, refreshPremiumData]);

  useEffect(() => {
    persistActiveDraftRecipe(activeRecipe);
  }, [activeRecipe]);

  const navigateTo = (tab: NavTab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openAuthModal = (mode: 'login' | 'signup' = 'login', promptMessage?: string) => {
    setAuthModalState({ open: true, mode, promptMessage: promptMessage ?? null });
  };

  const handleLogout = async () => {
    const supabase = await initSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setAuthUser(null);
    setUserFullName(null);
    setSavedRecipes([]);
    setRecipesError(null);
    setActiveRecipe(createStarterRecipe());
    await refreshPremiumData();
  };

  const handleSaveRecipe = async (recipeToSave: Recipe, asNew = false) => {
    if (!authUser) {
      openAuthModal('login', 'Log in or create a free account to save your recipes.');
      return;
    }

    const supabase = await initSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client is not configured.');
    }

    const saved = await saveUserRecipe(supabase, authUser.id, recipeToSave, asNew);
    setSavedRecipes((prev) => {
      const exists = prev.some((r) => r.id === saved.id);
      if (exists) {
        return prev.map((r) => (r.id === saved.id ? saved : r));
      }
      return [saved, ...prev];
    });
    setActiveRecipe(saved);
  };

  const handleLoadRecipe = (recipe: Recipe) => {
    setActiveRecipe({
      ...recipe,
      ingredients: recipe.ingredients.map((i) => ({ ...i })),
      expenses: { ...recipe.expenses },
    });
    navigateTo('calculator');
  };

  const handleDuplicateRecipe = async (recipe: Recipe) => {
    if (!authUser) {
      openAuthModal('login', 'Log in to duplicate saved recipes.');
      return;
    }
    const supabase = await initSupabaseClient();
    if (!supabase) return;

    const duplicated = await saveUserRecipe(supabase, authUser.id, recipe, true);
    setSavedRecipes((prev) => [duplicated, ...prev]);
  };

  const handleDeleteRecipe = async (id: string) => {
    if (!authUser) return;
    const supabase = await initSupabaseClient();
    if (!supabase) return;

    await deleteUserRecipe(supabase, authUser.id, id);
    setSavedRecipes((prev) => prev.filter((r) => r.id !== id));
  };

  const handleNewBlankRecipe = () => {
    setActiveRecipe(createBlankRecipe());
    navigateTo('calculator');
  };

  const handleOpenCalculator = (recipe?: Recipe) => {
    if (recipe) {
      handleLoadRecipe(recipe);
      return;
    }
    navigateTo('calculator');
  };

  const isAuthenticated = Boolean(authUser);
  const isPremium = Boolean(isAuthenticated && premiumStatus?.isPremium);

  return (
    <div className="min-h-screen flex flex-col bg-[#FCF9F6] text-[#3B2A24]">
      <Navbar
        activeTab={activeTab}
        userEmail={authUser?.email ?? null}
        onNavigate={navigateTo}
        onOpenAuth={(mode) => openAuthModal(mode)}
        onLogout={() => void handleLogout()}
      />

      {supabaseHealth && supabaseHealth.configured && !supabaseHealth.tablesReady && (
        <div className="no-print bg-[#FDF2F2] border-b border-[#F2C6C6] px-4 py-2.5 text-center text-xs text-[#9B2C2C]">
          Supabase database setup incomplete: run{' '}
          <span className="font-[family-name:var(--font-mono)] font-medium">
            supabase/migrations/001_bakeprofit_schema.sql
          </span>{' '}
          in your Supabase SQL Editor to create tables ({supabaseHealth.missingTables.join(', ')}).
        </div>
      )}

      <main className="flex-1">
        {activeTab === 'home' && (
          <LandingPage
            onStartCalculating={() => navigateTo('calculator')}
            onNavigate={navigateTo}
          />
        )}

        {activeTab === 'calculator' && (
          <CalculatorView
            recipe={activeRecipe}
            savedRecipes={savedRecipes}
            isPremium={isPremium}
            isAuthenticated={isAuthenticated}
            onChangeRecipe={setActiveRecipe}
            onSaveRecipe={handleSaveRecipe}
            onNewBlankRecipe={handleNewBlankRecipe}
            onGoToRecipes={() => navigateTo('recipes')}
            onGoToPremium={() => navigateTo('premium')}
            onRequireAuth={(msg) => openAuthModal('login', msg)}
          />
        )}

        {activeTab === 'recipes' && (
          <RecipesView
            recipes={savedRecipes}
            isAuthenticated={isAuthenticated}
            isLoading={recipesLoading}
            error={recipesError}
            onLoadRecipe={handleLoadRecipe}
            onDuplicateRecipe={handleDuplicateRecipe}
            onDeleteRecipe={handleDeleteRecipe}
            onCreateNew={handleNewBlankRecipe}
            onOpenAuth={(mode) => openAuthModal(mode)}
          />
        )}

        {activeTab === 'pricing' && (
          <PricingView
            activeRecipe={activeRecipe}
            savedRecipes={savedRecipes}
            onOpenCalculator={handleOpenCalculator}
          />
        )}

        {activeTab === 'premium' && (
          <PremiumView
            onBackToCalculator={() => navigateTo('calculator')}
            isAuthenticated={isAuthenticated}
            userEmail={authUser?.email ?? null}
            userFullName={userFullName}
            onRequireAuth={(msg) => openAuthModal('login', msg)}
            paymentConfig={paymentConfig}
            premiumStatus={premiumStatus}
            notification={paymentNotification}
            onDismissNotification={() => setPaymentNotification(null)}
            onRefreshPremiumStatus={refreshPremiumData}
            onSetNotification={setPaymentNotification}
          />
        )}
      </main>

      <Footer onNavigate={navigateTo} />

      {authModalState.open && (
        <AuthModal
          initialMode={authModalState.mode}
          promptMessage={authModalState.promptMessage}
          onClose={() =>
            setAuthModalState((prev) => ({ ...prev, open: false, promptMessage: null }))
          }
          onSuccess={() => {
            void refreshPremiumData();
          }}
        />
      )}
    </div>
  );
}
