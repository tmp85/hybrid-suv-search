import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildInventory,normalizeMuse,rankVehicles,listingState,isArchived,validateDataset,parseMuseSupplement} from '../dist/inventory.js';
import {checkSeller} from '../scripts/check-seller.mjs';
const now='2026-10-31T18:00:00Z';
const row={vin:'KNDRHDLG6P5204248',year:2023,model:'Kia Sorento Hybrid',trim:'EX AWD',hybrid_type:'Full hybrid',price:25000,mileage:65000,drivetrain:'AWD',location:'National City, CA',seller:'Dealer',url:'https://www.cargurus.com/details/451663169',history:'Clean title; 0 accidents; 1 owner; personal use',concerns:'Verify service records',verification_date:'2026-10-31',verified_active:true};
const feed=(rows=[row],date='2026-10-31')=>({listings:structuredClone(rows),search_date:date});
const dataset=()=>buildInventory({muse:feed(),now});
test('every feed row reconciles, merges by VIN and retains historical prices and original links',()=>{
 const first=dataset(),next=structuredClone(row);next.price=24500;next.verification_date='2026-11-01';
 const second=buildInventory({previous:first,muse:feed([next],'2026-11-01'),now:'2026-11-01T18:00:00Z'});
 assert.equal(second.vehicles.length,1);assert.equal(second.reconciliation.length,1);assert.equal(second.reconciliation[0].vehicleId,row.vin);
 assert.deepEqual(second.vehicles[0].priceHistory.map(p=>p.price),[25000,24500]);assert.equal(second.vehicles[0].priceDrop,500);
 assert.equal(second.vehicles[0].sources[0].url,row.url);assert.equal(second.vehicles[0].discoveryAgents[0],'Muse');
 assert.equal(second.counts.imported,second.counts.active+second.counts.stale+second.counts.archived);
});
test('same-day cross-source differences are not price drops',()=>{
 const v=dataset().vehicles[0];v.priceHistory.push({date:'2026-10-31',price:22000,url:'https://www.edmunds.com/kia/sorento-hybrid/2023/vin/'+row.vin+'/',basis:'different source'});
 assert.equal(rankVehicles([v],now)[0].priceDrop,0);
});
test('source failures preserve vehicles and last successful update',()=>{
 const first=dataset(),failed=buildInventory({previous:first,muse:null,sourceError:'HTTP 503',now:'2026-11-01T18:00:00Z'});
 assert.equal(failed.vehicles[0].price,first.vehicles[0].price);assert.equal(failed.sources.muse.lastSuccessAt,first.sources.muse.lastSuccessAt);
 assert.equal(failed.sources.muse.status,'error');assert.deepEqual(failed.reconciliation,first.reconciliation);assert(failed.alerts.includes('HTTP 503'));
});
test('newer positive source evidence supersedes old failed check, never the reverse',()=>{
 const first=dataset();first.vehicles[0].verification={result:'inaccessible',checkedAt:'2026-10-31T19:00:00Z',url:row.url};
 const sameDay=buildInventory({previous:first,muse:feed(),now:'2026-10-31T20:00:00Z'});assert.equal(sameDay.vehicles[0].listingState,'stale');
 const next={...row,verification_date:'2026-11-01'};
 const newer=buildInventory({previous:first,muse:feed([next],'2026-11-01'),now:'2026-11-01T18:00:00Z'});
 assert.equal(newer.vehicles[0].listingState,'verified_active');assert.equal(newer.vehicles[0].verification,undefined);assert.equal(newer.vehicles[0].verificationHistory[0].result,'inaccessible');
});
test('compact crossovers and nonhybrids are flagged outside eligibility',()=>{
 const compact=rankVehicles([{...dataset().vehicles[0],name:'Honda CR-V Hybrid'}],now)[0];assert.equal(compact.eligibility.qualifies,false);assert.equal(compact.status,'watchlist');
 const gas=rankVehicles([{...dataset().vehicles[0],type:'Gasoline'}],now)[0];assert.equal(gas.eligibility.qualifies,false);
});
test('missing, stale, blocked and false-only records are never assumed unavailable',()=>{
 const first=dataset(),other={...row,vin:'KNDRH4LG7P5193809',url:'https://www.cargurus.com/details/460851868'};
 const missing=buildInventory({previous:first,muse:feed([other]),now});
 const old=missing.vehicles.find(v=>v.vin===row.vin);assert.equal(listingState(old,now),'stale');assert(!isArchived(old,now));
 const falseFlag=normalizeMuse(feed([{...row,verified_active:false}]))[0];assert(!isArchived(falseFlag,now));
 const blocked={...first.vehicles[0],verification:{result:'inaccessible'}};assert.equal(listingState(blocked,now),'stale');assert(!isArchived(blocked,now));
 assert.equal(listingState(first.vehicles[0],'2026-11-09T00:00:00Z'),'stale');
});
test('explicit sold/removed evidence and disqualifying buybacks archive but preserve history',()=>{
 const unavailable={...row,verified_active:false,new_vs_prior:'Edmunds page says vehicle no longer available — sold or removed'};
 const a=buildInventory({previous:dataset(),muse:feed([unavailable]),now});assert.equal(a.vehicles[0].listingState,'confirmed_unavailable');assert.equal(a.counts.active,0);assert.equal(a.counts.archived,1);assert(a.vehicles[0].priceHistory.length);
 const excluded={...row,new_vs_prior:'EXCLUDED — manufacturer buyback reported; fails clean-title criterion'};
 const b=buildInventory({previous:dataset(),muse:feed([excluded]),now});assert.equal(b.vehicles[0].listingState,'excluded');
});
test('ranking is identical for independent and Muse agents and does not use supplied ranks',()=>{
 const original=dataset().vehicles[0],a={...original,origin:'Muse',discoveryAgents:['Muse'],rank:1},b={...original,origin:'ChatGPT',discoveryAgents:['ChatGPT'],rank:999};
 const x=rankVehicles([a],now)[0],y=rankVehicles([b],now)[0];assert.equal(x.score,y.score);assert.deepEqual(x.rankReasons,y.rankReasons);
});
test('feed rejects malformed data instead of replacing last known good',()=>{
 for(const bad of [{...row,hybrid_type:'Gasoline'},{...row,price:'25000'},{...row,vin:'bad'},{...row,verification_date:'2026-02-31'}])assert.throws(()=>normalizeMuse(feed([bad])));
 const bad=dataset();bad.vehicles.push(structuredClone(bad.vehicles[0]));assert.throws(()=>validateDataset(bad));
});
test('direct seller blocks, redirects and 404s do not mean sold; explicit unavailable does',async()=>{
 const v={...dataset().vehicles[0],sources:[{url:'https://dealer.example/inventory/used-2023-kia-sorento-hybrid-'+row.vin.toLowerCase()+'/'}]};
 const response=(status,body,url,redirected=false)=>async()=>({status,ok:status===200,text:async()=>body,url:url||v.sources[0].url,redirected});
 assert.equal((await checkSeller(v,response(403,''),now)).result,'inaccessible');
 assert.equal((await checkSeller(v,response(404,''),now)).result,'not_found');
 assert.equal((await checkSeller(v,response(200,'Homepage','https://dealer.example/',true),now)).result,'redirected');
 assert.equal((await checkSeller(v,response(200,'Inventory','https://dealer.example/inventory?vehicleStatus=unavailable',true),now)).result,'unavailable');
 assert.equal((await checkSeller(v,response(200,'<title>2023 Kia Sorento</title>'+row.vin+' contact form CAPTCHA'),now)).result,'observed');
});
test('historical baseline and all current canonical records have defensible unique identities',async()=>{
 const historical=JSON.parse(await readFile(new URL('../dist/muse-feed-snapshot.json',import.meta.url),'utf8'));
 assert.equal(normalizeMuse(historical).length,historical.listings.length);
});
test('all four October 31 removals remain in history with evidence-based states',async()=>{
 const historical=JSON.parse(await readFile(new URL('../dist/muse-prior-snapshot.json',import.meta.url),'utf8'));
 const overrides=JSON.parse(await readFile(new URL('../data/verification-overrides.json',import.meta.url),'utf8'));
 const expected={'KNDRG4LG4N5110224':'excluded','KNDRHDLGXP5185400':'confirmed_unavailable','KNDRH4LG9P5169625':'confirmed_unavailable','KNDRHDLG0P5189018':'stale'};
 const data=buildInventory({seedVehicles:normalizeMuse(historical),muse:feed(),overrides,now});
 for(const [vin,state]of Object.entries(expected)){const v=data.vehicles.find(v=>v.vin===vin);assert(v,vin+' must survive feed removal');assert.equal(v.listingState,state);assert(v.priceHistory.length);assert(v.evidence.reason);}
});
test('HTML supplement requires matching report date and exact row count',()=>{
 const h='<p class="meta">Saturday, October 31, 2026 — report</p><h2>All verified-active listings today (1)</h2><table><tr><th>heading</th></tr><tr>'+['2021 Toyota Highlander Hybrid XLE','Full hybrid','83,952 mi','AWD','$29,500','Covina, CA','Future Walker Cars','Clean title; 0 accidents; 1 previous owner','<a href="https://www.cargurus.com/details/458285167">View listing</a>'].map(x=>'<td>'+x+'</td>').join('')+'</tr></table>';
 const rows=parseMuseSupplement(h,'2026-10-31');assert.equal(rows.length,1);assert.equal(rows[0].listing_id,'https://www.cargurus.com/details/458285167');assert.equal(rows[0].vin,null);
 assert.equal(normalizeMuse(feed(rows))[0].lastVerified,'2026-10-31');assert.throws(()=>parseMuseSupplement(h,'2026-10-30'));assert.throws(()=>parseMuseSupplement(h.replace('today (1)','today (2)'),'2026-10-31'));
});
