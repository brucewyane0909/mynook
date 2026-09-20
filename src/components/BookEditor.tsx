import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Undo,
  Redo,
  Sparkles,
  Download,
  Maximize2,
  Minimize2,
  CheckCircle2,
  CloudUpload,
  RefreshCw,
  MoveUp,
  MoveDown,
  Menu,
  X,
  Type,
  AlertTriangle,
  FileText,
  BookOpen,
  Wand2,
} from 'lucide-react';
import { Book, BookPage, SyncStatus, EditorFont, EditorFontSize } from '../types';
import {
  fetchPagesForBook,
  createPageInFirestore,
  updatePageInFirestore,
  deletePageFromFirestore,
  syncLiveWritingToRTDB,
  fetchLiveWritingState,
} from '../services/storage';
import { getAutoCorrection } from '../utils/spelling';
import { AiAssistantPanel } from './AiAssistantPanel';
import { AiSuggestion } from '../services/aiService';

interface BookEditorProps {
  book: Book;
  onBackToDashboard: () => void;
  onExportPdf: (book: Book, pages: BookPage[]) => void;
  onExportEpub?: (book: Book, pages: BookPage[]) => void;
}

export const BookEditor: React.FC<BookEditorProps> = ({
  book,
  onBackToDashboard,
  onExportPdf,
  onExportEpub,
}) => {
  // Navigation & Page State
  const [pages, setPages] = useState<BookPage[]>([]);
  const [currentPageId, setCurrentPageId] = useState<string>('');
  const [isLoadingPages, setIsLoadingPages] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const activePageIndex = pages.findIndex((p) => p.id === currentPageId);
  const currentChapterNum = activePageIndex >= 0 ? activePageIndex + 1 : 1;
  const progressPercent = pages.length > 0 ? Math.min(100, Math.round(((activePageIndex >= 0 ? activePageIndex + 1 : 1) / pages.length) * 100)) : 0;

  // Active Page content & title state
  const [pageTitle, setPageTitle] = useState('');
  const [contentHtml, setContentHtml] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  // Auto-correction & Toolbar
  const [autoCorrectEnabled, setAutoCorrectEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('mynook_autocorrect');
    return saved !== null ? saved === 'true' : true;
  });

  const toggleAutoCorrect = () => {
    setAutoCorrectEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('mynook_autocorrect', String(next));
      return next;
    });
  };

  const [editorFont, setEditorFont] = useState<EditorFont>('serif');
  const [editorFontSize, setEditorFontSize] = useState<EditorFontSize>('md');

  // Synchronization & Auto-save
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [lastSavedTime, setLastSavedTime] = useState<Date>(new Date());
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);

  // Delete page modal
  const [pageToDelete, setPageToDelete] = useState<BookPage | null>(null);

  // Refs for timers & editing
  const editorRef = useRef<HTMLDivElement>(null);
  const rtdbTimerRef = useRef<NodeJS.Timeout | null>(null);
  const firestoreTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInternalChangeRef = useRef(false);
  const currentPageIdRef = useRef('');
  const currentContentRef = useRef('');
  const currentTitleRef = useRef('');

  currentPageIdRef.current = currentPageId;
  currentContentRef.current = contentHtml;
  currentTitleRef.current = pageTitle;

  // MYNOOK AI Assistant State & Selection Tracking
  const [isAiPanelOpen, setIsAiPanelOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mynook_ai_panel_open');
      if (saved !== null) return saved === 'true';
      return window.innerWidth >= 1280;
    }
    return false;
  });
  const [selectedText, setSelectedText] = useState<string>('');
  const savedSelectionRangeRef = useRef<Range | null>(null);

  const toggleAiPanel = () => {
    setIsAiPanelOpen((prev) => {
      const next = !prev;
      localStorage.setItem('mynook_ai_panel_open', String(next));
      return next;
    });
  };

  // Monitor selection within editor canvas
  const handleEditorSelectionChange = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    if (editorRef.current && editorRef.current.contains(sel.anchorNode)) {
      const text = sel.toString().trim();
      if (text) {
        setSelectedText(text);
        try {
          savedSelectionRangeRef.current = sel.getRangeAt(0).cloneRange();
        } catch {
          // ignore
        }
      }
    }
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', handleEditorSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleEditorSelectionChange);
    };
  }, [handleEditorSelectionChange]);

  // Helper to update editor content and schedule sync
  const handleContentUpdate = (newHtml: string) => {
    setContentHtml(newHtml);
    currentContentRef.current = newHtml;
    updateCounts(newHtml);
    scheduleSync(pageTitle, newHtml);
  };

  // Helper to escape HTML characters safely
  const escapeHtml = (text: string): string => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Helper to format multiple paragraphs or prose lines into clean HTML paragraphs
  const formatTextToHtmlParagraphs = (text: string): string => {
    const parts = text.split(/\n\n+/).filter(Boolean);
    if (parts.length === 0) return '<p></p>';
    return parts.map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
  };

  // Robust ContentEditable text search and replacement helper
  const replaceTextInContentEditable = (
    container: HTMLElement,
    targetText: string,
    replacementText: string,
    savedRange?: Range | null
  ): boolean => {
    // 1. First priority: Try saved selection range if active and valid
    if (savedRange && container.contains(savedRange.commonAncestorContainer)) {
      const rangeStr = savedRange.toString().trim();
      const targetClean = (targetText || '').trim();
      if (!targetClean || rangeStr === targetClean || targetClean.includes(rangeStr) || rangeStr.includes(targetClean)) {
        try {
          savedRange.deleteContents();
          if (replacementText.includes('\n\n')) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = formatTextToHtmlParagraphs(replacementText);
            const frag = document.createDocumentFragment();
            while (tempDiv.firstChild) {
              frag.appendChild(tempDiv.firstChild);
            }
            savedRange.insertNode(frag);
          } else {
            const textNode = document.createTextNode(replacementText);
            savedRange.insertNode(textNode);
          }
          return true;
        } catch (err) {
          console.warn('[MYNOOK Editor] Saved range replace error:', err);
        }
      }
    }

    // 2. Second priority: Walk DOM text nodes to locate the target text regardless of HTML markup or line wraps
    if (targetText && targetText.trim()) {
      const normalizedTarget = targetText.replace(/\s+/g, ' ').trim();
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      let fullText = '';
      const nodeMap: { node: Text; start: number; end: number }[] = [];

      let curr = walker.nextNode() as Text | null;
      while (curr) {
        textNodes.push(curr);
        const nodeText = curr.nodeValue || '';
        const start = fullText.length;
        fullText += nodeText;
        nodeMap.push({ node: curr, start, end: fullText.length });
        curr = walker.nextNode() as Text | null;
      }

      let matchStart = fullText.indexOf(targetText);
      let matchLen = targetText.length;

      // Try normalized spaces match
      if (matchStart === -1) {
        const fullNormalized = fullText.replace(/\s+/g, ' ');
        const normStart = fullNormalized.indexOf(normalizedTarget);
        if (normStart !== -1) {
          const charMap: number[] = [];
          let inSpace = false;
          for (let i = 0; i < fullText.length; i++) {
            if (/\s/.test(fullText[i])) {
              if (!inSpace) {
                charMap.push(i);
                inSpace = true;
              }
            } else {
              charMap.push(i);
              inSpace = false;
            }
          }
          if (normStart < charMap.length) {
            matchStart = charMap[normStart];
            const endNorm = normStart + normalizedTarget.length - 1;
            const rawEnd = endNorm < charMap.length ? charMap[endNorm] + 1 : fullText.length;
            matchLen = rawEnd - matchStart;
          }
        }
      }

      // Try case-insensitive match
      if (matchStart === -1) {
        const lowerFull = fullText.toLowerCase();
        const lowerTarget = targetText.toLowerCase();
        matchStart = lowerFull.indexOf(lowerTarget);
        if (matchStart !== -1) {
          matchLen = targetText.length;
        }
      }

      if (matchStart !== -1) {
        const matchEnd = matchStart + matchLen;
        let startNode: Text | null = null;
        let startOffset = 0;
        let endNode: Text | null = null;
        let endOffset = 0;

        for (const item of nodeMap) {
          if (!startNode && matchStart >= item.start && matchStart <= item.end) {
            startNode = item.node;
            startOffset = matchStart - item.start;
          }
          if (!endNode && matchEnd >= item.start && matchEnd <= item.end) {
            endNode = item.node;
            endOffset = matchEnd - item.start;
          }
        }

        if (startNode && endNode) {
          try {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            range.deleteContents();

            if (replacementText.includes('\n\n')) {
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = formatTextToHtmlParagraphs(replacementText);
              const frag = document.createDocumentFragment();
              while (tempDiv.firstChild) {
                frag.appendChild(tempDiv.firstChild);
              }
              range.insertNode(frag);
            } else {
              const textNode = document.createTextNode(replacementText);
              range.insertNode(textNode);
            }
            return true;
          } catch (err) {
            console.warn('[MYNOOK Editor] Text node replacement error:', err);
          }
        }
      }
    }

    // 3. Third priority: direct innerHTML string replacement
    if (targetText && container.innerHTML.includes(targetText)) {
      const formatted = replacementText.includes('\n\n')
        ? formatTextToHtmlParagraphs(replacementText)
        : escapeHtml(replacementText);
      container.innerHTML = container.innerHTML.replace(targetText, formatted);
      return true;
    }

    return false;
  };

  // Handle AI textual revision applications with verified success and atomic persistence
  const handleApplyAiSuggestion = async (
    suggestion: AiSuggestion
  ): Promise<{ success: boolean; error?: string }> => {
    if (!editorRef.current) {
      return { success: false, error: 'Editor is not loaded.' };
    }

    // Handle Title change
    if (suggestion.target === 'title') {
      try {
        handleTitleChange(suggestion.suggestedText);
        await flushCurrentWriting();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to update title.' };
      }
    }

    const targetToFind = (suggestion.originalText || selectedText || '').trim();
    const isChapterTarget = suggestion.target === 'chapter';
    const currentCleanText = (editorRef.current.textContent || '').trim();
    let replaced = false;

    if (isChapterTarget || !currentCleanText || currentCleanText === 'Start writing your story here...') {
      editorRef.current.innerHTML = formatTextToHtmlParagraphs(suggestion.suggestedText);
      replaced = true;
    } else {
      replaced = replaceTextInContentEditable(
        editorRef.current,
        targetToFind,
        suggestion.suggestedText,
        savedSelectionRangeRef.current
      );
    }

    if (!replaced) {
      return {
        success: false,
        error: 'The original text is no longer present in this page. Please regenerate the suggestion.',
      };
    }

    // Editor content changed successfully! Update state and persist
    isInternalChangeRef.current = true;
    const updatedHtml = editorRef.current.innerHTML;
    setContentHtml(updatedHtml);
    currentContentRef.current = updatedHtml;
    updateCounts(updatedHtml);

    setPages((prev) =>
      prev.map((p) => (p.id === currentPageIdRef.current ? { ...p, content: updatedHtml } : p))
    );

    setSelectedText('');
    savedSelectionRangeRef.current = null;

    try {
      await flushCurrentWriting();
      return { success: true };
    } catch (saveErr: any) {
      console.warn('[MYNOOK Editor] Persistence warning:', saveErr);
      return { success: true };
    }
  };

  const handleReplaceSelection = async (newText: string) => {
    if (!editorRef.current) return;
    const targetToFind = selectedText.trim();
    const replaced = replaceTextInContentEditable(
      editorRef.current,
      targetToFind,
      newText,
      savedSelectionRangeRef.current
    );
    if (!replaced) {
      editorRef.current.innerHTML += `<p>${escapeHtml(newText)}</p>`;
    }
    const updated = editorRef.current.innerHTML;
    setContentHtml(updated);
    currentContentRef.current = updated;
    updateCounts(updated);
    setPages((prev) =>
      prev.map((p) => (p.id === currentPageIdRef.current ? { ...p, content: updated } : p))
    );
    setSelectedText('');
    savedSelectionRangeRef.current = null;
    await flushCurrentWriting();
  };

  const handleCreateChapterFromAi = async (title: string, content?: string) => {
    await flushCurrentWriting();
    const nextPageNumber = pages.length + 1;
    const newPage = await createPageInFirestore(book.id, {
      title: title || `Chapter ${nextPageNumber}`,
      content: content ? `<p>${content.replace(/\n\n/g, '</p><p>')}</p>` : '<p></p>',
      pageNumber: nextPageNumber,
    });
    const updated = [...pages, newPage];
    setPages(updated);
    setCurrentPageId(newPage.id);
    setPageTitle(newPage.title);
    setContentHtml(newPage.content);
    updateCounts(newPage.content);
  };

  // Calculate live word and character counts
  const updateCounts = (text: string) => {
    const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanText) {
      setWordCount(0);
      setCharCount(0);
      return;
    }
    const words = cleanText.split(/\s+/).filter(Boolean);
    setWordCount(words.length);
    setCharCount(cleanText.length);
  };

  // 1. Initial Load: Fetch book pages
  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setIsLoadingPages(true);
      const fetchedPages = await fetchPagesForBook(book.id);
      if (!isMounted) return;

      setPages(fetchedPages);
      if (fetchedPages.length > 0) {
        const firstPage = fetchedPages[0];
        setCurrentPageId(firstPage.id);
        setPageTitle(firstPage.title);
        setContentHtml(firstPage.content);
        updateCounts(firstPage.content);
        checkLiveWritingRecovery(book.id, firstPage);
      }
      setIsLoadingPages(false);
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [book.id]);

  // 2. Check for latest live writing in Realtime DB or local backup
  const checkLiveWritingRecovery = async (bookId: string, page: BookPage) => {
    try {
      const liveState = await fetchLiveWritingState(bookId, page.id);
      if (liveState && liveState.updatedAt > page.updatedAt + 2000) {
        // Realtime DB has newer unsaved content from an interrupted session!
        if (liveState.content && liveState.content !== page.content) {
          setContentHtml(liveState.content);
          if (liveState.title) setPageTitle(liveState.title);
          updateCounts(liveState.content);
          setRecoveryNotice('Restored latest unsaved writing session from Realtime Database.');
          setTimeout(() => setRecoveryNotice(null), 6000);
        }
      }
    } catch (err) {
      console.warn('Recovery check error:', err);
    }
  };

  // Sync editor innerHTML when contentHtml state changes from outside
  useEffect(() => {
    if (editorRef.current && !isInternalChangeRef.current) {
      if (editorRef.current.innerHTML !== contentHtml) {
        editorRef.current.innerHTML = contentHtml || '<p><br></p>';
      }
    }
    isInternalChangeRef.current = false;
  }, [contentHtml, currentPageId]);

  // Save current writing immediately before page switch or unload
  const flushCurrentWriting = useCallback(async () => {
    const pageId = currentPageIdRef.current;
    const content = currentContentRef.current;
    const title = currentTitleRef.current;
    if (!pageId) return;

    if (rtdbTimerRef.current) clearTimeout(rtdbTimerRef.current);
    if (firestoreTimerRef.current) clearTimeout(firestoreTimerRef.current);

    try {
      setSyncStatus('saving');
      await syncLiveWritingToRTDB(book.id, pageId, title, content);
      await updatePageInFirestore(book.id, pageId, {
        title,
        content,
        updatedAt: Date.now(),
      });
      setSyncStatus('saved');
      setLastSavedTime(new Date());
    } catch (e) {
      console.warn('Flush error:', e);
      setSyncStatus('saved');
    }
  }, [book.id]);

  // Handle browser close / reload auto-save
  useEffect(() => {
    const handleBeforeUnload = () => {
      flushCurrentWriting();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flushCurrentWriting();
    };
  }, [flushCurrentWriting]);

  // Handle ESC key to exit Focus Mode
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFocusMode) {
        setIsFocusMode(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isFocusMode]);

  // Handle outside click for Export dropdown menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    if (isExportMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExportMenuOpen]);

  // 3. Debounced Synchronization Architecture (RTDB: 500ms, Firestore: 1500ms)
  const scheduleSync = (newTitle: string, newContent: string) => {
    setSyncStatus('syncing');

    // Debounce to Realtime Database (approx 500ms)
    if (rtdbTimerRef.current) clearTimeout(rtdbTimerRef.current);
    rtdbTimerRef.current = setTimeout(async () => {
      try {
        await syncLiveWritingToRTDB(book.id, currentPageIdRef.current, newTitle, newContent);
      } catch (err) {
        console.warn('Live RTDB sync warning:', err);
      }
    }, 500);

    // Debounce to permanent Firestore storage (approx 1500ms)
    if (firestoreTimerRef.current) clearTimeout(firestoreTimerRef.current);
    firestoreTimerRef.current = setTimeout(async () => {
      try {
        setSyncStatus('saving');
        await updatePageInFirestore(book.id, currentPageIdRef.current, {
          title: newTitle,
          content: newContent,
          updatedAt: Date.now(),
        });
        // Update local pages list
        setPages((prev) =>
          prev.map((p) =>
            p.id === currentPageIdRef.current ? { ...p, title: newTitle, content: newContent } : p
          )
        );
        setSyncStatus('saved');
        setLastSavedTime(new Date());
      } catch (err) {
        console.warn('Firestore auto-save warning:', err);
        setSyncStatus('saved');
      }
    }, 1500);
  };

  // 4. Editor Typing & Auto-Correction Handler
  const handleEditorInput = (e: React.FormEvent<HTMLDivElement>) => {
    isInternalChangeRef.current = true;
    const newHtml = e.currentTarget.innerHTML;
    setContentHtml(newHtml);
    updateCounts(newHtml);
    scheduleSync(pageTitle, newHtml);
  };

  // Keydown listener for spacebar auto-correction and shortcuts
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Check Auto-Correction on Spacebar (only when not composing in IME)
    if (autoCorrectEnabled && e.key === ' ' && !e.nativeEvent.isComposing) {
      const corrected = handleAutoCorrectionOnSpace();
      if (corrected) {
        e.preventDefault();
      }
    }
  };

  // Spacebar Auto-correction execution
  const handleAutoCorrectionOnSpace = (): boolean => {
    if (!autoCorrectEnabled) return false;

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;

    const range = sel.getRangeAt(0);
    if (!range.collapsed) return false;

    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE || !node.nodeValue) return false;

    const text = node.nodeValue;
    const caretPos = range.startOffset;
    const textBefore = text.slice(0, caretPos);

    // Extract the word immediately preceding the caret (with any trailing punctuation)
    // Examples: "writting" -> word: "writting", punct: ""
    //           "writting," -> word: "writting", punct: ","
    const match = textBefore.match(/(?:^|\s)([\w']+)([.,!?:;]*)$/);
    if (!match) return false;

    const rawWord = match[1];
    const trailingPunct = match[2] || '';
    if (rawWord.length < 2) return false;

    // Calculate exact position of rawWord + trailingPunct in this text node
    const targetLen = rawWord.length + trailingPunct.length;
    const wordStartPos = caretPos - targetLen;
    const wordEndPos = caretPos;

    // Gather preceding context words for grammatical disambiguation
    const textLeading = textBefore.slice(0, wordStartPos).trim();
    let fullContextText = textLeading;
    let prevNode: Node | null = node;
    while (fullContextText.split(/\s+/).filter(Boolean).length < 6 && prevNode) {
      if (prevNode.previousSibling) {
        prevNode = prevNode.previousSibling;
        fullContextText = (prevNode.textContent || '') + ' ' + fullContextText;
      } else {
        prevNode = prevNode.parentNode;
        if (!prevNode || prevNode === editorRef.current) break;
      }
    }

    const contextTokens = fullContextText.trim().split(/\s+/).filter(Boolean);
    const prevWord = contextTokens.length > 0 ? contextTokens[contextTokens.length - 1] : undefined;
    const prevPrevWord = contextTokens.length > 1 ? contextTokens[contextTokens.length - 2] : undefined;

    const correction = getAutoCorrection(rawWord, {
      prevWord,
      prevPrevWord,
      allTokens: contextTokens,
    });

    if (!correction || correction.corrected.toLowerCase() === rawWord.toLowerCase()) {
      return false;
    }

    // Single replacement string with trailing punctuation and exactly ONE space
    const replacement = correction.corrected + trailingPunct + ' ';

    // Select the target word range to replace
    const replaceRange = document.createRange();
    replaceRange.setStart(node, wordStartPos);
    replaceRange.setEnd(node, wordEndPos);
    sel.removeAllRanges();
    sel.addRange(replaceRange);

    // Execute replacement via insertText to preserve browser undo/redo history & trigger input event
    isInternalChangeRef.current = true;
    let replaced = false;
    try {
      replaced = document.execCommand('insertText', false, replacement);
    } catch {
      replaced = false;
    }

    if (!replaced) {
      // DOM fallback if execCommand fails
      replaceRange.deleteContents();
      const textNode = document.createTextNode(replacement);
      replaceRange.insertNode(textNode);
      const afterRange = document.createRange();
      afterRange.setStart(textNode, textNode.length);
      afterRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(afterRange);
    }

    // Sync editor state, word count and debounced persistence
    if (editorRef.current) {
      const updatedHtml = editorRef.current.innerHTML;
      setContentHtml(updatedHtml);
      updateCounts(updatedHtml);
      scheduleSync(currentTitleRef.current, updatedHtml);
    }

    return true;
  };

  // Format command wrapper
  const executeFormat = (cmd: string, val: string = '') => {
    if (editorRef.current) {
      editorRef.current.focus();
    }
    document.execCommand(cmd, false, val);
    if (editorRef.current) {
      const updated = editorRef.current.innerHTML;
      setContentHtml(updated);
      scheduleSync(pageTitle, updated);
    }
  };

  // 5. Page Title Change - immediate UI & sidebar update, debounced Firestore sync
  const handleTitleChange = (newTitle: string) => {
    setPageTitle(newTitle);
    currentTitleRef.current = newTitle;
    setPages((prev) =>
      prev.map((p) => (p.id === currentPageIdRef.current ? { ...p, title: newTitle } : p))
    );
    scheduleSync(newTitle, currentContentRef.current);
  };

  // 6. Switch Pages
  const handleSelectPage = async (page: BookPage) => {
    if (page.id === currentPageId) return;

    // Save pending changes of current page before switching
    await flushCurrentWriting();

    setCurrentPageId(page.id);
    setPageTitle(page.title);
    setContentHtml(page.content);
    updateCounts(page.content);
    checkLiveWritingRecovery(book.id, page);

    // On mobile, collapse sidebar after selection
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  // 7. Add New Page
  const handleAddNewPage = async () => {
    await flushCurrentWriting();

    const nextPageNumber = pages.length + 1;
    const defaultTitle = `Chapter ${nextPageNumber}`;

    // Optimistic page creation
    const newPage = await createPageInFirestore(book.id, {
      title: defaultTitle,
      content: '<p></p>',
      pageNumber: nextPageNumber,
    });

    const updatedPages = [...pages, newPage];
    setPages(updatedPages);
    setCurrentPageId(newPage.id);
    setPageTitle(newPage.title);
    setContentHtml(newPage.content);
    updateCounts(newPage.content);

    // Focus editor
    setTimeout(() => {
      editorRef.current?.focus();
    }, 100);
  };

  // 8. Delete Page
  const confirmDeletePage = async () => {
    if (!pageToDelete) return;
    const idToDelete = pageToDelete.id;

    await deletePageFromFirestore(book.id, idToDelete);
    const updated = pages.filter((p) => p.id !== idToDelete);
    setPages(updated);
    setPageToDelete(null);

    // If active page was deleted, switch to first available
    if (currentPageId === idToDelete) {
      if (updated.length > 0) {
        const next = updated[0];
        setCurrentPageId(next.id);
        setPageTitle(next.title);
        setContentHtml(next.content);
        updateCounts(next.content);
      } else {
        // Recreate default page
        handleAddNewPage();
      }
    }
  };

  // 9. Reorder Pages (Move Up / Down)
  const handleMovePage = async (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === pages.length - 1)
    ) {
      return;
    }

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newPages = [...pages];
    const temp = newPages[index];
    newPages[index] = newPages[targetIndex];
    newPages[targetIndex] = temp;

    // Update page numbers
    const renumbered = newPages.map((p, i) => ({
      ...p,
      pageNumber: i + 1,
    }));

    setPages(renumbered);

    // Persist reordered pages
    for (const p of renumbered) {
      await updatePageInFirestore(book.id, p.id, { pageNumber: p.pageNumber });
    }
  };

  // Helper to select page and auto-close sidebar on mobile
  const handleSelectPageWithMobileClose = async (page: BookPage) => {
    await handleSelectPage(page);
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  // Typography font class
  const fontClass =
    editorFont === 'serif'
      ? 'font-serif'
      : 'font-sans';

  // Font size class
  const fontSizeClass = {
    sm: 'text-sm sm:text-base leading-relaxed',
    md: 'text-base sm:text-lg leading-loose',
    lg: 'text-lg sm:text-xl leading-loose',
    xl: 'text-xl sm:text-2xl leading-loose',
  }[editorFontSize];

  return (
    <div
      id="book-editor-container"
      className={`h-[calc(100vh-64px)] w-full flex flex-col bg-[#F9F7F2] dark:bg-[#181816] text-[#1A1A1A] dark:text-[#ECE9E2] overflow-hidden ${
        isFullscreen || isFocusMode ? 'fixed inset-0 z-50 h-screen' : ''
      }`}
    >
      {/* Recovery Banner if unsaved state restored */}
      {recoveryNotice && (
        <div className="bg-[#EBE8E0] dark:bg-[#282824] border-b border-[#DCD8CF] dark:border-[#383834] text-[#3A3A36] dark:text-[#ECE9E2] text-xs px-3 sm:px-4 py-2 flex items-center justify-between animate-in fade-in duration-200 font-sans shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-[#3A3A36] dark:text-[#ECE9E2] flex-shrink-0" />
            <span className="truncate">{recoveryNotice}</span>
          </div>
          <button
            onClick={() => setRecoveryNotice(null)}
            className="p-1 hover:bg-[#DCD8CF] dark:hover:bg-[#383834] rounded shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Workspace Body: Left Sidebar + Editor */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile Backdrop for Sidebar Drawer */}
        {!isFocusMode && isSidebarOpen && (
          <div
            id="mobile-sidebar-backdrop"
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs z-20 md:hidden transition-opacity animate-in fade-in duration-200"
          />
        )}

        {/* ==================== LEFT SIDEBAR ==================== */}
        {!isFocusMode && (
          <aside
            id="editor-sidebar"
            className={`${
              isSidebarOpen
                ? 'w-64 sm:w-72 border-r border-[#E5E1D8] dark:border-[#2E2E2A]'
                : 'w-14 sm:w-16 border-r border-[#E5E1D8] dark:border-[#2E2E2A]'
            } transition-all duration-300 ease-in-out bg-[#F3F0E9] dark:bg-[#1D1D1A] flex flex-col z-30 h-full shrink-0 select-none overflow-hidden`}
          >
            {isSidebarOpen ? (
              /* ================= EXPANDED SIDEBAR ================= */
              <>
                {/* Sidebar Top: Back button & Editorial Cover Card */}
                <div className="p-4 sm:p-5 border-b border-[#E5E1D8] dark:border-[#2E2E2A] shrink-0">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <button
                      id="editor-back-btn"
                      onClick={async () => {
                        await flushCurrentWriting();
                        onBackToDashboard();
                      }}
                      className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#8A8882] dark:text-[#9E9B95] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] transition-colors py-1 cursor-pointer"
                      title="Back to Library"
                      aria-label="Back to Library"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Library</span>
                    </button>
                    <button
                      id="close-sidebar-mobile-btn"
                      onClick={() => setIsSidebarOpen(false)}
                      className="p-1.5 rounded-sm text-[#8A8882] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] cursor-pointer"
                      title="Collapse sidebar"
                      aria-label="Collapse sidebar"
                    >
                      <ChevronLeft className="w-4 h-4 hidden sm:inline" />
                      <X className="w-4 h-4 sm:hidden" />
                    </button>
                  </div>

                  {/* Editorial Book Jacket Preview in Sidebar */}
                  <div className="relative group mb-3">
                    <div className="w-full aspect-[2/3] max-h-40 sm:max-h-48 mx-auto bg-[#E5E1D8] dark:bg-[#282824] rounded-sm shadow-xs flex items-center justify-center overflow-hidden border border-[#DCD8CF] dark:border-[#353530]">
                      {book.frontCoverUrl ? (
                        <img
                          src={book.frontCoverUrl}
                          alt={book.title}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="p-4 text-center">
                          <p className="serif italic text-xs mb-1 text-[#6B6964] dark:text-[#A8A59E] line-clamp-2">
                            {book.title}
                          </p>
                          <div className="w-8 h-[1px] bg-[#6B6964] dark:bg-[#A8A59E] mx-auto" />
                        </div>
                      )}
                    </div>
                  </div>

                  <h2 className="serif italic font-bold text-sm text-[#3A3A36] dark:text-[#ECE9E2] truncate">
                    {book.title}
                  </h2>
                  <p className="text-xs text-[#8A8882] dark:text-[#9E9B95] font-serif italic truncate">
                    {book.author ? `by ${book.author}` : 'Unknown Author'}
                  </p>
                </div>

                {/* Chapters / Pages List */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-1">
                  <div className="flex items-center justify-between mb-2 text-[10px] font-bold uppercase tracking-widest text-[#8A8882] dark:text-[#9E9B95]">
                    <span>Manuscript</span>
                    <span className="font-mono">{pages.length}</span>
                  </div>

                  {isLoadingPages ? (
                    <div className="p-4 text-center text-xs text-[#8A8882] font-serif italic">Loading chapters...</div>
                  ) : (
                    pages.map((page, index) => {
                      const isActive = page.id === currentPageId;
                      const pageNumStr = String(index + 1).padStart(2, '0');

                      return (
                        <div
                          key={page.id}
                          id={`sidebar-page-item-${page.id}`}
                          onClick={() => handleSelectPageWithMobileClose(page)}
                          className={`group relative flex items-center justify-between py-2 px-2.5 rounded-sm cursor-pointer text-sm font-medium transition-all ${
                            isActive
                              ? 'bg-[#EBE8E0] dark:bg-[#2D2D29] border-l-2 border-[#3A3A36] dark:border-[#ECE9E2] text-[#1A1A1A] dark:text-[#ECE9E2]'
                              : 'text-[#5A5852] dark:text-[#A8A59E] hover:bg-[#EBE8E0]/70 dark:hover:bg-[#252521]'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
                            <span
                              className={`w-5 text-[10px] font-mono shrink-0 ${
                                isActive ? 'text-[#3A3A36] dark:text-[#ECE9E2] font-bold' : 'text-[#8A8882] dark:text-[#9E9B95]'
                              }`}
                            >
                              {pageNumStr}
                            </span>
                            <span className="truncate text-xs sm:text-sm font-medium">
                              {page.title || `Chapter ${index + 1}`}
                            </span>
                          </div>

                          {/* Page Action Controls (Move & Delete) */}
                          <div
                            className={`flex items-center gap-0.5 shrink-0 ${
                              isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                            } transition-opacity`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              id={`move-up-page-btn-${page.id}`}
                              onClick={() => handleMovePage(index, 'up')}
                              disabled={index === 0}
                              title="Move Page Up"
                              aria-label="Move Page Up"
                              className="p-1 rounded hover:bg-[#DCD8CF] dark:hover:bg-[#383834] text-[#8A8882] dark:text-[#9E9B95] disabled:opacity-30 cursor-pointer"
                            >
                              <MoveUp className="w-3 h-3" />
                            </button>
                            <button
                              id={`move-down-page-btn-${page.id}`}
                              onClick={() => handleMovePage(index, 'down')}
                              disabled={index === pages.length - 1}
                              title="Move Page Down"
                              aria-label="Move Page Down"
                              className="p-1 rounded hover:bg-[#DCD8CF] dark:hover:bg-[#383834] text-[#8A8882] dark:text-[#9E9B95] disabled:opacity-30 cursor-pointer"
                            >
                              <MoveDown className="w-3 h-3" />
                            </button>
                            {pages.length > 1 && (
                              <button
                                id={`delete-page-btn-${page.id}`}
                                onClick={() => setPageToDelete(page)}
                                title="Delete Page"
                                aria-label="Delete Page"
                                className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-950/50 text-red-500 cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Sidebar Bottom: Editorial Progress Bar + Add Page */}
                <div className="mt-auto p-3 sm:p-4 border-t border-[#E5E1D8] dark:border-[#2E2E2A] shrink-0">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-[#8A8882] dark:text-[#9E9B95] mb-2">
                    <span>Progress</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="w-full h-1 bg-[#E5E1D8] dark:bg-[#2E2E2A] rounded-full overflow-hidden mb-3">
                    <div
                      className="h-full bg-[#3A3A36] dark:bg-[#ECE9E2] transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <button
                    id="sidebar-add-page-btn"
                    onClick={async () => {
                      await handleAddNewPage();
                      if (typeof window !== 'undefined' && window.innerWidth < 768) {
                        setIsSidebarOpen(false);
                      }
                    }}
                    className="w-full py-2 px-3 min-h-[36px] rounded-sm font-bold text-[10px] uppercase tracking-widest bg-[#EBE8E0] hover:bg-[#3A3A36] hover:text-white dark:bg-[#282824] dark:hover:bg-[#ECE9E2] dark:hover:text-[#1A1A1A] text-[#3A3A36] dark:text-[#ECE9E2] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Add Page"
                    aria-label="Add Page"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Page</span>
                  </button>
                </div>
              </>
            ) : (
              /* ================= COLLAPSED ICON RAIL ================= */
              <div className="flex flex-col h-full py-2 items-center justify-between overflow-hidden">
                {/* Top Control Icons */}
                <div className="flex flex-col items-center gap-2 border-b border-[#E5E1D8] dark:border-[#2E2E2A] pb-3 shrink-0 w-full px-1">
                  <button
                    id="expand-sidebar-btn-rail"
                    onClick={() => setIsSidebarOpen(true)}
                    className="p-2 rounded-sm text-[#8A8882] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0]/70 dark:hover:bg-[#282824] transition-colors cursor-pointer"
                    title="Expand Sidebar"
                    aria-label="Expand Sidebar"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <button
                    id="editor-back-btn-rail"
                    onClick={async () => {
                      await flushCurrentWriting();
                      onBackToDashboard();
                    }}
                    className="p-2 rounded-sm text-[#8A8882] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0]/70 dark:hover:bg-[#282824] transition-colors cursor-pointer"
                    title="Back to Library"
                    aria-label="Back to Library"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  <div
                    className="w-8 h-10 my-1 bg-[#E5E1D8] dark:bg-[#282824] rounded-xs border border-[#DCD8CF] dark:border-[#353530] flex items-center justify-center overflow-hidden cursor-pointer"
                    title={book.title}
                    onClick={() => setIsSidebarOpen(true)}
                  >
                    {book.frontCoverUrl ? (
                      <img src={book.frontCoverUrl} alt={book.title} className="w-full h-full object-cover" />
                    ) : (
                      <BookOpen className="w-3.5 h-3.5 text-[#8A8882]" />
                    )}
                  </div>
                </div>

                {/* Chapter Icon Rail */}
                <div className="flex-1 overflow-y-auto w-full px-1 py-2 space-y-1.5 flex flex-col items-center scrollbar-none">
                  {pages.map((page, index) => {
                    const isActive = page.id === currentPageId;
                    const pageNumStr = String(index + 1).padStart(2, '0');

                    return (
                      <button
                        key={page.id}
                        id={`sidebar-page-rail-item-${page.id}`}
                        onClick={() => handleSelectPageWithMobileClose(page)}
                        title={`Chapter ${index + 1}: ${page.title || 'Untitled'}`}
                        aria-label={`Select Chapter ${index + 1}`}
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-sm flex items-center justify-center text-xs font-mono font-bold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[#EBE8E0] dark:bg-[#2D2D29] border-l-2 border-[#3A3A36] dark:border-[#ECE9E2] text-[#1A1A1A] dark:text-[#ECE9E2] shadow-2xs'
                            : 'text-[#8A8882] dark:text-[#9E9B95] hover:bg-[#EBE8E0]/70 dark:hover:bg-[#252521] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2]'
                        }`}
                      >
                        {pageNumStr}
                      </button>
                    );
                  })}
                </div>

                {/* Bottom Rail Actions */}
                <div className="pt-2 border-t border-[#E5E1D8] dark:border-[#2E2E2A] flex flex-col items-center gap-2 shrink-0 w-full px-1">
                  <button
                    id="sidebar-add-page-btn-rail"
                    onClick={async () => {
                      await handleAddNewPage();
                    }}
                    title="Add Page"
                    aria-label="Add Page"
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-sm bg-[#EBE8E0] hover:bg-[#3A3A36] hover:text-white dark:bg-[#282824] dark:hover:bg-[#ECE9E2] dark:hover:text-[#1A1A1A] text-[#3A3A36] dark:text-[#ECE9E2] flex items-center justify-center transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>

                  <div
                    className="p-1 flex flex-col items-center gap-1 cursor-pointer"
                    title={`Progress: ${progressPercent}%`}
                    onClick={() => setIsSidebarOpen(true)}
                  >
                    <span className="text-[9px] font-mono font-bold text-[#8A8882]">{progressPercent}%</span>
                    <div className="w-1.5 h-6 bg-[#E5E1D8] dark:bg-[#2E2E2A] rounded-full overflow-hidden">
                      <div
                        className="w-full bg-[#3A3A36] dark:bg-[#ECE9E2] transition-all"
                        style={{ height: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </aside>
        )}

        {/* ==================== MAIN EDITOR AREA ==================== */}
        <section className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-[#181816] min-w-0">
          {/* ==================== FOCUS MODE TOP BAR ==================== */}
          {isFocusMode ? (
            <div
              id="focus-mode-top-bar"
              className="h-12 border-b border-[#E5E1D8] dark:border-[#2E2E2A] bg-[#FAF9F5] dark:bg-[#181816] px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 select-none animate-in fade-in duration-150 shrink-0"
            >
              {/* Exit Focus Mode Action */}
              <button
                id="exit-focus-mode-btn"
                onClick={() => setIsFocusMode(false)}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-sm bg-[#EBE8E0] dark:bg-[#282824] hover:bg-[#3A3A36] hover:text-white dark:hover:bg-[#ECE9E2] dark:hover:text-[#1A1A1A] text-xs font-medium text-[#3A3A36] dark:text-[#ECE9E2] transition-colors cursor-pointer shrink-0"
                title="Exit Focus Mode (Esc)"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider hidden xs:inline">Exit Focus</span>
                <kbd className="text-[9px] font-mono px-1 py-0.2 bg-white/60 dark:bg-black/30 rounded border border-[#DCD8CF] dark:border-[#383834] hidden sm:inline">
                  ESC
                </kbd>
              </button>

              {/* Minimal Chapter Switcher */}
              <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
                <button
                  id="focus-prev-chapter-btn"
                  onClick={async () => {
                    if (activePageIndex > 0) {
                      await handleSelectPage(pages[activePageIndex - 1]);
                    }
                  }}
                  disabled={activePageIndex <= 0}
                  className={`p-1.5 sm:p-1 rounded-sm ${
                    activePageIndex <= 0
                      ? 'opacity-30 cursor-not-allowed text-[#8A8882]'
                      : 'text-[#5A5852] dark:text-[#A8A59E] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0] dark:hover:bg-[#282824] cursor-pointer'
                  }`}
                  title="Previous Chapter"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="text-center truncate">
                  <span className="text-xs serif italic font-bold text-[#1A1A1A] dark:text-[#ECE9E2]">
                    Ch. {currentChapterNum}/{pages.length}
                  </span>
                  <span className="text-[10px] font-serif text-[#8A8882] dark:text-[#9E9B95] hidden md:inline ml-2 truncate">
                    ({pageTitle})
                  </span>
                </div>
                <button
                  id="focus-next-chapter-btn"
                  onClick={async () => {
                    if (activePageIndex < pages.length - 1) {
                      await handleSelectPage(pages[activePageIndex + 1]);
                    }
                  }}
                  disabled={activePageIndex >= pages.length - 1}
                  className={`p-1.5 sm:p-1 rounded-sm ${
                    activePageIndex >= pages.length - 1
                      ? 'opacity-30 cursor-not-allowed text-[#8A8882]'
                      : 'text-[#5A5852] dark:text-[#A8A59E] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0] dark:hover:bg-[#282824] cursor-pointer'
                  }`}
                  title="Next Chapter"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Focus Stats & Sync dot */}
              <div className="flex items-center gap-2 sm:gap-4 text-[10px] font-bold uppercase tracking-widest text-[#8A8882] dark:text-[#9E9B95] shrink-0">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="hidden sm:inline">Synced</span>
                </div>
                <span className="font-mono text-xs">
                  {wordCount.toLocaleString()} <span className="hidden sm:inline">Words</span>
                </span>
              </div>
            </div>
          ) : (
            /* ==================== STANDARD TOP BAR ==================== */
            <div className="h-14 border-b border-[#E5E1D8] dark:border-[#2E2E2A] bg-[#F9F7F2]/90 dark:bg-[#181816]/90 backdrop-blur-sm px-2 sm:px-4 md:px-6 flex items-center justify-between gap-1.5 sm:gap-3 shrink-0 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
                <button
                  id="toggle-sidebar-btn"
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className="p-1.5 sm:p-2 min-w-[34px] sm:min-w-[36px] min-h-[34px] sm:min-h-[36px] flex items-center justify-center rounded-sm text-[#8A8882] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0]/70 dark:hover:bg-[#282824] transition-colors cursor-pointer shrink-0"
                  title={isSidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
                  aria-label={isSidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
                >
                  {isSidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                {/* Page Title Editable Input */}
                <input
                  id="page-title-input"
                  type="text"
                  value={pageTitle}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Chapter Title..."
                  className="font-serif italic font-bold text-xs sm:text-sm md:text-base text-[#1A1A1A] dark:text-[#ECE9E2] bg-transparent border-b border-transparent hover:border-[#DCD8CF] dark:hover:border-[#383834] focus:border-[#3A3A36] dark:focus:border-[#ECE9E2] focus:outline-none px-1 py-0.5 min-w-0 flex-1 truncate transition-all"
                />
              </div>

              {/* Right Status Badges & Action Controls */}
              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                {/* Sync Status Badge */}
                <div
                  id="sync-status-indicator"
                  className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 bg-[#EBE8E0] dark:bg-[#282824] rounded-full border border-[#DCD8CF] dark:border-[#383834] text-[10px] font-bold uppercase tracking-tight text-[#6B6964] dark:text-[#A8A59E] shrink-0"
                >
                  {syncStatus === 'syncing' && (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin text-[#3A3A36] dark:text-[#ECE9E2]" />
                      <span>Syncing...</span>
                    </>
                  )}
                  {syncStatus === 'saving' && (
                    <>
                      <CloudUpload className="w-3 h-3 animate-pulse text-[#3A3A36] dark:text-[#ECE9E2]" />
                      <span>Saving...</span>
                    </>
                  )}
                  {syncStatus === 'saved' && (
                    <>
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                      <span>Synced</span>
                    </>
                  )}
                </div>

                {/* MYNOOK AI Assistant Toggle Button */}
                <button
                  id="ai-assistant-toggle-btn"
                  onClick={toggleAiPanel}
                  className={`p-1.5 sm:py-1.5 sm:px-2.5 min-h-[34px] sm:min-h-[36px] text-[10px] font-bold uppercase tracking-wider rounded-sm transition-all flex items-center gap-1 sm:gap-1.5 cursor-pointer shrink-0 ${
                    isAiPanelOpen
                      ? 'bg-[#3A3A36] text-white dark:bg-[#ECE9E2] dark:text-[#181816] shadow-sm'
                      : 'bg-[#EBE8E0] dark:bg-[#282824] hover:bg-[#3A3A36] hover:text-white dark:hover:bg-[#ECE9E2] dark:hover:text-[#1A1A1A] text-[#3A3A36] dark:text-[#ECE9E2]'
                  }`}
                  title={isAiPanelOpen ? 'Hide MYNOOK AI Assistant' : 'Open MYNOOK AI Assistant'}
                  aria-label="MYNOOK AI Assistant"
                >
                  <Wand2 className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                  <span className="hidden sm:inline">MYNOOK AI</span>
                </button>

                {/* Focus Mode Button */}
                <button
                  id="focus-mode-toggle-btn"
                  onClick={() => setIsFocusMode(true)}
                  className="p-1.5 sm:py-1.5 sm:px-2.5 min-h-[34px] sm:min-h-[36px] bg-[#EBE8E0] dark:bg-[#282824] hover:bg-[#3A3A36] hover:text-white dark:hover:bg-[#ECE9E2] dark:hover:text-[#1A1A1A] text-[#3A3A36] dark:text-[#ECE9E2] text-[10px] font-bold uppercase tracking-wider rounded-sm transition-colors flex items-center gap-1 sm:gap-1.5 cursor-pointer shrink-0"
                  title="Enter Focus Mode (Distraction-Free Writing)"
                  aria-label="Focus Mode"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                  <span className="hidden md:inline">Focus</span>
                </button>

                {/* Export Dropdown Menu (PDF & EPUB) */}
                <div className="relative shrink-0" ref={exportMenuRef}>
                  <button
                    id="editor-export-btn"
                    onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                    className="p-1.5 sm:py-1.5 sm:px-2.5 min-h-[34px] sm:min-h-[36px] bg-[#3A3A36] dark:bg-[#ECE9E2] text-white dark:text-[#1A1A1A] text-[10px] font-bold uppercase tracking-wider rounded-sm hover:bg-black dark:hover:bg-white transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                    title="Export Manuscript"
                    aria-label="Export Manuscript"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden sm:inline">Export</span>
                    <ChevronDown className="w-3 h-3 opacity-70 shrink-0" />
                  </button>

                  {isExportMenuOpen && (
                    <div className="absolute right-0 mt-1 w-48 rounded-sm bg-[#F9F7F2] dark:bg-[#21211E] border border-[#E5E1D8] dark:border-[#2E2E2A] shadow-xl py-1 z-30 animate-in fade-in zoom-in-95 duration-100">
                      <button
                        id="editor-export-pdf-item"
                        onClick={async () => {
                          setIsExportMenuOpen(false);
                          await flushCurrentWriting();
                          onExportPdf(book, pages);
                        }}
                        className="w-full px-3.5 py-2.5 sm:py-2 text-left text-xs font-medium text-[#3A3A36] dark:text-[#ECE9E2] hover:bg-[#EBE8E0] dark:hover:bg-[#2D2D29] flex items-center gap-2 cursor-pointer font-sans"
                      >
                        <FileText className="w-3.5 h-3.5 text-[#8A8882]" />
                        <span>Export as PDF</span>
                      </button>
                      <button
                        id="editor-export-epub-item"
                        onClick={async () => {
                          setIsExportMenuOpen(false);
                          await flushCurrentWriting();
                          if (onExportEpub) {
                            onExportEpub(book, pages);
                          }
                        }}
                        className="w-full px-3.5 py-2.5 sm:py-2 text-left text-xs font-medium text-[#3A3A36] dark:text-[#ECE9E2] hover:bg-[#EBE8E0] dark:hover:bg-[#2D2D29] flex items-center gap-2 cursor-pointer font-sans"
                      >
                        <BookOpen className="w-3.5 h-3.5 text-[#C5A059]" />
                        <span>Export as EPUB</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Distraction-free / Fullscreen toggle */}
                <button
                  id="fullscreen-toggle-btn"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="p-1.5 min-w-[34px] sm:min-w-[36px] min-h-[34px] sm:min-h-[36px] flex items-center justify-center rounded-sm text-[#8A8882] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0]/70 dark:hover:bg-[#282824] transition-colors cursor-pointer shrink-0"
                  title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                  aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* ==================== WRITING TOOLBAR (Hidden in Focus Mode) ==================== */}
          {!isFocusMode && (
            <div
              id="editor-toolbar"
              className="border-b border-[#F0EFEB] dark:border-[#282824] bg-white dark:bg-[#21211E] px-3 sm:px-6 py-1.5 sm:py-2 flex items-center justify-between gap-2 sm:gap-4 text-xs overflow-x-auto shrink-0 scrollbar-none"
            >
            {/* Formatting Actions */}
            <div className="flex items-center gap-0.5 sm:gap-1 text-[#8A8882] dark:text-[#9E9B95] shrink-0">
              <button
                id="btn-bold"
                onClick={() => executeFormat('bold')}
                className="p-2 sm:p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-sm hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0]/60 dark:hover:bg-[#282824] cursor-pointer"
                title="Bold (Ctrl+B)"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                id="btn-italic"
                onClick={() => executeFormat('italic')}
                className="p-2 sm:p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-sm hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0]/60 dark:hover:bg-[#282824] cursor-pointer"
                title="Italic (Ctrl+I)"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                id="btn-underline"
                onClick={() => executeFormat('underline')}
                className="p-2 sm:p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-sm hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0]/60 dark:hover:bg-[#282824] cursor-pointer"
                title="Underline (Ctrl+U)"
              >
                <Underline className="w-3.5 h-3.5" />
              </button>
              <button
                id="btn-strike"
                onClick={() => executeFormat('strikeThrough')}
                className="p-2 sm:p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-sm hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0]/60 dark:hover:bg-[#282824] cursor-pointer"
                title="Strikethrough"
              >
                <Strikethrough className="w-3.5 h-3.5" />
              </button>

              <span className="w-px h-4 bg-[#E5E1D8] dark:bg-[#2E2E2A] mx-0.5 sm:mx-1" />

              <button
                id="btn-h1"
                onClick={() => executeFormat('formatBlock', '<h1>')}
                className="p-2 sm:p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-sm hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0]/60 dark:hover:bg-[#282824] cursor-pointer"
                title="Heading 1"
              >
                <Heading1 className="w-3.5 h-3.5" />
              </button>
              <button
                id="btn-h2"
                onClick={() => executeFormat('formatBlock', '<h2>')}
                className="p-2 sm:p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-sm hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0]/60 dark:hover:bg-[#282824] cursor-pointer"
                title="Heading 2"
              >
                <Heading2 className="w-3.5 h-3.5" />
              </button>
              <button
                id="btn-p"
                onClick={() => executeFormat('formatBlock', '<p>')}
                className="px-2 py-1 min-h-[32px] flex items-center justify-center rounded-sm hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0]/60 dark:hover:bg-[#282824] font-serif cursor-pointer"
                title="Paragraph"
              >
                ¶
              </button>

              <span className="w-px h-4 bg-[#E5E1D8] dark:bg-[#2E2E2A] mx-0.5 sm:mx-1" />

              <button
                id="btn-align-left"
                onClick={() => executeFormat('justifyLeft')}
                className="p-2 sm:p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-sm hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0]/60 dark:hover:bg-[#282824] cursor-pointer"
                title="Align Left"
              >
                <AlignLeft className="w-3.5 h-3.5" />
              </button>
              <button
                id="btn-align-center"
                onClick={() => executeFormat('justifyCenter')}
                className="p-2 sm:p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-sm hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0]/60 dark:hover:bg-[#282824] cursor-pointer"
                title="Align Center"
              >
                <AlignCenter className="w-3.5 h-3.5" />
              </button>
              <button
                id="btn-align-right"
                onClick={() => executeFormat('justifyRight')}
                className="p-2 sm:p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-sm hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0]/60 dark:hover:bg-[#282824] cursor-pointer"
                title="Align Right"
              >
                <AlignRight className="w-3.5 h-3.5" />
              </button>
              <button
                id="btn-align-justify"
                onClick={() => executeFormat('justifyFull')}
                className="p-2 sm:p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-sm hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0]/60 dark:hover:bg-[#282824] cursor-pointer"
                title="Justify"
              >
                <AlignJustify className="w-3.5 h-3.5" />
              </button>

              <span className="w-px h-4 bg-[#E5E1D8] dark:bg-[#2E2E2A] mx-0.5 sm:mx-1" />

              <button
                id="btn-bullet-list"
                onClick={() => executeFormat('insertUnorderedList')}
                className="p-2 sm:p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-sm hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0]/60 dark:hover:bg-[#282824] cursor-pointer"
                title="Bullet List"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                id="btn-number-list"
                onClick={() => executeFormat('insertOrderedList')}
                className="p-2 sm:p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-sm hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0]/60 dark:hover:bg-[#282824] cursor-pointer"
                title="Numbered List"
              >
                <ListOrdered className="w-3.5 h-3.5" />
              </button>

              <span className="w-px h-4 bg-[#E5E1D8] dark:bg-[#2E2E2A] mx-0.5 sm:mx-1" />

              <button
                id="btn-undo"
                onClick={() => executeFormat('undo')}
                className="p-2 sm:p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-sm hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0]/60 dark:hover:bg-[#282824] cursor-pointer"
                title="Undo"
              >
                <Undo className="w-3.5 h-3.5" />
              </button>
              <button
                id="btn-redo"
                onClick={() => executeFormat('redo')}
                className="p-2 sm:p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-sm hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0]/60 dark:hover:bg-[#282824] cursor-pointer"
                title="Redo"
              >
                <Redo className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Typography & Auto-Correction Controls */}
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              {/* Font Family Selector */}
              <div className="flex items-center rounded-sm border border-[#DCD8CF] dark:border-[#383834] overflow-hidden bg-[#EBE8E0]/40 dark:bg-[#282824] text-[10px] font-bold uppercase tracking-wider">
                <button
                  id="font-serif-btn"
                  onClick={() => setEditorFont('serif')}
                  className={`px-2.5 sm:px-3 py-1 font-serif cursor-pointer ${
                    editorFont === 'serif'
                      ? 'bg-[#3A3A36] text-white dark:bg-[#ECE9E2] dark:text-[#1A1A1A]'
                      : 'text-[#8A8882] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2]'
                  }`}
                >
                  Serif
                </button>
                <button
                  id="font-sans-btn"
                  onClick={() => setEditorFont('sans')}
                  className={`px-2.5 sm:px-3 py-1 font-sans cursor-pointer ${
                    editorFont === 'sans'
                      ? 'bg-[#3A3A36] text-white dark:bg-[#ECE9E2] dark:text-[#1A1A1A]'
                      : 'text-[#8A8882] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2]'
                  }`}
                >
                  Sans
                </button>
              </div>

              {/* Auto-Correction Toggle (Artistic Flair switch layout) */}
              <div className="flex items-center space-x-2 sm:space-x-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#8A8882] dark:text-[#9E9B95] hidden xs:inline">
                  Auto-Correct
                </span>
                <button
                  id="auto-correct-toggle-btn"
                  type="button"
                  onClick={toggleAutoCorrect}
                  className={`w-8 h-4 rounded-full relative p-0.5 transition-colors cursor-pointer shrink-0 ${
                    autoCorrectEnabled ? 'bg-[#3A3A36] dark:bg-[#ECE9E2]' : 'bg-[#DCD8CF] dark:bg-[#383834]'
                  }`}
                  title={autoCorrectEnabled ? 'Auto-correction is ON (Press SPACE to correct)' : 'Auto-correction is OFF'}
                >
                  <div
                    className={`w-3 h-3 rounded-full transition-transform ${
                      autoCorrectEnabled
                        ? 'translate-x-4 bg-white dark:bg-[#181816]'
                        : 'translate-x-0 bg-white dark:bg-[#8A8882]'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
          )}

          {/* ==================== MAIN WRITING CANVAS ==================== */}
          <div className="flex-1 overflow-y-auto px-2 py-4 sm:px-6 sm:py-10 lg:py-16 flex justify-center bg-[#FAF9F5] dark:bg-[#181816]">
            <article
              id="book-editor-sheet"
              className="w-full max-w-2xl min-h-[500px] sm:min-h-[750px] bg-white dark:bg-[#21211E] border border-[#E5E1D8] dark:border-[#2E2E2A] rounded-sm p-4 sm:p-12 lg:p-16 shadow-sm focus-within:border-[#3A3A36]/40 dark:focus-within:border-[#ECE9E2]/40 transition-all flex flex-col"
            >
              {/* Editorial Chapter Heading - Directly Editable */}
              <div className="mb-4 sm:mb-8">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#8A8882] dark:text-[#9E9B95] mb-1 flex items-center gap-1.5 sm:gap-2 select-none">
                  <span>Chapter {currentChapterNum}</span>
                  <span className="text-[#DCD8CF] dark:text-[#383834]">•</span>
                  <span className="font-serif italic font-normal text-[11px] sm:text-xs text-[#8A8882]">Click to edit title</span>
                </div>
                <input
                  id="canvas-chapter-title-input"
                  type="text"
                  value={pageTitle}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  onBlur={() => flushCurrentWriting()}
                  placeholder={`Chapter ${currentChapterNum}`}
                  className="w-full text-xl sm:text-2xl lg:text-3xl serif italic font-bold text-[#1A1A1A] dark:text-[#ECE9E2] bg-transparent border-b border-transparent hover:border-[#E5E1D8] dark:hover:border-[#2E2E2A] focus:border-[#3A3A36] dark:focus:border-[#ECE9E2] focus:outline-none py-1 transition-all"
                />
                <div className="w-16 sm:w-20 h-0.5 bg-[#3A3A36] dark:bg-[#ECE9E2] mt-1.5 opacity-80" />
              </div>

              {/* The Actual ContentEditable Writing Editor */}
              <div
                id="main-contenteditable-editor"
                ref={editorRef}
                contentEditable
                spellCheck={true}
                suppressContentEditableWarning
                onInput={handleEditorInput}
                onKeyDown={handleEditorKeyDown}
                className={`flex-1 focus:outline-none text-[#3A3A36] dark:text-[#D4D1CA] ${fontClass} ${fontSizeClass} space-y-3 sm:space-y-4 prose dark:prose-invert max-w-none empty:before:content-['Start_writing_your_story_here...'] empty:before:text-[#8A8882] empty:before:pointer-events-none`}
                style={{
                  minHeight: '350px',
                  wordBreak: 'break-word',
                }}
              />
            </article>
          </div>

          {/* ==================== LIVE WORD & CHAR COUNT FOOTER ==================== */}
          <footer
            id="editor-footer"
            className="h-11 sm:h-12 border-t border-[#E5E1D8] dark:border-[#2E2E2A] bg-[#F9F7F2] dark:bg-[#181816] px-3 sm:px-8 flex items-center justify-between text-xs select-none shrink-0"
          >
            <div className="flex items-center gap-2 sm:gap-3 text-[10px] font-bold uppercase tracking-widest text-[#8A8882] dark:text-[#9E9B95] min-w-0">
              <span className="hidden sm:inline truncate max-w-[150px]">
                Active: <span className="text-[#1A1A1A] dark:text-[#ECE9E2]">{pageTitle}</span>
              </span>
              <span className="text-[#DCD8CF] dark:text-[#383834] hidden sm:inline">•</span>
              <span className="truncate">
                Saved {lastSavedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {/* Word & Char counts in Artistic Flair stacked typography */}
            <div className="flex items-center space-x-3 sm:space-x-6 text-[10px] font-bold uppercase tracking-widest text-[#8A8882] dark:text-[#9E9B95] shrink-0">
              <div className="flex flex-col items-end">
                <span className="text-[#1A1A1A] dark:text-[#ECE9E2] font-mono text-xs font-bold">
                  {wordCount.toLocaleString()}
                </span>
                <span>Words</span>
              </div>
              <div className="w-[1px] h-5 sm:h-6 bg-[#E5E1D8] dark:bg-[#2E2E2A]" />
              <div className="flex flex-col items-end">
                <span className="text-[#1A1A1A] dark:text-[#ECE9E2] font-mono text-xs font-bold">
                  {charCount.toLocaleString()}
                </span>
                <span>Chars</span>
              </div>
            </div>
          </footer>
        </section>

        {/* ==================== RIGHT-SIDE AI ASSISTANT PANEL ==================== */}
        <AiAssistantPanel
          isOpen={isAiPanelOpen}
          onClose={() => setIsAiPanelOpen(false)}
          book={book}
          pages={pages}
          currentPage={activePageIndex >= 0 ? pages[activePageIndex] : null}
          currentChapterNumber={currentChapterNum}
          selectedText={selectedText}
          onClearSelectedText={() => setSelectedText('')}
          onApplySuggestion={handleApplyAiSuggestion}
          onReplaceSelection={handleReplaceSelection}
          onCreateChapterFromAi={handleCreateChapterFromAi}
        />
      </div>

      {/* Delete Confirmation Modal */}
      {pageToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-md bg-[#F9F7F2] dark:bg-[#21211E] rounded-sm shadow-2xl border border-[#E5E1D8] dark:border-[#2E2E2A] p-4 sm:p-6 space-y-4 my-auto">
            <div className="flex items-center gap-2.5 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="serif italic font-bold text-base sm:text-lg text-[#1A1A1A] dark:text-[#ECE9E2] truncate">
                Delete Chapter?
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-[#5A5852] dark:text-[#A8A59E] leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <strong className="text-[#1A1A1A] dark:text-[#ECE9E2]">
                "{pageToDelete.title}"
              </strong>
              ? This action cannot be undone.
            </p>
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 pt-2">
              <button
                onClick={() => setPageToDelete(null)}
                className="w-full sm:w-auto px-4 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 rounded-sm text-[10px] font-bold uppercase tracking-widest text-[#8A8882] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0] dark:hover:bg-[#282824] transition-colors cursor-pointer text-center"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeletePage}
                className="w-full sm:w-auto px-4 py-2.5 sm:py-2 min-h-[42px] sm:min-h-0 rounded-sm text-[10px] font-bold uppercase tracking-widest bg-red-600 hover:bg-red-700 text-white shadow-sm transition-colors cursor-pointer text-center"
              >
                Delete Page
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
