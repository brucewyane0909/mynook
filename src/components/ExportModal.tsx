import React from 'react';
import { Loader2, Download, CheckCircle, AlertCircle, FileText } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: string;
  isCompleted: boolean;
  error: string | null;
  bookTitle: string;
  format?: 'pdf' | 'epub';
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  status,
  isCompleted,
  error,
  bookTitle,
  format = 'pdf',
}) => {
  if (!isOpen) return null;

  const isEpub = format === 'epub';
  const formatLabel = isEpub ? 'EPUB' : 'PDF';
  const formatDesc = isEpub ? 'EPUB ebook' : 'PDF manuscript';

  return (
    <div
      id="export-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
    >
      <div
        id="export-modal-card"
        className="w-full max-w-md bg-[#F9F7F2] dark:bg-[#21211E] rounded-sm shadow-2xl border border-[#E5E1D8] dark:border-[#2E2E2A] p-4 sm:p-6 text-center space-y-3.5 sm:space-y-4 my-auto"
      >
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-sm bg-[#EBE8E0] dark:bg-[#282824] text-[#3A3A36] dark:text-[#ECE9E2] mx-auto flex items-center justify-center">
          {error ? (
            <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
          ) : isCompleted ? (
            <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin text-[#3A3A36] dark:text-[#ECE9E2]" />
          )}
        </div>

        <div>
          <h3 className="serif italic font-bold text-base sm:text-lg text-[#1A1A1A] dark:text-[#ECE9E2]">
            {error
              ? 'Export Failed'
              : isCompleted
              ? `${formatLabel} Export Complete`
              : `Exporting Book to ${formatLabel}`}
          </h3>
          <p className="text-xs text-[#8A8882] mt-1 serif italic truncate px-2">
            "{bookTitle}"
          </p>
        </div>

        {/* Current Step Status */}
        <div className="p-3 rounded-sm bg-white dark:bg-[#181816] border border-[#E5E1D8] dark:border-[#2E2E2A] text-xs text-[#5A5852] dark:text-[#A8A59E] min-h-[44px] flex items-center justify-center">
          {error ? (
            <span className="text-red-600 dark:text-red-400">{error}</span>
          ) : isCompleted ? (
            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
              Your {formatDesc} has been successfully generated and downloaded!
            </span>
          ) : (
            <span className="animate-pulse font-serif">{status || `Compiling chapters into ${formatLabel}...`}</span>
          )}
        </div>

        {/* Close Button once finished or errored */}
        {(isCompleted || error) && (
          <div className="pt-2">
            <button
              onClick={onClose}
              className="w-full py-2.5 min-h-[42px] rounded-sm text-[10px] font-bold uppercase tracking-widest bg-[#3A3A36] hover:bg-black dark:bg-[#ECE9E2] dark:hover:bg-white text-white dark:text-[#1A1A1A] transition-colors shadow-sm cursor-pointer"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
