import JSZip from 'jszip';
import { Book, BookPage } from '../types';

/**
 * Fetch image and return as Uint8Array for binary zip embedding
 */
async function fetchImageBuffer(url: string): Promise<{ data: Uint8Array; mimeType: string } | null> {
  if (!url) return null;
  try {
    const resp = await fetch(url, { mode: 'cors' });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const mimeType = blob.type || (url.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
    return {
      data: new Uint8Array(arrayBuffer),
      mimeType,
    };
  } catch (err) {
    console.warn('Could not fetch image directly for EPUB, attempting canvas fallback:', err);
  }

  // Canvas fallback for images with restrictive CORS
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (!blob) return resolve(null);
          const reader = new FileReader();
          reader.onloadend = () => {
            if (reader.result instanceof ArrayBuffer) {
              resolve({
                data: new Uint8Array(reader.result),
                mimeType: 'image/jpeg',
              });
            } else {
              resolve(null);
            }
          };
          reader.readAsArrayBuffer(blob);
        }, 'image/jpeg', 0.9);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Clean & sanitize text for valid XHTML XML parsing
 */
function escapeXml(unsafe: string): string {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Converts rich text HTML content from contentEditable into valid XHTML fragments
 */
function sanitizeHtmlToXhtml(html: string): string {
  if (!html || !html.trim()) {
    return '<p>&#160;</p>';
  }

  // Parse using browser DOMParser to get well-formed tree
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild || doc.body;

  // If no elements, wrap plain text in paragraph
  if (root.children.length === 0) {
    const text = root.textContent?.trim() || '';
    return text ? `<p>${escapeXml(text)}</p>` : '<p>&#160;</p>';
  }

  // Serialize child nodes to clean XHTML
  const serializeNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeXml(node.nodeValue || '');
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      // Allowed tags in standard EPUB body
      const childContent = Array.from(el.childNodes).map(serializeNode).join('');

      switch (tag) {
        case 'p':
        case 'blockquote':
        case 'ul':
        case 'ol':
        case 'li':
        case 'em':
        case 'i':
        case 'strong':
        case 'b':
        case 'u':
        case 's':
        case 'strike':
          return `<${tag}>${childContent || '&#160;'}</${tag}>`;
        case 'h1':
          return `<h2>${childContent}</h2>`;
        case 'h2':
          return `<h3>${childContent}</h3>`;
        case 'h3':
          return `<h4>${childContent}</h4>`;
        case 'br':
          return '<br />';
        case 'hr':
          return '<hr />';
        case 'div':
          return `<p>${childContent || '&#160;'}</p>`;
        default:
          return childContent;
      }
    }

    return '';
  };

  const output = Array.from(root.childNodes)
    .map(serializeNode)
    .filter(Boolean)
    .join('\n');

  return output.trim() || '<p>&#160;</p>';
}

/**
 * Main export function for EPUB generation
 */
