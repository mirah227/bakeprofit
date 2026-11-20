import { formatNaira, formatPercent } from '../utils/calculations';

interface SummaryCardsProps {
  totalCost: number;
  costPerProduct: number;
  suggestedSellingPrice: number;
  expectedProfitPerProduct: number;
  expectedTotalProfit: number;
  actualMarginPercent: number;
  yieldCount: number;
  yieldUnitLabel: string;
  isMarginValid: boolean;
}

export function SummaryCards({
  totalCost,
  costPerProduct,
  suggestedSellingPrice,
  expectedProfitPerProduct,
  expectedTotalProfit,
  actualMarginPercent,
  yieldCount,
  yieldUnitLabel,
  isMarginValid,
}: SummaryCardsProps) {
  const unitLabel = yieldUnitLabel.trim() || 'product';

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-[#FBF0F2] border border-[#ECCED5] p-5">
        <p className="text-xs font-medium text-[#8C4D5C]">
          Suggested Selling Price
        </p>
        <div className="mt-1.5 flex items-baseline justify-between gap-3">
          <span className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold text-[#3B2A24] tabular-nums">
            {isMarginValid ? formatNaira(suggestedSellingPrice) : '—'}
          </span>
          <span className="text-xs text-[#7A6158] whitespace-nowrap">
            per {unitLabel}
          </span>
        </div>
        {yieldCount > 1 && isMarginValid && suggestedSellingPrice > 0 && (
          <p className="mt-2 text-xs text-[#7A6158] tabular-nums">
            Full batch revenue ({yieldCount} {unitLabel}): {formatNaira(suggestedSellingPrice * yieldCount)}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white border border-[#EBE0D8] p-4">
          <p className="text-xs text-[#7A6158]">Total Cost</p>
          <p className="mt-1 text-lg font-semibold text-[#3B2A24] tabular-nums">
            {formatNaira(totalCost)}
          </p>
          <p className="mt-0.5 text-[11px] text-[#9A8076]">Ingredients + expenses</p>
        </div>

        <div className="rounded-2xl bg-white border border-[#EBE0D8] p-4">
          <p className="text-xs text-[#7A6158]">Cost Per {unitLabel}</p>
          <p className="mt-1 text-lg font-semibold text-[#3B2A24] tabular-nums">
            {formatNaira(costPerProduct)}
          </p>
          <p className="mt-0.5 text-[11px] text-[#9A8076]">
            {yieldCount > 0 ? `Divided by ${yieldCount}` : 'Enter batch yield'}
          </p>
        </div>

        <div className="rounded-2xl bg-white border border-[#EBE0D8] p-4">
          <p className="text-xs text-[#7A6158]">Expected Profit</p>
          <p className="mt-1 text-lg font-semibold text-[#2E6B4E] tabular-nums">
            {isMarginValid ? formatNaira(expectedProfitPerProduct) : '—'}
          </p>
          <p className="mt-0.5 text-[11px] text-[#9A8076] tabular-nums">
            {yieldCount > 1 && isMarginValid
              ? `${formatNaira(expectedTotalProfit)} batch profit`
              : `Per ${unitLabel} sold`}
          </p>
        </div>

        <div className="rounded-2xl bg-white border border-[#EBE0D8] p-4">
          <p className="text-xs text-[#7A6158]">Profit Margin</p>
          <p className="mt-1 text-lg font-semibold text-[#3B2A24] tabular-nums">
            {isMarginValid && suggestedSellingPrice > 0
              ? formatPercent(actualMarginPercent)
              : '—'}
          </p>
          <p className="mt-0.5 text-[11px] text-[#9A8076]">Of selling price</p>
        </div>
      </div>
    </div>
  );
}
