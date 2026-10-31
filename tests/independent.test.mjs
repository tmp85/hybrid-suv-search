import test from 'node:test';
import assert from 'node:assert/strict';
import {buildInventory,normalizeIndependent,normalizeMuse,rankVehicles} from '../dist/inventory.js';
import {directListingUrl} from '../dist/listings.js';

const now='2026-10-31T20:00:00Z';
const vin='5TDJGRFH0JS041065';
const row={vin,year:2018,name:'Toyota Highlander Hybrid',trim:'XLE',type:'HEV',price:27998,mileage:82247,city:'Milwaukie',state:'OR',drive:'AWD',rows:3,seller:'CarMax Milwaukie',url:'https://www.capitalone.com/cars/vehicle-details/2018/Toyota/Highlander%2BHybrid/XLE/'+vin,observedAt:'2026-10-31T07:00:00-07:00',verification:{status:'ad_observed',note:'Advertised vehicle observed; unsold status unconfirmed.'},history:{title:'reported_clean',accidents:'none_reported',owners:null},fees:0,priceBasis:'Advertised price; taxes and registration excluded.'};
const feed=(rows=[row],changes={})=>({schemaVersion:1,source:'chatgpt-independent',runId:'test-report-2026-10-31',generatedAt:'2026-10-31T18:30:00Z',reportDate:'2026-10-31',reportUrl:'https://chatgpt.com/c/test-report',mode:'observations',writer:{mode:'one_time',automationId:null,runUrl:null},listings:structuredClone(rows),...changes});
const museRow={vin,year:2018,model:'Toyota Highlander Hybrid',trim:'XLE',hybrid_type:'Full hybrid',price:28000,mileage:82247,drivetrain:'AWD',location:'Milwaukie, OR',seller:'Dealer',url:row.url,history:'Clean title; 0 accidents',concerns:'Verify service records',verification_date:'2026-10-31',verified_active:true};
const muse=(rows=[museRow])=>({search_date:'2026-10-31',listings:structuredClone(rows)});
const build=(options={})=>buildInventory({muse:muse(),now,...options});

test('independent export preserves observation time, attribution and real listing identity',()=>{
 const [v]=normalizeIndependent(feed(),now);
 assert.equal(v.vin,vin);assert.equal(v.price,27998);assert.equal(v.checked,row.observedAt);assert.equal(v.lastVerified,row.observedAt);
 assert.deepEqual(v.discoveryAgents,['ChatGPT independent']);assert.equal(v.sources[0].url,row.url);
 assert.equal(v.observations[0].runId,'test-report-2026-10-31');assert.equal(v.currentObservation.priceBasis,row.priceBasis);
 assert.equal(v.priceHistory[0].date,row.observedAt);assert.equal(v.listingState,'verified_active');
});

test('valid feed connects independently while one-time export never proves scheduled automation',()=>{
 const data=build({independent:feed()});assert.equal(data.vehicles.length,1);
 assert.deepEqual(new Set(data.vehicles[0].discoveryAgents),new Set(['Muse','ChatGPT independent']));
 assert.equal(data.reconciliation.filter(r=>r.source==='independent').length,1);
 assert.equal(data.sources.independent.status,'connected');assert.equal(data.sources.independent.exporterMode,'one_time');assert.equal(data.sources.independent.automationVerified,false);
 const scheduled=build({independent:feed([row],{writer:{mode:'scheduled',automationId:null,runUrl:null}})});
 assert.equal(scheduled.sources.independent.exporterMode,'scheduled_unverified');assert.equal(scheduled.sources.independent.automationVerified,false);
 const proof={verified:true,automationId:'actual-scheduler-id',verifiedRunId:'actual-prior-run',verificationUrl:'https://github.com/tmp85/hybrid-suv-search/actions/runs/123'};
 const verified=build({independent:feed([row],{writer:{mode:'scheduled',automationId:'actual-scheduler-id',runUrl:null}}),independentAutomation:proof});
 assert.equal(verified.sources.independent.exporterMode,'scheduled_verified');
 assert.equal(build({independent:feed(),independentAutomation:proof}).sources.independent.exporterMode,'one_time');
});

