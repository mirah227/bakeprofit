import {
  AlertCircle,
  BookmarkCheck,
  Check,
  Copy,
  Download,
  FilePlus2,
  Plus,
  Printer,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { COMMON_INGREDIENTS, IngredientTemplate } from '../data/presets';
import { IngredientItem, Recipe, UnitOfMeasure } from '../types/bakery';
import {
  ALL_UNITS,
  calculateRecipeSummary,
  formatNaira,
  formatPercent,
  getCompatibleUnits,
  getDefaultUsedUnitForPurchase,
  toNumber,
  UNIT_META,
} from '../utils/calculations';
import { SummaryCards } from './SummaryCards';

interface CalculatorViewProps {
  recipe: Recipe;
  savedRecipes: Recipe[];
  isPremium: boolean;
  isAuthenticated: boolean;
  onChangeRecipe: (updated: Recipe) => void;
  onSaveRecipe: (recipe: Recipe, asNew?: boolean) => Promise<void>;
  onNewBlankRecipe: () => void;
  onGoToRecipes: () => void;
  onGoToPremium: () => void;
  onRequireAuth: (message: string) => void;
}

const MARGIN_PRESETS = [25, 35, 40, 50, 60];

export function CalculatorView({
  recipe,
  savedRecipes,
  isPremium,
  isAuthenticated,
  onChangeRecipe,
  onSaveRecipe,
  onNewBlankRecipe,
  onGoToRecipes,
  onGoToPremium,
  onRequireAuth,
}: CalculatorViewProps) {
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  const summary = useMemo(() => calculateRecipeSummary(recipe), [recipe]);
  const isExistingSaved = savedRecipes.some((r) => r.id === recipe.id);

  const updateField = <K extends keyof Recipe>(field: K, value: Recipe[K]) => {
    if (field === 'name' && nameError) setNameError(null);
    onChangeRecipe({ ...recipe, [field]: value });
  };

  const updateIngredient = (
    id: string,
    patch: Partial<IngredientItem>
  ) => {
    const nextIngredients = recipe.ingredients.map((item) => {
      if (item.id !== id) return item;
      const updated = { ...item, ...patch };
      if (patch.purchaseUnit && patch.purchaseUnit !== item.purchaseUnit) {
        const compatible = getCompatibleUnits(patch.purchaseUnit);
        if (!compatible.includes(updated.usedUnit)) {
          updated.usedUnit = getDefaultUsedUnitForPurchase(patch.purchaseUnit);
        }
      }
      return updated;
    });
    onChangeRecipe({ ...recipe, ingredients: nextIngredients });
  };

  const addBlankIngredient = () => {
    const newItem: IngredientItem = {
      id: `ing-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: '',
      quantityUsed: '',
      usedUnit: 'g',
      purchaseQuantity: '',
      purchaseUnit: 'kg',
      purchasePrice: '',
    };
    onChangeRecipe({
      ...recipe,
      ingredients: [...recipe.ingredients, newItem],
    });
  };

  const addTemplateIngredient = (tpl: IngredientTemplate) => {
    const newItem: IngredientItem = {
      id: `ing-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: tpl.name,
      quantityUsed: tpl.defaultUsedQuantity,
      usedUnit: tpl.defaultUsedUnit,
      purchaseQuantity: tpl.purchaseQuantity,
      purchaseUnit: tpl.purchaseUnit,
      purchasePrice: tpl.purchasePrice,
    };
    onChangeRecipe({
      ...recipe,
      ingredients: [...recipe.ingredients, newItem],
    });
    setShowQuickAdd(false);
  };

  const removeIngredient = (id: string) => {
    if (recipe.ingredients.length <= 1) {
      onChangeRecipe({
        ...recipe,
        ingredients: [
          {
            id: `ing-${Date.now()}`,
            name: '',
            quantityUsed: '',
            usedUnit: 'g',
            purchaseQuantity: '',
            purchaseUnit: 'kg',
            purchasePrice: '',
          },
        ],
      });
      return;
    }
    onChangeRecipe({
      ...recipe,
      ingredients: recipe.ingredients.filter((item) => item.id !== id),
    });
  };

  const updateExpense = (field: keyof Recipe['expenses'], rawValue: string) => {
    const parsed = rawValue === '' ? '' : Math.max(0, Number(rawValue));
    onChangeRecipe({
      ...recipe,
      expenses: {
        ...recipe.expenses,
        [field]: rawValue === '' ? '' : Number.isFinite(parsed) ? parsed : 0,
      },
    });
  };

  const handleNumericInput = (rawValue: string): number | '' => {
    if (rawValue === '') return '';
    const num = Number(rawValue);
    return Number.isFinite(num) ? num : '';
  };

  const handleSave = async (asNew = false) => {
    if (!recipe.name.trim()) {
      setNameError('Please enter a recipe name before saving.');
      return;
    }
    if (summary.hasIngredientErrors) {
      setNameError('Fix ingredient unit or quantity errors before saving.');
      return;
    }
    if (!isAuthenticated) {
      onRequireAuth('Log in or create a free BakeProfit account to save your recipes.');
      return;
    }
    setNameError(null);
    setIsSaving(true);
    try {
      await onSaveRecipe(recipe, asNew);
      setSaveFeedback(asNew ? 'Saved as a new recipe.' : 'Recipe saved to My Recipes.');
      window.setTimeout(() => setSaveFeedback(null), 3200);
    } catch (err) {
      setNameError(
        err instanceof Error ? err.message : 'Unable to save recipe to Supabase.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const yieldCountNum = toNumber(recipe.yieldCount);
  const marginNum = toNumber(recipe.desiredMarginPercent);

  const ingredientShare =
    summary.suggestedSellingPrice > 0 && yieldCountNum > 0
      ? ((summary.totalIngredientCost / yieldCountNum) / summary.suggestedSellingPrice) * 100
      : 0;
  const expenseShare =
    summary.suggestedSellingPrice > 0 && yieldCountNum > 0
      ? ((summary.totalExpenses / yieldCountNum) / summary.suggestedSellingPrice) * 100
      : 0;
  const profitShare =
    summary.suggestedSellingPrice > 0
      ? (summary.expectedProfitPerProduct / summary.suggestedSellingPrice) * 100
      : 0;

  const handleDownloadCostReport = () => {
    const safeTitle = (recipe.name.trim() || 'BakeProfit Recipe').replace(/[<>&"]/g, '');
    const unitLabel = (recipe.yieldUnitLabel.trim() || 'product').replace(/[<>&"]/g, '');
    const rowsHtml = recipe.ingredients
      .map((item) => {
        const res = summary.ingredientResults[item.id] ?? { cost: 0 };
        const safeName = (item.name.trim() || 'Unnamed Ingredient').replace(/[<>&"]/g, '');
        return `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">${safeName}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">${item.purchaseQuantity || 0} ${item.purchaseUnit} @ ${formatNaira(toNumber(item.purchasePrice))}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">${item.quantityUsed || 0} ${item.usedUnit}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${formatNaira(res.cost)}</td>
        </tr>`;
      })
      .join('');

    const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${safeTitle} — BakeProfit Cost Report</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;color:#3B2A24;max-width:760px;margin:40px auto;padding:0 24px;line-height:1.5;">
  <h1 style="margin:0 0 4px;">${safeTitle}</h1>
  <p style="margin:0 0 24px;color:#7A6158;font-size:14px;">BakeProfit Costing Report · Yield: ${yieldCountNum} ${unitLabel} · Target Margin: ${formatPercent(marginNum)}</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
    <thead>
      <tr style="border-bottom:2px solid #E5D7CE;text-align:left;color:#7A6158;font-size:12px;">
        <th style="padding:8px 0;">Ingredient</th>
        <th style="padding:8px 0;">Purchase Pack</th>
        <th style="padding:8px 0;">Used</th>
        <th style="padding:8px 0;text-align:right;">Cost</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div style="background:#FCF9F6;border:1px solid #EAE0D8;border-radius:12px;padding:20px;font-size:14px;">
    <p style="margin:4px 0;display:flex;justify-content:space-between;"><span>Total Ingredient Cost:</span><strong>${formatNaira(summary.totalIngredientCost)}</strong></p>
    <p style="margin:4px 0;display:flex;justify-content:space-between;"><span>Packaging &amp; Production Expenses:</span><strong>${formatNaira(summary.totalExpenses)}</strong></p>
    <p style="margin:4px 0;display:flex;justify-content:space-between;"><span>Total Production Cost:</span><strong>${formatNaira(summary.totalProductionCost)}</strong></p>
    <p style="margin:4px 0;display:flex;justify-content:space-between;"><span>Cost Per ${unitLabel}:</span><strong>${formatNaira(summary.costPerProduct)}</strong></p>
    <hr style="border:none;border-top:1px solid #EAE0D8;margin:12px 0;">
    <p style="margin:4px 0;display:flex;justify-content:space-between;font-size:16px;"><span>Suggested Selling Price:</span><strong>${formatNaira(summary.suggestedSellingPrice)}</strong></p>
    <p style="margin:4px 0;display:flex;justify-content:space-between;color:#2E6B4E;"><span>Expected Profit Per ${unitLabel}:</span><strong>${formatNaira(summary.expectedProfitPerProduct)}</strong></p>
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(recipe.name.trim() || 'bakeprofit-recipe').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-cost-report.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      {/* Top Toolbar */}
      <div className="no-print flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-[#EAE0D8]">
        <div>
          <p className="text-xs font-medium text-[#A45567]">Recipe Costing Workspace</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold text-[#3B2A24]">
            Bakery Cost &amp; Profit Calculator
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onNewBlankRecipe}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium text-[#4A352E] bg-white border border-[#E5D7CE] hover:border-[#C56E80] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FilePlus2 className="w-4 h-4" />
            New Blank
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium text-[#4A352E] bg-white border border-[#E5D7CE] hover:border-[#C56E80] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Print Cost Sheet
          </button>

          {isPremium && (
            <button
              type="button"
              onClick={handleDownloadCostReport}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium text-[#2E6B4E] bg-[#F0F7F3] border border-[#C6E2D1] hover:bg-[#E4F2EA] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download Report
            </button>
          )}

          {isExistingSaved && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void handleSave(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium text-[#4A352E] bg-white border border-[#E5D7CE] hover:border-[#C56E80] disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Copy className="w-4 h-4" />
              Save Copy
            </button>
          )}

          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSave(false)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#4A352E] hover:bg-[#3B2A24] disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BookmarkCheck className="w-4 h-4" />
            {isSaving
              ? 'Saving...'
              : isExistingSaved
              ? 'Update Recipe'
              : 'Save Recipe'}
          </button>
        </div>
      </div>

      {/* Feedback & Validation Alerts */}
      {nameError && (
        <div
          role="alert"
          className="no-print mt-4 flex items-center gap-2.5 rounded-xl bg-[#FDF2F2] border border-[#F2C6C6] px-4 py-3 text-sm text-[#9B2C2C]"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{nameError}</span>
        </div>
      )}

      {saveFeedback && (
        <div
          role="status"
          className="no-print mt-4 flex items-center justify-between gap-3 rounded-xl bg-[#F0F7F3] border border-[#C6E2D1] px-4 py-3 text-sm text-[#245A3F]"
        >
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{saveFeedback}</span>
          </div>
          <button
            type="button"
            onClick={onGoToRecipes}
            className="text-xs font-semibold underline hover:no-underline cursor-pointer whitespace-nowrap"
          >
            View My Recipes
          </button>
        </div>
      )}

      <div className="mt-7 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Recipe Info, Ingredients, Expenses */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
          {/* Recipe Details Card */}
          <section className="rounded-2xl bg-white border border-[#EAE0D8] p-5 sm:p-6">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[#3B2A24]">
              Recipe Details
            </h2>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-4">
              <div className="sm:col-span-6">
                <label
                  htmlFor="recipe-name"
                  className="block text-xs font-medium text-[#6B544B] mb-1.5"
                >
                  Recipe Name
                </label>
                <input
                  id="recipe-name"
                  type="text"
                  placeholder="e.g. 8-Inch Chocolate Fudge Cake"
                  value={recipe.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] placeholder:text-[#AE988E] focus:outline-none focus:border-[#B56173] focus:bg-white transition-colors"
                />
              </div>

              <div className="sm:col-span-3">
                <label
                  htmlFor="yield-count"
                  className="block text-xs font-medium text-[#6B544B] mb-1.5"
                >
                  Products Produced
                </label>
                <input
                  id="yield-count"
                  type="number"
                  min={1}
                  step="any"
                  placeholder="1"
                  value={recipe.yieldCount}
                  onChange={(e) => updateField('yieldCount', handleNumericInput(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] tabular-nums focus:outline-none focus:border-[#B56173] focus:bg-white transition-colors"
                />
              </div>

              <div className="sm:col-span-3">
                <label
                  htmlFor="yield-label"
                  className="block text-xs font-medium text-[#6B544B] mb-1.5"
                >
                  Product Unit
                </label>
                <input
                  id="yield-label"
                  type="text"
                  placeholder="cake"
                  value={recipe.yieldUnitLabel}
                  onChange={(e) => updateField('yieldUnitLabel', e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] focus:outline-none focus:border-[#B56173] focus:bg-white transition-colors"
                />
              </div>
            </div>

            {!summary.isYieldValid && (
              <p className="mt-2.5 text-xs text-[#B44141]">
                Enter at least 1 product produced so we can calculate cost per item.
              </p>
            )}
          </section>

          {/* Ingredients Card */}
          <section className="rounded-2xl bg-white border border-[#EAE0D8] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#F2EAE4]">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[#3B2A24]">
                  Ingredients
                </h2>
                <p className="text-xs text-[#7A6158] mt-0.5">
                  Enter pack purchase price &amp; size, plus the exact amount used in this recipe.
                </p>
              </div>

              <div className="no-print relative flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowQuickAdd((prev) => !prev)}
                  className="px-3 py-2 text-xs font-medium text-[#6B544B] bg-[#FCF9F6] border border-[#E5D7CE] hover:border-[#C56E80] rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                >
                  Quick Pantry Add
                </button>
                <button
                  type="button"
                  onClick={addBlankIngredient}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#A45567] hover:bg-[#8E4455] rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Ingredient
                </button>

                {showQuickAdd && (
                  <div className="absolute right-0 top-11 z-20 w-72 rounded-2xl bg-white border border-[#E5D7CE] shadow-lg p-3">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#F2EAE4]">
                      <span className="text-xs font-semibold text-[#3B2A24]">
                        Tap to add common staple
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowQuickAdd(false)}
                        className="text-xs text-[#7A6158] hover:text-[#3B2A24] cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-[#F7F1EC]">
                      {COMMON_INGREDIENTS.map((tpl) => (
                        <button
                          key={tpl.name}
                          type="button"
                          onClick={() => addTemplateIngredient(tpl)}
                          className="w-full text-left py-2 px-2 hover:bg-[#FCF7F8] rounded-lg transition-colors cursor-pointer"
                        >
                          <p className="text-xs font-medium text-[#3B2A24]">{tpl.name}</p>
                          <p className="text-[11px] text-[#8D7369] tabular-nums">
                            Pack: {tpl.purchaseQuantity} {tpl.purchaseUnit} @{' '}
                            {formatNaira(tpl.purchasePrice)} · Uses {tpl.defaultUsedQuantity}{' '}
                            {tpl.defaultUsedUnit}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Ingredient Rows */}
            <div className="divide-y divide-[#F2EAE4]">
              {recipe.ingredients.map((item, idx) => {
                const res = summary.ingredientResults[item.id] ?? { cost: 0, isValid: true };
                const compatibleUsedUnits = getCompatibleUnits(item.purchaseUnit);

                return (
                  <div key={item.id} className="py-4 first:pt-4 last:pb-2">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                      {/* Name */}
                      <div className="sm:col-span-4">
                        <label
                          htmlFor={`ing-name-${item.id}`}
                          className="block text-[11px] font-medium text-[#7A6158] mb-1"
                        >
                          Ingredient {idx + 1}
                        </label>
                        <input
                          id={`ing-name-${item.id}`}
                          type="text"
                          placeholder="e.g. All-Purpose Flour"
                          value={item.name}
                          onChange={(e) => updateIngredient(item.id, { name: e.target.value })}
                          className="w-full px-3 py-2 text-sm rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] placeholder:text-[#AE988E] focus:outline-none focus:border-[#B56173] focus:bg-white"
                        />
                      </div>

                      {/* Purchase Qty + Unit */}
                      <div className="sm:col-span-3">
                        <label
                          htmlFor={`ing-pqty-${item.id}`}
                          className="block text-[11px] font-medium text-[#7A6158] mb-1"
                        >
                          Purchase Qty
                        </label>
                        <div className="flex">
                          <input
                            id={`ing-pqty-${item.id}`}
                            type="number"
                            min={0}
                            step="any"
                            placeholder="2"
                            value={item.purchaseQuantity}
                            onChange={(e) =>
                              updateIngredient(item.id, {
                                purchaseQuantity: handleNumericInput(e.target.value),
                              })
                            }
                            className="w-full min-w-0 px-2.5 py-2 text-sm rounded-l-xl border border-r-0 border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] tabular-nums focus:outline-none focus:border-[#B56173] focus:bg-white"
                          />
                          <select
                            aria-label="Purchase unit"
                            value={item.purchaseUnit}
                            onChange={(e) =>
                              updateIngredient(item.id, {
                                purchaseUnit: e.target.value as UnitOfMeasure,
                              })
                            }
                            className="px-2 py-2 text-xs font-medium rounded-r-xl border border-[#E2D5CC] bg-[#F6EFEA] text-[#4A352E] focus:outline-none focus:border-[#B56173] cursor-pointer"
                          >
                            {ALL_UNITS.map((u) => (
                              <option key={u} value={u}>
                                {UNIT_META[u].shortLabel}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Purchase Price */}
                      <div className="sm:col-span-2">
                        <label
                          htmlFor={`ing-price-${item.id}`}
                          className="block text-[11px] font-medium text-[#7A6158] mb-1"
                        >
                          Price (₦)
                        </label>
                        <input
                          id={`ing-price-${item.id}`}
                          type="number"
                          min={0}
                          step="any"
                          placeholder="4000"
                          value={item.purchasePrice}
                          onChange={(e) =>
                            updateIngredient(item.id, {
                              purchasePrice: handleNumericInput(e.target.value),
                            })
                          }
                          className="w-full px-2.5 py-2 text-sm rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] tabular-nums focus:outline-none focus:border-[#B56173] focus:bg-white"
                        />
                      </div>

                      {/* Quantity Used + Unit */}
                      <div className="sm:col-span-3">
                        <label
                          htmlFor={`ing-uqty-${item.id}`}
                          className="block text-[11px] font-medium text-[#7A6158] mb-1"
                        >
                          Qty Used
                        </label>
                        <div className="flex">
                          <input
                            id={`ing-uqty-${item.id}`}
                            type="number"
                            min={0}
                            step="any"
                            placeholder="500"
                            value={item.quantityUsed}
                            onChange={(e) =>
                              updateIngredient(item.id, {
                                quantityUsed: handleNumericInput(e.target.value),
                              })
                            }
                            className="w-full min-w-0 px-2.5 py-2 text-sm rounded-l-xl border border-r-0 border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] tabular-nums focus:outline-none focus:border-[#B56173] focus:bg-white"
                          />
                          <select
                            aria-label="Used unit"
                            value={item.usedUnit}
                            onChange={(e) =>
                              updateIngredient(item.id, {
                                usedUnit: e.target.value as UnitOfMeasure,
                              })
                            }
                            className="px-2 py-2 text-xs font-medium rounded-r-xl border border-[#E2D5CC] bg-[#F6EFEA] text-[#4A352E] focus:outline-none focus:border-[#B56173] cursor-pointer"
                          >
                            {compatibleUsedUnits.map((u) => (
                              <option key={u} value={u}>
                                {UNIT_META[u].shortLabel}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Row Cost & Delete Action */}
                    <div className="mt-2.5 flex items-center justify-between gap-4">
                      <div>
                        {!res.isValid ? (
                          <span className="inline-flex items-center gap-1 text-xs text-[#B44141]">
                            <AlertCircle className="w-3.5 h-3.5" />
                            {res.error}
                          </span>
                        ) : (
                          <span className="text-xs text-[#8D7369]">
                            Ingredient cost:{' '}
                            <strong className="font-[family-name:var(--font-mono)] font-medium text-[#3B2A24] tabular-nums">
                              {formatNaira(res.cost)}
                            </strong>
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => removeIngredient(item.id)}
                        aria-label={`Remove ${item.name || `ingredient ${idx + 1}`}`}
                        className="no-print inline-flex items-center gap-1 text-xs text-[#8D7369] hover:text-[#B44141] transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-[#EAE0D8] flex items-center justify-between">
              <span className="text-sm font-medium text-[#6B544B]">Total Ingredient Cost</span>
              <span className="font-[family-name:var(--font-mono)] text-base font-semibold text-[#3B2A24] tabular-nums">
                {formatNaira(summary.totalIngredientCost)}
              </span>
            </div>
          </section>

          {/* Production Expenses Card */}
          <section className="rounded-2xl bg-white border border-[#EAE0D8] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#F2EAE4]">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[#3B2A24]">
                  Packaging &amp; Production Expenses
                </h2>
                <p className="text-xs text-[#7A6158] mt-0.5">
                  Include cake boxes, boards, ribbons, baking time, gas, and electricity.
                </p>
              </div>
              <span className="font-[family-name:var(--font-mono)] text-sm font-semibold text-[#3B2A24] tabular-nums">
                {formatNaira(summary.totalExpenses)}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="exp-packaging"
                  className="block text-xs font-medium text-[#6B544B] mb-1.5"
                >
                  Packaging Costs (₦)
                </label>
                <input
                  id="exp-packaging"
                  type="number"
                  min={0}
                  step="any"
                  placeholder="e.g. 1500"
                  value={recipe.expenses.packaging}
                  onChange={(e) => updateExpense('packaging', e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] tabular-nums focus:outline-none focus:border-[#B56173] focus:bg-white"
                />
              </div>

              <div>
                <label
                  htmlFor="exp-labour"
                  className="block text-xs font-medium text-[#6B544B] mb-1.5"
                >
                  Labour / Baker Time (₦)
                </label>
                <input
                  id="exp-labour"
                  type="number"
                  min={0}
                  step="any"
                  placeholder="e.g. 2500"
                  value={recipe.expenses.labour}
                  onChange={(e) => updateExpense('labour', e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] tabular-nums focus:outline-none focus:border-[#B56173] focus:bg-white"
                />
              </div>

              <div>
                <label
                  htmlFor="exp-electricity"
                  className="block text-xs font-medium text-[#6B544B] mb-1.5"
                >
                  Electricity &amp; Gas (₦)
                </label>
                <input
                  id="exp-electricity"
                  type="number"
                  min={0}
                  step="any"
                  placeholder="e.g. 1200"
                  value={recipe.expenses.electricity}
                  onChange={(e) => updateExpense('electricity', e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] tabular-nums focus:outline-none focus:border-[#B56173] focus:bg-white"
                />
              </div>

              <div>
                <label
                  htmlFor="exp-other"
                  className="block text-xs font-medium text-[#6B544B] mb-1.5"
                >
                  Other Expenses (₦)
                </label>
                <input
                  id="exp-other"
                  type="number"
                  min={0}
                  step="any"
                  placeholder="e.g. 500"
                  value={recipe.expenses.other}
                  onChange={(e) => updateExpense('other', e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] tabular-nums focus:outline-none focus:border-[#B56173] focus:bg-white"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Desired Margin & Live Results */}
        <aside className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-24 space-y-5">
          {/* Margin Selector Card */}
          <div className="rounded-2xl bg-white border border-[#EAE0D8] p-5">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="desired-margin"
                className="text-sm font-semibold text-[#3B2A24]"
              >
                Desired Profit Margin (%)
              </label>
              <div className="w-24">
                <input
                  id="desired-margin"
                  type="number"
                  min={0}
                  max={99}
                  step="any"
                  value={recipe.desiredMarginPercent}
                  onChange={(e) =>
                    updateField('desiredMarginPercent', handleNumericInput(e.target.value))
                  }
                  className="w-full px-3 py-1.5 text-right text-sm font-semibold rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] tabular-nums focus:outline-none focus:border-[#B56173] focus:bg-white"
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {MARGIN_PRESETS.map((pct) => {
                const active = marginNum === pct;
                return (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => updateField('desiredMarginPercent', pct)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer tabular-nums ${
                      active
                        ? 'bg-[#4A352E] text-white'
                        : 'bg-[#F7F1EB] text-[#6B544B] hover:bg-[#EFE4DC]'
                    }`}
                  >
                    {pct}%
                  </button>
                );
              })}
            </div>

            {!summary.isMarginValid && (
              <p className="mt-2.5 text-xs text-[#B44141]">
                Profit margin must be between 0% and 99%.
              </p>
            )}
          </div>

          {/* Summary Metric Cards */}
          <SummaryCards
            totalCost={summary.totalProductionCost}
            costPerProduct={summary.costPerProduct}
            suggestedSellingPrice={summary.suggestedSellingPrice}
            expectedProfitPerProduct={summary.expectedProfitPerProduct}
            expectedTotalProfit={summary.expectedTotalProfit}
            actualMarginPercent={summary.actualMarginPercent}
            yieldCount={yieldCountNum}
            yieldUnitLabel={recipe.yieldUnitLabel}
            isMarginValid={summary.isMarginValid}
          />

          {/* Visual Cost Split */}
          {summary.suggestedSellingPrice > 0 && (
            <div className="rounded-2xl bg-white border border-[#EAE0D8] p-5">
              <h3 className="text-xs font-semibold text-[#3B2A24]">
                Where every naira goes
              </h3>
              <div className="mt-3 h-2.5 w-full rounded-full overflow-hidden flex bg-[#F4ECE6]">
                <div
                  style={{ width: `${Math.max(0, Math.min(100, ingredientShare))}%` }}
                  className="bg-[#C56E80] transition-all duration-200"
                  title="Ingredients"
                />
                <div
                  style={{ width: `${Math.max(0, Math.min(100, expenseShare))}%` }}
                  className="bg-[#8D7369] transition-all duration-200"
                  title="Expenses"
                />
                <div
                  style={{ width: `${Math.max(0, Math.min(100, profitShare))}%` }}
                  className="bg-[#3D7A5B] transition-all duration-200"
                  title="Profit"
                />
              </div>

              <div className="mt-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between text-[#6B544B]">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#C56E80]" />
                    Ingredients
                  </span>
                  <span className="font-medium text-[#3B2A24] tabular-nums">
                    {formatPercent(ingredientShare)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[#6B544B]">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#8D7369]" />
                    Packaging &amp; Overhead
                  </span>
                  <span className="font-medium text-[#3B2A24] tabular-nums">
                    {formatPercent(expenseShare)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[#6B544B]">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#3D7A5B]" />
                    Net Profit
                  </span>
                  <span className="font-medium text-[#2E6B4E] tabular-nums">
                    {formatPercent(profitShare)}
                  </span>
                </div>
              </div>

              {isPremium ? (
                <div className="mt-4 pt-4 border-t border-[#F2EAE4] space-y-2 text-xs">
                  <p className="font-semibold text-[#3B2A24]">Detailed Unit Economics</p>
                  <div className="flex items-center justify-between text-[#6B544B]">
                    <span>Ingredients per {recipe.yieldUnitLabel || 'product'}</span>
                    <span className="font-medium text-[#3B2A24] tabular-nums">
                      {yieldCountNum > 0
                        ? formatNaira(summary.totalIngredientCost / yieldCountNum)
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[#6B544B]">
                    <span>Packaging per {recipe.yieldUnitLabel || 'product'}</span>
                    <span className="font-medium text-[#3B2A24] tabular-nums">
                      {yieldCountNum > 0
                        ? formatNaira(toNumber(recipe.expenses.packaging) / yieldCountNum)
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[#6B544B]">
                    <span>Labour &amp; power per {recipe.yieldUnitLabel || 'product'}</span>
                    <span className="font-medium text-[#3B2A24] tabular-nums">
                      {yieldCountNum > 0
                        ? formatNaira(
                            (toNumber(recipe.expenses.labour) +
                              toNumber(recipe.expenses.electricity) +
                              toNumber(recipe.expenses.other)) /
                              yieldCountNum
                          )
                        : '—'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="no-print mt-4 pt-3 border-t border-[#F2EAE4] flex items-center justify-between text-xs">
                  <span className="text-[#7A6158]">Need downloadable cost reports?</span>
                  <button
                    type="button"
                    onClick={onGoToPremium}
                    className="font-semibold text-[#A45567] hover:underline cursor-pointer"
                  >
                    Unlock Premium
                  </button>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
