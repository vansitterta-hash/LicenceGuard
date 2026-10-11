import type { PDFDocument as PDFDocumentType } from 'pdf-lib';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_MARGIN = 18;

/** Canonical Motivation only: measured text flow, never a scaled screenshot.
 * Retains canonical paragraph/table order, emphasis and section structure.
 * Other DOCX/pack conversion continues using renderDocxAsPdf unchanged.
 */
export async function renderCanonicalMotivationAsPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('The populated Motivation document is unavailable.');
  const dom = new DOMParser().parseFromString(xml, 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const body = dom.getElementsByTagNameNS(W, 'body')[0];
  if (!body) throw new Error('The Motivation document has no body.');
  const pdfLib = await import('pdf-lib/cjs/index.js');
  const pdf = await pdfLib.PDFDocument.create();
  const regular = await pdf.embedFont(pdfLib.StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(pdfLib.StandardFonts.TimesRomanBold);
  const margin = 50, bottom = 55, width = A4_WIDTH - margin * 2;
  const textOf = (node: Element): string => {
    let text = '';
    const walk = (n: Node) => {
      if (n.nodeType === 1 && (n as Element).localName === 't') text += n.textContent;
      else if (n.nodeType === 1 && (n as Element).localName === 'br') text += '\n';
      else for (const child of Array.from(n.childNodes)) walk(child);
    };
    walk(node);
    return text.replace(/\u00a0/g, ' ').trim();
  };
  const blocks: { text: string; bold: boolean; key?: string; cells?: string[] }[] = [];
  for (const child of Array.from(body.childNodes)) {
    if (child.nodeType !== 1) continue;
    const node = child as Element;
    if (node.localName === 'p') {
      const text = textOf(node);
      if (!text) continue;
      const bookmark = Array.from(node.getElementsByTagNameNS(W, 'bookmarkStart')).find(n => n.getAttribute('w:name')?.startsWith('lg_motivation_'));
      blocks.push({ text, bold: Boolean(node.getElementsByTagNameNS(W, 'b').length), key: bookmark?.getAttribute('w:name') ?? undefined });
    } else if (node.localName === 'tbl') {
      for (const row of Array.from(node.getElementsByTagNameNS(W, 'tr'))) {
        const cells = Array.from(row.getElementsByTagNameNS(W, 'tc')).map(textOf);
        blocks.push({ text: '', bold: false, cells });
      }
    }
  }
  type Line = { text: string; x: number; y: number; bold: boolean; size: number };
  const wrap = (text: string, maximum: number, emphasized: boolean): string[] => {
    const font = emphasized ? bold : regular;
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, 11) <= maximum) { line = next; continue; }
        if (line) lines.push(line);
        line = '';
        for (const character of word) {
          if (font.widthOfTextAtSize(line + character, 11) > maximum) { lines.push(line); line = ''; }
          line += character;
        }
      }
      if (line) lines.push(line);
    }
    return lines;
  };
  const layout = (known: Record<string, number>) => {
    const pages: Line[][] = [[]]; const headings: Record<string, number> = {};
    let y = A4_HEIGHT - margin;
    const newPage = () => { pages.push([]); y = A4_HEIGHT - margin; };
    const room = (height: number) => { if (y - height < bottom) newPage(); };
    for (const block of blocks) {
      if (block.cells) {
        const columnWidths = [45, width - 100, 55];
        const cells = block.cells.map((text, i) => wrap(text.startsWith('lg_motivation_') ? String(known[text] ?? 1) : text, columnWidths[i] - 8, false));
        const height = Math.max(...cells.map(lines => lines.length), 1) * 15 + 8;
        room(height);
        let x = margin;
        cells.forEach((lines, i) => { lines.forEach((text, row) => pages.at(-1)!.push({ text, x, y: y - row * 15, bold: false, size: 11 })); x += columnWidths[i]; });
        y -= height;
        continue;
      }
      if (block.text === 'INDEX' && pages.at(-1)!.length) newPage();
      // Keep a canonical section heading with the beginning of its content.
      room(block.key || block.bold ? 60 : 20);
      if (block.key) headings[block.key] = pages.length;
      const lines = wrap(block.text, width, block.bold);
      for (const text of lines) { room(15); pages.at(-1)!.push({ text, x: margin, y, bold: block.bold, size: 11 }); y -= 15; }
      y -= block.bold ? 10 : 6;
    }
    return { pages, headings };
  };
  let result = layout({});
  for (let attempt = 0; attempt < 5; attempt++) {
    const next = layout(result.headings);
    if (JSON.stringify(next.headings) === JSON.stringify(result.headings)) { result = next; break; }
    if (attempt === 4) throw new Error('Motivation index pagination did not stabilize.');
    result = next;
  }
  const indexKeys = blocks.flatMap(b => b.cells ?? []).filter(t => t.startsWith('lg_motivation_'));
  if (indexKeys.some(key => !result.headings[key])) throw new Error('A Motivation index entry has no corresponding section.');
  for (const [i, lines] of result.pages.entries()) {
    const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    for (const line of lines) page.drawText(line.text, { x: line.x, y: line.y, size: line.size, font: line.bold ? bold : regular });
    page.drawText(`Page ${i + 1} of ${result.pages.length}`, { x: margin, y: 28, size: 9, font: regular });
  }
  pdf.setTitle('Firearm licence motivation');
  pdf.setSubject(JSON.stringify({ sectionPages: result.headings, indexPages: Object.fromEntries(indexKeys.map(key => [key, result.headings[key]])), pageCount: result.pages.length }));
  return pdf.save();
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The browser could not capture a rendered DOCX page.');
  return new Uint8Array(await blob.arrayBuffer());
}

