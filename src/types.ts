export interface Book {
  id: string;
  title: string;
  author: string;
  description: string;
  frontCoverUrl: string;
  frontCoverPublicId?: string;
  backCoverUrl: string;
  backCoverPublicId?: string;
  createdAt: number;
  updatedAt: number;
  pageCount: number;
  ownerId?: string;
  genre?: string;
  templateId?: string;
}

export type ExportFormat = 'pdf' | 'epub';

export interface BookPage {
  id: string;
  bookId: string;
  title: string;
  content: string;
  pageNumber: number;
  createdAt: number;
  updatedAt: number;
}

export interface LiveSessionState {
  title: string;
  content: string;
  updatedAt: number;
  authorId?: string;
}

export type SyncStatus = 'saved' | 'saving' | 'syncing' | 'synced' | 'offline' | 'error';

export type EditorFont = 'serif' | 'sans';
export type EditorFontSize = 'sm' | 'md' | 'lg' | 'xl';
