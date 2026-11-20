import { IngredientItem, Recipe } from '../types/bakery';

export interface IngredientTemplate {
  name: string;
  purchaseQuantity: number;
  purchaseUnit: IngredientItem['purchaseUnit'];
  purchasePrice: number;
  defaultUsedQuantity: number;
  defaultUsedUnit: IngredientItem['usedUnit'];
}

export const COMMON_INGREDIENTS: IngredientTemplate[] = [
  {
    name: 'All-Purpose Flour',
    purchaseQuantity: 2,
    purchaseUnit: 'kg',
    purchasePrice: 4000,
    defaultUsedQuantity: 500,
    defaultUsedUnit: 'g',
  },
  {
    name: 'Granulated Sugar',
    purchaseQuantity: 1,
    purchaseUnit: 'kg',
    purchasePrice: 2200,
    defaultUsedQuantity: 350,
    defaultUsedUnit: 'g',
  },
  {
    name: 'Salted Butter',
    purchaseQuantity: 500,
    purchaseUnit: 'g',
    purchasePrice: 4500,
    defaultUsedQuantity: 250,
    defaultUsedUnit: 'g',
  },
  {
    name: 'Fresh Eggs',
    purchaseQuantity: 30,
    purchaseUnit: 'pcs',
    purchasePrice: 5400,
    defaultUsedQuantity: 6,
    defaultUsedUnit: 'pcs',
  },
  {
    name: 'Buttermilk / Whole Milk',
    purchaseQuantity: 1,
    purchaseUnit: 'l',
    purchasePrice: 2400,
    defaultUsedQuantity: 250,
    defaultUsedUnit: 'ml',
  },
  {
    name: 'Whipped Cream (Heavy)',
    purchaseQuantity: 1,
    purchaseUnit: 'l',
    purchasePrice: 6500,
    defaultUsedQuantity: 400,
    defaultUsedUnit: 'ml',
  },
  {
    name: 'Cocoa Powder',
    purchaseQuantity: 500,
    purchaseUnit: 'g',
    purchasePrice: 4200,
    defaultUsedQuantity: 80,
    defaultUsedUnit: 'g',
  },
  {
    name: 'Vanilla Extract',
    purchaseQuantity: 100,
    purchaseUnit: 'ml',
    purchasePrice: 2500,
    defaultUsedQuantity: 2,
    defaultUsedUnit: 'tsp',
  },
];

export function createStarterRecipe(): Recipe {
  const now = new Date().toISOString();
  return {
    id: 'starter-vanilla-cake',
    name: '8-Inch Vanilla Celebration Cake',
    yieldCount: 1,
    yieldUnitLabel: 'cake',
    desiredMarginPercent: 40,
    ingredients: [
      {
        id: 'ing-flour',
        name: 'All-Purpose Flour',
        quantityUsed: 500,
        usedUnit: 'g',
        purchaseQuantity: 2,
        purchaseUnit: 'kg',
        purchasePrice: 4000,
      },
      {
        id: 'ing-sugar',
        name: 'Granulated Sugar',
        quantityUsed: 400,
        usedUnit: 'g',
        purchaseQuantity: 1,
        purchaseUnit: 'kg',
        purchasePrice: 2200,
      },
      {
        id: 'ing-butter',
        name: 'Salted Butter',
        quantityUsed: 250,
        usedUnit: 'g',
        purchaseQuantity: 500,
        purchaseUnit: 'g',
        purchasePrice: 4500,
      },
      {
        id: 'ing-eggs',
        name: 'Fresh Eggs',
        quantityUsed: 6,
        usedUnit: 'pcs',
        purchaseQuantity: 30,
        purchaseUnit: 'pcs',
        purchasePrice: 5400,
      },
      {
        id: 'ing-milk',
        name: 'Whole Milk',
        quantityUsed: 250,
        usedUnit: 'ml',
        purchaseQuantity: 1,
        purchaseUnit: 'l',
        purchasePrice: 2400,
      },
    ],
    expenses: {
      packaging: 1800,
      labour: 2500,
      electricity: 1200,
      other: 500,
    },
    notes: 'Two-layer 8-inch sponge with buttercream frosting and gold cake board.',
    createdAt: now,
    updatedAt: now,
  };
}

