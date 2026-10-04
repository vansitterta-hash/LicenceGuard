import type { DocumentFieldDefinition, DocumentFieldId } from '../types/documentEngine';
import type { DocumentLayoutElement } from '../types/documentLayout';
import type { SapsTemplateField } from '../types/sapsTemplate';
import { DECLARATION_QUESTIONS, DECLARATION_DETAIL_LABELS } from '../utils/saps271Declarations';
import { SAPS517_ADDITIONAL_DECLARATIONS } from '../utils/saps517Applicant';

export const SAPS271_DECLARATION_FIELDS: DocumentFieldDefinition[] = [];
for (const question of DECLARATION_QUESTIONS) {
  const answerId = `applicant.declarations.${question.key}.answer` as DocumentFieldId;
  const source = `data.saps271Declarations.answers.${question.key}`;
  SAPS271_DECLARATION_FIELDS.push({ id: answerId, label: question.label, dataType: 'CHOICE', sourcePath: `${source}.answer`, normalise: 'TRIM' });
  for (let index = 0; index < 2; index++) {
    for (const detail of question.details) {
      SAPS271_DECLARATION_FIELDS.push({
        id: `applicant.declarations.${question.key}.${index}.${detail}` as DocumentFieldId,
        label: `${question.label}, incident ${index + 1}: ${DECLARATION_DETAIL_LABELS[detail]}`,
        dataType: detail === 'dateFrom' ? 'DATE' : 'TEXT',
        sourcePath: `${source}.incidents.${index}.${detail}`,
        normalise: 'TRIM',
      });
    }
  }
}

type SharedDeclarationPosition = {
  answer: { page: number; y: number };
  records: Array<{ page: number; y: number }>;
};

export function createSharedDeclarationTemplateFields(section: string, questionNumbers: number[]): SapsTemplateField[] {
  const fields: SapsTemplateField[] = [];
  for (const [questionIndex, question] of DECLARATION_QUESTIONS.entries()) {
    const number = questionNumbers[questionIndex];
    const answerId = `applicant.declarations.${question.key}.answer` as SapsTemplateField['key'];
    fields.push({ key: answerId, label: `${number}: ${question.label}`, section, required: true });
    for (let index = 0; index < 2; index++) {
      for (const detail of question.details) {
        fields.push({
          key: `applicant.declarations.${question.key}.${index}.${detail}` as SapsTemplateField['key'],
          label: `${number}, incident ${index + 1}: ${DECLARATION_DETAIL_LABELS[detail]}`,
          section,
          required: false,
        });
      }
    }
  }
  return fields;
}

export function createSharedDeclarationElements(input: {
  prefix: string;
  positions: SharedDeclarationPosition[];
  rowHeight: number;
  yesX?: number;
  noX?: number;
}): DocumentLayoutElement[] {
  const elements: DocumentLayoutElement[] = [];
  for (const [questionIndex, question] of DECLARATION_QUESTIONS.entries()) {
    const answerId = `applicant.declarations.${question.key}.answer` as DocumentFieldId;
    const position = input.positions[questionIndex];
    for (const answer of ['YES', 'NO']) {
      elements.push({
        id: `${input.prefix}-${question.key}-${answer.toLowerCase()}`,
        kind: 'CHECKBOX',
        fieldId: answerId,
        page: position.answer.page,
        x: answer === 'YES' ? input.yesX ?? 128 : input.noX ?? 224,
        y: position.answer.y,
        fontSize: 9,
        choiceValue: answer,
      });
    }
    for (const [index, record] of position.records.entries()) {
      for (const detail of question.details) {
        const id = `applicant.declarations.${question.key}.${index}.${detail}` as DocumentFieldId;
        const right = detail === 'caseNumber' || detail === 'period' || (detail === 'outcome' && ['negligence', 'confiscation'].includes(question.key));
        const row = detail === 'policeStation' || detail === 'caseNumber'
          ? 0
          : ['firearmDetails', 'dateFrom', 'period'].includes(detail) || (detail === 'outcome' && question.key === 'convictions')
            ? 2
            : 1;
        elements.push({
          id: `${input.prefix}-${question.key}-${index}-${detail}`,
          kind: 'TEXT',
          fieldId: id,
          page: record.page,
          x: right ? 430 : 144,
          y: Number((record.y - row * input.rowHeight).toFixed(1)),
          width: right ? 128 : detail === 'policeStation' || (row === 1 && ['negligence', 'confiscation'].includes(question.key)) || detail === 'dateFrom' ? 185 : 414,
          fontSize: 8,
          conditionFieldId: answerId,
          conditionValue: 'YES',
        });
      }
    }
  }
  return elements;
}