async function addRenderedPage(
  pdf: PDFDocumentType,
  element: HTMLElement,
  html2canvas: typeof import('html2canvas').default
): Promise<void> {
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    logging: false,
    scale: 2,
    useCORS: true,
  });
  if (canvas.width === 0 || canvas.height === 0) {
    throw new Error('The DOCX renderer produced an empty page.');
  }

  const image = await pdf.embedPng(await canvasToPngBytes(canvas));
  const availableWidth = A4_WIDTH - PAGE_MARGIN * 2;
  const availableHeight = A4_HEIGHT - PAGE_MARGIN * 2;
  const scale = Math.min(availableWidth / image.width, availableHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  page.drawImage(image, {
    x: (A4_WIDTH - width) / 2,
    y: (A4_HEIGHT - height) / 2,
    width,
    height,
  });
}

export async function renderDocxAsPdf(docxBytes: Uint8Array): Promise<Uint8Array> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('DOCX motivation conversion requires the LicenceGuard web browser.');
  }

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    left: '-100000px',
    position: 'fixed',
    top: '0',
    width: '900px',
    zIndex: '-1',
  });
  document.body.appendChild(host);

  try {
    const [{ renderAsync }, html2canvasModule, pdfLib] = await Promise.all([
      import('docx-preview'),
      import('html2canvas'),
      import('pdf-lib/cjs/index.js'),
    ]);
    await renderAsync(docxBytes.buffer as ArrayBuffer, host, undefined, {
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      inWrapper: true,
      renderChanges: false,
      renderComments: false,
      renderFooters: true,
      renderHeaders: true,
    });

    const renderedPages = Array.from(host.querySelectorAll<HTMLElement>('section.docx'));
    if (renderedPages.length === 0) {
      throw new Error('The DOCX renderer did not produce any printable pages.');
    }

    const pdf = await pdfLib.PDFDocument.create();
    for (const renderedPage of renderedPages) {
      await addRenderedPage(pdf, renderedPage, html2canvasModule.default);
    }
    return pdf.save();
  } finally {
    host.remove();
  }
}
