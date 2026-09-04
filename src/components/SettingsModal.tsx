import React, { useState, useEffect } from 'react';
import { X, Sliders, Database, Wifi, Cloud, ShieldCheck, Keyboard, Sparkles, Check } from 'lucide-react';
import { RTDB_URL } from '../services/firebase';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  theme,
  onToggleTheme,
}) => {
  const [authorName, setAuthorName] = useState(() => {
    return localStorage.getItem('mynook_default_author') || 'Anonymous Author';
  });
  const [savedAuthor, setSavedAuthor] = useState(false);

  if (!isOpen) return null;

  const handleSaveAuthor = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('mynook_default_author', authorName.trim());
    setSavedAuthor(true);
    setTimeout(() => setSavedAuthor(false), 2000);
  };

  return (
    <div
      id="settings-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
    >
      <div
        id="settings-modal-card"
        className="w-full max-w-lg bg-[#F9F7F2] dark:bg-[#21211E] rounded-sm shadow-2xl border border-[#E5E1D8] dark:border-[#2E2E2A] overflow-hidden my-auto max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-[#E5E1D8] dark:border-[#2E2E2A] shrink-0">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-sm bg-[#EBE8E0] dark:bg-[#282824] text-[#3A3A36] dark:text-[#ECE9E2] flex items-center justify-center shrink-0">
              <Sliders className="w-4 h-4" />
            </div>
            <h2 className="text-base sm:text-lg serif italic font-bold text-[#1A1A1A] dark:text-[#ECE9E2] truncate">
              Workspace Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 sm:p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-sm text-[#8A8882] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0] dark:hover:bg-[#282824] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 overflow-y-auto flex-1">
          {/* Author Pen Name Setting */}
          <div>
            <label className="block text-[10px] font-bold text-[#8A8882] dark:text-[#9E9B95] uppercase tracking-widest mb-2">
              Default Pen Name
            </label>
            <form onSubmit={handleSaveAuthor} className="flex gap-2">
              <input
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Author pen name"
                className="flex-1 px-3.5 py-2 text-xs sm:text-sm rounded-sm bg-white dark:bg-[#181816] text-[#1A1A1A] dark:text-[#ECE9E2] border border-[#E5E1D8] dark:border-[#2E2E2A] focus:outline-none focus:border-[#3A3A36] dark:focus:border-[#ECE9E2]"
              />
              <button
                type="submit"
                className="px-4 py-2 min-h-[38px] rounded-sm text-[10px] font-bold uppercase tracking-widest bg-[#3A3A36] hover:bg-black dark:bg-[#ECE9E2] dark:hover:bg-white text-white dark:text-[#1A1A1A] transition-colors cursor-pointer shrink-0"
              >
                {savedAuthor ? <Check className="w-4 h-4 text-emerald-400" /> : 'Save'}
              </button>
            </form>
          </div>

          {/* Theme Switch */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-4 border-t border-[#E5E1D8] dark:border-[#2E2E2A]">
            <div>
              <h4 className="text-sm font-semibold text-[#1A1A1A] dark:text-[#ECE9E2]">
                Visual Theme
              </h4>
              <p className="text-xs text-[#8A8882]">
                Switch between warm paper light and refined dark workspace
              </p>
            </div>
            <button
              onClick={onToggleTheme}
              className="self-start sm:self-auto px-4 py-2 min-h-[38px] rounded-sm text-[10px] font-bold uppercase tracking-widest bg-[#EBE8E0] dark:bg-[#282824] text-[#3A3A36] dark:text-[#ECE9E2] border border-[#E5E1D8] dark:border-[#2E2E2A] hover:bg-[#3A3A36] hover:text-white dark:hover:bg-[#ECE9E2] dark:hover:text-[#1A1A1A] transition-colors cursor-pointer"
            >
              {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
            </button>
          </div>

          {/* Architecture & Cloud Integration Status */}
          <div className="pt-4 border-t border-[#E5E1D8] dark:border-[#2E2E2A] space-y-3">
            <h4 className="text-[10px] font-bold text-[#8A8882] dark:text-[#9E9B95] uppercase tracking-widest">
              Connected Services & Storage
            </h4>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-sm bg-white dark:bg-[#181816] border border-[#E5E1D8] dark:border-[#2E2E2A]">
                <div className="flex items-center gap-2 text-[#3A3A36] dark:text-[#ECE9E2]">
                  <Database className="w-4 h-4 text-[#8A8882] shrink-0" />
                  <span>Firebase Firestore</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Permanent Storage
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-sm bg-white dark:bg-[#181816] border border-[#E5E1D8] dark:border-[#2E2E2A]">
                <div className="flex items-center gap-2 text-[#3A3A36] dark:text-[#ECE9E2]">
                  <Wifi className="w-4 h-4 text-[#8A8882] shrink-0" />
                  <span>Realtime Database</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-sm bg-white dark:bg-[#181816] border border-[#E5E1D8] dark:border-[#2E2E2A]">
                <div className="flex items-center gap-2 text-[#3A3A36] dark:text-[#ECE9E2]">
                  <Cloud className="w-4 h-4 text-[#8A8882] shrink-0" />
                  <span>Cloudinary CDN</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Cover Art Hosting
                </span>
              </div>
            </div>
          </div>

          {/* Keyboard Shortcuts Reference */}
          <div className="pt-4 border-t border-[#E5E1D8] dark:border-[#2E2E2A] space-y-2">
            <h4 className="text-[10px] font-bold text-[#8A8882] dark:text-[#9E9B95] uppercase tracking-widest flex items-center gap-1.5">
              <Keyboard className="w-3.5 h-3.5" />
              <span>Writer Shortcuts</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-[#5A5852] dark:text-[#A8A59E]">
              <div className="flex items-center justify-between p-2 rounded-sm bg-white dark:bg-[#181816] border border-[#E5E1D8] dark:border-[#2E2E2A]">
                <span>Bold Text</span>
                <kbd className="px-1.5 py-0.5 rounded-xs bg-[#EBE8E0] dark:bg-[#282824] text-[#3A3A36] dark:text-[#ECE9E2] font-mono text-[10px]">
                  Ctrl+B
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-sm bg-white dark:bg-[#181816] border border-[#E5E1D8] dark:border-[#2E2E2A]">
                <span>Italic Text</span>
                <kbd className="px-1.5 py-0.5 rounded-xs bg-[#EBE8E0] dark:bg-[#282824] text-[#3A3A36] dark:text-[#ECE9E2] font-mono text-[10px]">
                  Ctrl+I
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-sm bg-white dark:bg-[#181816] border border-[#E5E1D8] dark:border-[#2E2E2A]">
                <span>Underline</span>
                <kbd className="px-1.5 py-0.5 rounded-xs bg-[#EBE8E0] dark:bg-[#282824] text-[#3A3A36] dark:text-[#ECE9E2] font-mono text-[10px]">
                  Ctrl+U
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-sm bg-white dark:bg-[#181816] border border-[#E5E1D8] dark:border-[#2E2E2A]">
                <span>Auto-Correct</span>
                <span className="text-[10px] text-[#3A3A36] dark:text-[#ECE9E2] font-semibold">
                  Spacebar
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 bg-[#EBE8E0] dark:bg-[#181816] border-t border-[#E5E1D8] dark:border-[#2E2E2A] text-center text-[10px] uppercase font-bold tracking-widest text-[#8A8882] shrink-0">
          MYNOOK Studio &bull; Book Project Management
        </div>
      </div>
    </div>
  );
};
