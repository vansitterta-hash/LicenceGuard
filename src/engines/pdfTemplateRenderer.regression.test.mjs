import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeBoxedTextLayout,
  isOfficialUseField,
  normaliseBoxedValue,
} from './pdfTemplateRenderer.ts';

test('boxed values use one character per box without drifting between boxes', () => {
  const layout = computeBoxedTextLayout({
    value: '1987654321098',
    boxCount: 13,
    x: 100,
    boxWidth: 12,
    boxSpacing: 2,
    y: 250,
    fontSize: 9,
  });

  assert.equal(layout.characters.length, 13);
  assert.deepEqual(layout.characters.map((entry) => entry.character), Array.from('1987654321098'));
  assert.ok(layout.characters.every((entry) => entry.centered === true));
  assert.ok(layout.characters.every((entry, index) => entry.x >= 100 + index * 14 && entry.x < 100 + (index + 1) * 14));
});

test('postal codes and numeric boxes are digit-only and preserved as box characters', () => {
  const boxed = normaliseBoxedValue('1234', { boxCount: 4, allowLetters: false });
  assert.equal(boxed, '1234');
  assert.equal(normaliseBoxedValue('A123', { boxCount: 4, allowLetters: false }), '123');
});

test('official-use fields are protected from autofill values', () => {
  assert.equal(isOfficialUseField({ fieldId: 'application.openedDate', officialUse: true }), true);
  assert.equal(isOfficialUseField({ fieldId: 'applicant.idNumber', officialUse: false }), false);
});
