import {
  ArrowRight,
  Calculator,
  FileText,
  Layers,
  Percent,
  Tag,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { NavTab } from '../types/bakery';
import { calculatePricingForMargin, formatNaira, formatPercent } from '../utils/calculations';

interface LandingPageProps {
  onStartCalculating: () => void;
  onNavigate: (tab: NavTab) => void;
}

const PREVIEW_INGREDIENTS = [
  {
    name: 'All-Purpose Flour',
    purchase: '2 kg @ ₦4,000',
    used: '500 g',
    cost: 1000,
  },
  {
    name: 'Granulated Sugar',
    purchase: '1 kg @ ₦2,200',
    used: '400 g',
    cost: 880,
  },
  {
    name: 'Salted Butter',
    purchase: '500 g @ ₦4,500',
    used: '250 g',
    cost: 2250,
  },
  {
    name: 'Fresh Eggs',
    purchase: '30 pcs @ ₦5,400',
    used: '6 pcs',
    cost: 1080,
  },
];

export function LandingPage({ onStartCalculating, onNavigate }: LandingPageProps) {
  const [previewMargin, setPreviewMargin] = useState(40);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [flatlayImgFailed, setFlatlayImgFailed] = useState(false);

  const previewPricing = useMemo(() => {
    const ingredientsTotal = PREVIEW_INGREDIENTS.reduce((sum, i) => sum + i.cost, 0); // 5,210
    const expensesTotal = 4500; // packaging 1,800 + labour 1,500 + power 1,200
    const totalProductionCost = ingredientsTotal + expensesTotal; // 9,710
    const pricing = calculatePricingForMargin(totalProductionCost, previewMargin, 1);
    return {
      ingredientsTotal,
      expensesTotal,
      totalProductionCost,
      ...pricing,
    };
  }, [previewMargin]);

  return (
    <div className="space-y-20 pb-12">
      {/* Hero Section */}
      <section className="pt-10 sm:pt-14 lg:pt-16">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-sm font-medium text-[#A45567] tracking-wide">
                Bakery Costing &amp; Pricing Studio
              </p>

              <h1
                className="mt-3 font-[family-name:var(--font-display)] font-semibold text-[#3B2A24] leading-[1.08] tracking-tight"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.65rem)', textWrap: 'balance' }}
              >
                Know your costs. Price with confidence.
              </h1>

              <p className="mt-5 text-base sm:text-lg text-[#6B544B] leading-relaxed max-w-xl">
                Take control of your baking business with a simple tool that calculates recipe
                costs, selling prices and profit.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <button
                  type="button"
                  onClick={onStartCalculating}
                  className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-white bg-[#4A352E] hover:bg-[#3B2A24] rounded-xl transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B56173]"
                >
                  Start Calculating
                  <ArrowRight className="w-4 h-4" />
                </button>

                <a
                  href="#features"
                  className="inline-flex items-center justify-center px-6 py-3.5 text-sm font-medium text-[#4A352E] bg-white border border-[#E5D7CE] hover:border-[#C56E80] hover:bg-[#FDF7F8] rounded-xl transition-colors duration-150 whitespace-nowrap shrink-0"
                >
                  Explore Features
                </a>
              </div>

              <div className="mt-10 pt-6 border-t border-[#EDE3DC] flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#7A6158]">
                <span>Built for home bakers &amp; cake vendors</span>
                <span aria-hidden="true">·</span>
                <span>Automatic unit conversions (g, kg, ml, L)</span>
                <span aria-hidden="true">·</span>
                <span>Nigerian Naira (₦) ready</span>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-full min-h-[320px] sm:min-h-[380px] rounded-3xl overflow-hidden border border-[#EAE0D8] bg-[#F5EBE4]">
                {!heroImgFailed ? (
                  <img
                    src="/src/assets/images/hero_artisan_bakery_1795191531274.jpg"
                    alt="Soft blush frosted artisan celebration cake on a ceramic pedestal in warm natural light"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-[#F9ECEF] to-[#F3E7DF]">
                    <Calculator className="w-10 h-10 text-[#A45567] mb-3" />
                    <p className="font-[family-name:var(--font-display)] text-xl font-semibold text-[#3B2A24]">
                      BakeProfit Studio
                    </p>
                    <p className="text-sm text-[#7A6158] mt-1">
                      Precision costing for every cake &amp; pastry batch
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Calculator Preview */}
      <section aria-labelledby="preview-heading">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-white border border-[#EAE0D8] p-6 sm:p-8 lg:p-10 shadow-[0_6px_30px_-12px_rgba(74,53,46,0.08)]">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-[#F0E6DF]">
              <div>
                <p className="text-xs font-medium text-[#A45567]">
                  Live Costing Preview
                </p>
                <h2
                  id="preview-heading"
                  className="mt-1 font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold text-[#3B2A24]"
                >
                  See how a single recipe breaks down
                </h2>
              </div>
              <button
                type="button"
                onClick={onStartCalculating}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#A45567] hover:text-[#7F3D4D] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Open full calculator
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left side: Sample recipe breakdown */}
              <div className="lg:col-span-7">
                <div className="flex items-center justify-between text-xs font-medium text-[#7A6158] pb-3 border-b border-[#F2EAE4]">
                  <span>8-Inch Vanilla Celebration Cake</span>
                  <span>Yield: 1 cake</span>
                </div>

                <div className="divide-y divide-[#F4ECE6]">
                  {PREVIEW_INGREDIENTS.map((item) => (
                    <div
                      key={item.name}
                      className="py-3.5 flex items-center justify-between gap-4 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-[#3B2A24] truncate">{item.name}</p>
                        <p className="text-xs text-[#8D7369] mt-0.5">
                          Bought {item.purchase} · Used {item.used}
                        </p>
                      </div>
                      <span className="font-[family-name:var(--font-mono)] text-sm font-medium text-[#3B2A24] tabular-nums shrink-0">
                        {formatNaira(item.cost)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t border-[#EAE0D8] grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center justify-between text-[#6B544B]">
                    <span>Ingredients subtotal</span>
                    <span className="font-medium text-[#3B2A24] tabular-nums">
                      {formatNaira(previewPricing.ingredientsTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[#6B544B]">
                    <span>Packaging, labour &amp; power</span>
                    <span className="font-medium text-[#3B2A24] tabular-nums">
                      {formatNaira(previewPricing.expensesTotal)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right side: Interactive margin & output */}
              <div className="lg:col-span-5 rounded-2xl bg-[#FCF7F8] border border-[#F0D9DF] p-6">
                <div className="flex items-center justify-between gap-4">
                  <label
                    htmlFor="preview-margin-slider"
                    className="text-sm font-medium text-[#4A352E]"
                  >
                    Desired Profit Margin
                  </label>
                  <span className="font-[family-name:var(--font-mono)] text-sm font-semibold text-[#A45567] tabular-nums">
                    {formatPercent(previewMargin)}
                  </span>
                </div>

                <input
                  id="preview-margin-slider"
                  type="range"
                  min={15}
                  max={65}
                  step={5}
                  value={previewMargin}
                  onChange={(e) => setPreviewMargin(Number(e.target.value))}
                  className="mt-3 w-full accent-[#B56173] cursor-pointer"
                />

                <div className="mt-6 pt-5 border-t border-[#F0D9DF] space-y-3.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-[#6B544B]">Total Production Cost</span>
                    <span className="font-semibold text-[#3B2A24] tabular-nums">
                      {formatNaira(previewPricing.totalProductionCost)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-[#6B544B]">Expected Profit</span>
                    <span className="font-semibold text-[#2E6B4E] tabular-nums">
                      {formatNaira(previewPricing.expectedProfitPerProduct)}
                    </span>
                  </div>
                  <div className="pt-3 border-t border-[#F0D9DF] flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-[#3B2A24]">
                      Suggested Selling Price
                    </span>
                    <span className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[#3B2A24] tabular-nums">
                      {formatNaira(previewPricing.suggestedSellingPrice)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onStartCalculating}
                  className="mt-6 w-full py-3 px-4 text-sm font-semibold text-white bg-[#4A352E] hover:bg-[#3B2A24] rounded-xl transition-colors cursor-pointer"
                >
                  Calculate Your Own Recipe
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Highlights */}
      <section id="features" aria-labelledby="features-heading">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-[#A45567]">Everything You Need</p>
            <h2
              id="features-heading"
              className="mt-2 font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold text-[#3B2A24] tracking-tight"
              style={{ textWrap: 'balance' }}
            >
              Built for busy bakers, not accountants
            </h2>
            <p className="mt-3 text-[#6B544B] leading-relaxed">
              Stop guessing cake prices from competitors. Know your exact ingredient and overhead
              costs in minutes.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-6 gap-5">
            {/* Wide Feature 1 */}
            <div className="md:col-span-4 rounded-3xl bg-white border border-[#EAE0D8] p-6 sm:p-8 flex flex-col sm:flex-row gap-6 items-center">
              <div className="flex-1">
                <div className="w-10 h-10 rounded-xl bg-[#F8E9EC] text-[#A45567] flex items-center justify-center mb-4">
                  <Calculator className="w-5 h-5" />
                </div>
                <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[#3B2A24]">
                  01. Recipe Cost Calculator
                </h3>
                <p className="mt-2 text-sm text-[#6B544B] leading-relaxed">
                  Enter what you paid for a bag of flour or crate of eggs, type the exact grams or
                  pieces your recipe uses, and get instant per-ingredient costs with automatic unit
                  conversion.
                </p>
                <button
                  type="button"
                  onClick={onStartCalculating}
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#A45567] hover:text-[#7F3D4D] cursor-pointer"
                >
                  Try the calculator
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <div className="w-full sm:w-52 h-44 rounded-2xl overflow-hidden border border-[#EFE5DE] shrink-0 bg-[#F5EBE4]">
                {!flatlayImgFailed ? (
                  <img
                    src="/src/assets/images/bakery_ingredients_flatlay_1795191531541.jpg"
                    alt="Flour, eggs, butter, and kitchen scale arranged neatly on warm cream marble"
                    referrerPolicy="no-referrer"
                    onError={() => setFlatlayImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-[#F8E9EC] text-[#A45567]">
                    <Calculator className="w-8 h-8" />
                  </div>
                )}
              </div>
            </div>

            {/* Feature 2 */}
            <div className="md:col-span-2 rounded-3xl bg-white border border-[#EAE0D8] p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#F5EBE4] text-[#5E443B] flex items-center justify-center mb-4">
                  <Layers className="w-5 h-5" />
                </div>
                <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[#3B2A24]">
                  02. Ingredient Management
                </h3>
                <p className="mt-2 text-sm text-[#6B544B] leading-relaxed">
                  Add, edit, or update market prices anytime. When butter or sugar goes up, update
                  one line and recalculate your entire recipe instantly.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('recipes')}
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#4A352E] hover:text-[#A45567] cursor-pointer"
              >
                View saved recipes
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Feature 3 */}
            <div className="md:col-span-2 rounded-3xl bg-white border border-[#EAE0D8] p-6 sm:p-8">
              <div className="w-10 h-10 rounded-xl bg-[#F8E9EC] text-[#A45567] flex items-center justify-center mb-4">
                <Tag className="w-5 h-5" />
              </div>
              <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[#3B2A24]">
                03. Selling Price Calculator
              </h3>
              <p className="mt-2 text-sm text-[#6B544B] leading-relaxed">
                Include packaging boxes, cake boards, electricity, gas, and your labour so your
                selling price covers every hidden naira.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="md:col-span-2 rounded-3xl bg-white border border-[#EAE0D8] p-6 sm:p-8">
              <div className="w-10 h-10 rounded-xl bg-[#F5EBE4] text-[#5E443B] flex items-center justify-center mb-4">
                <Percent className="w-5 h-5" />
              </div>
              <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[#3B2A24]">
                04. Profit Margin Calculator
              </h3>
              <p className="mt-2 text-sm text-[#6B544B] leading-relaxed">
                Set your target profit margin and compare retail vs batch margins side-by-side in
                our dedicated pricing studio.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="md:col-span-2 rounded-3xl bg-[#FBF0F2] border border-[#ECCED5] p-6 sm:p-8">
              <div className="w-10 h-10 rounded-xl bg-white text-[#A45567] flex items-center justify-center mb-4">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[#3B2A24]">
                05. Downloadable Cost Reports
              </h3>
              <p className="mt-2 text-sm text-[#6B544B] leading-relaxed">
                Generate clean, structured cost sheets for every cake and pastry order so you can
                quote corporate and wedding clients effortlessly.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('premium')}
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#8C4D5C] hover:text-[#4A352E] cursor-pointer"
              >
                Explore Premium tools
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section>
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-[#4A352E] text-white px-6 py-12 sm:px-12 sm:py-14 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="max-w-xl">
              <h2 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold">
                Ready to price your next bake accurately?
              </h2>
              <p className="mt-2 text-sm sm:text-base text-[#EBDCD5]">
                Start with a sample cake recipe or build your own ingredient list from scratch.
              </p>
            </div>
            <button
              type="button"
              onClick={onStartCalculating}
              className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-[#3B2A24] bg-[#F8E9EC] hover:bg-white rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Start Calculating
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
