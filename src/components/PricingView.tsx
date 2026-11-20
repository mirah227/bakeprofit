import { ArrowRight, HelpCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Recipe } from '../types/bakery';
import {
  calculatePricingForMargin,
  calculateRecipeSummary,
  formatNaira,
  formatPercent,
  toNumber,
} from '../utils/calculations';
import { SummaryCards } from './SummaryCards';

interface PricingViewProps {
  activeRecipe: Recipe;
  savedRecipes: Recipe[];
  onOpenCalculator: (recipe?: Recipe) => void;
}

const COMPARE_MARGINS = [25, 35, 40, 50, 60];

export function PricingView({
  activeRecipe,
  savedRecipes,
  onOpenCalculator,
}: PricingViewProps) {
  const [selectedSource, setSelectedSource] = useState<'active' | 'custom' | string>('active');
  const [customTotalCost, setCustomTotalCost] = useState<number | ''>(12000);
  const [customYield, setCustomYield] = useState<number | ''>(1);
  const [customUnitLabel, setCustomUnitLabel] = useState('cake');
  const [desiredMargin, setDesiredMargin] = useState<number | ''>(
    activeRecipe.desiredMarginPercent === '' ? 40 : Number(activeRecipe.desiredMarginPercent)
  );

  const sourceData = useMemo(() => {
    if (selectedSource === 'custom') {
      const total = Math.max(0, toNumber(customTotalCost));
      const yieldVal = toNumber(customYield);
      const costPerProduct = yieldVal > 0 ? total / yieldVal : 0;
      return {
        label: 'Custom Cost Estimate',
        totalCost: total,
        yieldCount: yieldVal,
        yieldUnitLabel: customUnitLabel || 'product',
        costPerProduct,
        matchedRecipe: undefined as Recipe | undefined,
      };
    }

    const recipe =
      selectedSource === 'active'
        ? activeRecipe
        : savedRecipes.find((r) => r.id === selectedSource) ?? activeRecipe;

    const summary = calculateRecipeSummary(recipe);
    return {
      label: recipe.name || 'Current Calculator Recipe',
      totalCost: summary.totalProductionCost,
      yieldCount: toNumber(recipe.yieldCount),
      yieldUnitLabel: recipe.yieldUnitLabel || 'product',
      costPerProduct: summary.costPerProduct,
      matchedRecipe: recipe,
    };
  }, [selectedSource, activeRecipe, savedRecipes, customTotalCost, customYield, customUnitLabel]);

  const numericMargin = desiredMargin === '' ? 0 : Number(desiredMargin);
  const pricing = useMemo(
    () =>
      calculatePricingForMargin(
        sourceData.costPerProduct,
        numericMargin,
        sourceData.yieldCount
      ),
    [sourceData.costPerProduct, numericMargin, sourceData.yieldCount]
  );

  const handleSelectChange = (val: string) => {
    setSelectedSource(val);
    if (val === 'active') {
      setDesiredMargin(activeRecipe.desiredMarginPercent === '' ? 40 : activeRecipe.desiredMarginPercent);
    } else if (val !== 'custom') {
      const found = savedRecipes.find((r) => r.id === val);
      if (found) {
        setDesiredMargin(found.desiredMarginPercent === '' ? 40 : found.desiredMarginPercent);
      }
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#EAE0D8]">
        <div>
          <p className="text-xs font-medium text-[#A45567]">Selling Price Studio</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold text-[#3B2A24]">
            Pricing Calculator
          </h1>
          <p className="mt-1 text-sm text-[#6B544B]">
            Test profit margins on any saved recipe or custom batch cost to find your ideal selling price.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onOpenCalculator(sourceData.matchedRecipe)}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-[#4A352E] hover:bg-[#3B2A24] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Edit in Calculator
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Controls Column */}
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-2xl bg-white border border-[#EAE0D8] p-5 sm:p-6 space-y-5">
            <div>
              <label
                htmlFor="pricing-source"
                className="block text-xs font-semibold text-[#3B2A24] mb-1.5"
              >
                1. Choose Cost Source
              </label>
              <select
                id="pricing-source"
                value={selectedSource}
                onChange={(e) => handleSelectChange(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] focus:outline-none focus:border-[#B56173] cursor-pointer"
              >
                <option value="active">
                  Current Calculator Draft ({activeRecipe.name || 'Untitled'})
                </option>
                {savedRecipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    Saved: {r.name}
                  </option>
                ))}
                <option value="custom">Enter Custom Production Cost</option>
              </select>
            </div>

            {selectedSource === 'custom' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-[#F2EAE4]">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="custom-cost"
                    className="block text-xs font-medium text-[#6B544B] mb-1"
                  >
                    Total Production Cost (₦)
                  </label>
                  <input
                    id="custom-cost"
                    type="number"
                    min={0}
                    step="any"
                    value={customTotalCost}
                    onChange={(e) =>
                      setCustomTotalCost(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))
                    }
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] tabular-nums focus:outline-none focus:border-[#B56173]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="custom-yield"
                    className="block text-xs font-medium text-[#6B544B] mb-1"
                  >
                    Batch Yield
                  </label>
                  <input
                    id="custom-yield"
                    type="number"
                    min={1}
                    step="any"
                    value={customYield}
                    onChange={(e) =>
                      setCustomYield(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))
                    }
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] tabular-nums focus:outline-none focus:border-[#B56173]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="custom-unit"
                    className="block text-xs font-medium text-[#6B544B] mb-1"
                  >
                    Product Label
                  </label>
                  <input
                    id="custom-unit"
                    type="text"
                    value={customUnitLabel}
                    onChange={(e) => setCustomUnitLabel(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] focus:outline-none focus:border-[#B56173]"
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-[#FCF9F6] border border-[#EFE5DE] p-4 flex items-center justify-between text-sm">
                <div>
                  <p className="text-xs text-[#7A6158]">Active Cost Baseline</p>
                  <p className="font-medium text-[#3B2A24] mt-0.5">{sourceData.label}</p>
                </div>
                <span className="font-[family-name:var(--font-mono)] font-semibold text-[#3B2A24] tabular-nums">
                  {formatNaira(sourceData.totalCost)}
                </span>
              </div>
            )}

            <div className="pt-2 border-t border-[#F2EAE4]">
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="pricing-margin-input"
                  className="text-xs font-semibold text-[#3B2A24]"
                >
                  2. Desired Profit Margin (%)
                </label>
                <input
                  id="pricing-margin-input"
                  type="number"
                  min={0}
                  max={99}
                  step="any"
                  value={desiredMargin}
                  onChange={(e) =>
                    setDesiredMargin(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  className="w-24 px-3 py-1.5 text-right text-sm font-semibold rounded-xl border border-[#E2D5CC] bg-[#FCF9F6] text-[#3B2A24] tabular-nums focus:outline-none focus:border-[#B56173]"
                />
              </div>

              <input
                aria-label="Desired profit margin slider"
                type="range"
                min={5}
                max={75}
                step={1}
                value={Math.min(75, Math.max(5, numericMargin))}
                onChange={(e) => setDesiredMargin(Number(e.target.value))}
                className="mt-3 w-full accent-[#B56173] cursor-pointer"
              />

              {!pricing.isMarginValid && (
                <p className="mt-2 text-xs text-[#B44141]">
                  Please enter a margin between 0% and 99%.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-[#FBF7F3] border border-[#EAE0D8] p-5">
            <div className="flex items-start gap-2.5">
              <HelpCircle className="w-4 h-4 text-[#A45567] mt-0.5 shrink-0" />
              <div>
                <h2 className="text-xs font-semibold text-[#3B2A24]">
                  How BakeProfit prices your cakes
                </h2>
                <p className="mt-1 text-xs text-[#6B544B] leading-relaxed">
                  To earn a true 40% profit margin, we calculate{' '}
                  <span className="font-[family-name:var(--font-mono)] text-[#3B2A24]">
                    Cost &divide; (1 &minus; 0.40)
                  </span>{' '}
                  so that 40% of the final selling price you collect from your customer is pure
                  profit.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Summary & Comparison Column */}
        <div className="lg:col-span-7 space-y-6">
          <SummaryCards
            totalCost={sourceData.totalCost}
            costPerProduct={sourceData.costPerProduct}
            suggestedSellingPrice={pricing.suggestedSellingPrice}
            expectedProfitPerProduct={pricing.expectedProfitPerProduct}
            expectedTotalProfit={pricing.expectedTotalProfit}
            actualMarginPercent={pricing.actualMarginPercent}
            yieldCount={sourceData.yieldCount}
            yieldUnitLabel={sourceData.yieldUnitLabel}
            isMarginValid={pricing.isMarginValid}
          />

          {/* Margin Comparison Table */}
          <div className="rounded-2xl bg-white border border-[#EAE0D8] p-5 sm:p-6">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[#3B2A24]">
              Margin Comparison Guide
            </h2>
            <p className="text-xs text-[#7A6158] mt-0.5">
              Click any row to apply that target profit margin.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#EAE0D8] text-[11px] font-medium text-[#7A6158]">
                    <th className="py-2.5 pr-3">Target Margin</th>
                    <th className="py-2.5 px-3 text-right">Cost / {sourceData.yieldUnitLabel}</th>
                    <th className="py-2.5 px-3 text-right">Selling Price</th>
                    <th className="py-2.5 pl-3 text-right">Profit / {sourceData.yieldUnitLabel}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4ECE6] text-sm">
                  {COMPARE_MARGINS.map((m) => {
                    const row = calculatePricingForMargin(
                      sourceData.costPerProduct,
                      m,
                      sourceData.yieldCount
                    );
                    const isSelected = numericMargin === m;
                    return (
                      <tr
                        key={m}
                        onClick={() => setDesiredMargin(m)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#FBF0F2]' : 'hover:bg-[#FCF9F6]'
                        }`}
                      >
                        <td className="py-3 pr-3 font-medium text-[#3B2A24] tabular-nums">
                          {m}%
                        </td>
                        <td className="py-3 px-3 text-right text-[#6B544B] tabular-nums">
                          {formatNaira(sourceData.costPerProduct)}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-[#3B2A24] tabular-nums">
                          {formatNaira(row.suggestedSellingPrice)}
                        </td>
                        <td className="py-3 pl-3 text-right font-medium text-[#2E6B4E] tabular-nums">
                          {formatNaira(row.expectedProfitPerProduct)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
