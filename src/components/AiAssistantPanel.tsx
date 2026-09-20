import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  X,
  Send,
  Square,
  RotateCcw,
  Copy,
  Check,
  Languages,
  BookOpen,
  Feather,
  Wand2,
  CheckCheck,
  Lightbulb,
  ArrowRightLeft,
  ChevronDown,
  FileText,
  AlertCircle,
  CornerDownLeft,
} from 'lucide-react';
import { Book, BookPage } from '../types';
import {
  ChatMessage,
  AiSuggestion,
  extractSuggestionsFromText,
  streamAiChat,
  translateText,
} from '../services/aiService';

interface AiAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book;
  pages: BookPage[];
  currentPage: BookPage | null;
  currentChapterNumber: number;
  selectedText: string;
  onClearSelectedText: () => void;
  onApplySuggestion: (suggestion: AiSuggestion) => void;
  onReplaceSelection: (newText: string) => void;
  onCreateChapterFromAi?: (title: string, content?: string) => void;
}

type PanelTab = 'chat' | 'translator' | 'prompts';

const QUICK_ACTIONS = [
  { id: 'improve', label: '✨ Improve Writing', hint: 'Sensory depth & rhythm' },
  { id: 'rewrite', label: '✍️ Rewrite', hint: 'Alternative literary phrasing' },
  { id: 'continue', label: '📝 Continue Writing', hint: 'Seamless narrative progression' },
  { id: 'ideas', label: '💡 Give Ideas', hint: 'Creative directions & twists' },
  { id: 'dialogue', label: '🎭 Improve Dialogue', hint: 'Natural & subtext-rich' },
  { id: 'summarize', label: '📖 Summarize', hint: 'Key beats & arcs' },
  { id: 'analyze', label: '🔍 Analyze Chapter', hint: 'Pacing, tone, and depth' },
  { id: 'grammar', label: '🧹 Fix Grammar', hint: 'Mechanics without losing voice' },
  { id: 'suggest_title', label: '🏷️ Suggest Title', hint: '5 evocative title ideas' },
];

const INSPIRATION_PROMPTS = [
  {
    category: 'Narrative & Pacing',
    prompts: [
      'Give me 5 possible ways to continue this scene.',
      'Give me a surprising plot twist with high stakes.',
      'Find inconsistencies or pacing drops in this chapter.',
    ],
  },
  {
    category: 'Sensory & Voice',
    prompts: [
      'Describe this scene more vividly with sensory textures.',
      'Make this scene significantly more emotional and poignant.',
      'Make this sound like a masterwork literary novel.',
    ],
  },
  {
    category: 'Dialogue & Characters',
    prompts: [
      'Make this dialogue sound natural, punchy, and character-driven.',
      'What are the core emotional motivations of the characters in this scene?',
      'Identify repetitive words or flat dialogue tags in this chapter.',
    ],
  },
];

