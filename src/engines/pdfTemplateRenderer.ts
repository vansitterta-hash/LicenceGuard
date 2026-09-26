import type { PDFFont } from 'pdf-lib';
import { getPdfTemplateLayout } from '../data/sapsPdfLayoutRegistry';
import { resolveDocumentField } from './documentEngine';
import type { DocumentEngineContext, DocumentTemplateDefinition } from '../types/documentEngine';
import type { DocumentLayoutElement } from '../types/documentLayout';

function splitText(value: string, font: PDFFont, size: number, maxWidth?: number, maxLines = 1): string[] {
  if (!maxWidth) return [value];
  const truncationMarker = '...';
  const truncateToWidth = (text: string, appendMarker = false): string => {
    if (!appendMarker && font.widthOfTextAtSize(text, size) <= maxWidth) return text;
    let truncatedText = text;
    while (
      truncatedText.length > 0
      && font.widthOfTextAtSize(`${truncatedText}${truncationMarker}`, size) > maxWidth
    ) {
      truncatedText = truncatedText.slice(0, -1);
    }
    return `${truncatedText}${truncationMarker}`;
  };
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  let truncated = false;

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = '';
      if (lines.length >= maxLines) {
        truncated = true;
        break;
      }
    }
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      current = truncateToWidth(word, true);
      truncated = true;
      break;
    }
    current = word;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === 0) lines.push(value);

  if (!truncated && lines.join(' ').length < value.trim().length) truncated = true;
  if (truncated && lines.length > 0 && !lines[lines.length - 1].endsWith(truncationMarker)) {
    lines[lines.length - 1] = truncateToWidth(lines[lines.length - 1], true);
  }
  return lines;
}

function resolveElementValue(element: DocumentLayoutElement, context: DocumentEngineContext): string {
  const sourceValue = resolveDocumentField(element.fieldId, context);
  if (element.kind === 'CHECKBOX') return sourceValue === element.choiceValue ? element.mark ?? 'X' : '';
  return element.uppercase ? sourceValue.toUpperCase() : sourceValue;
}

export function getBoxCharacterPositions(element: DocumentLayoutElement): Array<{ x: number; width: number }> {
  if (element.kind !== 'BOXED_TEXT' || !element.boxCount || element.boxCount < 1) {
    throw new Error(`Boxed field ${element.id} must define a positive boxCount.`);
  }
  const separators = new Set(element.separatorAfter ?? []);
  const separatorWidth = element.separatorWidth ?? element.boxWidth;
  const totalSeparatorWidth = separators.size * (separatorWidth ?? 0);
  const boxWidth = element.boxWidth
    ?? (element.width ? (element.width - totalSeparatorWidth) / element.boxCount : 0);
  if (!(boxWidth > 0)) throw new Error(`Boxed field ${element.id} must define a usable boxWidth or width.`);

  const positions: Array<{ x: number; width: number }> = [];
  let x = element.x;
  for (let index = 0; index < element.boxCount; index++) {
    positions.push({ x, width: boxWidth });
    x += boxWidth;
    if (separators.has(index + 1)) x += separatorWidth ?? boxWidth;
  }
  return positions;
}

function boxedCharacters(value: string, element: DocumentLayoutElement): string[] {
  const normalised = element.characterSet === 'DIGITS'
    ? value.replace(/\D/g, '')
    : element.characterSet === 'ALPHANUMERIC'
      ? value.replace(/[^a-z0-9]/gi, '')
      : value.replace(/\s/g, '');
  const characters = Array.from(normalised);
  if (characters.length > (element.boxCount ?? 0)) {
    throw new Error(`${element.fieldId} exceeds the ${element.boxCount} configured character boxes.`);
  }
  return characters;
}

export async function renderOfficialPdfTemplate(input: {
  template: DocumentTemplateDefinition;
  context: DocumentEngineContext;
}): Promise<Uint8Array> {
  const layout = getPdfTemplateLayout(input.template.code);
  if (!layout) throw new Error(`Official PDF rendering is not configured for ${input.template.code}.`);

  const proxyUrl = `/api/saps-template?code=${encodeURIComponent(input.template.code)}`;
  const pinnedTemplateUrl = layout.sourceUrl.startsWith('/')
    ? layout.sourceUrl
    : null;
  let response = await fetch(pinnedTemplateUrl ?? proxyUrl);
  if (!response.ok && pinnedTemplateUrl) response = await fetch(proxyUrl);
  if (!response.ok) response = await fetch(layout.sourceUrl || input.template.sourceUrl);
  if (!response.ok) throw new Error(`Unable to download the official ${input.template.code} template. Check your connection and try again.`);

  // Avoid tslib 1.x's ESM default-import bridge, which fails under Metro Web.
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib/cjs/index.js');
  const pdf = await PDFDocument.load(await response.arrayBuffer());
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  if (pages.length < layout.pageCount) throw new Error(`${layout.id} expects ${layout.pageCount} pages, but the downloaded template has ${pages.length}.`);

  for (const element of layout.elements) {
    if (element.autofillPolicy === 'PROTECTED_OFFICIAL') continue;
    const page = pages[element.page - 1];
    if (!page) continue;
    if (
      element.conditionFieldId
      && resolveDocumentField(element.conditionFieldId, input.context) !== element.conditionValue
    ) continue;
    const value = resolveElementValue(element, input.context);
    if (!value) continue;
    const size = element.fontSize ?? 9;
    if (element.kind === 'BOXED_TEXT') {
      const positions = getBoxCharacterPositions(element);
      boxedCharacters(value, element).forEach((character, index) => {
        const textWidth = font.widthOfTextAtSize(character, size);
        page.drawText(character, {
          x: positions[index].x + Math.max(0, (positions[index].width - textWidth) / 2),
          y: element.y,
          size,
          font,
          color: rgb(0, 0, 0),
        });
      });
      continue;
    }
    const lines = splitText(value, font, size, element.width, element.maxLines ?? 1);
    if (element.fieldId.startsWith('applicant.declarations.') && element.kind === 'TEXT' && lines.join(' ') !== value.trim().replace(/\s+/g, ' ')) {
      throw new Error(`SAPS 271 declaration field ${element.fieldId} exceeds the available form space. Review the detail before generating; declaration text cannot be truncated.`);
    }
    const lineHeight = element.lineHeight ?? size + 1;

    lines.forEach((line, index) => {
      const textWidth = font.widthOfTextAtSize(line, size);
      const x = element.align === 'CENTER' && element.width
        ? element.x + Math.max(0, (element.width - textWidth) / 2)
        : element.align === 'RIGHT' && element.width
          ? element.x + Math.max(0, element.width - textWidth)
          : element.x;
      page.drawText(line, {
        x,
        y: element.y - index * lineHeight,
        size,
        font,
        color: rgb(0, 0, 0),
      });
    });
  }

  pdf.setTitle(`${input.template.code} - LicenceGuard completed application`);
  pdf.setAuthor('LicenceGuard');
  pdf.setSubject('Completed SAPS firearm application form - review before signature and submission');
  pdf.setProducer(`LicenceGuard Document Engine / ${layout.id}`);
  return pdf.save();
}

export function downloadPdf(bytes: Uint8Array, fileName: string): void {
  if (typeof window === 'undefined') throw new Error('PDF download is available on LicenceGuard Web.');
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  window.document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
