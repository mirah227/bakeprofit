import type { SupabaseClient } from '@supabase/supabase-js';
import type { IngredientItem, Recipe, UnitOfMeasure } from '../types/bakery';
import { toNumber } from './calculations';

interface DbIngredientRow {
  id: string;
  recipe_id: string;
  user_id: string;
  name: string;
  quantity_used: number;
  used_unit: string;
  purchase_quantity: number;
  purchase_unit: string;
  purchase_price: number;
  sort_order: number;
}

interface DbRecipeRow {
  id: string;
  user_id: string;
  name: string;
  yield_count: number;
  yield_unit_label: string;
  desired_margin_percent: number;
  packaging_cost: number;
  labour_cost: number;
  electricity_cost: number;
  other_cost: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  recipe_ingredients?: DbIngredientRow[];
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

function mapDbRecipeToApp(row: DbRecipeRow): Recipe {
  const sortedIngredients = [...(row.recipe_ingredients ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  const ingredients: IngredientItem[] =
    sortedIngredients.length > 0
      ? sortedIngredients.map((ing) => ({
          id: ing.id,
          name: ing.name,
          quantityUsed: Number(ing.quantity_used),
          usedUnit: (ing.used_unit || 'g') as UnitOfMeasure,
          purchaseQuantity: Number(ing.purchase_quantity),
          purchaseUnit: (ing.purchase_unit || 'kg') as UnitOfMeasure,
          purchasePrice: Number(ing.purchase_price),
        }))
      : [
          {
            id: `ing-${Date.now()}`,
            name: '',
            quantityUsed: '',
            usedUnit: 'g',
            purchaseQuantity: '',
            purchaseUnit: 'kg',
            purchasePrice: '',
          },
        ];

  return {
    id: row.id,
    name: row.name,
    yieldCount: Number(row.yield_count),
    yieldUnitLabel: row.yield_unit_label || 'cake',
    desiredMarginPercent: Number(row.desired_margin_percent),
    ingredients,
    expenses: {
      packaging: Number(row.packaging_cost || 0),
      labour: Number(row.labour_cost || 0),
      electricity: Number(row.electricity_cost || 0),
      other: Number(row.other_cost || 0),
    },
    notes: row.notes ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchUserProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<{ fullName: string; businessName: string; email: string } | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, business_name, email')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    fullName: data.full_name || '',
    businessName: data.business_name || '',
    email: data.email || '',
  };
}

export async function fetchUserRecipes(
  supabase: SupabaseClient,
  userId: string
): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_ingredients(*)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data as DbRecipeRow[] | null)?.map(mapDbRecipeToApp) ?? [];
}

export async function saveUserRecipe(
  supabase: SupabaseClient,
  userId: string,
  recipe: Recipe,
  asNew = false
): Promise<Recipe> {
  const cleanName = recipe.name.trim();
  if (!cleanName) {
    throw new Error('Recipe name is required.');
  }

  const yieldCount = Math.max(1, toNumber(recipe.yieldCount) || 1);
  const margin = Math.min(99, Math.max(0, toNumber(recipe.desiredMarginPercent)));
  const shouldUpdate = !asNew && isValidUuid(recipe.id);

  let savedRecipeRow: DbRecipeRow;

  if (shouldUpdate) {
    const { data, error } = await supabase
      .from('recipes')
      .update({
        name: cleanName,
        yield_count: yieldCount,
        yield_unit_label: recipe.yieldUnitLabel.trim() || 'cake',
        desired_margin_percent: margin,
        packaging_cost: Math.max(0, toNumber(recipe.expenses.packaging)),
        labour_cost: Math.max(0, toNumber(recipe.expenses.labour)),
        electricity_cost: Math.max(0, toNumber(recipe.expenses.electricity)),
        other_cost: Math.max(0, toNumber(recipe.expenses.other)),
        notes: recipe.notes?.trim() || null,
      })
      .eq('id', recipe.id)
      .eq('user_id', userId)
      .select('*')
      .single<DbRecipeRow>();

    if (error || !data) {
      throw new Error(error?.message || 'Could not update recipe in Supabase.');
    }
    savedRecipeRow = data;

    const { error: delErr } = await supabase
      .from('recipe_ingredients')
      .delete()
      .eq('recipe_id', recipe.id)
      .eq('user_id', userId);

    if (delErr) {
      throw new Error(delErr.message);
    }
  } else {
    const nextName = asNew && isValidUuid(recipe.id) ? `${cleanName} (Copy)` : cleanName;
    const { data, error } = await supabase
      .from('recipes')
      .insert({
        user_id: userId,
        name: nextName,
        yield_count: yieldCount,
        yield_unit_label: recipe.yieldUnitLabel.trim() || 'cake',
        desired_margin_percent: margin,
        packaging_cost: Math.max(0, toNumber(recipe.expenses.packaging)),
        labour_cost: Math.max(0, toNumber(recipe.expenses.labour)),
        electricity_cost: Math.max(0, toNumber(recipe.expenses.electricity)),
        other_cost: Math.max(0, toNumber(recipe.expenses.other)),
        notes: recipe.notes?.trim() || null,
      })
      .select('*')
      .single<DbRecipeRow>();

    if (error || !data) {
      throw new Error(error?.message || 'Could not save recipe to Supabase.');
    }
    savedRecipeRow = data;
  }

  const ingredientRows = recipe.ingredients.map((item, index) => ({
    recipe_id: savedRecipeRow.id,
    user_id: userId,
    name: item.name.trim(),
    quantity_used: Math.max(0, toNumber(item.quantityUsed)),
    used_unit: item.usedUnit,
    purchase_quantity: Math.max(0, toNumber(item.purchaseQuantity)),
    purchase_unit: item.purchaseUnit,
    purchase_price: Math.max(0, toNumber(item.purchasePrice)),
    sort_order: index,
  }));

  if (ingredientRows.length > 0) {
    const { data: insertedIngredients, error: ingErr } = await supabase
      .from('recipe_ingredients')
      .insert(ingredientRows)
      .select('*');

    if (ingErr) {
      throw new Error(ingErr.message);
    }
    savedRecipeRow.recipe_ingredients = (insertedIngredients as DbIngredientRow[]) ?? [];
  } else {
    savedRecipeRow.recipe_ingredients = [];
  }

  return mapDbRecipeToApp(savedRecipeRow);
}

export async function deleteUserRecipe(
  supabase: SupabaseClient,
  userId: string,
  recipeId: string
): Promise<void> {
  const { error } = await supabase
    .from('recipes')
    .delete()
    .eq('id', recipeId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(error.message);
  }
}