export async function exportBookToEpub(
  book: Book,
  pages: BookPage[],
  onProgress?: (status: string) => void
): Promise<void> {
  onProgress?.('Initializing EPUB package...');

  const zip = new JSZip();

  const title = book.title?.trim() || 'Untitled Book';
  const author = book.author?.trim() || 'MYNOOK Author';
  const description = book.description?.trim() || '';
  const language = 'en';
  const bookId = `urn:uuid:mynook-${(book.id || Date.now()).toString().replace(/[^a-zA-Z0-9-]/g, '-')}`;
  const modifiedDate = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const pubYear = new Date(book.createdAt || Date.now()).getFullYear();

  // 1. mimetype file MUST be uncompressed at the start of zip
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. META-INF/container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.file('META-INF/container.xml', containerXml);

  // 3. OEBPS/styles.css
  const stylesCss = `@charset "UTF-8";
@namespace epub "http://www.idpf.org/2007/ops";

body {
  font-family: "Georgia", "Times New Roman", "Baskerville", serif;
  font-size: 1.05em;
  line-height: 1.65;
  color: #1a1a1a;
  background-color: #ffffff;
  margin: 5%;
  padding: 0;
}

h1, h2, h3, h4 {
  font-family: "Georgia", "Times New Roman", serif;
  font-weight: bold;
  text-align: center;
  color: #111111;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}

h1.book-title {
  font-size: 2.2em;
  font-style: italic;
  margin-top: 20%;
  margin-bottom: 0.2em;
}

p.author-name {
  font-size: 1.2em;
  font-style: italic;
  color: #444444;
  text-align: center;
  margin-top: 0.5em;
  margin-bottom: 2em;
}

p.book-desc {
  font-size: 0.95em;
  color: #555555;
  text-align: center;
  max-width: 80%;
  margin: 1em auto;
  line-height: 1.6;
}

p.publisher-meta {
  font-size: 0.8em;
  color: #888888;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-top: 4em;
}

.chapter-header {
  text-align: center;
  margin-top: 15%;
  margin-bottom: 2.5em;
}

.chapter-number {
  font-size: 0.85em;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: #8a8882;
  margin-bottom: 0.3em;
}

.chapter-title {
  font-size: 1.8em;
  font-style: italic;
  font-weight: bold;
  margin-top: 0.2em;
  margin-bottom: 0.5em;
}

.chapter-divider {
  width: 48px;
  height: 1px;
  background: #c5a059;
  border: none;
  margin: 1.5em auto;
}

p {
  margin: 0 0 0.8em 0;
  text-align: justify;
  text-indent: 1.4em;
}

p.first-paragraph {
  text-indent: 0;
}

blockquote {
  font-style: italic;
  margin: 1.5em 2em;
  color: #555555;
}

ul, ol {
  margin: 1em 2em;
}

li {
  margin-bottom: 0.4em;
}

.cover-wrapper {
  text-align: center;
  padding: 0;
  margin: 0;
  height: 100%;
}

.cover-image {
  max-width: 100%;
  max-height: 100%;
  height: auto;
  display: block;
  margin: 0 auto;
}

nav#toc ol {
  list-style-type: none;
  padding-left: 0;
}

nav#toc li {
  margin: 0.8em 0;
}

nav#toc a {
  text-decoration: none;
  color: #1a1a1a;
  font-weight: 500;
}
`;
  zip.file('OEBPS/styles.css', stylesCss);

  // 4. Handle Cover Image
  onProgress?.('Processing cover artwork...');
  let coverImageFileName: string | null = null;
  let coverMediaType = 'image/jpeg';

  if (book.frontCoverUrl) {
    const coverBuffer = await fetchImageBuffer(book.frontCoverUrl);
    if (coverBuffer) {
      coverMediaType = coverBuffer.mimeType;
      const ext = coverMediaType === 'image/png' ? 'png' : 'jpg';
      coverImageFileName = `cover.${ext}`;
      zip.file(`OEBPS/images/${coverImageFileName}`, coverBuffer.data);
    }
  }

  // 5. Generate Title Page
  const titlePageXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}">
<head>
  <meta charset="utf-8" />
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css" />
</head>
<body epub:type="titlepage">
  <section class="titlepage">
    <h1 class="book-title">${escapeXml(title)}</h1>
    <p class="author-name">by ${escapeXml(author)}</p>
    ${description ? `<p class="book-desc">${escapeXml(description)}</p>` : ''}
    <p class="publisher-meta">MYNOOK PRESS &#8226; ${pubYear}</p>
  </section>
</body>
</html>`;
  zip.file('OEBPS/titlepage.xhtml', titlePageXhtml);

  // If cover image exists, create dedicated cover.xhtml
  if (coverImageFileName) {
    const coverXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}">
<head>
  <meta charset="utf-8" />
  <title>Cover - ${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css" />
</head>
<body epub:type="cover" style="margin: 0; padding: 0; text-align: center;">
  <div class="cover-wrapper">
    <img class="cover-image" src="images/${coverImageFileName}" alt="Cover Image" />
  </div>
</body>
</html>`;
    zip.file('OEBPS/cover.xhtml', coverXhtml);
  }

  // 6. Generate Chapters XHTML
  const manifestItems: { id: string; href: string; mediaType: string; properties?: string }[] = [
    { id: 'styles', href: 'styles.css', mediaType: 'text/css' },
    { id: 'titlepage', href: 'titlepage.xhtml', mediaType: 'application/xhtml+xml' },
  ];

  const spineItems: string[] = [];

  if (coverImageFileName) {
    manifestItems.unshift({
      id: 'cover-image',
      href: `images/${coverImageFileName}`,
      mediaType: coverMediaType,
      properties: 'cover-image',
    });
    manifestItems.splice(2, 0, {
      id: 'cover',
      href: 'cover.xhtml',
      mediaType: 'application/xhtml+xml',
    });
    spineItems.push('cover');
  }

  spineItems.push('titlepage');

  const tocNavList: { title: string; href: string }[] = [
    { title: 'Title Page', href: 'titlepage.xhtml' },
  ];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const chapterNum = i + 1;
    const chapterId = `chapter_${chapterNum}`;
    const chapterFileName = `${chapterId}.xhtml`;
    const chapterTitle = page.title?.trim() || `Chapter ${chapterNum}`;

    onProgress?.(`Formatting chapter ${chapterNum} of ${pages.length}: ${chapterTitle}...`);

    const sanitizedContent = sanitizeHtmlToXhtml(page.content);

    const chapterXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}">
