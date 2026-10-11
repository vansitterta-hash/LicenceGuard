// Synthetic local records only; never modify live firearm or document data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loader } from './beta-test-support.mjs';
const { FIREARM_CONFIGURATIONS, FIREARM_CONFIGURATION_TYPES, firearmConfigurationOptions, firearmConfigurationForTypeChange, firearmConfigurationFields, firearmConfigurationLabel } = loader()('src/utils/firearmConfiguration.ts');
const writes = [];
let row = { id: 'firearm', dealer_id: 'dealer', client_id: 'client', firearm_type: 'SHOTGUN', is_active: true };
const db = { from(table) {
  let payload;
  const query = { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
    insert(value) { payload = value; return this; }, update(value) { payload = value; return this; },
    async single() { if (payload) { writes.push({ table, payload }); row = { ...row, ...payload }; } return { data: row, error: null }; },
    async maybeSingle() { return { data: null, error: null }; },
  }; return query;
} };
const service = loader({ '../lib/supabase': { supabase: db }, '../services/safeDeletionService': { removeSafeRecord() { throw new Error('No deletion permitted'); } } })('src/services/firearmService.ts');
const values = { make: 'CZ', model: '', calibre: '12 BR SHOTGUN', serialNumber: 'TEST', firearmType: 'SHOTGUN', requiredCompetency: 'SHOTGUN', competencyOverrideReason: '', firearmNotes: '', licenceNumber: '', licenceSection: '', licenceIssueDate: '', licenceExpiryDate: '', licenceStatus: 'VALID', licenceNotes: '' };
for (const option of firearmConfigurationOptions('SHOTGUN')) {
  const other = option.value === 'OTHER' ? 'Explicitly recorded test configuration' : 'stale other';
  const saved = await service.createFirearm('dealer', 'client', 'owner', { ...values, firearmConfiguration: option.value, firearmConfigurationOther: other });
  assert.equal(saved.firearm_configuration, option.value);
  assert.equal(saved.firearm_configuration_other, option.value === 'OTHER' ? other : null);
}
await service.updateFirearm('firearm', 'dealer', 'client', 'owner', { ...values, firearmConfiguration: 'SIDE_BY_SIDE', firearmConfigurationOther: 'stale' });
assert.equal(row.firearm_configuration_other, null);
await service.updateFirearm('firearm', 'dealer', 'client', 'owner', values);
assert.equal(row.firearm_configuration, null);
assert.equal(firearmConfigurationLabel(null), 'Unknown / not recorded');
assert.throws(() => firearmConfigurationFields('SHOTGUN', 'OTHER', ''), /Describe/);
assert.throws(() => firearmConfigurationFields('SHOTGUN', 'OTHER', 'x'.repeat(121)), /Describe/);
assert.throws(() => firearmConfigurationFields('SHOTGUN', 'invented'), /valid/);
assert.throws(() => firearmConfigurationFields('PISTOL', 'OVER_UNDER'), /compatible/);
assert.ok(writes.every(w => w.table === 'firearms'), 'no generated documents or SAPS application answers mutated');
const types = loader()('src/types/firearm.ts').FIREARM_TYPES.map(t => t.value);
assert.equal(firearmConfigurationLabel('SINGLE_SHOT_BREAK_ACTION'), 'Single-shot break-action');
for (const type of ['PISTOL', 'MANUAL_RIFLE', 'MANUAL_CARBINE', 'SHOTGUN', 'PISTOL_CALIBRE_CARBINE']) {
  assert.ok(firearmConfigurationOptions(type).some(o=>o.value==='SINGLE_SHOT_BREAK_ACTION'));
}
for (const value of ['SINGLE_SHOT','FALLING_BLOCK','ROLLING_BLOCK','BREAK_ACTION','OVER_UNDER','SIDE_BY_SIDE']) {
  assert.ok(FIREARM_CONFIGURATIONS.some(o=>o.value===value), 'existing distinct descriptions retained');
  assert.notEqual(firearmConfigurationLabel(value),firearmConfigurationLabel('SINGLE_SHOT_BREAK_ACTION'));
}
assert.deepEqual(Object.keys(FIREARM_CONFIGURATION_TYPES).sort(), [...types].sort());
for (const type of types) {
  assert.deepEqual(firearmConfigurationFields(type, null), { firearm_configuration: null, firearm_configuration_other: null });
  await service.createFirearm('dealer', 'client', 'owner', { ...values, firearmType: type });
  assert.equal(row.firearm_configuration, null);
  assert.deepEqual(firearmConfigurationOptions(type).map(o=>o.value).sort(), [...FIREARM_CONFIGURATION_TYPES[type]].sort());
  for (const option of FIREARM_CONFIGURATIONS) {
    const other = option.value === 'OTHER' ? 'Explicit compatible description' : null;
    if (FIREARM_CONFIGURATION_TYPES[type].includes(option.value)) {
      const saved=await service.createFirearm('dealer','client','owner',{...values,firearmType:type,firearmConfiguration:option.value,firearmConfigurationOther:other});
      assert.equal(saved.firearm_configuration, option.value);
    } else {
      const count=writes.length;
      await assert.rejects(service.createFirearm('dealer','client','owner',{...values,firearmType:type,firearmConfiguration:option.value,firearmConfigurationOther:other}), /compatible/);
      assert.equal(writes.length,count);
    }
  }
}
assert.equal(firearmConfigurationForTypeChange('SHOTGUN','PISTOL','OVER_UNDER').firearmConfiguration,null);
assert.equal(firearmConfigurationForTypeChange('SHOTGUN','PISTOL','OTHER','shotgun description').firearmConfiguration,null);
assert.equal(firearmConfigurationForTypeChange('MANUAL_RIFLE','BOLT_ACTION_RIFLE','STRAIGHT_PULL').firearmConfiguration,'STRAIGHT_PULL');
assert.ok(readFileSync('src/screens/FirearmFormScreen.tsx','utf8').includes('...firearmConfigurationForTypeChange('));
assert.ok(readFileSync('src/screens/FirearmFormScreen.tsx','utf8').includes('...firearmConfigurationOptions(values.firearmType)'));
const api=readFileSync('api/application-research.js','utf8');
const apiMatrix=api.slice(0,api.indexOf('const requestCounts'));
assert.deepEqual(new Function(apiMatrix+'; return FIREARM_CONFIGURATION_TYPES;')(),FIREARM_CONFIGURATION_TYPES,'server and canonical matrices agree');
const researchService = loader({ '../lib/supabase': { supabase: db } })('src/services/applicationResearchService.ts');
for (const type of types) {
  for (const configuration of [null, ...FIREARM_CONFIGURATION_TYPES[type]]) {
    const context = researchService.buildApplicationResearchContext({ applicationType: 'FIREARM_LICENCE_FIRST_APPLICATION', licenceSection: '16', motivationSummary: 'Applicant purpose', firearm: { make: 'Explicit make', model: null, calibre: '12 bore', firearmType: type, firearmConfiguration: configuration, firearmConfigurationOther: configuration==='OTHER'?'Recorded compatible description':null } });
    assert.equal(context.firearm.firearmConfiguration,configuration);
    assert.equal(context.firearm.model,null,'Research configuration does not infer model');
    assert.ok(context.sources.every(s=>s.reviewStatus==='UNREVIEWED'));
  }
}
const incompatibleResearch=researchService.buildApplicationResearchContext({applicationType:'FIREARM_LICENCE_FIRST_APPLICATION',licenceSection:'16',motivationSummary:null,firearm:{make:'Explicit make',model:null,calibre:'12 bore',firearmType:'BOLT_ACTION_RIFLE',firearmConfiguration:'SEMI_AUTOMATIC'}});
assert.equal(incompatibleResearch.firearm.firearmConfiguration,null,'Research context consumes compatible configuration only');
const { PGlite } = createRequire(import.meta.url)('../.tmp/generated-documents-rls-runtime/node_modules/@electric-sql/pglite');
const pg = new PGlite();
await pg.exec('create table public.firearms(id integer primary key, firearm_type text not null);');
for (let i=0;i<types.length;i++) await pg.query('insert into firearms values($1,$2)',[i+1,types[i]]);
// Isolated synthetic PostgreSQL only; never apply this migration to a connected database.
await pg.exec(readFileSync('supabase/migrations/20261011_shotgun_configuration.sql', 'utf8'));
assert.ok((await pg.query('select * from firearms')).rows.every(r=>r.firearm_configuration===null&&r.firearm_configuration_other===null),'legacy records remain unknown without backfill');
for (let i=0;i<types.length;i++) {
  for (const option of FIREARM_CONFIGURATIONS) {
    const query=()=>pg.query('update firearms set firearm_configuration=$1,firearm_configuration_other=$2 where id=$3',[option.value,option.value==='OTHER'?'Recorded compatible other':null,i+1]);
    if(FIREARM_CONFIGURATION_TYPES[types[i]].includes(option.value)) await query();
    else await assert.rejects(query(),/check constraint/);
  }
  await pg.query('update firearms set firearm_configuration=null,firearm_configuration_other=null where id=$1',[i+1]);
}
const shotgunId=types.indexOf('SHOTGUN')+1;
for (const [configuration, other] of [['OTHER',null],['OTHER',' '],['OTHER','x'.repeat(121)],['PUMP_ACTION','stale'],[null,'stale'],['invented',null]]) {
  await assert.rejects(pg.query('update firearms set firearm_configuration=$1,firearm_configuration_other=$2 where id=$3',[configuration,other,shotgunId]), /check constraint/);
}
await pg.close();
// Locked SAPS paths must remain byte-identical to the accepted checkpoint.
const { execFileSync } = await import('node:child_process');
for(const path of ['src/utils/applicationFormAnswers.ts','src/data/saps271PhysicalMapping.ts','src/services/generatedApplicationDocumentService.ts']) {
  const head=execFileSync('git',['show','HEAD:'+path],{encoding:'utf8'}).replaceAll('\r\n','\n');
  assert.equal(readFileSync(path,'utf8').replaceAll('\r\n','\n'),head,path+' remains unchanged');
}
assert.ok(writes.every(w=>w.table==='firearms'),'no SAPS documents/declarations mutated');
console.log('PASS: all 11 firearm types, valid/invalid configuration matrix, create/edit and type-change validation, isolated PostgreSQL constraints, no backfill or SAPS/document mutation.');
