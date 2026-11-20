import {
  CalculationSummary,
  IngredientCostResult,
  IngredientItem,
  ProductionExpenses,
  Recipe,
  UnitFamily,
  UnitOfMeasure,
} from '../types/bakery';

export const UNIT_META: Record<
  UnitOfMeasure,
  { label: string; shortLabel: string; family: UnitFamily; toBaseFactor: number }
> = {
  g: { label: 'Grams (g)', shortLabel: 'g', family: 'weight', toBaseFactor: 1 },
  kg: { label: 'Kilograms (kg)', shortLabel: 'kg', family: 'weight', toBaseFactor: 1000 },
  ml: { label: 'Millilitres (ml)', shortLabel: 'ml', family: 'volume', toBaseFactor: 1 },
  l: { label: 'Litres (L)', shortLabel: 'L', family: 'volume', toBaseFactor: 1000 },
  tsp: { label: 'Teaspoon (tsp)', shortLabel: 'tsp', family: 'volume', toBaseFactor: 5 },
  tbsp: { label: 'Tablespoon (tbsp)', shortLabel: 'tbsp', family: 'volume', toBaseFactor: 15 },
  cup: { label: 'Cup (240ml)', shortLabel: 'cup', family: 'volume', toBaseFactor: 240 },
  pcs: { label: 'Pieces (pcs)', shortLabel: 'pcs', family: 'count', toBaseFactor: 1 },
};

export const ALL_UNITS: UnitOfMeasure[] = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'pcs'];

export function getCompatibleUnits(unit: UnitOfMeasure): UnitOfMeasure[] {
  const family = UNIT_META[unit].family;
  return ALL_UNITS.filter((u) => UNIT_META[u].family === family);
}

export function getDefaultUsedUnitForPurchase(purchaseUnit: UnitOfMeasure): UnitOfMeasure {
  if (purchaseUnit === 'kg') return 'g';
  if (purchaseUnit === 'l') return 'ml';
  return purchaseUnit;
}

export function areUnitsCompatible(a: UnitOfMeasure, b: UnitOfMeasure): boolean {
  return UNIT_META[a].family === UNIT_META[b].family;
}

export function convertQuantity(
  quantity: number,
  fromUnit: UnitOfMeasure,
  toUnit: UnitOfMeasure
): { value: number; compatible: boolean } {
  if (!areUnitsCompatible(fromUnit, toUnit)) {
    return { value: 0, compatible: false };
  }
  const baseValue = quantity * UNIT_META[fromUnit].toBaseFactor;
  const converted = baseValue / UNIT_META[toUnit].toBaseFactor;
  return { value: converted, compatible: true };
}

