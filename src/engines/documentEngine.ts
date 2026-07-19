import { getDocumentFieldDefinition } from '../data/documentFieldRegistry';
import type { DocumentEngineContext, DocumentFieldDefinition, DocumentTemplateDefinition, ResolvedDocument } from '../types/documentEngine';

function readPath(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, root);
}

function normalise(value: unknown, field: DocumentFieldDefinition): string {
  let result = value == null ? '' : String(value);
  switch (field.normalise) {
    case 'UPPERCASE': result = result.trim().toUpperCase(); break;
    case 'DIGITS_ONLY': result = result.replace(/\D/g, ''); break;
    case 'SECTION_NUMBER': result = result.replace(/\D/g, ''); break;
    case 'TRIM': result = result.trim(); break;
  }
  return result;
}

export function resolveDocumentField(fieldId: DocumentFieldDefinition['id'], context: DocumentEngineContext): string {
  const definition = getDocumentFieldDefinition(fieldId);
  return normalise(readPath({ data: context.data, review: context.reviewValues }, definition.sourcePath), definition);
}

export function resolveDocumentTemplate(template: DocumentTemplateDefinition, context: DocumentEngineContext): ResolvedDocument {
  const fields = template.bindings.map((binding) => {
    let value = resolveDocumentField(binding.fieldId, context);
    if (binding.choiceValue) {
      value = value === binding.choiceValue ? 'X' : '';
    }
    return { ...binding, value, valid: !binding.required || Boolean(value) };
  });
  const sectionNames = Array.from(new Set(fields.map((field) => field.section)));
  const sections = sectionNames.map((title) => ({ title, fields: fields.filter((field) => field.section === title) }));
  const missingRequiredFieldCount = fields.filter((field) => !field.valid).length;
  return {
    template,
    sections,
    mappedFieldCount: fields.filter((field) => Boolean(field.value)).length,
    missingRequiredFieldCount,
    isComplete: missingRequiredFieldCount === 0,
  };
}
