import type { PDFDocument as PDFDocumentType } from 'pdf-lib';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_MARGIN = 18;

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
      import('pdf-lib'),
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