export function toNumber(val: number | '' | undefined): number {
  if (val === '' || val === undefined || val === null) return 0;
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateIngredientCost(ingredient: IngredientItem): IngredientCostResult {
  const qtyUsed = ingredient.quantityUsed === '' ? null : Number(ingredient.quantityUsed);
  const purchaseQty = ingredient.purchaseQuantity === '' ? null : Number(ingredient.purchaseQuantity);
  const purchasePrice = ingredient.purchasePrice === '' ? null : Number(ingredient.purchasePrice);

  if (qtyUsed === null && purchaseQty === null && purchasePrice === null) {
    return { cost: 0, isValid: true };
  }

  if (qtyUsed !== null && qtyUsed < 0) {
    return { cost: 0, isValid: false, error: 'Quantity used cannot be negative' };
  }
  if (purchaseQty !== null && purchaseQty <= 0) {
    return { cost: 0, isValid: false, error: 'Purchase quantity must be greater than 0' };
  }
  if (purchasePrice !== null && purchasePrice < 0) {
    return { cost: 0, isValid: false, error: 'Purchase price cannot be negative' };
  }

  if (!areUnitsCompatible(ingredient.usedUnit, ingredient.purchaseUnit)) {
    return {
      cost: 0,
      isValid: false,
      error: `Cannot convert ${ingredient.usedUnit} to ${ingredient.purchaseUnit}`,
    };
  }

  if (qtyUsed === null || purchaseQty === null || purchasePrice === null) {
    return { cost: 0, isValid: true };
  }

  const { value: convertedUsed } = convertQuantity(
    qtyUsed,
    ingredient.usedUnit,
    ingredient.purchaseUnit
  );

  const cost = (convertedUsed / purchaseQty) * purchasePrice;
  return {
    cost: Number.isFinite(cost) ? cost : 0,
    isValid: true,
  };
}

export function calculateTotalExpenses(expenses: ProductionExpenses): number {
  return (
    Math.max(0, toNumber(expenses.packaging)) +
    Math.max(0, toNumber(expenses.labour)) +
    Math.max(0, toNumber(expenses.electricity)) +
    Math.max(0, toNumber(expenses.other))
  );
}

export function calculateRecipeSummary(recipe: Recipe): CalculationSummary {
  const ingredientResults: Record<string, IngredientCostResult> = {};
  let totalIngredientCost = 0;
  let hasIngredientErrors = false;

  for (const item of recipe.ingredients) {
    const res = calculateIngredientCost(item);
    ingredientResults[item.id] = res;
    if (!res.isValid) {
      hasIngredientErrors = true;
    } else {
      totalIngredientCost += res.cost;
    }
  }

  const totalExpenses = calculateTotalExpenses(recipe.expenses);
  const totalProductionCost = totalIngredientCost + totalExpenses;

  const rawYield = recipe.yieldCount === '' ? 0 : Number(recipe.yieldCount);
  const isYieldValid = Number.isFinite(rawYield) && rawYield > 0;
  const yieldCount = isYieldValid ? rawYield : 0;

  const costPerProduct = yieldCount > 0 ? totalProductionCost / yieldCount : 0;

  const rawMargin =
    recipe.desiredMarginPercent === '' ? 0 : Number(recipe.desiredMarginPercent);
  const isMarginValid = Number.isFinite(rawMargin) && rawMargin >= 0 && rawMargin < 100;

  let suggestedSellingPrice = 0;
  if (costPerProduct > 0 && isMarginValid) {
    suggestedSellingPrice = costPerProduct / (1 - rawMargin / 100);
  }

  const expectedProfitPerProduct =
    suggestedSellingPrice > 0 ? suggestedSellingPrice - costPerProduct : 0;
  const expectedTotalProfit = expectedProfitPerProduct * yieldCount;
  const actualMarginPercent =
    suggestedSellingPrice > 0 ? (expectedProfitPerProduct / suggestedSellingPrice) * 100 : 0;

  return {
    totalIngredientCost,
    totalExpenses,
    totalProductionCost,
    costPerProduct,
    suggestedSellingPrice,
    expectedProfitPerProduct,
    expectedTotalProfit,
    actualMarginPercent,
    isMarginValid,
    isYieldValid,
    hasIngredientErrors,
    ingredientResults,
  };
}

export function calculatePricingForMargin(
  costPerProduct: number,
  desiredMarginPercent: number,
  yieldCount: number
): {
  suggestedSellingPrice: number;
  expectedProfitPerProduct: number;
  expectedTotalProfit: number;
  actualMarginPercent: number;
  isMarginValid: boolean;
} {
  const isMarginValid =
    Number.isFinite(desiredMarginPercent) && desiredMarginPercent >= 0 && desiredMarginPercent < 100;

  if (!isMarginValid || costPerProduct <= 0) {
    return {
      suggestedSellingPrice: 0,
      expectedProfitPerProduct: 0,
      expectedTotalProfit: 0,
      actualMarginPercent: 0,
      isMarginValid,
    };
  }

  const suggestedSellingPrice = costPerProduct / (1 - desiredMarginPercent / 100);
  const expectedProfitPerProduct = suggestedSellingPrice - costPerProduct;
  const safeYield = yieldCount > 0 ? yieldCount : 1;

  return {
    suggestedSellingPrice,
    expectedProfitPerProduct,
    expectedTotalProfit: expectedProfitPerProduct * safeYield,
    actualMarginPercent: (expectedProfitPerProduct / suggestedSellingPrice) * 100,
    isMarginValid: true,
  };
}

export function formatNaira(amount: number, decimals?: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const hasFraction = Math.abs(safe - Math.round(safe)) >= 0.005;
  const fractionDigits = decimals !== undefined ? decimals : hasFraction ? 2 : 0;

  const formatted = new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(safe);

  return `₦${formatted}`;
}

export function formatPercent(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(1).replace(/\.0$/, '')}%`;
}