const SUPPORTED_LANGUAGES = [
  'Hindi',
  'English',
  'Bengali',
  'Odia',
  'Spanish',
  'French',
  'German',
];

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  isOpen,
  onClose,
  book,
  pages,
  currentPage,
  currentChapterNumber,
  selectedText,
  onClearSelectedText,
  onApplySuggestion,
  onReplaceSelection,
  onCreateChapterFromAi,
}) => {
  const [activeTab, setActiveTab] = useState<PanelTab>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    return [
      {
        id: 'msg_welcome',
        role: 'model',
        content: `Welcome to **MYNOOK AI** for *${book.title}*.\n\nI am your dedicated literary writing assistant. You are currently on **Chapter ${currentChapterNumber}: ${
          currentPage?.title || 'Untitled'
        }**.\n\nSelect any sentence or paragraph in your manuscript to polish, rewrite, or translate it, or choose a quick action below to begin.`,
        timestamp: Date.now(),
      },
    ];
  });

  const [inputPrompt, setInputPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());

  // Translator state
  const [sourceLang, setSourceLang] = useState('Hindi');
  const [targetLang, setTargetLang] = useState('English');
  const [transSourceText, setTransSourceText] = useState('');
  const [transResultText, setTransResultText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [transCopied, setTransCopied] = useState(false);
  const [transApplied, setTransApplied] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cancelStreamRef = useRef<(() => void) | null>(null);

  // Auto-scroll messages to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  // Clean up streaming on unmount
  useEffect(() => {
    return () => {
      if (cancelStreamRef.current) {
        cancelStreamRef.current();
      }
    };
  }, []);

  // Update translator source when user selects text and switches to translator
  useEffect(() => {
    if (selectedText && activeTab === 'translator' && !transSourceText) {
      setTransSourceText(selectedText);
    }
  }, [selectedText, activeTab, transSourceText]);

  // Handle sending a message or quick action
  const handleSendMessage = (customPrompt?: string, actionName?: string) => {
    const textToSend = (customPrompt || inputPrompt).trim();
    if (!textToSend && !actionName) return;

    if (isGenerating) {
      // Prevent duplicate concurrent requests
      return;
    }

    if (cancelStreamRef.current) {
      cancelStreamRef.current();
      cancelStreamRef.current = null;
    }

    const userMessageId = 'user_' + Date.now();
    const modelMessageId = 'model_' + Date.now();

    const displayPrompt =
      textToSend || (actionName ? QUICK_ACTIONS.find((q) => q.id === actionName)?.label || actionName : 'AI Action');

    const newMessages: ChatMessage[] = [
      ...messages,
      {
        id: userMessageId,
        role: 'user',
        content: displayPrompt,
        timestamp: Date.now(),
      },
      {
        id: modelMessageId,
        role: 'model',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      },
    ];

    setMessages(newMessages);
    setInputPrompt('');
    setIsGenerating(true);

    // Build context payload
    const bookContext = {
      bookTitle: book.title,
      bookAuthor: book.author,
      genre: book.genre,
      currentChapterTitle: currentPage?.title,
      currentChapterNumber,
      totalChapters: pages.length,
      selectedText: selectedText || undefined,
      currentChapterContent: currentPage?.content,
      chapterList: pages.map((p) => ({ pageNumber: p.pageNumber, title: p.title })),
    };

    // Pre-populate chapter lookup for quick multi-chapter queries if book has few pages
    const chapterLookup: Record<number, string> = {};
    pages.forEach((p) => {
      if (p.content) {
        const plain = p.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        chapterLookup[p.pageNumber] = plain.slice(0, 3000);
      }
    });

    let currentStreamContent = '';

    const cancel = streamAiChat({
      messages: newMessages.slice(0, -1).map((m) => ({
        role: m.role,
        content: m.content,
      })),
      bookContext,
      action: actionName,
      chapterLookup,
      onChunk: (chunkText) => {
        currentStreamContent += chunkText;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === modelMessageId
              ? {
                  ...m,
                  content: currentStreamContent,
                  suggestions: extractSuggestionsFromText(currentStreamContent),
                }
              : m
          )
        );
      },
      onToolCall: (toolCall) => {
        console.log('AI requested tool call:', toolCall);
        if (toolCall.name === 'propose_manuscript_edit' && toolCall.args?.suggestedText) {
          const newSuggestion: AiSuggestion = {
            id: 'sugg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            target: toolCall.args.target === 'title' ? 'title' : toolCall.args.target === 'chapter' ? 'chapter' : 'selection',
            originalText: toolCall.args.originalText || selectedText || '',
            suggestedText: toolCall.args.suggestedText,
            rationale: toolCall.args.rationale || 'Proposed refinement by assistant.',
            status: 'pending',
          };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === modelMessageId
                ? {
                    ...m,
                    content: m.content || `I've prepared a suggested revision for your manuscript:`,
                    suggestions: [...(m.suggestions || []), newSuggestion],
                  }
                : m
            )
          );
        } else if (toolCall.name === 'propose_create_chapter' && toolCall.args?.title && onCreateChapterFromAi) {
          onCreateChapterFromAi(toolCall.args.title, toolCall.args.initialContent);
        }
      },
      onDone: (fullText) => {
        setIsGenerating(false);
        cancelStreamRef.current = null;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== modelMessageId) return m;
            const extracted = extractSuggestionsFromText(fullText || currentStreamContent);
            const combinedSuggestions = [...(m.suggestions || [])];
            for (const s of extracted) {
              if (!combinedSuggestions.some((existing) => existing.suggestedText === s.suggestedText)) {
                combinedSuggestions.push(s);
              }
            }
            const fallbackText = combinedSuggestions.length > 0
              ? `I've crafted an enhanced revision with sensory details and polished rhythm:`
              : (fullText || currentStreamContent || '').trim() || `I've analyzed your manuscript. Let me know what you'd like to develop next!`;

            return {
              ...m,
              content: (fullText || currentStreamContent || '').trim() || fallbackText,
              isStreaming: false,
              suggestions: combinedSuggestions,
            };
          })
        );
      },
      onError: (errMsg) => {
        setIsGenerating(false);
        cancelStreamRef.current = null;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === modelMessageId
              ? {
                  ...m,
                  content:
                    currentStreamContent ||
                    `*Notice: ${errMsg}*`,
                  isStreaming: false,
                }
              : m
          )
        );
      },
    });

    cancelStreamRef.current = cancel;
  };

  const handleStopGeneration = () => {
    if (cancelStreamRef.current) {
      cancelStreamRef.current();
      cancelStreamRef.current = null;
    }
    setIsGenerating(false);
  };

  const handleClearConversation = () => {
    if (cancelStreamRef.current) {
      cancelStreamRef.current();
      cancelStreamRef.current = null;
    }
    setIsGenerating(false);
    setMessages([
      {
        id: 'msg_welcome_' + Date.now(),
        role: 'model',
        content: `Conversation cleared. How can I assist you with **${book.title}** today?`,
        timestamp: Date.now(),
      },
    ]);
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleApplySingleSuggestion = (suggestion: AiSuggestion) => {
    onApplySuggestion(suggestion);
    setAppliedIds((prev) => new Set(prev).add(suggestion.id));
  };

  const handleRejectSingleSuggestion = (suggestionId: string) => {
    setRejectedIds((prev) => new Set(prev).add(suggestionId));
  };

  // Translator handlers
  const handleSwapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
  };

  const handleExecuteTranslation = async () => {
    if (!transSourceText.trim()) return;
    setIsTranslating(true);
    setTransResultText('');
    setTransApplied(false);
    try {
      const result = await translateText(transSourceText, sourceLang, targetLang);
      setTransResultText(result);
    } catch (err: any) {
      setTransResultText(`Error: ${err.message || 'Translation failed.'}`);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleCopyTranslation = () => {
    if (!transResultText) return;
    navigator.clipboard.writeText(transResultText);
    setTransCopied(true);
    setTimeout(() => setTransCopied(false), 2000);
  };

  const handleApplyTranslationToEditor = () => {
    if (!transResultText) return;
    onReplaceSelection(transResultText);
    setTransApplied(true);
    setTimeout(() => setTransApplied(false), 3000);
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          id="ai-panel-backdrop"
          onClick={onClose}
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-30 md:hidden transition-opacity animate-in fade-in duration-200"
        />
      )}

      {/* Main AI Assistant Drawer / Sidebar */}
      <aside
        id="mynook-ai-panel"
        className={`fixed md:relative top-0 right-0 h-full w-[90vw] sm:w-[400px] md:w-80 lg:w-96 xl:w-[420px] bg-[#FAF9F5] dark:bg-[#1D1D1A] border-l border-[#E5E1D8] dark:border-[#2E2E2A] z-40 flex flex-col shadow-2xl md:shadow-none transition-all duration-300 ease-in-out shrink-0 ${
          isOpen ? 'translate-x-0 opacity-100 pointer-events-auto' : 'translate-x-full opacity-0 pointer-events-none md:hidden hidden'
        }`}
      >
        {/* ==================== HEADER ==================== */}
        <div className="p-3.5 sm:p-4 border-b border-[#E5E1D8] dark:border-[#2E2E2A] flex items-center justify-between bg-[#F3F0E9] dark:bg-[#181816] shrink-0 select-none">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-sm bg-[#3A3A36] dark:bg-[#ECE9E2] text-[#F9F7F2] dark:text-[#181816] flex items-center justify-center shrink-0 shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
            </div>
            <div className="truncate">
              <div className="flex items-center gap-1.5">
                <h3 className="serif italic font-bold text-sm text-[#1A1A1A] dark:text-[#ECE9E2]">
                  MYNOOK AI
                </h3>
                <span className="text-[9px] font-mono px-1 py-0.2 rounded-xs bg-[#C5A059]/15 text-[#8C6D2B] dark:text-[#E2C382] font-semibold">
                  Gemini
                </span>
              </div>
              <p className="text-[10px] text-[#8A8882] dark:text-[#9E9B95] font-serif italic truncate">
                Your writing assistant
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              id="ai-clear-chat-btn"
              onClick={handleClearConversation}
              className="p-1.5 rounded-sm text-[#8A8882] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0] dark:hover:bg-[#282824] transition-colors cursor-pointer"
              title="Clear conversation"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              id="ai-close-panel-btn"
              onClick={onClose}
              className="p-1.5 rounded-sm text-[#8A8882] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0] dark:hover:bg-[#282824] transition-colors cursor-pointer"
              title="Close panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ==================== SUB-NAVIGATION TABS ==================== */}
        <div className="px-3 py-2 border-b border-[#E5E1D8] dark:border-[#2E2E2A] bg-[#FAF9F5] dark:bg-[#1D1D1A] flex items-center gap-1 shrink-0">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-[#3A3A36] text-white dark:bg-[#ECE9E2] dark:text-[#1A1A1A] font-bold shadow-xs'
                : 'text-[#8A8882] dark:text-[#9E9B95] hover:bg-[#EBE8E0] dark:hover:bg-[#282824]'
            }`}
          >
            <Feather className="w-3.5 h-3.5" />
            <span>Assistant</span>
          </button>
          <button
            onClick={() => setActiveTab('translator')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'translator'
                ? 'bg-[#3A3A36] text-white dark:bg-[#ECE9E2] dark:text-[#1A1A1A] font-bold shadow-xs'
                : 'text-[#8A8882] dark:text-[#9E9B95] hover:bg-[#EBE8E0] dark:hover:bg-[#282824]'
            }`}
          >
            <Languages className="w-3.5 h-3.5" />
            <span>Translator</span>
          </button>
          <button
            onClick={() => setActiveTab('prompts')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'prompts'
                ? 'bg-[#3A3A36] text-white dark:bg-[#ECE9E2] dark:text-[#1A1A1A] font-bold shadow-xs'
                : 'text-[#8A8882] dark:text-[#9E9B95] hover:bg-[#EBE8E0] dark:hover:bg-[#282824]'
            }`}
          >
            <Lightbulb className="w-3.5 h-3.5" />
            <span>Prompts</span>
          </button>
        </div>

        {/* ==================== ACTIVE SELECTION BANNER ==================== */}
        {selectedText && activeTab === 'chat' && (
          <div className="bg-[#FAF0D9]/80 dark:bg-[#2C2719] border-b border-[#F0DFB7] dark:border-[#4A3F26] px-3 py-2 text-xs flex items-center justify-between gap-2 shrink-0 animate-in fade-in duration-150 font-sans">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-1.5 h-1.5 bg-[#C5A059] rounded-full shrink-0" />
              <p className="truncate text-[#5A4517] dark:text-[#E2C382] font-medium text-[11px]">
                Selected text:{' '}
                <span className="italic font-serif">
                  "{selectedText.slice(0, 45)}
                  {selectedText.length > 45 ? '...' : ''}"
                </span>{' '}
                <span className="opacity-70 font-mono text-[10px]">
                  ({selectedText.split(/\s+/).filter(Boolean).length} words)
                </span>
              </p>
            </div>
            <button
              onClick={onClearSelectedText}
              className="text-[10px] text-[#8C6D2B] dark:text-[#E2C382] hover:underline shrink-0 cursor-pointer"
              title="Clear selection focus"
            >
              Clear
            </button>
          </div>
        )}

        {/* ==================== TAB 1: CHAT & QUICK ACTIONS ==================== */}
        {activeTab === 'chat' && (
          <>
            {/* Quick Action Chips Bar */}
            <div className="p-2 border-b border-[#E5E1D8] dark:border-[#2E2E2A] bg-white/70 dark:bg-[#21211E]/70 overflow-x-auto scrollbar-none flex items-center gap-1.5 shrink-0">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleSendMessage(undefined, action.id)}
                  disabled={isGenerating}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-full bg-[#EBE8E0] dark:bg-[#282824] hover:bg-[#3A3A36] hover:text-white dark:hover:bg-[#ECE9E2] dark:hover:text-[#1A1A1A] text-[#3A3A36] dark:text-[#ECE9E2] transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 shrink-0"
                  title={action.hint}
                >
                  {action.label}
                </button>
              ))}
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 text-xs">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] text-[#8A8882] dark:text-[#9E9B95] px-1 font-mono">
                      <span>{isUser ? 'You' : 'MYNOOK AI'}</span>
                      <span>•</span>
                      <span>
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div
                      className={`max-w-[92%] rounded-sm p-3 leading-relaxed shadow-2xs ${
                        isUser
                          ? 'bg-[#3A3A36] text-white dark:bg-[#ECE9E2] dark:text-[#181816]'
                          : 'bg-white dark:bg-[#21211E] border border-[#E5E1D8] dark:border-[#2E2E2A] text-[#1A1A1A] dark:text-[#ECE9E2]'
                      }`}
                    >
                      {/* Render text with basic markdown formatting */}
                      <div className="whitespace-pre-wrap font-sans text-xs space-y-2 leading-relaxed">
                        {renderFormattedMessage(msg.content)}
                      </div>

                      {/* Suggestions / Diff Cards */}
                      {msg.suggestions && msg.suggestions.length > 0 && (
                        <div className="mt-3 space-y-2 pt-2 border-t border-[#E5E1D8] dark:border-[#2E2E2A]">
                          {msg.suggestions.map((sugg) => {
                            const isApplied = appliedIds.has(sugg.id);
                            const isRejected = rejectedIds.has(sugg.id);

                            return (
                              <div
                                key={sugg.id}
                                className={`p-2.5 rounded-sm border transition-all text-xs ${
                                  isApplied
                                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                                    : isRejected
                                    ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900 opacity-60'
                                    : 'bg-[#FAF9F5] dark:bg-[#1A1A18] border-[#DCD8CF] dark:border-[#383834]'
                                }`}
                              >
                                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#8A8882] mb-1.5">
                                  <span className="flex items-center gap-1">
                                    <Wand2 className="w-3 h-3 text-[#C5A059]" />
                                    Suggested Literary Revision
                                  </span>
                                  {isApplied && (
                                    <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-0.5">
                                      <Check className="w-3 h-3" /> Applied
                                    </span>
                                  )}
                                  {isRejected && <span className="text-red-500 font-bold">Rejected</span>}
                                </div>

                                {sugg.originalText && (
                                  <div className="mb-2 p-1.5 bg-red-50/50 dark:bg-red-950/10 rounded border-l-2 border-red-400 text-[#7A2E2E] dark:text-[#E8A5A5]">
                                    <div className="text-[9px] font-mono uppercase font-bold text-[#A84A4A] mb-0.5">
                                      Original
                                    </div>
                                    <p className="italic font-serif text-[11px]">{sugg.originalText}</p>
                                  </div>
                                )}

                                <div className="p-2 bg-emerald-50/60 dark:bg-emerald-950/20 rounded border-l-2 border-emerald-500 text-[#1B4D3E] dark:text-[#A7E2C9]">
                                  <div className="text-[9px] font-mono uppercase font-bold text-emerald-700 dark:text-emerald-300 mb-0.5">
                                    Proposed Replacement
                                  </div>
                                  <p className="serif italic text-xs leading-relaxed">
                                    {sugg.suggestedText}
                                  </p>
                                </div>

                                {sugg.rationale && (
                                  <p className="mt-1.5 text-[10px] text-[#8A8882] dark:text-[#9E9B95] italic font-serif">
                                    Why: {sugg.rationale}
                                  </p>
                                )}

                                {!isApplied && !isRejected && (
                                  <div className="mt-2.5 flex items-center justify-end gap-1.5 pt-1">
                                    <button
                                      onClick={() => handleRejectSingleSuggestion(sugg.id)}
                                      className="px-2.5 py-1 text-[10px] font-medium rounded text-[#8A8882] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0] dark:hover:bg-[#282824] transition-colors cursor-pointer"
                                    >
                                      Reject
                                    </button>
                                    <button
                                      onClick={() => handleCopyText(sugg.id, sugg.suggestedText)}
                                      className="px-2.5 py-1 text-[10px] font-medium rounded text-[#3A3A36] dark:text-[#ECE9E2] hover:bg-[#EBE8E0] dark:hover:bg-[#282824] flex items-center gap-1 transition-colors cursor-pointer"
                                    >
                                      {copiedId === sugg.id ? (
                                        <Check className="w-3 h-3 text-emerald-500" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                      <span>{copiedId === sugg.id ? 'Copied' : 'Copy'}</span>
                                    </button>
                                    <button
                                      onClick={() => handleApplySingleSuggestion(sugg)}
                                      className="px-3 py-1 text-[10px] font-bold rounded bg-[#3A3A36] text-white dark:bg-[#ECE9E2] dark:text-[#1A1A1A] hover:bg-black dark:hover:bg-white flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                                    >
                                      <CheckCheck className="w-3 h-3" />
                                      <span>Apply Change</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Tool call execution badge */}
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="mt-2 text-[10px] text-[#8A8882] font-mono flex items-center gap-1">
                          <BookOpen className="w-3 h-3 text-[#C5A059]" />
                          <span>Referenced manuscript data</span>
                        </div>
                      )}

                      {/* Streaming cursor */}
                      {msg.isStreaming && (
                        <span className="inline-block w-1.5 h-3 ml-1 bg-[#C5A059] animate-pulse align-middle" />
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Text Input Area */}
            <div className="p-3 border-t border-[#E5E1D8] dark:border-[#2E2E2A] bg-[#F3F0E9] dark:bg-[#181816] shrink-0">
              <div className="relative flex flex-col bg-white dark:bg-[#21211E] rounded-sm border border-[#DCD8CF] dark:border-[#383834] focus-within:border-[#3A3A36] dark:focus-within:border-[#ECE9E2] transition-all p-2 shadow-2xs">
                <textarea
                  id="ai-prompt-input"
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder={
                    selectedText
                      ? 'Ask about selected text, or prompt a rewrite...'
                      : 'Ask about characters, pacing, ideas, or chapter critique...'
                  }
                  rows={2}
                  className="w-full bg-transparent border-none focus:outline-none resize-none text-xs text-[#1A1A1A] dark:text-[#ECE9E2] placeholder-[#8A8882] leading-relaxed"
                />

                <div className="flex items-center justify-between pt-1 border-t border-[#F0EFEB] dark:border-[#282824] text-[10px] text-[#8A8882]">
                  <span className="font-sans hidden xs:inline">
                    Enter to send • Shift+Enter for new line
                  </span>

                  <div className="flex items-center gap-1.5 ml-auto">
                    {isGenerating ? (
                      <button
                        id="ai-stop-btn"
                        onClick={handleStopGeneration}
                        className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                        title="Stop Generation"
                      >
                        <Square className="w-3 h-3 fill-current" />
                        <span>Stop</span>
                      </button>
                    ) : (
                      <button
                        id="ai-send-btn"
                        onClick={() => handleSendMessage()}
                        disabled={!inputPrompt.trim()}
                        className="p-1.5 rounded-sm bg-[#3A3A36] text-white dark:bg-[#ECE9E2] dark:text-[#1A1A1A] hover:bg-black dark:hover:bg-white disabled:opacity-30 cursor-pointer transition-colors"
                        title="Send Prompt"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ==================== TAB 2: TRANSLATOR ==================== */}
        {activeTab === 'translator' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            <div className="p-3 bg-white dark:bg-[#21211E] rounded-sm border border-[#E5E1D8] dark:border-[#2E2E2A] space-y-3">
              <div className="flex items-center justify-between">
                <span className="serif italic font-bold text-sm text-[#1A1A1A] dark:text-[#ECE9E2]">
                  Literary Translator
                </span>
                <span className="text-[10px] text-[#8A8882]">Multi-language prose</span>
              </div>

              {/* Language Pair Selectors */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#8A8882] block mb-1">
                    From
                  </label>
                  <select
                    value={sourceLang}
                    onChange={(e) => setSourceLang(e.target.value)}
                    className="w-full text-xs p-1.5 rounded-sm bg-[#F9F7F2] dark:bg-[#181816] border border-[#DCD8CF] dark:border-[#383834] text-[#1A1A1A] dark:text-[#ECE9E2] focus:outline-none"
                  >
                    <option value="Auto">Auto-detect</option>
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleSwapLanguages}
                  className="mt-4 p-1.5 rounded hover:bg-[#EBE8E0] dark:hover:bg-[#282824] text-[#8A8882] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] cursor-pointer"
                  title="Swap languages"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                </button>

                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#8A8882] block mb-1">
                    To
                  </label>
                  <select
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="w-full text-xs p-1.5 rounded-sm bg-[#F9F7F2] dark:bg-[#181816] border border-[#DCD8CF] dark:border-[#383834] text-[#1A1A1A] dark:text-[#ECE9E2] focus:outline-none"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Source Textarea */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#8A8882]">
                    Input Text
                  </label>
                  {selectedText && (
                    <button
                      onClick={() => setTransSourceText(selectedText)}
                      className="text-[10px] text-[#C5A059] hover:underline cursor-pointer"
                    >
                      Import Selection
                    </button>
                  )}
                </div>
                <textarea
                  value={transSourceText}
                  onChange={(e) => setTransSourceText(e.target.value)}
                  rows={4}
                  placeholder="Enter text or paste a passage in Hindi, English, etc..."
                  className="w-full text-xs p-2.5 rounded-sm bg-[#F9F7F2] dark:bg-[#181816] border border-[#DCD8CF] dark:border-[#383834] text-[#1A1A1A] dark:text-[#ECE9E2] focus:outline-none resize-none leading-relaxed"
                />
              </div>

              <button
                onClick={handleExecuteTranslation}
                disabled={isTranslating || !transSourceText.trim()}
                className="w-full py-2 rounded-sm bg-[#3A3A36] text-white dark:bg-[#ECE9E2] dark:text-[#1A1A1A] hover:bg-black dark:hover:bg-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 shadow-xs"
              >
                {isTranslating ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white dark:border-black/30 dark:border-t-black rounded-full animate-spin" />
                    <span>Translating...</span>
                  </>
                ) : (
                  <>
                    <Languages className="w-3.5 h-3.5" />
                    <span>Translate</span>
                  </>
                )}
              </button>
            </div>

            {/* Translation Result Card */}
            {transResultText && (
              <div className="p-3 bg-white dark:bg-[#21211E] rounded-sm border border-[#E5E1D8] dark:border-[#2E2E2A] space-y-2 animate-in fade-in duration-150">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#8A8882]">
                  <span>Translation ({targetLang})</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleCopyTranslation}
                      className="p-1 hover:bg-[#EBE8E0] dark:hover:bg-[#282824] rounded text-[#3A3A36] dark:text-[#ECE9E2] flex items-center gap-1 cursor-pointer"
                      title="Copy Translation"
                    >
                      {transCopied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{transCopied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-[#FAF9F5] dark:bg-[#181816] rounded-sm border border-[#E5E1D8] dark:border-[#2E2E2A] text-xs leading-relaxed font-serif italic text-[#1A1A1A] dark:text-[#ECE9E2] whitespace-pre-wrap">
                  {transResultText}
                </div>

                {/* Option to apply to editor */}
                <div className="pt-2 flex items-center justify-end">
                  <button
                    onClick={handleApplyTranslationToEditor}
                    className="px-3 py-1.5 rounded-sm bg-[#3A3A36] text-white dark:bg-[#ECE9E2] dark:text-[#1A1A1A] hover:bg-black dark:hover:bg-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    {transApplied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Applied to Editor</span>
                      </>
                    ) : (
                      <>
                        <CornerDownLeft className="w-3.5 h-3.5" />
                        <span>Insert / Replace Selection</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 3: WRITING PROMPTS & INSPIRATION ==================== */}
        {activeTab === 'prompts' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            <div className="p-3 bg-white dark:bg-[#21211E] rounded-sm border border-[#E5E1D8] dark:border-[#2E2E2A]">
              <h4 className="serif italic font-bold text-sm text-[#1A1A1A] dark:text-[#ECE9E2] mb-1">
                Narrative Inspirations
              </h4>
              <p className="text-[11px] text-[#8A8882] dark:text-[#9E9B95] leading-relaxed">
                Click any craft prompt below to instantly brainstorm with Gemini based on{' '}
                <strong className="text-[#1A1A1A] dark:text-[#ECE9E2]">
                  Chapter {currentChapterNumber}
                </strong>
                .
              </p>
            </div>

            {INSPIRATION_PROMPTS.map((cat, idx) => (
              <div key={idx} className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#8A8882] px-1">
                  {cat.category}
                </div>
                <div className="space-y-1.5">
                  {cat.prompts.map((promptText, pIdx) => (
                    <button
                      key={pIdx}
                      onClick={() => {
                        setActiveTab('chat');
                        handleSendMessage(promptText);
                      }}
                      className="w-full text-left p-2.5 rounded-sm bg-white dark:bg-[#21211E] border border-[#E5E1D8] dark:border-[#2E2E2A] hover:border-[#3A3A36] dark:hover:border-[#ECE9E2] text-[#3A3A36] dark:text-[#ECE9E2] hover:bg-[#FAF9F5] dark:hover:bg-[#282824] transition-all cursor-pointer font-serif italic text-xs leading-relaxed group flex items-start justify-between gap-2"
                    >
                      <span>"{promptText}"</span>
                      <Sparkles className="w-3.5 h-3.5 text-[#C5A059] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>
    </>
  );
};

/**
 * Helper to render formatted text with basic bold, italic, code formatting
 */
function renderFormattedMessage(content: string) {
  // Hide raw <<<SUGGESTION>>> blocks from the plain chat stream since they are rendered as cards
  const cleaned = content.replace(/<<<SUGGESTION>>>[\s\S]*?<<<END_SUGGESTION>>>/g, '').trim();
  if (!cleaned) return null;

  // Split paragraphs
  const paragraphs = cleaned.split('\n\n');
  return paragraphs.map((p, pIdx) => {
    // Check if bullet point
    if (p.startsWith('- ') || p.startsWith('* ')) {
      const items = p.split('\n').filter(Boolean);
      return (
        <ul key={pIdx} className="list-disc pl-4 space-y-1">
          {items.map((item, iIdx) => (
            <li key={iIdx}>{formatInline(item.replace(/^[-*]\s+/, ''))}</li>
          ))}
        </ul>
      );
    }
    return <p key={pIdx}>{formatInline(p)}</p>;
  });
}

function formatInline(text: string) {
  // Simple bold and italic replacers
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-bold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index} className="italic font-serif">{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="bg-[#EBE8E0] dark:bg-[#2E2E2A] px-1 py-0.5 rounded font-mono text-[10px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