export const SAPS271_DECLARATION_TEMPLATE_FIELDS = createSharedDeclarationTemplateFields('SAPS 271 Background & Declarations', [62, 63, 64, 65, 66, 67]);
export const SAPS271_DECLARATION_ELEMENTS = createSharedDeclarationElements({
  prefix: 's271',
  positions: [
    { answer: { page: 8, y: 771.2 }, records: [{ page: 8, y: 753.8 }, { page: 8, y: 701.6 }] },
    { answer: { page: 8, y: 623.5 }, records: [{ page: 8, y: 606.1 }, { page: 8, y: 571.3 }] },
    { answer: { page: 8, y: 510.5 }, records: [{ page: 8, y: 493.1 }, { page: 8, y: 440.9 }] },
    { answer: { page: 8, y: 362.9 }, records: [{ page: 8, y: 345.5 }, { page: 8, y: 310.7 }] },
    { answer: { page: 8, y: 250 }, records: [{ page: 8, y: 232.6 }, { page: 8, y: 180.4 }] },
    { answer: { page: 8, y: 102.2 }, records: [{ page: 8, y: 84.8 }, { page: 9, y: 800.6 }] },
  ],
  rowHeight: 17.4,
});

export const SAPS517_DECLARATION_TEMPLATE_FIELDS = createSharedDeclarationTemplateFields('SAPS 517 Background Questionnaire', [5, 6, 7, 8, 9, 10]);
for (const question of SAPS517_ADDITIONAL_DECLARATIONS) {
  SAPS517_DECLARATION_TEMPLATE_FIELDS.push(
    { key: `applicant.saps517.declarations.${question.key}.answer` as SapsTemplateField['key'], label: `H${question.number}: ${question.label}`, section: 'SAPS 517 Applicant Declarations', required: true },
    { key: `applicant.saps517.declarations.${question.key}.details` as SapsTemplateField['key'], label: `H${question.number}: Details`, section: 'SAPS 517 Applicant Declarations', required: false },
  );
}

export const SAPS517_ADDITIONAL_DECLARATION_ELEMENTS: DocumentLayoutElement[] = [
  ...SAPS517_ADDITIONAL_DECLARATIONS.map((question, index) => {
    const page = question.number === 11 ? 4 : 5;
    const yesY = question.number === 11 ? 107.34 : [772.8, 699.24, 625.68, 552.12, 488.16][question.number - 12];
    const detailsY = question.number === 11 ? 88.8 : yesY - 18;
    const answerId = `applicant.saps517.declarations.${question.key}.answer` as DocumentFieldId;
    return [
      { id: `s517-h${question.number}-yes`, kind: 'CHECKBOX' as const, fieldId: answerId, page, x: 128, y: yesY, fontSize: 9, choiceValue: 'YES', mark: 'X' },
      { id: `s517-h${question.number}-no`, kind: 'CHECKBOX' as const, fieldId: answerId, page, x: 224, y: yesY, fontSize: 9, choiceValue: 'NO', mark: 'X' },
      { id: `s517-h${question.number}-details`, kind: 'TEXT' as const, fieldId: `applicant.saps517.declarations.${question.key}.details` as DocumentFieldId, page, x: 126, y: detailsY, width: 430, fontSize: 7, maxLines: 1 },
    ];
  }).flat(),
];

export const SAPS517_DECLARATION_ELEMENTS = createSharedDeclarationElements({
  prefix: 's517',
  positions: [
    { answer: { page: 3, y: 234 }, records: [{ page: 3, y: 216 }, { page: 3, y: 162 }] },
    { answer: { page: 4, y: 780 }, records: [{ page: 4, y: 762 }, { page: 4, y: 726 }] },
    { answer: { page: 4, y: 662 }, records: [{ page: 4, y: 644 }, { page: 4, y: 590 }] },
    { answer: { page: 4, y: 507 }, records: [{ page: 4, y: 489 }, { page: 4, y: 453 }] },
    { answer: { page: 4, y: 389 }, records: [{ page: 4, y: 371 }, { page: 4, y: 317 }] },
    { answer: { page: 4, y: 234 }, records: [{ page: 4, y: 216 }, { page: 4, y: 180 }] },
  ],
  rowHeight: 18,
});

export const SAPS517A_DECLARATION_TEMPLATE_FIELDS = createSharedDeclarationTemplateFields('SAPS 517(a) Background Questionnaire', [10, 11, 12, 13, 14, 15]);
export const SAPS517A_DECLARATION_ELEMENTS = createSharedDeclarationElements({
  prefix: 's517a',
  positions: [
    { answer: { page: 3, y: 744 }, records: [{ page: 3, y: 726 }, { page: 3, y: 672 }] },
    { answer: { page: 3, y: 590 }, records: [{ page: 3, y: 572 }, { page: 3, y: 536 }] },
    { answer: { page: 3, y: 471 }, records: [{ page: 3, y: 453 }, { page: 3, y: 399 }] },
    { answer: { page: 3, y: 317 }, records: [{ page: 3, y: 299 }, { page: 3, y: 263 }] },
    { answer: { page: 3, y: 199 }, records: [{ page: 3, y: 181 }, { page: 3, y: 127 }] },
    { answer: { page: 4, y: 780 }, records: [{ page: 4, y: 762 }, { page: 4, y: 726 }] },
  ],
  rowHeight: 18,
});
