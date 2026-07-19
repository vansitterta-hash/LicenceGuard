import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getPdfTemplateLayout } from '../data/sapsPdfLayoutRegistry';
import { resolveDocumentField } from './documentEngine';
import type { DocumentEngineContext, DocumentTemplateDefinition } from '../types/documentEngine';

function fitText(value: string, maxWidth: number | undefined, size: number): string {
  if (!maxWidth) return value;
  const averageCharacterWidth = size * 0.52;
  const maxCharacters = Math.max(1, Math.floor(maxWidth / averageCharacterWidth));
  return value.length > maxCharacters ? value.slice(0, Math.max(1, maxCharacters - 1)) : value;
}

export async function renderOfficialPdfTemplate(input: {
  template: DocumentTemplateDefinition;
  context: DocumentEngineContext;
}): Promise<Uint8Array> {
  const layout = getPdfTemplateLayout(input.template.code);
  if (!layout) throw new Error(`Official PDF rendering is not configured for ${input.template.code}.`);

  const proxyUrl = `/api/saps-template?code=${encodeURIComponent(input.template.code)}`;
  let response = await fetch(proxyUrl);
  if (!response.ok) response = await fetch(input.template.sourceUrl);
  if (!response.ok) throw new Error(`Unable to download the official ${input.template.code} template. Check your connection and try again.`);
  const pdf = await PDFDocument.load(await response.arrayBuffer());
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();

  for (const binding of layout.bindings) {
    const page = pages[binding.page - 1];
    if (!page) continue;
    const sourceValue = resolveDocumentField(binding.fieldId, input.context);
    const matchesChoice = binding.choiceValue ? sourceValue === binding.choiceValue : true;
    const value = binding.mark ? (matchesChoice ? binding.mark : '') : sourceValue;
    if (!value) continue;
    const size = binding.size ?? 9;
    page.drawText(fitText(value, binding.maxWidth, size), {
      x: binding.x,
      y: binding.y,
      size,
      font,
      color: rgb(0, 0, 0),
      maxWidth: binding.maxWidth,
      lineHeight: size + 1,
    });
  }

  pdf.setTitle(`${input.template.code} - LicenceGuard completed application`);
  pdf.setAuthor('LicenceGuard');
  pdf.setSubject('Completed SAPS firearm application form - review before signature and submission');
  pdf.setProducer('LicenceGuard Document Engine');
  return pdf.save();
}

export function downloadPdf(bytes: Uint8Array, fileName: string): void {
  if (typeof window === 'undefined') throw new Error('PDF download is available on LicenceGuard Web.');
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
