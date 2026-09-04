import React from 'react';
import { BookOpen, Moon, Sun, Settings, Search, Feather } from 'lucide-react';

interface NavbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onNavigateHome: () => void;
  isWritingMode?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  searchQuery,
  onSearchChange,
  theme,
  onToggleTheme,
  onOpenSettings,
  onNavigateHome,
  isWritingMode = false,
}) => {
  return (
    <header
      id="mynook-navbar"
      className="w-full sticky top-0 z-30 transition-colors duration-200 border-b bg-[#F9F7F2] dark:bg-[#181816] border-[#E5E1D8] dark:border-[#2E2E2A]"
    >
      <div className="max-w-7xl mx-auto px-6 sm:px-8 h-16 flex items-center justify-between gap-6">
        {/* Brand Logo & Editorial Nav */}
        <div className="flex items-center space-x-8 lg:space-x-12">
          <button
            id="nav-brand-btn"
            onClick={onNavigateHome}
            className="flex items-center space-x-3 text-left group focus:outline-none"
          >
            <span className="text-2xl font-bold tracking-tighter serif italic text-[#3A3A36] dark:text-[#ECE9E2] hover:opacity-80 transition-opacity">
              MYNOOK
            </span>
          </button>

          <nav className="hidden md:flex items-center space-x-6 lg:space-x-8 text-xs font-medium uppercase tracking-widest text-[#8A8882] dark:text-[#9E9B95]">
            <button
              onClick={onNavigateHome}
              className={`pb-1 transition-colors ${
                !isWritingMode
                  ? 'text-[#1A1A1A] dark:text-[#ECE9E2] border-b border-[#1A1A1A] dark:border-[#ECE9E2]'
                  : 'hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2]'
              }`}
            >
              Library
            </button>
            <span className="text-[#8A8882] dark:text-[#9E9B95] opacity-50 cursor-default">
              Manuscripts
            </span>
            <button
              onClick={onOpenSettings}
              className="hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] transition-colors"
            >
              Settings
            </button>
          </nav>
        </div>

        {/* Center Search (only in dashboard) */}
        {!isWritingMode && (
          <div className="flex-1 max-w-sm mx-2 hidden lg:block">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8A8882] pointer-events-none" />
              <input
                id="search-books-input"
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search manuscripts..."
                className="w-full pl-9 pr-4 py-1.5 text-xs rounded-sm bg-[#EBE8E0]/70 dark:bg-[#282824] text-[#1A1A1A] dark:text-[#ECE9E2] placeholder-[#8A8882] border border-[#DCD8CF] dark:border-[#383834] focus:outline-none focus:border-[#3A3A36] dark:focus:border-[#ECE9E2] transition-all font-sans"
              />
            </div>
          </div>
        )}

        {/* Right Controls */}
        <div className="flex items-center space-x-4 sm:space-x-6">
          {/* Synced Badge */}
          <div
            id="nav-synced-pill"
            className="flex items-center space-x-2 px-3 py-1 bg-[#EBE8E0] dark:bg-[#282824] rounded-full border border-[#DCD8CF] dark:border-[#383834]"
          >
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-tight text-[#6B6964] dark:text-[#A8A59E]">
              Synced
            </span>
          </div>

          {/* Theme Toggle */}
          <button
            id="theme-toggle-btn"
            onClick={onToggleTheme}
            aria-label="Toggle Theme"
            className="p-1.5 rounded-full text-[#8A8882] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] transition-colors focus:outline-none"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-[#ECE9E2]" /> : <Moon className="w-4 h-4 text-[#3A3A36]" />}
          </button>

          {/* Settings Button */}
          <button
            id="settings-btn"
            onClick={onOpenSettings}
            aria-label="Settings"
            className="p-1.5 rounded-full text-[#8A8882] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] transition-colors focus:outline-none"
            title="Application Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Author Badge */}
          <button
            id="nav-author-badge"
            onClick={onOpenSettings}
            className="w-8 h-8 rounded-full bg-[#3A3A36] dark:bg-[#ECE9E2] flex items-center justify-center text-white dark:text-[#1A1A1A] text-xs font-serif font-bold shadow-sm hover:opacity-90 transition-opacity"
            title="Author Profile"
          >
            MN
          </button>
        </div>
      </div>
    </header>
  );
};
