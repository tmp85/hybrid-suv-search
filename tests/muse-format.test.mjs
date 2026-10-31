import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {adaptMuseFeed} from '../dist/muse-format.js';
import {MUSE_URL,parseMuseJson,listingIdentity} from '../dist/sources.js';

const fixture=JSON.parse(await readFile(new URL('../audit/muse-format-2026-10-31.json',import.meta.url),'utf8'));
const row=()=>structuredClone(fixture.listings[0]);
const feed=(rows)=>({...structuredClone(fixture),listings:rows,listing_count:rows.length});

test('real v2 feed retains all 115 records and original evidence without mutating the export',()=>{
 const before=structuredClone(fixture),adapted=adaptMuseFeed(fixture);
 assert.deepEqual(fixture,before);
 assert.equal(adapted.listings.length,115);
 assert.equal(parseMuseJson(adapted).vehicles.length,115);
 assert.equal(new Set(adapted.listings.map(r=>r.listing_id)).size,115);
 assert.deepEqual(adapted.counts,{active:22,unverified:47,unavailable:29,excluded:2,stale:15});
 assert.equal(adapted.generated_at,fixture.generated_at);
 for(let i=0;i<adapted.listings.length;i++){
  const actual=adapted.listings[i],original=fixture.listings[i];
  assert.equal(actual.listing_id,original.id);
  assert.equal(actual.museV2.sourceId,original.id);
  assert.equal(actual.museV2.status,original.status);
  assert.equal(actual.museV2.originalUrl,original.url);
  assert.equal(actual.verification_date,original.date_last_checked);
  for(const field of ['price_history','photos','history','title_history','accident_history','history_basis','maintenance_history','battery_warranty_note','date_first_discovered','marketplace','discovery_agent'])assert.deepEqual(actual[field],original[field]);
 }
 assert.deepEqual(adaptMuseFeed(adapted),adapted);
});

test('hybrid aliases and split model/location adapt explicitly, while unsupported aliases fail the feed',()=>{
 for(const [value,expected] of [['Full hybrid','Full hybrid'],['full','Full hybrid'],['HEV','Full hybrid'],['Plug-in hybrid','Plug-in hybrid'],['PHEV','Plug-in hybrid']]){
  const source={...row(),hybrid_type:value};
  const [actual]=adaptMuseFeed(feed([source])).listings;
  assert.equal(actual.hybrid_type,expected);
  assert.equal(actual.model,'Kia Sorento Hybrid');
  assert.equal(actual.location,'Fresno, CA');
  assert.equal(actual.museV2.originalHybridType,value);
 }
 assert.equal(adaptMuseFeed(feed([{...row(),model:'Kia Sorento Hybrid'}])).listings[0].model,'Kia Sorento Hybrid');
 for(const value of ['hybrid','mild hybrid','EV','gasoline',null,4])assert.throws(()=>adaptMuseFeed(feed([{...row(),hybrid_type:value} ])),/hybrid type/);
});

test('null and shared search URLs keep source identities and uncertainty without inventing a VIN or a direct listing',()=>{
 const nullSource=fixture.listings.find(r=>r.url===null&&r.vin===null);
 const searchSource={...row(),id:'search-lead',vin:null,url:'https://www.cargurus.com/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action',status:'unverified'};
 const [missing,search]=adaptMuseFeed(feed([nullSource,searchSource])).listings;
 assert.equal(missing.vin,null);
 assert.equal(missing.listing_id,nullSource.id);
 assert.equal(missing.url,MUSE_URL);
 assert.equal(missing.museV2.originalUrl,null);
 assert.equal(missing.museV2.originalUrlMissing,true);
 assert.equal(missing.verified_active,null);
 assert.equal(listingIdentity(missing.url),'');
 assert.equal(search.url,searchSource.url);
 assert.equal(search.vin,null);
 assert.equal(search.museV2.originalUrlMissing,false);
 assert.equal(search.verified_active,null);
 assert.equal(listingIdentity(search.url),'');
});

test('v2 source dispositions cannot silently become sold claims',()=>{
 for(const status of ['unverified','unavailable','excluded','stale']){
  const [actual]=adaptMuseFeed(feed([{...row(),status,verified_active:false,concerns:'Blocked by access restrictions'}])).listings;
  assert.equal(actual.verified_active,null);
  assert.equal(actual.museV2.status,status);
  assert.doesNotMatch(parseMuseJson(feed([actual])).vehicles[0].availability,/sold|removed|excluded/);
 }
 assert.equal(adaptMuseFeed(feed([{...row(),status:'active',url:null}])).listings[0].verified_active,null);
 assert.throws(()=>adaptMuseFeed(feed([{...row(),status:'mystery'}])),/status/);
});

test('legacy feeds are unchanged and v2 rejects unusable identities or unsafe URLs',async()=>{
 const legacy=JSON.parse(await readFile(new URL('../dist/muse-feed-snapshot.json',import.meta.url),'utf8'));
 assert.deepEqual(adaptMuseFeed(legacy),legacy);
 assert.notEqual(adaptMuseFeed(legacy),legacy);
 assert.throws(()=>adaptMuseFeed(feed([{...row(),id:null}])),/source id/);
 assert.throws(()=>adaptMuseFeed(feed([row(),row()])),/source id/);
 for(const url of ['javascript:alert(1)','https://name:secret@example.com/listing/123','not a URL',42])assert.throws(()=>adaptMuseFeed(feed([{...row(),url}])),/listing URL/);
});