<head>
  <meta charset="utf-8" />
  <title>${escapeXml(chapterTitle)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css" />
</head>
<body epub:type="bodymatter chapter">
  <section class="chapter">
    <header class="chapter-header">
      <p class="chapter-number">Chapter ${chapterNum}</p>
      <h1 class="chapter-title">${escapeXml(chapterTitle)}</h1>
      <hr class="chapter-divider" />
    </header>
    <div class="chapter-content">
      ${sanitizedContent}
    </div>
  </section>
</body>
</html>`;

    zip.file(`OEBPS/${chapterFileName}`, chapterXhtml);
    manifestItems.push({
      id: chapterId,
      href: chapterFileName,
      mediaType: 'application/xhtml+xml',
    });
    spineItems.push(chapterId);
    tocNavList.push({
      title: chapterTitle,
      href: chapterFileName,
    });
  }

  // 7. Navigation Document: OEBPS/nav.xhtml (EPUB 3 requirement)
  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}">
<head>
  <meta charset="utf-8" />
  <title>Table of Contents - ${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css" />
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
      ${tocNavList.map((item) => `<li><a href="${item.href}">${escapeXml(item.title)}</a></li>`).join('\n      ')}
    </ol>
  </nav>
</body>
</html>`;
  zip.file('OEBPS/nav.xhtml', navXhtml);
  manifestItems.push({
    id: 'nav',
    href: 'nav.xhtml',
    mediaType: 'application/xhtml+xml',
    properties: 'nav',
  });

  // 8. NCX Document: OEBPS/toc.ncx (EPUB 2 backward compatibility)
  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookId}" />
    <meta name="dtb:depth" content="1" />
    <meta name="dtb:totalPageCount" content="0" />
    <meta name="dtb:maxPageNumber" content="0" />
  </head>
  <docTitle>
    <text>${escapeXml(title)}</text>
  </docTitle>
  <docAuthor>
    <text>${escapeXml(author)}</text>
  </docAuthor>
  <navMap>
    ${tocNavList
      .map(
        (item, idx) => `
    <navPoint id="navpoint-${idx + 1}" playOrder="${idx + 1}">
      <navLabel>
        <text>${escapeXml(item.title)}</text>
      </navLabel>
      <content src="${item.href}" />
    </navPoint>`
      )
      .join('')}
  </navMap>
</ncx>`;
  zip.file('OEBPS/toc.ncx', tocNcx);
  manifestItems.push({
    id: 'ncx',
    href: 'toc.ncx',
    mediaType: 'application/x-dtbncx+xml',
  });

  // 9. Package Document: OEBPS/content.opf
  onProgress?.('Generating EPUB metadata and manifest...');
  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookID" xml:lang="${language}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookID">${bookId}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator id="creator">${escapeXml(author)}</dc:creator>
    <dc:language>${language}</dc:language>
    <dc:publisher>MYNOOK</dc:publisher>
    <dc:date>${new Date(book.createdAt || Date.now()).toISOString().split('T')[0]}</dc:date>
    <meta property="dcterms:modified">${modifiedDate}</meta>
    ${book.genre ? `<dc:subject>${escapeXml(book.genre)}</dc:subject>` : ''}
    ${description ? `<dc:description>${escapeXml(description)}</dc:description>` : ''}
    ${coverImageFileName ? '<meta name="cover" content="cover-image"/>' : ''}
  </metadata>
  <manifest>
    ${manifestItems
      .map(
        (item) =>
          `<item id="${item.id}" href="${item.href}" media-type="${item.mediaType}"${
            item.properties ? ` properties="${item.properties}"` : ''
          }/>`
      )
      .join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineItems.map((id) => `<itemref idref="${id}"/>`).join('\n    ')}
  </spine>
  <guide>
    <reference type="toc" title="Table of Contents" href="nav.xhtml"/>
    ${coverImageFileName ? '<reference type="cover" title="Cover" href="cover.xhtml"/>' : ''}
  </guide>
</package>`;
  zip.file('OEBPS/content.opf', contentOpf);

  // 10. Finalize ZIP & Trigger Download
  onProgress?.('Packaging and downloading EPUB ebook...');
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  const safeFilename = (title || 'My-Book').replace(/[^a-zA-Z0-9_-]/g, '_') + '.epub';

  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = safeFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
}
