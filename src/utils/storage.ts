import { INITIAL_SAVED_RECIPES } from '../data/presets';
import { Recipe } from '../types/bakery';

const RECIPES_STORAGE_KEY = 'bakeprofit_saved_recipes_v1';
const ACTIVE_RECIPE_STORAGE_KEY = 'bakeprofit_active_recipe_v1';

export function loadSavedRecipes(): Recipe[] {
  try {
    const raw = window.localStorage.getItem(RECIPES_STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(RECIPES_STORAGE_KEY, JSON.stringify(INITIAL_SAVED_RECIPES));
      return INITIAL_SAVED_RECIPES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return INITIAL_SAVED_RECIPES;
  } catch {
    return INITIAL_SAVED_RECIPES;
  }
}

export function persistSavedRecipes(recipes: Recipe[]): void {
  try {
    window.localStorage.setItem(RECIPES_STORAGE_KEY, JSON.stringify(recipes));
  } catch {
    // Storage quota or privacy mode fallback
  }
}

export function loadActiveDraftRecipe(): Recipe | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_RECIPE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.ingredients)) {
      return parsed as Recipe;
    }
    return null;
  } catch {
    return null;
  }
}

export function persistActiveDraftRecipe(recipe: Recipe): void {
  try {
    window.localStorage.setItem(ACTIVE_RECIPE_STORAGE_KEY, JSON.stringify(recipe));
  } catch {
    // Ignore storage failures
  }
}
