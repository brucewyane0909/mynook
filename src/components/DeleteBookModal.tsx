import React, { useState } from 'react';
import { AlertTriangle, Loader2, Trash2, X, CheckCircle2 } from 'lucide-react';
import { Book } from '../types';

interface DeleteBookModalProps {
  isOpen: boolean;
  book: Book | null;
  onClose: () => void;
  onConfirmDelete: (book: Book) => Promise<void>;
}

export const DeleteBookModal: React.FC<DeleteBookModalProps> = ({
  isOpen,
  book,
  onClose,
  onConfirmDelete,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDeleted, setIsDeleted] = useState(false);

  if (!isOpen || !book) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    setErrorMsg(null);

    try {
      await onConfirmDelete(book);
      setIsDeleted(true);
      setTimeout(() => {
        setIsDeleted(false);
        setIsDeleting(false);
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('Delete book error:', err);
      setErrorMsg(err.message || 'Failed to delete book. Please try again.');
      setIsDeleting(false);
    }
  };

  const handleModalClose = () => {
    if (isDeleting) return;
    setErrorMsg(null);
    setIsDeleted(false);
    onClose();
  };

  return (
    <div
      id="delete-book-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
    >
      <div
        id="delete-book-modal-card"
        className="w-full max-w-md bg-[#F9F7F2] dark:bg-[#21211E] rounded-sm shadow-2xl border border-[#E5E1D8] dark:border-[#2E2E2A] overflow-hidden my-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-[#E5E1D8] dark:border-[#2E2E2A]">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-sm bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <h2 className="text-base serif italic font-bold text-[#1A1A1A] dark:text-[#ECE9E2] truncate">
              Delete Book Project
            </h2>
          </div>
          <button
            id="close-delete-modal-btn"
            onClick={handleModalClose}
            disabled={isDeleting}
            className="p-2 sm:p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-sm text-[#8A8882] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0] dark:hover:bg-[#282824] transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4">
          {isDeleted ? (
            <div className="py-6 flex flex-col items-center justify-center text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
              <h3 className="serif font-bold text-base text-[#1A1A1A] dark:text-[#ECE9E2]">
                Book Deleted Successfully
              </h3>
              <p className="text-xs text-[#8A8882]">
                Project assets, pages, and writing sessions have been removed.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3 p-3.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-sm">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="text-xs text-[#5A5852] dark:text-[#DCD8CF] leading-relaxed">
                  <span className="font-semibold text-red-700 dark:text-red-300 block mb-0.5">
                    This action is permanent and cannot be undone.
                  </span>
                  Are you sure you want to delete <span className="font-serif italic font-bold text-[#1A1A1A] dark:text-white">"{book.title}"</span>? All chapters, cloud cover images, and saved writing sessions will be permanently purged.
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs rounded-sm">
                  {errorMsg}
                </div>
              )}

              <div className="pt-2 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-2.5">
                <button
                  type="button"
                  id="cancel-delete-book-btn"
                  onClick={handleModalClose}
                  disabled={isDeleting}
                  className="w-full sm:w-auto px-4 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 rounded-sm text-xs font-bold uppercase tracking-wider text-[#6B6964] dark:text-[#A8A59E] hover:bg-[#EBE8E0] dark:hover:bg-[#282824] transition-colors disabled:opacity-50 text-center cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="confirm-delete-book-btn"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="w-full sm:w-auto px-4 py-2.5 sm:py-2 min-h-[42px] sm:min-h-0 rounded-sm text-xs font-bold uppercase tracking-wider bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-1.5 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Book</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
