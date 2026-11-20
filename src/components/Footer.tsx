import { NavTab } from '../types/bakery';

interface FooterProps {
  onNavigate: (tab: NavTab) => void;
}

export function Footer({ onNavigate }: FooterProps) {
  return (
    <footer className="no-print border-t border-[#EDE3DC] bg-[#FBF7F3] mt-16">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <span className="font-[family-name:var(--font-display)] text-lg font-semibold text-[#3B2A24]">
            BakeProfit
          </span>
          <p className="mt-1 text-sm text-[#7A6158]">
            Know your costs. Price with confidence.
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap items-center gap-6 text-sm text-[#6D564D]">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="hover:text-[#3B2A24] transition-colors cursor-pointer whitespace-nowrap"
          >
            Home
          </button>
          <button
            type="button"
            onClick={() => onNavigate('calculator')}
            className="hover:text-[#3B2A24] transition-colors cursor-pointer whitespace-nowrap"
          >
            Calculator
          </button>
          <button
            type="button"
            onClick={() => onNavigate('recipes')}
            className="hover:text-[#3B2A24] transition-colors cursor-pointer whitespace-nowrap"
          >
            My Recipes
          </button>
          <button
            type="button"
            onClick={() => onNavigate('pricing')}
            className="hover:text-[#3B2A24] transition-colors cursor-pointer whitespace-nowrap"
          >
            Pricing
          </button>
          <button
            type="button"
            onClick={() => onNavigate('premium')}
            className="hover:text-[#3B2A24] transition-colors cursor-pointer whitespace-nowrap"
          >
            Premium
          </button>
        </nav>

        <p className="text-xs text-[#8D7369]">
          &copy; {new Date().getFullYear()} BakeProfit. Built for bakers.
        </p>
      </div>
    </footer>
  );
}