export const INITIAL_SAVED_RECIPES: Recipe[] = [
  createStarterRecipe(),
  {
    id: 'starter-red-velvet-cupcakes',
    name: 'Red Velvet Cupcakes (Box of 12)',
    yieldCount: 12,
    yieldUnitLabel: 'cupcakes',
    desiredMarginPercent: 45,
    ingredients: [
      {
        id: 'rv-flour',
        name: 'Cake Flour',
        quantityUsed: 300,
        usedUnit: 'g',
        purchaseQuantity: 2,
        purchaseUnit: 'kg',
        purchasePrice: 4000,
      },
      {
        id: 'rv-sugar',
        name: 'Caster Sugar',
        quantityUsed: 280,
        usedUnit: 'g',
        purchaseQuantity: 1,
        purchaseUnit: 'kg',
        purchasePrice: 2400,
      },
      {
        id: 'rv-butter',
        name: 'Unsalted Butter',
        quantityUsed: 200,
        usedUnit: 'g',
        purchaseQuantity: 500,
        purchaseUnit: 'g',
        purchasePrice: 4800,
      },
      {
        id: 'rv-creamcheese',
        name: 'Cream Cheese (Frosting)',
        quantityUsed: 250,
        usedUnit: 'g',
        purchaseQuantity: 1,
        purchaseUnit: 'kg',
        purchasePrice: 9600,
      },
      {
        id: 'rv-eggs',
        name: 'Fresh Eggs',
        quantityUsed: 3,
        usedUnit: 'pcs',
        purchaseQuantity: 30,
        purchaseUnit: 'pcs',
        purchasePrice: 5400,
      },
    ],
    expenses: {
      packaging: 1500,
      labour: 2000,
      electricity: 800,
      other: 400,
    },
    notes: 'Includes window cupcake box, liners, and cream cheese swirl.',
    createdAt: '2026-11-15T10:00:00.000Z',
    updatedAt: '2026-11-15T10:00:00.000Z',
  },
  {
    id: 'starter-banana-loaf',
    name: 'Signature Banana Nut Loaf',
    yieldCount: 2,
    yieldUnitLabel: 'loaves',
    desiredMarginPercent: 35,
    ingredients: [
      {
        id: 'bl-flour',
        name: 'All-Purpose Flour',
        quantityUsed: 400,
        usedUnit: 'g',
        purchaseQuantity: 2,
        purchaseUnit: 'kg',
        purchasePrice: 4000,
      },
      {
        id: 'bl-butter',
        name: 'Butter',
        quantityUsed: 180,
        usedUnit: 'g',
        purchaseQuantity: 500,
        purchaseUnit: 'g',
        purchasePrice: 4500,
      },
      {
        id: 'bl-eggs',
        name: 'Fresh Eggs',
        quantityUsed: 4,
        usedUnit: 'pcs',
        purchaseQuantity: 30,
        purchaseUnit: 'pcs',
        purchasePrice: 5400,
      },
      {
        id: 'bl-bananas',
        name: 'Ripe Bananas & Walnuts',
        quantityUsed: 1,
        usedUnit: 'pcs',
        purchaseQuantity: 1,
        purchaseUnit: 'pcs',
        purchasePrice: 2200,
      },
    ],
    expenses: {
      packaging: 900,
      labour: 1500,
      electricity: 700,
      other: 200,
    },
    notes: 'Baked in 9x5 loaf pans and wrapped in parchment sleeves.',
    createdAt: '2026-11-18T14:30:00.000Z',
    updatedAt: '2026-11-18T14:30:00.000Z',
  },
];

export function createBlankRecipe(): Recipe {
  const now = new Date().toISOString();
  return {
    id: `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    yieldCount: 1,
    yieldUnitLabel: 'cake',
    desiredMarginPercent: 40,
    ingredients: [
      {
        id: `ing-${Date.now()}-1`,
        name: '',
        quantityUsed: '',
        usedUnit: 'g',
        purchaseQuantity: '',
        purchaseUnit: 'kg',
        purchasePrice: '',
      },
    ],
    expenses: {
      packaging: '',
      labour: '',
      electricity: '',
      other: '',
    },
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}
