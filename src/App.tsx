import React, { useState, useEffect } from 'react';
import { Book, BookPage } from './types';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { BookEditor } from './components/BookEditor';
import { AddBookModal } from './components/AddBookModal';
import { SettingsModal } from './components/SettingsModal';
import { ExportModal } from './components/ExportModal';
import { DeleteBookModal } from './components/DeleteBookModal';
import {
  fetchBooks,
  createBookInFirestore,
  updateBookInFirestore,
  deleteBookCompletely,
  fetchPagesForBook,
} from './services/storage';
import { initAuth } from './services/firebase';
import { exportBookToPdf } from './services/pdfExport';

export default function App() {
  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('mynook_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Apply theme to html document
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('mynook_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Books & Navigation state
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoadingBooks, setIsLoadingBooks] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeBook, setActiveBook] = useState<Book | null>(null);

  // Modals state
  const [isAddBookModalOpen, setIsAddBookModalOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // PDF Export Modal State
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const [exportCompleted, setExportCompleted] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportingBookTitle, setExportingBookTitle] = useState('');

  // 1. Initialize Auth and load Books from Firestore on mount
  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      try {
        await initAuth();
        const loadedBooks = await fetchBooks();
        if (isMounted) {
          setBooks(loadedBooks);
          setIsLoadingBooks(false);
        }
      } catch (err) {
        console.warn('Initial data load warning:', err);
        if (isMounted) setIsLoadingBooks(false);
      }
    };
    init();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Add or Edit Book
  const handleSaveBook = async (bookData: {
    title: string;
    author: string;
    description: string;
    frontCoverUrl: string;
    backCoverUrl: string;
    genre: string;
  }) => {
    if (editingBook) {
      // Update existing book
      await updateBookInFirestore(editingBook.id, bookData);
      setBooks((prev) =>
        prev.map((b) => (b.id === editingBook.id ? { ...b, ...bookData, updatedAt: Date.now() } : b))
      );
      if (activeBook && activeBook.id === editingBook.id) {
        setActiveBook((prev) => (prev ? { ...prev, ...bookData } : null));
      }
    } else {
      // Create new book
      const newBook = await createBookInFirestore(bookData);
      setBooks((prev) => [newBook, ...prev]);
      // Open the new book immediately for seamless writing flow
      setActiveBook(newBook);
    }
  };

  // 3. Delete Book with complete atomic cleanup
  const handleDeleteBook = (book: Book) => {
    setBookToDelete(book);
  };

  const handleConfirmDelete = async (book: Book) => {
    await deleteBookCompletely(book);
    setBooks((prev) => prev.filter((b) => b.id !== book.id));
    if (activeBook && activeBook.id === book.id) {
      setActiveBook(null);
    }
  };

  // 4. Export Book to PDF
  const handleExportPdf = async (book: Book, preloadedPages?: BookPage[]) => {
    setIsExporting(true);
    setExportCompleted(false);
    setExportError(null);
    setExportingBookTitle(book.title);
    setExportStatus('Fetching book chapters...');

    try {
      const pages = preloadedPages || (await fetchPagesForBook(book.id));
      await exportBookToPdf(book, pages, (status) => {
        setExportStatus(status);
      });
      setExportCompleted(true);
    } catch (err: any) {
      console.error('PDF Export Error:', err);
      setExportError(err.message || 'Unable to generate PDF book. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F7F2] dark:bg-[#181816] text-[#1A1A1A] dark:text-[#ECE9E2] transition-colors duration-200">
      {/* Top Navigation */}
      <Navbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onNavigateHome={() => setActiveBook(null)}
        isWritingMode={!!activeBook}
      />

      {/* Main View Area: Dashboard or Book Editor */}
      <div className="flex-1 flex flex-col">
        {activeBook ? (
          <BookEditor
            book={activeBook}
            onBackToDashboard={() => setActiveBook(null)}
            onExportPdf={(b, pages) => handleExportPdf(b, pages)}
          />
        ) : (
          <Dashboard
            books={books}
            searchQuery={searchQuery}
            onAddNewBook={() => {
              setEditingBook(null);
              setIsAddBookModalOpen(true);
            }}
            onOpenBook={(book) => setActiveBook(book)}
            onEditBook={(book) => {
              setEditingBook(book);
              setIsAddBookModalOpen(true);
            }}
            onDeleteBook={handleDeleteBook}
            onExportPdf={(book) => handleExportPdf(book)}
            isLoading={isLoadingBooks}
          />
        )}
      </div>

      {/* Add / Edit Book Modal */}
      <AddBookModal
        isOpen={isAddBookModalOpen}
        onClose={() => {
          setIsAddBookModalOpen(false);
          setEditingBook(null);
        }}
        onSubmit={handleSaveBook}
        initialBook={editingBook}
      />

      {/* Delete Book Confirmation Modal */}
      <DeleteBookModal
        isOpen={!!bookToDelete}
        book={bookToDelete}
        onClose={() => setBookToDelete(null)}
        onConfirmDelete={handleConfirmDelete}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* PDF Export Progress Modal */}
      <ExportModal
        isOpen={isExporting}
        onClose={() => setIsExporting(false)}
        status={exportStatus}
        isCompleted={exportCompleted}
        error={exportError}
        bookTitle={exportingBookTitle}
      />
    </div>
  );
}
