import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {loader} from './beta-test-support.mjs';
const {PGlite}=createRequire(import.meta.url)('../.tmp/generated-documents-rls-runtime/node_modules/@electric-sql/pglite');
const pg=new PGlite();
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const privacy=readFileSync('supabase/migrations/20260928_privacy_enforcement.sql','utf8');
const helper=privacy.match(/create or replace function public\.is_record_authorized_for_user\([\s\S]*?\$\$;/i)[0].replace('security invoker','security definer');
await pg.exec(`create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select current_setting('request.jwt.claim.sub',true)::uuid $$;
create type record_scope as enum ('PRIVATE','SHARED','TEST');
create table dealers(id uuid primary key,workspace_kind text);
create table dealer_users(user_id uuid,dealer_id uuid,role text,is_active boolean);
create table dealer_user_permissions(user_id uuid,dealer_id uuid,permission text,scope_type text,expires_at timestamptz);
create table application_cases(id uuid primary key,dealer_id uuid,owner_user_id uuid,record_scope record_scope);
create function is_dealer_member(uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from dealer_users where dealer_id=$1 and user_id=auth.uid() and is_active) $$;
insert into dealers values ('${id(10)}','PRODUCTION'),('${id(11)}','PRODUCTION');
insert into dealer_users values ('${id(1)}','${id(10)}','staff',true),('${id(2)}','${id(10)}','staff',true),('${id(3)}','${id(10)}','administrator',true),('${id(4)}','${id(11)}','staff',true),('${id(5)}','${id(10)}','staff',true);
insert into application_cases values ('${id(20)}','${id(10)}','${id(1)}','PRIVATE');
insert into dealer_user_permissions values ('${id(5)}','${id(10)}','applications.read','workspace',null);
`);
await pg.exec(helper);
await pg.exec(readFileSync('supabase/migrations/20260720_application_workspace_events.sql','utf8'));
assert.equal((await pg.query('select count(*)::int as count from application_workspace_events')).rows[0].count,0,'no fabricated history');
await pg.exec('grant usage on schema public,auth to authenticated; grant select on application_cases,dealer_users,dealer_user_permissions,dealers to authenticated; grant select,insert on application_workspace_events to authenticated;');
assert.equal((await pg.query("select relrowsecurity from pg_class where oid='application_workspace_events'::regclass")).rows[0].relrowsecurity,true);
for(const actor of [1,3,5,2,4]) {
 await pg.exec('set role authenticated');await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[id(actor)]);
 const insert=()=>pg.query('insert into application_workspace_events(application_case_id,event_type,title,detail,created_by) values($1,$2,$3,$4,$5)',[id(20),'DRAFT_SAVED','Application draft saved','Recorded detail',id(actor)]);
 if([1,3,5].includes(actor)) {await insert();assert.ok((await pg.query('select * from application_workspace_events')).rows.length);await assert.rejects(pg.query('insert into application_workspace_events(application_case_id,event_type,title,created_by) values($1,$2,$3,$4)',[id(20),'TEST','Spoofed actor',id(2)]),/row-level security/);}
 else {assert.equal((await pg.query('select * from application_workspace_events')).rows.length,0);await assert.rejects(insert(),/row-level security/);}
 await pg.exec('reset role');
}
await pg.exec('set role authenticated');
await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[id(1)]);
const service=loader({'../lib/supabase':{supabase:{from(table){
 assert.equal(table,'application_workspace_events');
 let caseId;
 return {
  async insert(value){try{await pg.query('insert into application_workspace_events(application_case_id,event_type,title,detail,created_by) values($1,$2,$3,$4,$5)',[value.application_case_id,value.event_type,value.title,value.detail,value.created_by]);return {error:null};}catch(error){return {error:{message:error.message}};}},
  select(){return this;},eq(key,value){assert.equal(key,'application_case_id');caseId=value;return this;},order(){return this;},
  async limit(){return {data:(await pg.query('select id,event_type,title,detail,created_at from application_workspace_events where application_case_id=$1 order by created_at desc limit 50',[caseId])).rows,error:null};}
 };
}}}})('src/services/applicationWorkspaceService.ts');
assert.deepEqual(await service.listApplicationWorkspaceEvents(id(21)),[],'successful empty timeline does not fabricate history');
await service.recordApplicationWorkspaceEvent(id(20),id(1),'PACK_CHECKED','Application pack checked','Recorded pack detail');
const events=await service.listApplicationWorkspaceEvents(id(20));
assert.ok(events.some(e=>e.eventType==='PACK_CHECKED'&&e.title==='Application pack checked'&&e.detail==='Recorded pack detail'&&e.id&&e.createdAt));
await pg.exec('reset role');
await pg.close();console.log('PASS: timeline RLS owner/admin/permission access, same/cross dealer isolation, actor provenance, service contract, enabled RLS and no fabricated history.');
