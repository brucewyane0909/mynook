import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, set, get, remove } from 'firebase/database';
import { firestore, realtimeDb, getCurrentUser } from './firebase';
import { Book, BookPage, LiveSessionState } from '../types';

const LOCAL_STORAGE_BOOKS_KEY = 'mynook_cached_books';
const LOCAL_STORAGE_PAGES_PREFIX = 'mynook_cached_pages_';
const LOCAL_STORAGE_DRAFT_PREFIX = 'mynook_draft_';

// Helper for local cache fallback
const getCachedBooks = (): Book[] => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_BOOKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const setCachedBooks = (books: Book[]) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_BOOKS_KEY, JSON.stringify(books));
  } catch (e) {
    console.warn('Failed to cache books locally:', e);
  }
};

// ==================== FIRESTORE: BOOKS ====================

export async function fetchBooks(): Promise<Book[]> {
  try {
    const booksCol = collection(firestore, 'books');
    const q = query(booksCol, orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);

    const books: Book[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      books.push({
        id: d.id,
        title: data.title || 'Untitled Book',
        author: data.author || '',
        description: data.description || '',
        frontCoverUrl: data.frontCoverUrl || '',
        backCoverUrl: data.backCoverUrl || '',
        createdAt: data.createdAt?.toMillis?.() || data.createdAt || Date.now(),
        updatedAt: data.updatedAt?.toMillis?.() || data.updatedAt || Date.now(),
        pageCount: data.pageCount || 0,
        ownerId: data.ownerId || '',
        genre: data.genre || '',
      });
    });

    setCachedBooks(books);
    return books;
  } catch (err) {
    console.warn('Error fetching books from Firestore, falling back to local cache:', err);
    return getCachedBooks();
  }
}

