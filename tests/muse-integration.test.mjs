import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildInventory,normalizeMuse,rankVehicles,qualifies,isArchived} from '../dist/inventory.js';
import {MUSE_URL} from '../dist/sources.js';

const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const fixture=await read('../audit/muse-format-2026-10-31.json');
const prior84=await read('../audit/independent-inventory.json');
const now='2026-10-31T20:00:00.000Z';
const normalized=normalizeMuse(fixture);
const oneRow=row=>({...structuredClone(fixture),listings:[structuredClone(row)],listing_count:1});

test('v2 inventory normalization reconciles every real source identity and retains its evidence',()=>{
 const data=buildInventory({muse:fixture,now});
 assert.equal(normalized.length,115);
 assert.equal(data.vehicles.length,115);
 assert.equal(data.sources.muse.imported,115);
 assert.equal(data.reconciliation.length,115);
 assert.equal(new Set(data.reconciliation.map(row=>row.sourceId)).size,115);
 assert.equal(new Set(data.reconciliation.map(row=>row.vehicleId)).size,115);
 for(const source of fixture.listings){
  const vehicle=data.vehicles.find(v=>v.museReport?.sourceId===source.id);
  assert(vehicle,'Missing upstream identity '+source.id);
  assert.equal(vehicle.vin,source.vin);
  assert.equal(vehicle.museReport.originalUrl,source.url);
  assert.equal(vehicle.museReport.status,source.status);
  assert.equal(vehicle.museReport.firstDiscovered,source.date_first_discovered);
  assert.equal(vehicle.museReport.checkedAt,source.date_last_checked);
  assert.equal(vehicle.museReport.titleHistory,source.title_history);
  assert.equal(vehicle.museReport.historyBasis,source.history_basis);
  assert.deepEqual(vehicle.museReport.priceHistory,source.price_history);
  assert.deepEqual(vehicle.museReport.photos,source.photos);
  assert(data.reconciliation.some(r=>r.vehicleId===vehicle.id));
 }
});

test('all seven missing original URLs remain absent from listing and price evidence',()=>{
 const missing=fixture.listings.filter(row=>row.url===null);
 assert.equal(missing.length,7);
 assert(missing.some(row=>row.vin===null),'Fixture must exercise a source-only identity');
 for(const source of missing){
  const vehicle=normalized.find(v=>v.museReport.sourceId===source.id);
  assert(vehicle.id);
  assert.deepEqual(vehicle.sources,[]);
  assert.equal(vehicle.currentObservation.url,null);
  assert(vehicle.observations.every(observation=>observation.url===null));
  assert(vehicle.priceHistory.every(observation=>observation.url===null));
  assert(vehicle.unknowns.includes('Original vehicle listing URL'));
  assert.notEqual(vehicle.listingState,'verified_active');
  assert.equal(vehicle.museReport.reportUrl,MUSE_URL,'Report attribution may remain metadata');
 }
});

test('unavailable source statuses do not assert sold; actual branded-title exclusions remain archived',()=>{
 const unavailable=normalized.filter(v=>v.museReport.status==='unavailable');
 assert.equal(unavailable.length,29);
 for(const vehicle of unavailable){
  assert.equal(vehicle.listingState,'stale');
  assert.equal(isArchived(vehicle,now),false);
  assert.doesNotMatch(vehicle.availability,/sold|removed/);
 }
 const exclusions=normalized.filter(v=>v.museReport.status==='excluded');
 assert.equal(exclusions.length,2);
 for(const vehicle of exclusions){
  assert.equal(vehicle.listingState,'excluded');
  assert.equal(isArchived(vehicle,now),true);
  assert.match(vehicle.evidence.reason,/Manufacturer buyback/);
 }
 const unexplained={...fixture.listings[0],status:'excluded',title_history:null,history:'Availability could not be confirmed',concerns:'Access blocked'};
 const [uncertain]=normalizeMuse(oneRow(unexplained));
 assert.equal(isArchived(uncertain,now),false,'A bare excluded status supplies no title or sold evidence');
});

test('source price history stays attributed metadata until comparable dated quotes establish a change',()=>{
 const source=fixture.listings.find(row=>row.price_history.length>1&&row.price_history[0].price>row.price);
 assert(source,'Fixture must include a reported reduction');
 const [vehicle]=rankVehicles(normalizeMuse(oneRow(source)),now);
 assert.deepEqual(vehicle.museReport.priceHistory,source.price_history);
 assert.equal(vehicle.priceHistory.length,1,'Unattributed historical prices are not comparable source quotes');
 assert.equal(vehicle.priceDrop,0);
 assert.equal(vehicle.priceHistory[0].price,source.price);
 assert.equal(vehicle.priceHistory[0].url,source.url);
});

test('explicit Alabama location is retained and kept outside the configured region',()=>{
 const vehicle=normalized.find(v=>v.vin==='KNDRHDLGXP5185400');
 assert(vehicle);
 assert.equal(vehicle.city,'Birmingham');
 assert.equal(vehicle.state,'AL');
 assert.equal(qualifies(vehicle),false);
 assert(!vehicle.unknowns.includes('Vehicle location'));
});

test('v2 refresh keeps all prior 84 IDs, saved galleries and evidence stable across repeated ingestion',()=>{
 assert.equal(prior84.vehicles.length,84);
 const previous=structuredClone(prior84);
 const original=previous.vehicles.find(v=>v.vin==='KM8S6DA22NU035178');
 original.listingPhotos={verified:true,vin:original.vin,listingId:null,sourceUrl:original.sources[0].url,sourceLabel:'CarGurus',checkedAt:now,items:['https://static.cargurus.com/images/forsale/2026/10/13/16/53/2022_hyundai_santa_fe_hybrid_plug-in-pic-8782503627368446169-1024x768.jpeg']};
 const merged=buildInventory({previous,muse:fixture,now});
 const repeated=buildInventory({previous:merged,muse:fixture,now});
 assert.equal(merged.counts.imported,124);
 assert.deepEqual(merged.counts,repeated.counts);
 assert.equal(merged.reconciliation.filter(r=>r.source==='muse').length,115);
 assert.equal(new Set(merged.vehicles.map(v=>v.id)).size,124);
 for(const old of previous.vehicles){
  const retained=merged.vehicles.find(v=>v.id===old.id);
  assert(retained,'Saved identity was removed or replaced: '+old.id);
  for(const source of old.sources)assert(retained.sources.some(s=>s.url===source.url),'Original source link disappeared');
 }
 assert.deepEqual(merged.vehicles.find(v=>v.id===original.id).listingPhotos,original.listingPhotos);
 assert.deepEqual(repeated.vehicles.find(v=>v.id===original.id).listingPhotos,original.listingPhotos);
 for(const vehicle of merged.vehicles){
  const again=repeated.vehicles.find(v=>v.id===vehicle.id);
  for(const field of ['sources','observations','priceHistory','sourceIds','museReport'])assert.deepEqual(again[field],vehicle[field],'Repeated ingestion changed '+field+' for '+vehicle.id);
 }
});
