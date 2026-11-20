import {
  AlertCircle,
  BookOpen,
  Copy,
  Loader2,
  LogIn,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Recipe } from '../types/bakery';
import {
  calculateRecipeSummary,
  formatNaira,
  formatPercent,
  toNumber,
} from '../utils/calculations';

interface RecipesViewProps {
  recipes: Recipe[];
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  onLoadRecipe: (recipe: Recipe) => void;
  onDuplicateRecipe: (recipe: Recipe) => Promise<void>;
  onDeleteRecipe: (id: string) => Promise<void>;
  onCreateNew: () => void;
  onOpenAuth: (mode?: 'login' | 'signup') => void;
}

export function RecipesView({
  recipes,
  isAuthenticated,
  isLoading,
  error,
  onLoadRecipe,
  onDuplicateRecipe,
  onDeleteRecipe,
  onCreateNew,
  onOpenAuth,
}: RecipesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyRecipeId, setBusyRecipeId] = useState<string | null>(null);

  const filteredRecipes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(q))
    );
  }, [recipes, searchQuery]);

  const formatDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('en-NG', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(iso));
    } catch {
      return 'Recently';
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#EAE0D8]">
        <div>
          <p className="text-xs font-medium text-[#A45567]">Saved Library</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold text-[#3B2A24]">
            My Recipes
          </h1>
        </div>

        <button
          type="button"
          onClick={onCreateNew}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#4A352E] hover:bg-[#3B2A24] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Recipe
        </button>
      </div>

      {/* Sign-in prompt when unauthenticated */}
      {!isAuthenticated && (
        <div className="mt-6 rounded-2xl bg-[#FBF0F2] border border-[#ECCED5] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#3B2A24]">
              Sign in to sync and protect your bakery recipes
            </p>
            <p className="mt-0.5 text-xs text-[#6B544B]">
              Create a free BakeProfit account to save your own recipes privately in your database.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenAuth('login')}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[#4A352E] hover:bg-[#3B2A24] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5" />
            Log In / Sign Up
          </button>
        </div>
      )}

      {/* Database Error Banner */}
      {error && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-2.5 rounded-xl bg-[#FDF2F2] border border-[#F2C6C6] px-4 py-3 text-sm text-[#9B2C2C]"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="mt-10 rounded-3xl bg-white border border-[#EAE0D8] p-10 text-center max-w-lg mx-auto">
          <Loader2 className="w-7 h-7 text-[#A45567] animate-spin mx-auto" />
          <p className="mt-3 text-sm text-[#6B544B]">Loading your saved recipes...</p>
        </div>
      ) : !isAuthenticated ? (
        <div className="mt-10 rounded-3xl bg-white border border-[#EAE0D8] p-10 text-center max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-[#F8E9EC] text-[#A45567] flex items-center justify-center mx-auto">
            <BookOpen className="w-6 h-6" />
          </div>
          <h2 className="mt-4 font-[family-name:var(--font-display)] text-xl font-semibold text-[#3B2A24]">
            Your private recipe book awaits
          </h2>
          <p className="mt-2 text-sm text-[#6B544B]">
            Log in or create an account to save your cake and pastry recipes securely and access them
            from any device.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onOpenAuth('signup')}
              className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#4A352E] hover:bg-[#3B2A24] rounded-xl transition-colors cursor-pointer"
            >
              Create Account
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-[#4A352E] bg-[#FCF9F6] border border-[#E5D7CE] hover:border-[#C56E80] rounded-xl transition-colors cursor-pointer"
            >
              Log In
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Search bar */}
          {recipes.length > 0 && (
            <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative w-full sm:max-w-sm">
                <Search className="w-4 h-4 text-[#8D7369] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search recipes or ingredients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-[#E2D5CC] bg-white text-[#3B2A24] placeholder:text-[#AE988E] focus:outline-none focus:border-[#B56173]"
                />
              </div>
              <p className="text-xs text-[#7A6158] tabular-nums">
                Showing {filteredRecipes.length} of {recipes.length} saved recipes
              </p>
            </div>
          )}

          {/* Empty state */}
          {recipes.length === 0 ? (
            <div className="mt-10 rounded-3xl bg-white border border-[#EAE0D8] p-10 text-center max-w-lg mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-[#F8E9EC] text-[#A45567] flex items-center justify-center mx-auto">
                <BookOpen className="w-6 h-6" />
              </div>
              <h2 className="mt-4 font-[family-name:var(--font-display)] text-xl font-semibold text-[#3B2A24]">
                No saved recipes yet
              </h2>
              <p className="mt-2 text-sm text-[#6B544B]">
                Calculate your first cake or pastry recipe and save it to your account so you can
                update ingredient prices and recalculate anytime.
              </p>
              <button
                type="button"
                onClick={onCreateNew}
                className="mt-6 inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#4A352E] hover:bg-[#3B2A24] rounded-xl transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Create Your First Recipe
              </button>
            </div>
          ) : filteredRecipes.length === 0 ? (
            <div className="mt-8 rounded-2xl bg-white border border-[#EAE0D8] p-8 text-center">
              <p className="text-sm text-[#6B544B]">
                No saved recipes matched &ldquo;{searchQuery}&rdquo;.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-3 text-sm font-semibold text-[#A45567] hover:underline cursor-pointer"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredRecipes.map((recipe) => {
                const summary = calculateRecipeSummary(recipe);
                const yieldCount = toNumber(recipe.yieldCount);
                const unitLabel = recipe.yieldUnitLabel.trim() || 'product';
                const isConfirming = confirmDeleteId === recipe.id;
                const isBusy = busyRecipeId === recipe.id;

                return (
                  <article
                    key={recipe.id}
                    className="rounded-2xl bg-white border border-[#EAE0D8] p-5 flex flex-col justify-between transition-colors hover:border-[#D9C4BA]"
                  >
                    <div>
                      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[#3B2A24] leading-snug">
                        {recipe.name || 'Untitled Recipe'}
                      </h2>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#8D7369]">
                        <span>
                          {yieldCount} {unitLabel}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{recipe.ingredients.length} ingredients</span>
                        <span aria-hidden="true">·</span>
                        <span>Updated {formatDate(recipe.updatedAt)}</span>
                      </div>

                      <div className="mt-5 pt-4 border-t border-[#F3ECE6] grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-[#7A6158]">Total Cost</p>
                          <p className="mt-0.5 font-semibold text-[#3B2A24] tabular-nums">
                            {formatNaira(summary.totalProductionCost)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[#7A6158]">Cost Per {unitLabel}</p>
                          <p className="mt-0.5 font-semibold text-[#3B2A24] tabular-nums">
                            {formatNaira(summary.costPerProduct)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[#7A6158]">Suggested Price</p>
                          <p className="mt-0.5 font-semibold text-[#A45567] tabular-nums">
                            {formatNaira(summary.suggestedSellingPrice)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[#7A6158]">Profit Margin</p>
                          <p className="mt-0.5 font-semibold text-[#2E6B4E] tabular-nums">
                            {formatPercent(summary.actualMarginPercent)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 pt-4 border-t border-[#F3ECE6] flex items-center justify-between gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => onLoadRecipe(recipe)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#4A352E] hover:bg-[#3B2A24] disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit / Recalculate
                      </button>

                      <div className="flex items-center gap-1.5">
                        {!isConfirming ? (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={async () => {
                                setBusyRecipeId(recipe.id);
                                try {
                                  await onDuplicateRecipe(recipe);
                                } finally {
                                  setBusyRecipeId(null);
                                }
                              }}
                              aria-label={`Duplicate ${recipe.name}`}
                              title="Duplicate recipe"
                              className="p-2 rounded-xl text-[#6B544B] hover:bg-[#F7F1EB] hover:text-[#3B2A24] disabled:opacity-50 transition-colors cursor-pointer"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setConfirmDeleteId(recipe.id)}
                              aria-label={`Delete ${recipe.name}`}
                              title="Delete recipe"
                              className="p-2 rounded-xl text-[#6B544B] hover:bg-[#FDF2F2] hover:text-[#B44141] disabled:opacity-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={async () => {
                                setBusyRecipeId(recipe.id);
                                try {
                                  await onDeleteRecipe(recipe.id);
                                  setConfirmDeleteId(null);
                                } finally {
                                  setBusyRecipeId(null);
                                }
                              }}
                              className="px-2.5 py-1.5 text-xs font-semibold text-white bg-[#B44141] hover:bg-[#963333] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                            >
                              {isBusy ? 'Deleting...' : 'Delete'}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1.5 text-xs font-medium text-[#6B544B] hover:bg-[#F7F1EB] rounded-lg transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