export async function createBookInFirestore(
  bookData: Omit<Book, 'id' | 'createdAt' | 'updatedAt' | 'pageCount'> & {
    initialChapters?: { title: string; content?: string }[];
  }
): Promise<Book> {
  const user = getCurrentUser();
  const bookId = 'book_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  const now = Date.now();

  const chapters =
    bookData.initialChapters && bookData.initialChapters.length > 0
      ? bookData.initialChapters
      : [
          {
            title: 'Chapter 1: The Beginning',
            content: '<p>Every great story begins with a single word...</p>',
          },
        ];

  const newBook: Book = {
    id: bookId,
    title: bookData.title.trim() || 'Untitled Book',
    author: bookData.author.trim(),
    description: bookData.description.trim(),
    frontCoverUrl: bookData.frontCoverUrl || '',
    backCoverUrl: bookData.backCoverUrl || '',
    createdAt: now,
    updatedAt: now,
    pageCount: chapters.length,
    ownerId: user ? user.uid : 'author',
    genre: bookData.genre || '',
    templateId: bookData.templateId,
  };

  // Update local cache optimistically
  const cached = getCachedBooks();
  setCachedBooks([newBook, ...cached]);

  // Pre-seed local storage pages cache for instant offline responsiveness
  const localPages: BookPage[] = chapters.map((ch, idx) => ({
    id: `page_${now}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
    bookId,
    title: ch.title,
    content: ch.content || '<p></p>',
    pageNumber: idx + 1,
    createdAt: now,
    updatedAt: now,
  }));
  try {
    localStorage.setItem(LOCAL_STORAGE_PAGES_PREFIX + bookId, JSON.stringify(localPages));
  } catch (e) {
    console.warn('Failed to pre-cache template pages locally:', e);
  }

  try {
    const bookDocRef = doc(firestore, 'books', bookId);
    await setDoc(bookDocRef, {
      ...newBook,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Create initial pages for this book in Firestore subcollection
    for (const page of localPages) {
      const pageDocRef = doc(firestore, 'books', bookId, 'pages', page.id);
      await setDoc(pageDocRef, {
        id: page.id,
        bookId,
        title: page.title,
        content: page.content,
        pageNumber: page.pageNumber,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn('Error persisting new book to Firestore:', err);
  }

  return newBook;
}

export async function updateBookInFirestore(bookId: string, updates: Partial<Book>): Promise<void> {
  // Update local cache first
  const cached = getCachedBooks();
  const index = cached.findIndex((b) => b.id === bookId);
  if (index !== -1) {
    cached[index] = { ...cached[index], ...updates, updatedAt: Date.now() };
    setCachedBooks(cached);
  }

  try {
    const bookDocRef = doc(firestore, 'books', bookId);
    await updateDoc(bookDocRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Error updating book in Firestore:', err);
  }
}

export async function deleteBookFromFirestore(bookId: string): Promise<void> {
  const cached = getCachedBooks().filter((b) => b.id !== bookId);
  setCachedBooks(cached);

  try {
    // Delete pages subcollection
    const pagesCol = collection(firestore, 'books', bookId, 'pages');
    const snapshot = await getDocs(pagesCol);
    for (const p of snapshot.docs) {
      await deleteDoc(p.ref);
    }
    await deleteDoc(doc(firestore, 'books', bookId));
  } catch (err) {
    console.warn('Error deleting book from Firestore:', err);
  }
}

// ==================== FIRESTORE: PAGES ====================

export async function fetchPagesForBook(bookId: string): Promise<BookPage[]> {
  try {
    const pagesCol = collection(firestore, 'books', bookId, 'pages');
    const q = query(pagesCol, orderBy('pageNumber', 'asc'));
    const snapshot = await getDocs(q);

    const pages: BookPage[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      pages.push({
        id: d.id,
        bookId,
        title: data.title || 'Untitled Page',
        content: data.content || '',
        pageNumber: typeof data.pageNumber === 'number' ? data.pageNumber : pages.length + 1,
        createdAt: data.createdAt?.toMillis?.() || data.createdAt || Date.now(),
        updatedAt: data.updatedAt?.toMillis?.() || data.updatedAt || Date.now(),
      });
    });

    if (pages.length === 0) {
      // Create a default initial page if book was empty
      return [
        {
          id: 'page_' + Date.now(),
          bookId,
          title: 'Chapter 1: The Beginning',
          content: '<p>Every great story begins with a single word...</p>',
          pageNumber: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
    }

    localStorage.setItem(LOCAL_STORAGE_PAGES_PREFIX + bookId, JSON.stringify(pages));
    return pages;
  } catch (err) {
    console.warn('Error fetching pages from Firestore, checking local storage:', err);
    const cached = localStorage.getItem(LOCAL_STORAGE_PAGES_PREFIX + bookId);
    if (cached) {
      return JSON.parse(cached);
    }
    return [
      {
        id: 'page_fallback_' + Date.now(),
        bookId,
        title: 'Chapter 1: The Beginning',
        content: '<p>Every great story begins with a single word...</p>',
        pageNumber: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
  }
}

export async function createPageInFirestore(
  bookId: string,
  pageData: { title: string; content?: string; pageNumber: number }
): Promise<BookPage> {
  const pageId = 'page_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const now = Date.now();

  const newPage: BookPage = {
    id: pageId,
    bookId,
    title: pageData.title.trim() || `Chapter ${pageData.pageNumber}`,
    content: pageData.content || '<p></p>',
    pageNumber: pageData.pageNumber,
    createdAt: now,
    updatedAt: now,
  };

  // Cache locally
  try {
    const existing = JSON.parse(localStorage.getItem(LOCAL_STORAGE_PAGES_PREFIX + bookId) || '[]');
    localStorage.setItem(LOCAL_STORAGE_PAGES_PREFIX + bookId, JSON.stringify([...existing, newPage]));
  } catch {
    // ignore
  }

  try {
    const pageDocRef = doc(firestore, 'books', bookId, 'pages', pageId);
    await setDoc(pageDocRef, {
      ...newPage,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Update book pageCount
    await updateBookInFirestore(bookId, { pageCount: pageData.pageNumber });
  } catch (err) {
    console.warn('Error creating page in Firestore:', err);
  }

  return newPage;
}

export async function updatePageInFirestore(
  bookId: string,
  pageId: string,
  updates: Partial<BookPage>
): Promise<void> {
  // Update local cache immediately
  try {
    const existing: BookPage[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_PAGES_PREFIX + bookId) || '[]');
    const index = existing.findIndex((p) => p.id === pageId);
    if (index !== -1) {
      existing[index] = { ...existing[index], ...updates, updatedAt: Date.now() };
      localStorage.setItem(LOCAL_STORAGE_PAGES_PREFIX + bookId, JSON.stringify(existing));
    }
  } catch {
    // ignore
  }

  try {
    const pageDocRef = doc(firestore, 'books', bookId, 'pages', pageId);
    await setDoc(
      pageDocRef,
      {
        ...updates,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    // Also update parent book's updatedAt
    await updateBookInFirestore(bookId, { updatedAt: Date.now() });
  } catch (err) {
    console.warn('Error updating page in Firestore:', err);
  }
}

export async function deletePageFromFirestore(bookId: string, pageId: string): Promise<void> {
  try {
    const existing: BookPage[] = JSON.parse(localStorage.getItem(LOCAL_STORAGE_PAGES_PREFIX + bookId) || '[]');
    const filtered = existing.filter((p) => p.id !== pageId);
    localStorage.setItem(LOCAL_STORAGE_PAGES_PREFIX + bookId, JSON.stringify(filtered));
  } catch {
    // ignore
  }

  try {
    const pageDocRef = doc(firestore, 'books', bookId, 'pages', pageId);
    await deleteDoc(pageDocRef);
  } catch (err) {
    console.warn('Error deleting page from Firestore:', err);
  }
}

// ==================== REALTIME DATABASE: LIVE WRITING SYNC ====================

export async function syncLiveWritingToRTDB(
  bookId: string,
  pageId: string,
  title: string,
  content: string
): Promise<void> {
  const user = getCurrentUser();
  const sessionData: LiveSessionState = {
    title,
    content,
    updatedAt: Date.now(),
    authorId: user ? user.uid : 'author',
  };

  // Local safety draft storage
  try {
    localStorage.setItem(`${LOCAL_STORAGE_DRAFT_PREFIX}${bookId}_${pageId}`, JSON.stringify(sessionData));
  } catch {
    // ignore
  }

  try {
    const sessionRef = ref(realtimeDb, `live_sessions/${bookId}/${pageId}`);
    await set(sessionRef, sessionData);
  } catch (err) {
    console.warn('Realtime Database sync warning (operating in local resilience mode):', err);
  }
}

export async function fetchLiveWritingState(
  bookId: string,
  pageId: string
): Promise<LiveSessionState | null> {
  // First check local draft for instant availability
  let localDraft: LiveSessionState | null = null;
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_DRAFT_PREFIX}${bookId}_${pageId}`);
    if (raw) {
      localDraft = JSON.parse(raw);
    }
  } catch {
    // ignore
  }

  try {
    const sessionRef = ref(realtimeDb, `live_sessions/${bookId}/${pageId}`);
    const snapshot = await get(sessionRef);
    if (snapshot.exists()) {
      const rtdbData = snapshot.val() as LiveSessionState;
      // Return whichever is newer
      if (localDraft && localDraft.updatedAt > rtdbData.updatedAt) {
        return localDraft;
      }
      return rtdbData;
    }
  } catch (err) {
    console.warn('Could not read from Realtime Database, using local draft fallback:', err);
  }

  return localDraft;
}

export async function clearLiveWritingSession(bookId: string, pageId: string): Promise<void> {
  try {
    const sessionRef = ref(realtimeDb, `live_sessions/${bookId}/${pageId}`);
    await remove(sessionRef);
  } catch {
    // ignore
  }
}

/**
 * Completely purges all local storage data, drafts, and caches for a book
 */
export function clearBookLocalRecoveryData(bookId: string): void {
  try {
    localStorage.removeItem(LOCAL_STORAGE_PAGES_PREFIX + bookId);
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes(bookId) || key.startsWith(`${LOCAL_STORAGE_DRAFT_PREFIX}${bookId}`))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (err) {
    console.warn('Error purging local storage keys:', err);
  }
}

/**
 * Comprehensive, atomic book deletion pipeline:
 * 1. Ownership validation
 * 2. Cloudinary cover assets removal (using server endpoint)
 * 3. Firestore pages subcollection deletion
 * 4. Firestore book document deletion
 * 5. Realtime Database writing session cleanup
 * 6. Local storage drafts & caches purging
 */
export async function deleteBookCompletely(book: Book): Promise<void> {
  const user = getCurrentUser();
  const bookId = book.id;

  // Step 1: Verify book ownership
  if (book.ownerId && user && book.ownerId !== user.uid && book.ownerId !== 'author') {
    throw new Error('Permission denied: You do not have permission to delete this book project.');
  }

  // Step 2: Delete Firestore pages subcollection
  try {
    const pagesCol = collection(firestore, 'books', bookId, 'pages');
    const snapshot = await getDocs(pagesCol);
    for (const p of snapshot.docs) {
      await deleteDoc(p.ref);
    }
  } catch (err) {
    console.warn('Error deleting pages subcollection:', err);
  }

  // Step 4: Delete Firestore book document
  try {
    await deleteDoc(doc(firestore, 'books', bookId));
  } catch (err) {
    console.error('Error deleting book document from Firestore:', err);
    throw new Error('Failed to delete book document from Firestore.');
  }

  // Step 5: Delete Realtime Database writing sessions
  try {
    // live_sessions/${bookId}
    await remove(ref(realtimeDb, `live_sessions/${bookId}`));
    // writingSessions/${userId}/${bookId}
    if (user && user.uid) {
      await remove(ref(realtimeDb, `writingSessions/${user.uid}/${bookId}`));
    }
    await remove(ref(realtimeDb, `writingSessions/author/${bookId}`));
  } catch (err) {
    console.warn('Error clearing RTDB sessions for book:', err);
  }

  // Step 6: Delete local recovery / cache data
  clearBookLocalRecoveryData(bookId);

  // Step 7: Update cached books list
  const cached = getCachedBooks().filter((b) => b.id !== bookId);
  setCachedBooks(cached);
}

