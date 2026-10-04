import assert from 'node:assert/strict';
import { loader, nodes, nativeMock } from './beta-test-support.mjs';
import { complete517Profile } from './saps517-test-fixture.mjs';

// Isolated JSON storage: no network, credentials, or live applicant records.
const clone = value => JSON.parse(JSON.stringify(value));
let stored = { id: 'client', dealer_id: 'dealer', first_name: 'Example', surname: 'Applicant', id_number: '8001015009087', address_line_1: '1 Example Road', city: 'Durban', province: 'KwaZulu-Natal', postal_code: '4000', saps271_declarations: complete517Profile() };
const rows = {
  application_cases: [{ id: 'case', client_id: 'client', application_type: 'COMPETENCY_FIRST_APPLICATION', competency_category: 'SHOTGUN', acquisition_source: 'NOT_APPLICABLE' }],
  competencies: [], firearms: [], firearm_licences: [],
  documents: ['ID_COPY', 'PROOF_OF_RESIDENCE', 'COMPETENCY_APPLICATION'].map(document_type => ({ id: document_type, client_id: 'client', application_case_id: 'case', document_type, document_scope: 'CLIENT', lifecycle_status: 'ACTIVE', is_verified: true })),
};
const db = { from(table) {
  let payload, single = false;
  const filters = [];
  const query = {
    select() { return query; }, order() { return query; },
    eq(key, value) { filters.push(row => row[key] === value); return query; },
    single() { single = true; return query; },
    update(value) { assert.equal(table, 'clients'); payload = value; return query; },
    then(resolve, reject) {
      if (payload) { assert.ok(filters.every(f => f(stored))); stored = clone({ ...stored, ...payload }); }
      const result = (table === 'clients' ? [stored] : rows[table]).filter(row => filters.every(f => f(row)));
      return Promise.resolve({ data: clone(single ? result[0] : result), error: null }).then(resolve, reject);
    },
  };
  return query;
} };
const load = loader({ '../lib/supabase': { supabase: db }, '../services/safeDeletionService': {} });
const { updateClient, getClient } = load('src/services/clientService.ts');
const { getClientApplicationReadiness } = load('src/services/applicationReadinessService.ts');
const { saps517RequiredProfileIssues, getSaps517ApplicantData } = load('src/utils/saps517Applicant.ts');
const Section = loader({ 'react-native': nativeMock, '../Card': 'Card', '../TextField': 'TextField' })('src/components/client/Saps517ApplicantSection.tsx').default;
let editor = clone(stored.saps271_declarations);
async function saveReload() {
  await updateClient('client', 'dealer', 'user', {
    firstName: stored.first_name, surname: stored.surname, idNumber: stored.id_number,
    cellphone: '', alternateCellphone: '', email: '', preferredContactChannel: 'EMAIL',
    addressLine1: stored.address_line_1, addressLine2: '', suburb: '', city: stored.city,
    province: stored.province, postalCode: stored.postal_code, notes: '', saps271Declarations: editor,
  });
  editor = null;
  editor = (await getClient('client')).saps271_declarations;
}
function select(label) {
  const tree = Section({ value: editor, idNumber: stored.id_number, onChange: saps517 => { editor = { ...editor, saps517 }; } });
  nodes(tree).find(n => n.props?.accessibilityRole === 'radio' && nodes(n).some(child => child.props?.children === label)).props.onPress();
}
const certificateIssues = ['Enter the training certificate serial number.', 'Enter a valid training certificate issue date.'];
async function check(expected) {
  await saveReload();
  const client = await getClient('client');
  const issues = saps517RequiredProfileIssues(client, 'SHOTGUN');
  assert.deepEqual(issues, expected);
  const result = await getClientApplicationReadiness('client');
  const application = result.cases[0];
  const requirement = application.requirements.find(r => r.key === 'SAPS517_APPLICANT_DATA');
  assert.equal(requirement.detail, expected.join(' ') || 'Required SAPS 517 applicant information is complete.');
  assert.equal(requirement.state, expected.length ? 'MISSING' : 'SATISFIED');
  assert.equal(application.missingCount, expected.length ? 1 : 0); // Count requirements, not fields.
  assert.equal(application.readyToGenerate, !expected.length);
  assert.equal(result.blockedCases, expected.length ? 1 : 0);
  return result;
}
editor.saps517.maritalStatus = 'NOT_ANSWERED';
editor.saps517.postalAddressSameAsResidential = 'NOT_ANSWERED';
editor.saps517.accreditedTrainingCertificate = { answer: 'YES', institution: 'Synthetic test institution', serialNumber: '', dateIssued: '' };
select('Single');
select('Same as residential');
const first = await check(certificateIssues);
assert.equal(editor.saps517.maritalStatus, 'SINGLE');
assert.equal(editor.saps517.postalAddressSameAsResidential, 'YES');
select('Different postal address');
Object.assign(editor.saps517, { postalAddress: 'PO Box 42', postalLocality: 'Durban', postalAddressPostalCode: '4000' });
await check(certificateIssues);
for (const missing of [undefined, null, '', 'NOT_ANSWERED']) {
  editor.saps517.maritalStatus = missing;
  await check(['Select the applicant’s marital status.', ...certificateIssues]);
  select('Single');
  editor.saps517.postalAddressSameAsResidential = missing;
  await check(['Confirm whether the postal address is the same as the residential address.', ...certificateIssues]);
  select('Same as residential');
}
for (const invalid of ['', '2026-02-30', 'invalid', null, undefined]) {
  editor.saps517.accreditedTrainingCertificate.dateIssued = invalid;
  await check(certificateIssues);
}
for (const partial of [null, {}, { accreditedTrainingCertificate: null }, { maritalStatus: null, postalAddressSameAsResidential: null }]) {
  const data = getSaps517ApplicantData({ saps517: partial });
  assert.equal(data.maritalStatus, 'NOT_ANSWERED');
  assert.equal(data.postalAddressSameAsResidential, 'NOT_ANSWERED');
  assert.doesNotThrow(() => saps517RequiredProfileIssues({ ...stored, saps271_declarations: { saps517: partial } }, 'SHOTGUN'));
}
assert.equal(first.cases[0].requirements.find(r => r.key === 'SAPS517_APPLICANT_DATA').detail, certificateIssues.join(' '));
console.log('PASS: editor selections, actual client service JSON save/reload, partial JSON, unanswered blockers, certificate blockers, and readiness summary/detail agreement (isolated storage).');
