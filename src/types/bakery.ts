export type UnitOfMeasure = 'g' | 'kg' | 'ml' | 'l' | 'tsp' | 'tbsp' | 'cup' | 'pcs';

export type UnitFamily = 'weight' | 'volume' | 'count';

export type NavTab = 'home' | 'calculator' | 'recipes' | 'pricing' | 'premium';

export interface IngredientItem {
  id: string;
  name: string;
  quantityUsed: number | '';
  usedUnit: UnitOfMeasure;
  purchaseQuantity: number | '';
  purchaseUnit: UnitOfMeasure;
  purchasePrice: number | '';
}

export interface ProductionExpenses {
  packaging: number | '';
  labour: number | '';
  electricity: number | '';
  other: number | '';
}

export interface Recipe {
  id: string;
  name: string;
  yieldCount: number | '';
  yieldUnitLabel: string;
  desiredMarginPercent: number | '';
  ingredients: IngredientItem[];
  expenses: ProductionExpenses;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IngredientCostResult {
  cost: number;
  isValid: boolean;
  error?: string;
}

export interface CalculationSummary {
  totalIngredientCost: number;
  totalExpenses: number;
  totalProductionCost: number;
  costPerProduct: number;
  suggestedSellingPrice: number;
  expectedProfitPerProduct: number;
  expectedTotalProfit: number;
  actualMarginPercent: number;
  isMarginValid: boolean;
  isYieldValid: boolean;
  hasIngredientErrors: boolean;
  ingredientResults: Record<string, IngredientCostResult>;
}

export type PremiumPlanId = 'onetime' | 'monthly';

export interface PlanOption {
  id: PremiumPlanId;
  name: string;
  amount: number;
  currency: 'NGN';
  billingCycle: 'one-time' | 'monthly';
  description: string;
}

export interface PaymentConfigResponse {
  mode: 'test' | 'live';
  isConfigured: boolean;
  missingKeys: string[];
  keyMismatchError: string | null;
  monthlyConfigured: boolean;
  plans: PlanOption[];
}

export interface PaymentTransactionSummary {
  transactionReference: string;
  plan: PremiumPlanId;
  expectedAmount: number;
  currency: 'NGN';
  status: 'pending' | 'successful' | 'failed' | 'abandoned' | 'reversed';
  environment: 'test' | 'live';
  createdAt: string;
  verifiedAt: string | null;
}

export interface PremiumStatusResponse {
  mode: 'test' | 'live';
  isPremium: boolean;
  hasOneTimePurchase?: boolean;
  hasMonthlySubscription?: boolean;
  plan: PremiumPlanId | null;
  transactionReference: string | null;
  amountPaid: number | null;
  currency: 'NGN';
  status: string | null;
  environment: 'test' | 'live';
  unlockedAt: string | null;
  recentTransactions: PaymentTransactionSummary[];
}

