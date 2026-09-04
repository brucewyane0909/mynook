import { jsPDF } from 'jspdf';
import { Book, BookPage } from '../types';

/**
 * Loads an image URL as base64 Data URL.
 * Attempts direct load, then fallback to canvas.
 */
async function loadImgAsBase64(url: string): Promise<string | null> {
  if (!url) return null;

  const tryFetch = async (targetUrl: string): Promise<string | null> => {
    try {
      const resp = await fetch(targetUrl, { mode: 'cors' });
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  // 1. Direct fetch (supported with CORS headers on Cloudinary and modern CDNs)
  const dataUrl = await tryFetch(url);
  if (dataUrl) return dataUrl;

  // 2. Fallback to HTMLImageElement + canvas
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.9));
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Converts rich text / HTML editor content into clean readable text blocks
 */
function parseHtmlToBlocks(html: string): { type: 'heading' | 'paragraph'; text: string }[] {
  const div = document.createElement('div');
  div.innerHTML = html || '';

  const blocks: { type: 'heading' | 'paragraph'; text: string }[] = [];

  // If simple text with no elements
  if (!div.children.length) {
    const text = div.textContent?.trim();
    if (text) {
      blocks.push({ type: 'paragraph', text });
    }
    return blocks;
  }

  Array.from(div.children).forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const text = el.textContent?.trim() || '';
    if (!text) return;

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      blocks.push({ type: 'heading', text });
    } else {
      blocks.push({ type: 'paragraph', text });
    }
  });

  return blocks.length > 0 ? blocks : [{ type: 'paragraph', text: div.textContent || '' }];
}

