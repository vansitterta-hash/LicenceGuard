export function assertRequiredDigitalDocumentMerged(input: { required: boolean; label: string; documentName: string; reason?: string }): void {
  if (input.required) throw new Error(`The required ${input.label} document "${input.documentName}" could not be included in the final application pack. ${input.reason ?? 'The document could not be merged.'}`);
}
