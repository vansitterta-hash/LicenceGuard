import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loader, hookHarness, nativeMock, nodes } from './beta-test-support.mjs';

const rows = { clients: [{ id: 'client', dealer_id: 'dealer', first_name: 'Beta', surname: 'Test', is_active: true }],
  application_cases: [], competencies: [], firearms: [], firearm_licences: [] };
const writes = []; let nextId = 0, releaseWrite = null, pauseWrite = false;
const db = {
  from(table) {
    const filters = []; let payload, single = false, limit = Infinity, order = [];
    const q = {
      select() { return q; }, eq(key, value) { filters.push((row) => row[key] === value); return q; },
      not(key, op, value) { const excluded = value.replace(/[()\"]/g, '').split(','); filters.push((row) => !excluded.includes(row[key])); return q; },
      order(key, { ascending }) { order.push([key, ascending]); return q; }, limit(n) { limit = n; return q; },
      single() { single = true; return q; }, update(value) { payload = value; return q; },
      insert() { throw new Error('Unexpected direct insert: drafts must use create/resume'); },
      async then(resolve, reject) {
        try {
          if (payload && pauseWrite) { pauseWrite = false; await new Promise((done) => { releaseWrite = done; }); }
          let selected = rows[table].filter((row) => filters.every((filter) => filter(row)));
          for (const [key, ascending] of [...order].reverse()) selected.sort((a,b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1));
          selected = selected.slice(0, limit);
          if (payload) { for (const row of selected) Object.assign(row, payload); writes.push({ table, payload, ids: selected.map((r) => r.id) }); }
          return resolve({ data: structuredClone(single ? selected[0] : selected), error: single && selected.length !== 1 ? { message: 'Record is protected or unavailable' } : null });
        } catch (error) { return reject(error); }
      },
    }; return q;
  },
  async rpc(name, args) {
    assert.equal(name, 'create_or_resume_competency_application_draft');
    let row = rows.application_cases.find((r) => r.dealer_id === args.p_dealer_id && r.client_id === args.p_client_id && r.application_type === args.p_values.application_type && r.status === 'NOT_STARTED');
    if (!row) { row = { ...args.p_values, id: `case-${++nextId}`, created_at: '2026-09-12' }; rows.application_cases.push(row); }
    return { data: structuredClone(row), error: null };
  },
};
const service = loader({ '../lib/supabase': { supabase: db } })('src/services/applicationCaseService.ts');
const initial = {
  applicationType: 'COMPETENCY_FIRST_APPLICATION', status: 'NOT_STARTED', competencyCategory: 'HANDGUN',
  competencyId: '', firearmId: '', firearmLicenceId: '', licenceSection: '', acquisitionSource: 'NOT_APPLICABLE',
  supplierName: '', supplierIdOrRegistration: '', supplierContact: '', supplierLicenceNumber: '', saleOrInvoiceReference: '',
  motivationSummary: 'Existing motivation', openedDate: '2026-09-01', targetSubmissionDate: '2026-10-01',
  actualSubmissionDate: '', applicationReference: '', policeStation: '', outcomeDate: '', outcomeNotes: '',
  progressPercent: '20', dealerNotes: 'Original notes', clientNotes: 'Client-specific notes',
};
const first = await service.createApplicationCase('dealer', 'client', 'user', initial);
assert.equal((await service.createApplicationCase('dealer', 'client', 'user', initial)).id, first.id);
assert.equal(rows.application_cases.length, 1);
const changed = { ...initial, competencyCategory: 'SHOTGUN', policeStation: 'Camperdown', dealerNotes: 'Latest notes' };
await service.updateApplicationCase(first.id, 'dealer', 'client', 'user', changed);
assert.equal((await service.getApplicationCase(first.id)).police_station, 'Camperdown');
assert.equal((await service.createApplicationCase('dealer', 'client', 'user', initial)).police_station, 'Camperdown', 'Resume must not overwrite persisted values with defaults');
// Every persisted form field passes through the generic payload, including values not shown on this screen.
assert.equal(rows.application_cases[0].client_notes, initial.clientNotes);
assert.equal(rows.application_cases[0].target_submission_date, initial.targetSubmissionDate);

function mount(caseId = first.id, workflowAction) {
  const h = hookHarness(), listeners = new Map(), actions = [], alerts = [];
  const props = { route: { params: { clientId: 'client', ...(caseId ? { applicationCaseId: caseId } : {}), ...(workflowAction ? { workflowAction } : {}) } } };
  const navigation = {
    addListener(event, callback) { listeners.set(event, callback); return () => listeners.delete(event); },
    setParams(params) { props.route = { params: { ...props.route.params, ...params } }; h.invalidate(); },
    navigate(...args) { actions.push(['navigate', ...args]); },
    replace(...args) { actions.push(['replace', ...args, rows.application_cases.find((row) => row.id === args[1].applicationCaseId)?.police_station]); },
    dispatch(action) { actions.push(['dispatch', action]); },
  }; props.navigation = navigation;
  const mocks = {
    react: h.react, 'react-native': nativeMock,
    '@react-navigation/native': { usePreventRemove: (blocked, callback) => { h.preventRemove = blocked ? callback : null; } },
    'lucide-react-native': new Proxy({}, { get: (_, key) => key }),
    '../context/AuthContext': { useAuth: () => ({ dealerProfile: { dealerId: 'dealer' }, user: { id: 'user' } }) },
    '../services/applicationCaseService': service,
    '../services/clientService': { getClient: async () => rows.clients[0] },
    '../engines/competencyEngine': { listClientCompetencies: async () => [] },
    '../services/firearmService': { listClientFirearms: async () => [] },
    '../utils/userAlert': { userAlert: { alert: (...args) => alerts.push(args) } },
  };
  for (const name of ['Button', 'Card', 'Screen', 'TextField']) mocks[`../components/${name}`] = { __esModule: true, default: name };
  h.mount(loader(mocks)('src/screens/ApplicationCaseFormScreen.tsx').default, props);
  return { h, props, actions, alerts, focus: () => listeners.get('focus')?.(), field: (label) => nodes(h.tree).find((n) => n.props?.label === label), button: (title) => nodes(h.tree).find((n) => n.props?.title === title) };
}
let screen = mount(); const beforeHydrate = writes.length;
await screen.h.settle();
assert.equal(writes.length, beforeHydrate, 'Hydrating a persisted draft must cause zero writes');
assert.equal(screen.field('Police station / DFO').props.value, 'Camperdown');
const shotgun = nodes(screen.h.tree).find((n) => n.type === 'Pressable' && nodes(n).some((child) => child.props?.children === 'Shotgun'));
assert.ok(shotgun); shotgun.props.onPress();
screen.field('Police station / DFO').props.onChangeText('Updated station');
screen.field('Notes').props.onChangeText('Updated generic notes');
await screen.h.settle(); screen.focus(); await screen.h.settle();
assert.equal(screen.field('Police station / DFO').props.value, 'Updated station', 'Child-screen return preserves edits');
assert.equal(rows.application_cases[0].dealer_notes, 'Updated generic notes');
assert.equal(rows.application_cases[0].client_notes, initial.clientNotes, 'Editing visible values preserves hidden persisted fields');
// The old save cannot arrive after and overwrite the newest explicit save.
pauseWrite = true;
screen.field('Police station / DFO').props.onChangeText('Delayed old write');
await screen.h.settle(); assert.ok(releaseWrite);
screen.field('Police station / DFO').props.onChangeText('Newest explicit value');
await screen.h.settle();
const save = screen.button('Save and Check Readiness').props.onPress();
await screen.h.settle(); assert.equal(screen.actions.length, 0, 'Readiness must wait for persistence');
releaseWrite(); await save; await screen.h.settle();
assert.equal(rows.application_cases[0].police_station, 'Newest explicit value');
assert.equal(screen.actions.at(-1)[0], 'replace');
assert.equal(screen.actions.at(-1)[3], 'Newest explicit value');
assert.equal(screen.actions.at(-1)[2].applicationCaseId, first.id);
screen.h.unmount(); screen = mount(); await screen.h.settle();
assert.equal(screen.field('Police station / DFO').props.value, 'Newest explicit value', 'Fresh mount restores server values');
// Unmount does not cancel a queued write.
pauseWrite = true;
screen.field('Notes').props.onChangeText('Leave immediately'); await screen.h.settle();
screen.h.unmount(); releaseWrite(); await new Promise(setImmediate);
screen = mount(); await screen.h.settle(); assert.equal(screen.field('Notes').props.value, 'Leave immediately');
screen.h.unmount();
// Repeated workflow start resolves the existing ID, including changed category.
screen = mount(null, 'NEW_COMPETENCY'); await screen.h.settle();
assert.equal(screen.props.route.params.applicationCaseId, first.id);
assert.equal(screen.field('Police station / DFO').props.value, 'Newest explicit value');
assert.equal(rows.application_cases.length, 1); screen.h.unmount();
// Explicit continue can open a historical duplicate without rewriting or merging it.
rows.application_cases.push({ ...rows.application_cases[0], id: 'historical', police_station: 'Historical station' });
screen = mount('historical'); await screen.h.settle(); assert.equal(screen.field('Police station / DFO').props.value, 'Historical station'); screen.h.unmount();
assert.equal(rows.application_cases.length, 2);
rows.application_cases[0].status = 'SUBMITTED';
await assert.rejects(service.updateApplicationCase(first.id, 'dealer', 'client', 'user', changed), /protected/);
assert.equal(rows.application_cases[0].status, 'SUBMITTED');
await assert.rejects(service.updateApplicationCase('historical', 'another-dealer', 'client', 'user', changed), /unavailable/);
// Exercise hydration and edits for every supported type and editable workflow status.
for (const [index, applicationType] of ['COMPETENCY_FIRST_APPLICATION','COMPETENCY_ADDITIONAL_CATEGORY','COMPETENCY_RENEWAL','COMPETENCY_REAPPLICATION',
  'FIREARM_LICENCE_FIRST_APPLICATION','FIREARM_LICENCE_ADDITIONAL_APPLICATION','FIREARM_LICENCE_RENEWAL','FIREARM_LICENCE_REAPPLICATION'].entries()) {
  const id = `supported-${index}`;
  const firearm = applicationType.startsWith('FIREARM');
  const record = { ...rows.application_cases[1], id, application_type: applicationType, status: 'DOCUMENTS_INCOMPLETE',
    firearm_id: firearm ? 'firearm' : null, licence_section: firearm ? '13' : null,
    supplier_name: firearm ? 'Persisted supplier' : null, supplier_contact: firearm ? '0123456789' : null,
    police_station: `Station ${index}`, client_notes: `Hidden note ${index}`, target_submission_date: '2026-12-01',
  }; rows.application_cases.push(record);
  screen = mount(id); const before = writes.length; await screen.h.settle();
  assert.equal(writes.length, before, applicationType + ' hydration must not write');
  assert.equal(screen.field('Police station / DFO').props.value, `Station ${index}`);
  screen.field('Notes').props.onChangeText(`Edited ${index}`); await screen.h.settle();
  assert.equal(record.dealer_notes, `Edited ${index}`);
  assert.equal(record.client_notes, `Hidden note ${index}`);
  assert.equal(record.target_submission_date, '2026-12-01');
  if (firearm) { assert.equal(record.supplier_name, 'Persisted supplier'); assert.equal(record.firearm_id, 'firearm'); }
  screen.h.unmount();
}
screen = mount('missing-case'); await screen.h.settle(); assert.equal(screen.field('Police station / DFO'), undefined, 'A failed hydration must not display editable defaults'); assert.ok(screen.button('Retry')); screen.h.unmount();
const workspace = loader({ '../lib/supabase': { supabase: db } })('src/services/applicationWorkspaceService.ts');
await assert.rejects(workspace.saveApplicationDraft(first.id, 'user'), /protected/);
const migration = readFileSync('supabase/migrations/20260906_firearm_application_drafts.sql', 'utf8');
assert.match(migration, /security invoker/); assert.match(migration, /on conflict/);
console.log('R04 passed: resume, hydration, generic preservation, focus, ordered autosave, save-before-readiness, unmount, fresh mount, historical identity, terminal and tenant protection.');
