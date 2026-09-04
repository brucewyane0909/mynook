import React, { useState, useRef, useEffect } from 'react';
import { Book as BookIcon, MoreVertical, Edit3, Trash2, Download, Clock, BookOpen, Layers } from 'lucide-react';
import { Book } from '../types';

interface BookCardProps {
  book: Book;
  onOpenBook: (book: Book) => void;
  onEditBook: (book: Book) => void;
  onDeleteBook: (book: Book) => void;
  onExportPdf: (book: Book) => void;
}

export const BookCard: React.FC<BookCardProps> = ({
  book,
  onOpenBook,
  onEditBook,
  onDeleteBook,
  onExportPdf,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  // Format date cleanly
  const formattedDate = new Date(book.updatedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div
      id={`book-card-${book.id}`}
      className="group relative flex flex-col rounded-sm bg-white dark:bg-[#21211E] border border-[#E5E1D8] dark:border-[#2E2E2A] hover:border-[#3A3A36]/60 dark:hover:border-[#ECE9E2]/40 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden"
    >
      {/* Top Cover Visual Container */}
      <div
        className="relative h-64 w-full bg-[#F3F0E9] dark:bg-[#1E1E1B] overflow-hidden cursor-pointer flex items-center justify-center p-5 border-b border-[#E5E1D8] dark:border-[#2E2E2A]"
        onClick={() => onOpenBook(book)}
      >
        {book.frontCoverUrl ? (
          <div className="relative h-full aspect-[2/3] rounded-sm shadow-md overflow-hidden transition-transform duration-300 group-hover:scale-105 border border-[#DCD8CF] dark:border-[#383834]">
            <img
              src={book.frontCoverUrl}
              alt={book.title}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        ) : (
          /* Editorial Typographic Jacket Fallback (as in Artistic Flair) */
          <div className="relative h-full aspect-[2/3] rounded-sm bg-[#E5E1D8] dark:bg-[#282824] text-[#1A1A1A] dark:text-[#ECE9E2] p-4 flex flex-col justify-between shadow-sm border border-[#DCD8CF] dark:border-[#383834] transition-transform duration-300 group-hover:scale-105">
            <div className="flex justify-between items-start">
              <span className="text-[9px] uppercase font-mono tracking-widest text-[#8A8882] dark:text-[#9E9B95] font-semibold">
                {book.genre || 'MYNOOK'}
              </span>
              <BookIcon className="w-3.5 h-3.5 text-[#8A8882]" />
            </div>

            <div className="my-auto py-2 text-center">
              <h3 className="serif italic font-bold text-sm leading-snug text-[#3A3A36] dark:text-[#ECE9E2] line-clamp-3">
                {book.title}
              </h3>
              <div className="w-8 h-[1px] bg-[#6B6964] dark:bg-[#A8A59E] mx-auto my-2" />
              {book.author && (
                <p className="text-[10px] font-serif italic text-[#6B6964] dark:text-[#9E9B95] line-clamp-1">
                  by {book.author}
                </p>
              )}
            </div>

            <div className="text-[9px] text-[#8A8882] uppercase tracking-wider text-right font-mono">
              Volume I
            </div>
          </div>
        )}

        {/* Floating Options Menu Button */}
        <div className="absolute top-2.5 right-2.5 z-10" ref={menuRef}>
          <button
            id={`book-options-btn-${book.id}`}
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen(!isMenuOpen);
            }}
            aria-label="Book Options"
            className="p-1.5 rounded-full bg-white/90 dark:bg-[#21211E]/90 backdrop-blur-md text-[#5A5852] dark:text-[#A8A59E] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] shadow-sm transition-colors border border-[#E5E1D8] dark:border-[#2E2E2A]"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 mt-1 w-44 rounded-sm bg-[#F9F7F2] dark:bg-[#21211E] border border-[#E5E1D8] dark:border-[#2E2E2A] shadow-xl py-1 z-20 animate-in fade-in zoom-in-95 duration-100">
              <button
                id={`edit-book-btn-${book.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(false);
                  onEditBook(book);
                }}
                className="w-full px-3.5 py-2 text-left text-xs font-medium text-[#3A3A36] dark:text-[#ECE9E2] hover:bg-[#EBE8E0] dark:hover:bg-[#2D2D29] flex items-center gap-2 font-sans"
              >
                <Edit3 className="w-3.5 h-3.5 text-[#8A8882]" />
                Edit Details & Covers
              </button>
              <button
                id={`export-pdf-btn-${book.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(false);
                  onExportPdf(book);
                }}
                className="w-full px-3.5 py-2 text-left text-xs font-medium text-[#3A3A36] dark:text-[#ECE9E2] hover:bg-[#EBE8E0] dark:hover:bg-[#2D2D29] flex items-center gap-2 font-sans"
              >
                <Download className="w-3.5 h-3.5 text-[#3A3A36] dark:text-[#ECE9E2]" />
                Export Book to PDF
              </button>
              <div className="my-1 border-t border-[#E5E1D8] dark:border-[#2E2E2A]" />
              <button
                id={`delete-book-btn-${book.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(false);
                  onDeleteBook(book);
                }}
                className="w-full px-3.5 py-2 text-left text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-2 font-sans"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Book
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Book Metadata Area */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div>
          <h3
            onClick={() => onOpenBook(book)}
            className="serif italic font-bold text-base text-[#1A1A1A] dark:text-[#ECE9E2] line-clamp-1 hover:opacity-80 cursor-pointer transition-colors"
          >
            {book.title}
          </h3>

          <p className="text-xs text-[#8A8882] dark:text-[#9E9B95] font-serif italic mt-0.5 line-clamp-1">
            {book.author ? `by ${book.author}` : 'Unknown Author'}
          </p>

          {book.description && (
            <p className="text-xs text-[#5A5852] dark:text-[#A8A59E] font-sans mt-2 line-clamp-2 leading-relaxed">
              {book.description}
            </p>
          )}
        </div>

        {/* Meta Stats & Progress */}
        <div className="pt-2 border-t border-[#E5E1D8] dark:border-[#2E2E2A]">
          <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-widest text-[#8A8882] dark:text-[#9E9B95] mb-3">
            <span className="flex items-center gap-1">
              <Layers className="w-3 h-3 text-[#8A8882]" />
              {book.pageCount || 1} {book.pageCount === 1 ? 'Page' : 'Pages'}
            </span>
            <span className="flex items-center gap-1 font-mono">
              <Clock className="w-3 h-3 text-[#8A8882]" />
              {formattedDate}
            </span>
          </div>

          {/* Continue Writing Primary Button */}
          <button
            id={`continue-writing-btn-${book.id}`}
            onClick={() => onOpenBook(book)}
            className="w-full py-2 px-3 rounded-sm text-[10px] font-bold uppercase tracking-widest bg-[#EBE8E0] hover:bg-[#3A3A36] hover:text-white dark:bg-[#282824] dark:hover:bg-[#ECE9E2] dark:hover:text-[#1A1A1A] text-[#3A3A36] dark:text-[#ECE9E2] transition-all duration-200 flex items-center justify-center gap-2 group-hover:bg-[#3A3A36] group-hover:text-white dark:group-hover:bg-[#ECE9E2] dark:group-hover:text-[#1A1A1A]"
          >
            <BookOpen className="w-3 h-3" />
            <span>Open Manuscript</span>
          </button>
        </div>
      </div>
    </div>
  );
};