test('partial reports retain earlier independent-only observations and cross-posts omitted from Muse',()=>{
 const other={...museRow,vin:'KNDRHDLG6P5204248',model:'Kia Sorento Hybrid',url:'https://www.cargurus.com/details/451663169'};
 const first=build({independent:feed()}),next=build({previous:first,muse:muse([other]),independent:feed([],{runId:'empty-next-report'})}),retainedCrosspost=next.vehicles.find(v=>v.vin===vin);
 assert.equal(next.vehicles.length,2);assert.equal(retainedCrosspost.missingFromFeed,false);assert.equal(retainedCrosspost.listingState,'verified_active');
 assert.equal(retainedCrosspost.sourcePresence.muse.present,false);assert.equal(retainedCrosspost.sourcePresence.independent.present,true);
 const only=buildInventory({independent:feed(),now}),retained=buildInventory({previous:only,independent:feed([]),now});
 assert.equal(retained.vehicles[0].listingState,'verified_active');assert.equal(retained.vehicles[0].lastVerified,row.observedAt);
 const old=buildInventory({previous:retained,independent:feed([],{runId:'november-report',generatedAt:'2026-11-09T18:00:00Z',reportDate:'2026-11-09'}),now:'2026-11-09T20:00:00Z'});
 assert.equal(old.vehicles[0].listingState,'stale');assert.equal(old.vehicles[0].lastVerified,row.observedAt);
});

test('independent failures retain last good data without changing Muse health or suppressing its updates',()=>{
 const first=build({independent:feed()}),newMuse={...museRow,price:27500,verification_date:'2026-11-01'};
 const failed=buildInventory({previous:first,muse:{search_date:'2026-11-01',listings:[newMuse]},independentError:'Invalid export JSON',now:'2026-11-01T20:00:00Z'});
 assert.equal(failed.vehicles[0].price,27500);assert.equal(failed.sources.muse.status,'connected');assert.equal(failed.sources.independent.status,'error');
 assert.equal(failed.sources.independent.lastSuccessAt,first.sources.independent.lastSuccessAt);
 assert.equal(failed.sources.independent.runId,first.sources.independent.runId);assert(failed.alerts.some(a=>a.includes('Invalid export JSON')));
 assert(failed.reconciliation.some(r=>r.source==='independent'));
 const malformed=build({independent:{...feed(),listings:[{...row,price:'27998'}]}});
 assert.equal(malformed.sources.muse.status,'connected');assert.equal(malformed.sources.independent.status,'error');assert(malformed.alerts.length);
 const attempted=build({independentConfigured:true,independentError:'Malformed JSON'});assert.equal(attempted.sources.independent.status,'error');
 assert.equal(build().sources.independent.status,'not_connected');
});

test('precise observation ordering compares instants across timezone midnight',()=>{
 const later={...row,price:28100,observedAt:'2026-10-31T00:30:00-07:00'},earlier={...row,price:27000,observedAt:'2026-10-31T08:00:00+02:00'};
 const first=buildInventory({independent:feed([later]),now});
 const second=buildInventory({previous:first,independent:feed([earlier],{runId:'older-observation-exported-later'}),now});
 assert.equal(second.vehicles[0].price,28100);assert.equal(second.vehicles[0].currentObservation.observedAt,later.observedAt);
 const nextDayEarlier={...row,price:26000,observedAt:'2026-11-01T00:30:00+14:00'},priorDayLater={...row,price:26500,observedAt:'2026-10-31T23:00:00-07:00'};
 const exported='2026-11-01T18:00:00Z';
 const a=buildInventory({independent:feed([nextDayEarlier],{generatedAt:exported}),now:exported});
 const b=buildInventory({previous:a,independent:feed([priorDayLater],{generatedAt:exported,runId:'later-instant'}),now:exported});
 assert.equal(b.vehicles[0].price,26500);
});

test('stale exports and changed run-ID replays preserve independent history while Muse updates',()=>{
 const first=build({independent:feed(),independentContentHash:'sha256-original'});
 const oldFeed=feed([{...row,price:24000}],{runId:'old-export',generatedAt:'2026-10-31T15:00:00Z'});
 const nextMuse={...museRow,price:27600,verification_date:'2026-11-01'};
 const old=buildInventory({previous:first,muse:{search_date:'2026-11-01',listings:[nextMuse]},independent:oldFeed,independentContentHash:'sha256-old',now:'2026-11-01T20:00:00Z'});
 assert.equal(old.sources.independent.status,'error');assert.match(old.sources.independent.error,/older/);
 assert.equal(old.sources.independent.runId,first.sources.independent.runId);assert.equal(old.sources.independent.lastExportAt,first.sources.independent.lastExportAt);assert.equal(old.sources.independent.contentHash,'sha256-original');
 assert.equal(old.sources.muse.status,'connected');assert.equal(old.vehicles[0].price,27600);assert(!old.vehicles[0].priceHistory.some(p=>p.price===24000));
 const replay=build({previous:first,independent:feed([{...row,price:24000}]),independentContentHash:'sha256-changed'});
 assert.equal(replay.sources.independent.status,'error');assert.match(replay.sources.independent.error,/runId/);assert(!replay.vehicles[0].priceHistory.some(p=>p.price===24000));
 const retry=build({previous:first,independent:feed(),independentContentHash:'sha256-original'});
 assert.equal(retry.sources.independent.status,'connected');assert.equal(retry.vehicles[0].priceHistory.length,first.vehicles[0].priceHistory.length);
});

