import { LogOut, Menu, User, X } from 'lucide-react';
import { useState } from 'react';
import { NavTab } from '../types/bakery';

interface NavbarProps {
  activeTab: NavTab;
  userEmail: string | null;
  onNavigate: (tab: NavTab) => void;
  onOpenAuth: (mode?: 'login' | 'signup') => void;
  onLogout: () => void;
}

const NAV_ITEMS: { id: NavTab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'calculator', label: 'Calculator' },
  { id: 'recipes', label: 'My Recipes' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'premium', label: 'Premium' },
];

export function Navbar({
  activeTab,
  userEmail,
  onNavigate,
  onOpenAuth,
  onLogout,
}: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSelect = (tab: NavTab) => {
    onNavigate(tab);
    setMobileMenuOpen(false);
  };

  return (
    <header className="no-print sticky top-0 z-40 bg-[#FCF9F6]/95 backdrop-blur-sm border-b border-[#EDE3DC]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        <button
          type="button"
          onClick={() => handleSelect('home')}
          className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-[#3B2A24] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B56173]"
        >
          BakeProfit
        </button>

        <nav aria-label="Primary" className="hidden md:flex items-center gap-7">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`relative py-1.5 text-sm font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B56173] ${
                  isActive
                    ? 'text-[#3B2A24]'
                    : 'text-[#7A6158] hover:text-[#3B2A24]'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-0.5 h-[2px] bg-[#C56E80] rounded-full"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          {userEmail ? (
            <div className="hidden sm:flex items-center gap-2.5">
              <span
                title={userEmail}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6B544B] max-w-[140px] truncate"
              >
                <User className="w-3.5 h-3.5 shrink-0 text-[#A45567]" />
                <span className="truncate">{userEmail}</span>
              </span>
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-[#6B544B] hover:text-[#3B2A24] border border-[#E5D7CE] hover:border-[#C56E80] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Log Out
              </button>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => onOpenAuth('login')}
                className="px-3 py-2 text-sm font-medium text-[#6B544B] hover:text-[#3B2A24] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Log In
              </button>
              <button
                type="button"
                onClick={() => handleSelect('calculator')}
                className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-[#4A352E] hover:bg-[#3B2A24] rounded-xl transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B56173]"
              >
                Start Calculating
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl text-[#4A352E] hover:bg-[#F5EBE4] transition-colors cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#EDE3DC] bg-[#FCF9F6] px-4 py-3">
          <nav aria-label="Mobile" className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#F8E9EC] text-[#3B2A24]'
                      : 'text-[#6D564D] hover:bg-[#F5EBE4]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}

            <div className="mt-2 pt-2 border-t border-[#EDE3DC] flex flex-col gap-2">
              {userEmail ? (
                <>
                  <p className="px-3 text-xs text-[#6B544B] truncate">
                    Signed in as {userEmail}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full py-2.5 px-4 text-sm font-medium text-[#4A352E] bg-white border border-[#E5D7CE] rounded-xl transition-colors cursor-pointer"
                  >
                    Log Out
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAuth('login');
                  }}
                  className="w-full py-2.5 px-4 text-sm font-medium text-[#4A352E] bg-white border border-[#E5D7CE] rounded-xl transition-colors cursor-pointer"
                >
                  Log In / Sign Up
                </button>
              )}

              <button
                type="button"
                onClick={() => handleSelect('calculator')}
                className="w-full py-2.5 px-4 text-sm font-medium text-white bg-[#4A352E] hover:bg-[#3B2A24] rounded-xl transition-colors cursor-pointer"
              >
                Start Calculating
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
