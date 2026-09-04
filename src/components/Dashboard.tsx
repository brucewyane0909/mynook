import React from 'react';
import { Plus, BookOpen, Sparkles, FolderPlus, Library, Search } from 'lucide-react';
import { Book } from '../types';
import { BookCard } from './BookCard';

interface DashboardProps {
  books: Book[];
  searchQuery: string;
  onAddNewBook: () => void;
  onOpenBook: (book: Book) => void;
  onEditBook: (book: Book) => void;
  onDeleteBook: (book: Book) => void;
  onExportPdf: (book: Book) => void;
  onExportEpub: (book: Book) => void;
  isLoading: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({
  books,
  searchQuery,
  onAddNewBook,
  onOpenBook,
  onEditBook,
  onDeleteBook,
  onExportPdf,
  onExportEpub,
  isLoading,
}) => {
  // Filter books based on search query
  const filteredBooks = books.filter((b) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.title.toLowerCase().includes(q) ||
      b.author.toLowerCase().includes(q) ||
      (b.genre && b.genre.toLowerCase().includes(q)) ||
      (b.description && b.description.toLowerCase().includes(q))
    );
  });

  return (
    <main id="mynook-dashboard" className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      {/* Dashboard Sub-Hero & Quick Stats */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6 mb-6 sm:mb-10 pb-5 sm:pb-6 border-b border-[#E5E1D8] dark:border-[#2E2E2A]">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#8A8882] dark:text-[#9E9B95] mb-1">
            <Library className="w-3.5 h-3.5" />
            <span>Manuscript Collection</span>
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold serif italic text-[#3A3A36] dark:text-[#ECE9E2]">
            My Library
          </h1>
          <p className="text-xs sm:text-sm text-[#5A5852] dark:text-[#9E9B95] mt-0.5 sm:mt-1 font-serif italic">
            {books.length} {books.length === 1 ? 'manuscript' : 'manuscripts'} in progress
          </p>
        </div>

        {/* Primary Action Button */}
        <button
          id="hero-add-book-btn"
          onClick={onAddNewBook}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 sm:py-2 min-h-[42px] sm:min-h-0 bg-[#3A3A36] dark:bg-[#ECE9E2] hover:bg-black dark:hover:bg-white text-white dark:text-[#1A1A1A] text-[10px] font-bold uppercase tracking-widest rounded-sm shadow-sm transition-all duration-200 self-stretch sm:self-auto cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Project</span>
        </button>
      </div>

      {/* Loading Skeleton */}
      {isLoading && books.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-80 sm:h-96 rounded-sm bg-[#E5E1D8]/60 dark:bg-[#20201D] animate-pulse border border-[#DCD8CF] dark:border-[#2E2E2A]"
            />
          ))}
        </div>
      )}

      {/* Empty State: No Books Exist */}
      {!isLoading && books.length === 0 && (
        <div
          id="empty-books-state"
          className="py-12 sm:py-24 px-4 text-center max-w-lg mx-auto flex flex-col items-center justify-center"
        >
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-sm bg-[#EBE8E0] dark:bg-[#282824] text-[#3A3A36] dark:text-[#ECE9E2] flex items-center justify-center mb-4 sm:mb-5 border border-[#DCD8CF] dark:border-[#383834] shadow-sm">
            <BookOpen className="w-6 h-6 sm:w-7 sm:h-7 stroke-1" />
          </div>

          <h2 className="text-xl sm:text-2xl md:text-3xl serif italic text-[#3A3A36] dark:text-[#ECE9E2] mb-2">
            Your next story starts here.
          </h2>

          <div className="w-12 sm:w-16 h-0.5 bg-[#3A3A36] dark:bg-[#ECE9E2] mx-auto mb-3 sm:mb-4" />

          <p className="text-xs sm:text-sm text-[#5A5852] dark:text-[#9E9B95] mb-6 leading-relaxed font-serif">
            MYNOOK provides an artistic haven for writing novels, memoirs, essays, and screenplays with live cloud synchronization and cover artwork.
          </p>

          <button
            id="create-first-book-btn"
            onClick={onAddNewBook}
            className="w-full sm:w-auto px-6 py-3 sm:py-2.5 rounded-sm text-[10px] font-bold uppercase tracking-widest bg-[#3A3A36] dark:bg-[#ECE9E2] hover:bg-black dark:hover:bg-white text-white dark:text-[#1A1A1A] shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Create First Manuscript</span>
          </button>
        </div>
      )}

      {/* No Search Results */}
      {!isLoading && books.length > 0 && filteredBooks.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-[#8A8882] dark:text-[#9E9B95] text-sm font-serif italic">
            No manuscripts matched "<span className="font-semibold text-[#1A1A1A] dark:text-[#ECE9E2]">{searchQuery}</span>".
          </p>
        </div>
      )}

      {/* Main Books Grid */}
      {filteredBooks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 sm:gap-6 lg:gap-8">
          {/* Large "+ Add New Book" Card */}
          <button
            id="add-book-grid-card"
            onClick={onAddNewBook}
            className="group flex flex-col items-center justify-center h-full min-h-[260px] sm:min-h-[340px] md:min-h-[380px] p-6 rounded-sm border border-dashed border-[#DCD8CF] dark:border-[#383834] hover:border-[#3A3A36] dark:hover:border-[#ECE9E2] bg-[#F3F0E9]/60 hover:bg-[#EBE8E0]/70 dark:bg-[#1E1E1B]/50 dark:hover:bg-[#252521] transition-all duration-300 cursor-pointer text-center"
          >
            <div className="w-12 h-12 rounded-full bg-[#E5E1D8] group-hover:bg-[#3A3A36] group-hover:text-white dark:bg-[#282824] dark:group-hover:bg-[#ECE9E2] text-[#6B6964] dark:text-[#ECE9E2] dark:group-hover:text-[#1A1A1A] flex items-center justify-center mb-4 transition-all duration-300 shadow-sm">
              <Plus className="w-5 h-5" />
            </div>
            <span className="font-serif italic font-bold text-base text-[#3A3A36] dark:text-[#ECE9E2] transition-colors">
              + New Manuscript
            </span>
            <span className="text-[10px] uppercase tracking-widest text-[#8A8882] dark:text-[#9E9B95] mt-1.5 max-w-[160px]">
              Start writing or bind cover art
            </span>
          </button>

          {/* Existing Books Cards */}
          {filteredBooks.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              onOpenBook={onOpenBook}
              onEditBook={onEditBook}
              onDeleteBook={onDeleteBook}
              onExportPdf={onExportPdf}
              onExportEpub={onExportEpub}
            />
          ))}
        </div>
      )}
    </main>
  );
};