test('same-day uncertain cross-source quotes are deterministic in either ingestion order',()=>{
 const a=normalizeMuse(muse())[0],b=normalizeIndependent(feed([{...row,observedAt:'2026-10-31'}]),now)[0];
 const forward=buildInventory({seedVehicles:[a,b],now}),reverse=buildInventory({seedVehicles:[b,a],now});
 assert.equal(forward.vehicles.length,1);assert.equal(forward.vehicles[0].price,reverse.vehicles[0].price);
 assert.equal(forward.vehicles[0].currentObservation.url,reverse.vehicles[0].currentObservation.url);
 assert.equal(forward.vehicles[0].priceConflicts.length,2);assert.equal(forward.vehicles[0].priceDrop,0);
 const attributed={...forward.vehicles[0],origin:'A different researcher',discoveryAgents:['Other']};
 assert.equal(rankVehicles([attributed],now)[0].score,forward.vehicles[0].score);
});

test('known marketplace route variants merge without VIN and opaque recorded IDs remain awaiting verification',()=>{
 const a={...row,vin:null,url:'https://www.cargurus.com/details/458285167'},b={...a,url:'https://www.cargurus.com/Cars/listing/458285167'};
 const first=buildInventory({independent:feed([a]),now}),second=buildInventory({previous:first,independent:feed([b],{runId:'variant-route'}),now});
 assert.equal(second.vehicles.length,1);assert.equal(second.vehicles[0].sources.length,2);
 const opaque={...row,vin:null,listingId:'LukpoQTL8RGlMJv73SSeoA',url:'https://www.craigslist.org/view/d/hillsboro-2025-hyundai-santa-fe-hybrid/LukpoQTL8RGlMJv73SSeoA',verification:{status:'awaiting_verification',note:'Exact ad route requires rechecking.'}};
 const [v]=normalizeIndependent(feed([opaque]),now);assert.equal(v.listingState,'awaiting_verification');assert.equal(v.lastVerified,null);assert(!directListingUrl(v.sources[0].url,v.vin));
 assert.throws(()=>normalizeIndependent(feed([{...opaque,listingId:'invented-id'}]),now),/listingId/);
});

test('export validation rejects bad chronology, duplicates, invalid evidence and invented identity',()=>{
 const invalid=[feed([row,row]),feed([row],{reportDate:'2026-11-02'}),feed([row],{generatedAt:'2026-11-02T18:00:00Z'}),feed([{...row,observedAt:'2026-02-31'}]),feed([{...row,observedAt:'2026-11-01T18:00:00Z'}]),feed([{...row,url:'javascript:alert(1)'}]),feed([{...row,vin:null,url:'https://example.com/search'}]),feed([{...row,history:{title:'certified-perfect'}}]),feed([{...row,price:0}])];
 for(const bad of invalid)assert.throws(()=>normalizeIndependent(bad,now));
});

test('explicit unavailability evidence is retained while blocks and not-found are never sold claims',()=>{
 for(const status of ['inaccessible','not_found']){
  const v=buildInventory({independent:feed([{...row,verification:{status,note:'Source could not be accessed.'}}]),now}).vehicles[0];
  assert.equal(v.listingState,'stale');assert.equal(v.evidence,null);
 }
 const archived=buildInventory({independent:feed([{...row,verification:{status:'confirmed_unavailable',note:'Original seller page explicitly says this vehicle is sold.',evidenceUrl:row.url}}]),now});
 const retained=build({previous:archived,independent:feed([])});assert.equal(retained.vehicles[0].listingState,'confirmed_unavailable');assert.equal(retained.vehicles[0].evidence.reason,'Original seller page explicitly says this vehicle is sold.');assert(retained.vehicles[0].priceHistory.length);
});
