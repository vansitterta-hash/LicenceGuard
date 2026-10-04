import { analyseApplication } from '../src/intelligence/applicationIntelligenceService.ts';

const result = await analyseApplication({
  applicationCaseId: 'case-1',
  applicationType: 'FIREARM_LICENCE_FIRST_APPLICATION',
  licenceSection: '16',
  competencyCategory: null,
  firearm: {
    id: 'f1',
    make: 'Beretta',
    model: '1301',
    calibre: '12 gauge',
    serialNumber: 'ABC',
    firearmType: 'SHOTGUN',
  },
  client: { id: 'c1', name: 'Test User', idNumber: '123' },
  existingDocuments: ['MOTIVATION'],
  previousApplications: [],
  intendedUse: 'Dedicated sport shooting',
  sportDiscipline: 'Trap / clay target',
  primaryPurpose: 'Sport shooting',
  sportAssociation: 'National Sporting Clays Association',
});

const reasonFields = result.motivation?.reasons.map((r) => r.field) ?? [];
console.log(JSON.stringify({
  reasonFields,
  score: result.motivation?.score,
  title: result.motivation?.title,
}, null, 2));

if (!reasonFields.includes('sportDiscipline')) {
  throw new Error('sportDiscipline reason missing');
}
