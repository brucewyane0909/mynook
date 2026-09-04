import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Trash2, RefreshCw, Loader2, Image as ImageIcon, BookCheck, AlertCircle } from 'lucide-react';
import { Book } from '../types';
import { uploadCoverToCloudinary } from '../services/cloudinary';

interface AddBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (bookData: {
    title: string;
    author: string;
    description: string;
    frontCoverUrl: string;
    backCoverUrl: string;
    genre: string;
  }) => Promise<void>;
  initialBook?: Book | null;
}

export const AddBookModal: React.FC<AddBookModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialBook,
}) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState('');

  // Front cover state
  const [frontCoverUrl, setFrontCoverUrl] = useState('');
  const [frontCoverPreview, setFrontCoverPreview] = useState<string | null>(null);
  const [isUploadingFront, setIsUploadingFront] = useState(false);
  const frontInputRef = useRef<HTMLInputElement>(null);

  // Back cover state
  const [backCoverUrl, setBackCoverUrl] = useState('');
  const [backCoverPreview, setBackCoverPreview] = useState<string | null>(null);
  const [isUploadingBack, setIsUploadingBack] = useState(false);
  const backInputRef = useRef<HTMLInputElement>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialBook) {
      setTitle(initialBook.title || '');
      setAuthor(initialBook.author || '');
      setDescription(initialBook.description || '');
      setGenre(initialBook.genre || '');
      setFrontCoverUrl(initialBook.frontCoverUrl || '');
      setFrontCoverPreview(initialBook.frontCoverUrl || null);
      setBackCoverUrl(initialBook.backCoverUrl || '');
      setBackCoverPreview(initialBook.backCoverUrl || null);
    } else {
      setTitle('');
      setAuthor('');
      setDescription('');
      setGenre('');
      setFrontCoverUrl('');
      setFrontCoverPreview(null);
      setBackCoverUrl('');
      setBackCoverPreview(null);
    }
    setErrorMsg(null);
  }, [initialBook, isOpen]);

  if (!isOpen) return null;

  // Handle Front Cover File Selection & Upload
  const handleFrontFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    // Instant local preview
    const localUrl = URL.createObjectURL(file);
    setFrontCoverPreview(localUrl);
    setIsUploadingFront(true);

    try {
      const imageUrl = await uploadCoverToCloudinary(file);
      setFrontCoverUrl(imageUrl);
      setFrontCoverPreview(imageUrl);
    } catch (err: any) {
      console.error('Front cover upload error:', err);
      setErrorMsg(err.message || 'Unable to upload front cover. Please try again.');
      setFrontCoverPreview(frontCoverUrl || null);
    } finally {
      setIsUploadingFront(false);
      if (frontInputRef.current) frontInputRef.current.value = '';
    }
  };

  // Handle Back Cover File Selection & Upload
  const handleBackFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    // Instant local preview
    const localUrl = URL.createObjectURL(file);
    setBackCoverPreview(localUrl);
    setIsUploadingBack(true);

    try {
      const imageUrl = await uploadCoverToCloudinary(file);
      setBackCoverUrl(imageUrl);
      setBackCoverPreview(imageUrl);
    } catch (err: any) {
      console.error('Back cover upload error:', err);
      setErrorMsg(err.message || 'Unable to upload back cover. Please try again.');
      setBackCoverPreview(backCoverUrl || null);
    } finally {
      setIsUploadingBack(false);
      if (backInputRef.current) backInputRef.current.value = '';
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Please enter a book title to continue.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await onSubmit({
        title: title.trim(),
        author: author.trim(),
        description: description.trim(),
        genre: genre.trim(),
        frontCoverUrl,
        backCoverUrl,
      });
      onClose();
    } catch (err: any) {
      console.error('Book submission error:', err);
      setErrorMsg(err.message || 'Unable to save book. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="add-book-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
    >
      <div
        id="add-book-modal-card"
        className="w-full max-w-2xl bg-[#F9F7F2] dark:bg-[#21211E] rounded-sm shadow-2xl border border-[#E5E1D8] dark:border-[#2E2E2A] overflow-hidden my-8"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E1D8] dark:border-[#2E2E2A]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-sm bg-[#EBE8E0] dark:bg-[#282824] text-[#3A3A36] dark:text-[#ECE9E2] flex items-center justify-center">
              <BookCheck className="w-4 h-4" />
            </div>
            <h2 className="text-lg serif italic font-bold text-[#1A1A1A] dark:text-[#ECE9E2]">
              {initialBook ? 'Edit Book Details' : 'Create New Book Project'}
            </h2>
          </div>
          <button
            id="modal-close-btn"
            onClick={onClose}
            className="p-1.5 rounded-sm text-[#8A8882] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] hover:bg-[#EBE8E0] dark:hover:bg-[#282824] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error notification banner */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 flex items-center gap-2.5 text-red-700 dark:text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="p-6 space-y-5">
          {/* Book Title */}
          <div>
            <label className="block text-[10px] font-bold text-[#8A8882] dark:text-[#9E9B95] uppercase tracking-widest mb-1.5">
              Book Title <span className="text-red-500">*</span>
            </label>
            <input
              id="book-title-input"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter your book title"
              className="w-full px-4 py-2.5 rounded-sm bg-white dark:bg-[#181816] text-[#1A1A1A] dark:text-[#ECE9E2] placeholder-[#8A8882] border border-[#E5E1D8] dark:border-[#2E2E2A] focus:outline-none focus:border-[#3A3A36] dark:focus:border-[#ECE9E2] text-base font-serif"
            />
          </div>

          {/* Author & Genre Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-[#8A8882] dark:text-[#9E9B95] uppercase tracking-widest mb-1.5">
                Author Name
              </label>
              <input
                id="book-author-input"
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Author / Pen Name (optional)"
                className="w-full px-4 py-2 text-sm rounded-sm bg-white dark:bg-[#181816] text-[#1A1A1A] dark:text-[#ECE9E2] placeholder-[#8A8882] border border-[#E5E1D8] dark:border-[#2E2E2A] focus:outline-none focus:border-[#3A3A36] dark:focus:border-[#ECE9E2]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#8A8882] dark:text-[#9E9B95] uppercase tracking-widest mb-1.5">
                Genre / Category
              </label>
              <input
                id="book-genre-input"
                type="text"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="Fiction, Fantasy, Memoir, etc."
                className="w-full px-4 py-2 text-sm rounded-sm bg-white dark:bg-[#181816] text-[#1A1A1A] dark:text-[#ECE9E2] placeholder-[#8A8882] border border-[#E5E1D8] dark:border-[#2E2E2A] focus:outline-none focus:border-[#3A3A36] dark:focus:border-[#ECE9E2]"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-bold text-[#8A8882] dark:text-[#9E9B95] uppercase tracking-widest mb-1.5">
              Synopsis / Description
            </label>
            <textarea
              id="book-description-input"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this book about? Outline the premise or theme..."
              className="w-full px-4 py-2 text-sm rounded-sm bg-white dark:bg-[#181816] text-[#1A1A1A] dark:text-[#ECE9E2] placeholder-[#8A8882] border border-[#E5E1D8] dark:border-[#2E2E2A] focus:outline-none focus:border-[#3A3A36] dark:focus:border-[#ECE9E2] resize-none"
            />
          </div>

          {/* Cover Management Section */}
          <div className="pt-2 border-t border-[#E5E1D8] dark:border-[#2E2E2A]">
            <h3 className="text-[10px] font-bold text-[#8A8882] dark:text-[#9E9B95] uppercase tracking-widest mb-3">
              Book Covers (Cloud Storage)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Front Cover Card */}
              <div className="p-4 rounded-sm border border-[#E5E1D8] dark:border-[#2E2E2A] bg-white dark:bg-[#181816] flex flex-col items-center">
                <span className="text-xs font-serif italic text-[#6B6964] dark:text-[#A8A59E] mb-2">
                  Front Cover
                </span>

                <div className="w-28 h-40 rounded-sm overflow-hidden border border-[#DCD8CF] dark:border-[#353530] bg-[#E5E1D8] dark:bg-[#282824] flex items-center justify-center relative shadow-xs">
                  {frontCoverPreview ? (
                    <img
                      src={frontCoverPreview}
                      alt="Front Cover"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-[#8A8882] p-2 text-center">
                      <ImageIcon className="w-7 h-7 stroke-1 mb-1" />
                      <span className="text-[10px] uppercase font-bold tracking-wider">No cover</span>
                    </div>
                  )}

                  {isUploadingFront && (
                    <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center text-white p-2 text-center">
                      <Loader2 className="w-5 h-5 animate-spin mb-1 text-white" />
                      <span className="text-[9px] uppercase font-bold tracking-wider">Uploading...</span>
                    </div>
                  )}
                </div>

                <input
                  ref={frontInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFrontFileChange}
                  className="hidden"
                />

                <div className="flex items-center gap-2 mt-3 w-full">
                  {!frontCoverPreview ? (
                    <button
                      type="button"
                      id="upload-front-cover-btn"
                      onClick={() => frontInputRef.current?.click()}
                      disabled={isUploadingFront}
                      className="flex-1 py-1.5 px-3 rounded-sm text-[10px] font-bold uppercase tracking-widest bg-[#EBE8E0] dark:bg-[#282824] text-[#3A3A36] dark:text-[#ECE9E2] hover:bg-[#3A3A36] hover:text-white dark:hover:bg-[#ECE9E2] dark:hover:text-[#1A1A1A] flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Upload className="w-3 h-3" />
                      Upload Front
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        id="replace-front-cover-btn"
                        onClick={() => frontInputRef.current?.click()}
                        disabled={isUploadingFront}
                        className="flex-1 py-1.5 px-2 rounded-sm text-[10px] font-bold uppercase tracking-widest bg-[#EBE8E0] dark:bg-[#282824] text-[#3A3A36] dark:text-[#ECE9E2] hover:bg-[#3A3A36] hover:text-white flex items-center justify-center gap-1 transition-colors"
                        title="Replace Front Cover"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Replace
                      </button>
                      <button
                        type="button"
                        id="remove-front-cover-btn"
                        onClick={() => {
                          setFrontCoverUrl('');
                          setFrontCoverPreview(null);
                        }}
                        disabled={isUploadingFront}
                        className="py-1.5 px-2.5 rounded-sm text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 border border-red-200 dark:border-red-900/60 transition-colors"
                        title="Remove Front Cover"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Back Cover Card */}
              <div className="p-4 rounded-sm border border-[#E5E1D8] dark:border-[#2E2E2A] bg-white dark:bg-[#181816] flex flex-col items-center">
                <span className="text-xs font-serif italic text-[#6B6964] dark:text-[#A8A59E] mb-2">
                  Back Cover
                </span>

                <div className="w-28 h-40 rounded-sm overflow-hidden border border-[#DCD8CF] dark:border-[#353530] bg-[#E5E1D8] dark:bg-[#282824] flex items-center justify-center relative shadow-xs">
                  {backCoverPreview ? (
                    <img
                      src={backCoverPreview}
                      alt="Back Cover"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-[#8A8882] p-2 text-center">
                      <ImageIcon className="w-7 h-7 stroke-1 mb-1" />
                      <span className="text-[10px] uppercase font-bold tracking-wider">No cover</span>
                    </div>
                  )}

                  {isUploadingBack && (
                    <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center text-white p-2 text-center">
                      <Loader2 className="w-5 h-5 animate-spin mb-1 text-white" />
                      <span className="text-[9px] uppercase font-bold tracking-wider">Uploading...</span>
                    </div>
                  )}
                </div>

                <input
                  ref={backInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleBackFileChange}
                  className="hidden"
                />

                <div className="flex items-center gap-2 mt-3 w-full">
                  {!backCoverPreview ? (
                    <button
                      type="button"
                      id="upload-back-cover-btn"
                      onClick={() => backInputRef.current?.click()}
                      disabled={isUploadingBack}
                      className="flex-1 py-1.5 px-3 rounded-sm text-[10px] font-bold uppercase tracking-widest bg-[#EBE8E0] dark:bg-[#282824] text-[#3A3A36] dark:text-[#ECE9E2] hover:bg-[#3A3A36] hover:text-white dark:hover:bg-[#ECE9E2] dark:hover:text-[#1A1A1A] flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Upload className="w-3 h-3" />
                      Upload Back
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        id="replace-back-cover-btn"
                        onClick={() => backInputRef.current?.click()}
                        disabled={isUploadingBack}
                        className="flex-1 py-1.5 px-2 rounded-sm text-[10px] font-bold uppercase tracking-widest bg-[#EBE8E0] dark:bg-[#282824] text-[#3A3A36] dark:text-[#ECE9E2] hover:bg-[#3A3A36] hover:text-white flex items-center justify-center gap-1 transition-colors"
                        title="Replace Back Cover"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Replace
                      </button>
                      <button
                        type="button"
                        id="remove-back-cover-btn"
                        onClick={() => {
                          setBackCoverUrl('');
                          setBackCoverPreview(null);
                        }}
                        disabled={isUploadingBack}
                        className="py-1.5 px-2.5 rounded-sm text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 border border-red-200 dark:border-red-900/60 transition-colors"
                        title="Remove Back Cover"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E5E1D8] dark:border-[#2E2E2A]">
            <button
              type="button"
              id="cancel-book-btn"
              onClick={onClose}
              disabled={isSubmitting || isUploadingFront || isUploadingBack}
              className="px-4 py-2 rounded-sm text-[10px] font-bold uppercase tracking-widest text-[#8A8882] hover:text-[#1A1A1A] dark:hover:text-[#ECE9E2] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="save-book-btn"
              disabled={isSubmitting || isUploadingFront || isUploadingBack}
              className="px-5 py-2 rounded-sm text-[10px] font-bold uppercase tracking-widest bg-[#3A3A36] hover:bg-black dark:bg-[#ECE9E2] dark:hover:bg-white text-white dark:text-[#1A1A1A] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {initialBook ? 'Save Changes' : 'Create Book'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