export async function exportBookToPdf(
  book: Book,
  pages: BookPage[],
  onProgress?: (status: string) => void
): Promise<void> {
  onProgress?.('Preparing book layout and typography...');

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4', // 210 x 297 mm
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 25;
  const marginTop = 28;
  const marginBottom = 25;
  const contentWidth = pageWidth - marginX * 2;
  const maxContentY = pageHeight - marginBottom;

  let currentPdfPage = 1;

  // Helper: Draw running headers & footers
  const addPageDecorations = (pageNumber: number, runningTitle: string) => {
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(140, 140, 140);

    // Running Header (from page 3 onwards)
    if (pageNumber > 2) {
      doc.text(runningTitle, pageWidth / 2, 16, { align: 'center' });
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.2);
      doc.line(marginX, 19, pageWidth - marginX, 19);
    }

    // Running Footer (Page number)
    doc.text(`— ${pageNumber} —`, pageWidth / 2, pageHeight - 14, { align: 'center' });
  };

  // ==================== 1. FRONT COVER ====================
  onProgress?.('Rendering front cover...');

  let coverLoaded = false;
  if (book.frontCoverUrl) {
    const coverBase64 = await loadImgAsBase64(book.frontCoverUrl);
    if (coverBase64) {
      doc.addImage(coverBase64, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
      coverLoaded = true;
    }
  }

  // If no cover image or failed to load, render editorial book cover
  if (!coverLoaded) {
    // Rich midnight indigo cover background
    doc.setFillColor(24, 28, 38);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    // Subtle gold border
    doc.setDrawColor(197, 160, 89);
    doc.setLineWidth(1.2);
    doc.rect(15, 15, pageWidth - 30, pageHeight - 30);
    doc.setLineWidth(0.4);
    doc.rect(18, 18, pageWidth - 36, pageHeight - 36);

    // Ornament header
    doc.setTextColor(197, 160, 89);
    doc.setFont('times', 'bold');
    doc.setFontSize(11);
    doc.text('M Y N O O K   P R E S S', pageWidth / 2, 45, { align: 'center' });

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFont('times', 'bold');
    doc.setFontSize(28);
    const splitTitle = doc.splitTextToSize(book.title.toUpperCase(), contentWidth - 10);
    doc.text(splitTitle, pageWidth / 2, 115, { align: 'center' });

    // Accent line
    doc.setDrawColor(197, 160, 89);
    doc.setLineWidth(0.8);
    doc.line(pageWidth / 2 - 20, 138, pageWidth / 2 + 20, 138);

    // Author
    doc.setTextColor(220, 220, 220);
    doc.setFont('times', 'italic');
    doc.setFontSize(16);
    doc.text(book.author ? `by ${book.author}` : 'A Novel', pageWidth / 2, 152, { align: 'center' });

    // Description / Genre
    if (book.genre) {
      doc.setFont('times', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(180, 180, 180);
      doc.text(book.genre.toUpperCase(), pageWidth / 2, pageHeight - 45, { align: 'center' });
    }
  }

  // ==================== 2. TITLE & DEDICATION PAGE ====================
  doc.addPage();
  currentPdfPage++;

  doc.setFont('times', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(30, 30, 30);
  doc.text(book.title, pageWidth / 2, 85, { align: 'center' });

  if (book.author) {
    doc.setFont('times', 'italic');
    doc.setFontSize(14);
    doc.setTextColor(100, 100, 100);
    doc.text(`Written by ${book.author}`, pageWidth / 2, 102, { align: 'center' });
  }

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(pageWidth / 2 - 25, 115, pageWidth / 2 + 25, 115);

  if (book.description) {
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(90, 90, 90);
    const descLines = doc.splitTextToSize(book.description, 140);
    doc.text(descLines, pageWidth / 2, 130, { align: 'center' });
  }

  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text('Published with MYNOOK Book Studio', pageWidth / 2, pageHeight - 30, { align: 'center' });
  doc.text(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), pageWidth / 2, pageHeight - 25, { align: 'center' });

  // ==================== 3. TABLE OF CONTENTS ====================
  onProgress?.('Generating Table of Contents...');
  doc.addPage();
  currentPdfPage++;

  doc.setFont('times', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(30, 30, 30);
  doc.text('TABLE OF CONTENTS', pageWidth / 2, marginTop + 10, { align: 'center' });

  doc.setDrawColor(197, 160, 89);
  doc.setLineWidth(0.5);
  doc.line(pageWidth / 2 - 15, marginTop + 16, pageWidth / 2 + 15, marginTop + 16);

  let tocY = marginTop + 35;
  pages.forEach((p, idx) => {
    const chNumber = String(idx + 1).padStart(2, '0');
    doc.setFont('times', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    const titleText = `${chNumber}.  ${p.title}`;
    doc.text(titleText, marginX, tocY);

    // Dot leader
    doc.setFont('times', 'normal');
    doc.setTextColor(180, 180, 180);
    doc.text('. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .', marginX + 85, tocY);

    tocY += 10;
  });

  addPageDecorations(currentPdfPage, book.title);

  // ==================== 4. CHAPTERS & PAGES ====================
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    onProgress?.(`Composing chapter ${i + 1} of ${pages.length}: ${page.title}...`);

    doc.addPage();
    currentPdfPage++;

    let cursorY = marginTop + 15;

    // Chapter Header
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(160, 140, 100);
    doc.text(`CHAPTER ${i + 1}`, pageWidth / 2, cursorY, { align: 'center' });
    cursorY += 8;

    // Chapter Title
    doc.setFont('times', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(25, 25, 25);
    const splitChapterTitle = doc.splitTextToSize(page.title, contentWidth);
    doc.text(splitChapterTitle, pageWidth / 2, cursorY, { align: 'center' });
    cursorY += splitChapterTitle.length * 8 + 8;

    // Small divider
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.3);
    doc.line(pageWidth / 2 - 15, cursorY, pageWidth / 2 + 15, cursorY);
    cursorY += 12;

    // Content blocks
    const blocks = parseHtmlToBlocks(page.content);

    for (const block of blocks) {
      if (block.type === 'heading') {
        doc.setFont('times', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(40, 40, 40);
        cursorY += 4;
      } else {
        doc.setFont('times', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(45, 45, 45);
      }

      const lines = doc.splitTextToSize(block.text, contentWidth);
      const lineHeight = block.type === 'heading' ? 6.5 : 5.8;

      for (const line of lines) {
        if (cursorY + lineHeight > maxContentY) {
          addPageDecorations(currentPdfPage, `${book.title} — ${page.title}`);
          doc.addPage();
          currentPdfPage++;
          cursorY = marginTop;
          doc.setFont('times', 'normal');
          doc.setFontSize(11);
          doc.setTextColor(45, 45, 45);
        }

        doc.text(line, marginX, cursorY);
        cursorY += lineHeight;
      }

      // Paragraph spacing
      cursorY += 3.5;
    }

    addPageDecorations(currentPdfPage, `${book.title} — ${page.title}`);
  }

  // ==================== 5. BACK COVER ====================
  if (book.backCoverUrl) {
    onProgress?.('Adding back cover...');
    doc.addPage();
    currentPdfPage++;

    const backCoverBase64 = await loadImgAsBase64(book.backCoverUrl);
    if (backCoverBase64) {
      doc.addImage(backCoverBase64, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
    } else {
      // Styled back cover
      doc.setFillColor(24, 28, 38);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('times', 'bold');
      doc.setFontSize(18);
      doc.text(book.title, pageWidth / 2, 80, { align: 'center' });

      if (book.description) {
        doc.setFont('times', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(210, 210, 210);
        const desc = doc.splitTextToSize(book.description, 140);
        doc.text(desc, pageWidth / 2, 105, { align: 'center' });
      }

      doc.setFont('times', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(170, 170, 170);
      doc.text('Crafted with MYNOOK', pageWidth / 2, pageHeight - 35, { align: 'center' });
    }
  }

  onProgress?.('Finalizing and downloading PDF...');
  const safeFilename = (book.title || 'My-Book').replace(/[^a-zA-Z0-9_-]/g, '_') + '.pdf';
  doc.save(safeFilename);
}
