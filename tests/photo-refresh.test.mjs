import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshPhotos,PHOTO_REFRESH_LIMITS} from '../scripts/refresh-photos.mjs';

const now='2026-10-31T21:00:00.000Z',vin='5TDJGRFH0JS041065';
const source='https://www.capitalone.com/cars/vehicle-details/2018/Toyota/Highlander%2BHybrid/XLE/'+vin;
const vehicle=(id,extra={})=>({id,vin,rank:id,year:2018,name:'Toyota Highlander',sources:[{url:source}],listingState:'awaiting_verification',availability:'Seller availability unconfirmed',...extra});
const gallery=(date=now,extra={})=>({items:['https://images.example.com/highlander.jpg'],sourceUrl:source,sourceLabel:'Original listing',checkedAt:date,vin,listingId:null,verified:true,...extra});
const failure=(status='no_photos')=>({attempt:{status,checkedAt:now,sourceUrl:source,reason:'No accessible original listing photo.'},stats:{requests:1}});
const success=()=>({gallery:gallery(),attempt:{status:'collected',checkedAt:now,sourceUrl:source,reason:'Original listing cover validated.'}});

test('refreshes retained candidates by rank including outside criteria, and records every outcome without availability changes',async()=>{
 const dataset={vehicles:[vehicle(3),vehicle(1,{eligibility:{qualifies:false}}),vehicle(2)]},before=structuredClone(dataset),order=[];
 const result=await refreshPhotos(dataset,{now,concurrency:1,collector:async v=>{order.push(v.id);return v.id===1?success():failure(v.id===2?'no_source':'inaccessible');}});
 assert.equal(result,dataset);assert.deepEqual(order,[1,2,3]);
 assert.equal(dataset.photos.attempted,3);assert.equal(dataset.photos.collected,1);
 assert.equal(dataset.photos.withPhotos,1);assert.equal(dataset.photos.withoutPhotos,2);
 assert.deepEqual(dataset.photos.outcomes,{collected:1,no_source:1,no_photos:0,inaccessible:1});
 for(let i=0;i<dataset.vehicles.length;i++){
  assert.equal(dataset.vehicles[i].listingState,before.vehicles[i].listingState);
  assert.equal(dataset.vehicles[i].availability,before.vehicles[i].availability);
  assert.equal(dataset.vehicles[i].photoImport.checkedAt,now);
 }
});

test('skips archives, fresh canonical galleries and packaged galleries without mutating them',async()=>{
 const dataset={vehicles:[vehicle(1,{listingState:'excluded',evidence:{reason:'Outside search'}}),vehicle(2,{listingPhotos:gallery()}),vehicle(3,{vin:'JTEAAAAH6NJ101083'}),vehicle(4)]};
 const preserved=structuredClone(dataset.vehicles.slice(0,3)),calls=[];
 await refreshPhotos(dataset,{now,collector:async v=>{calls.push(v.id);return failure();}});
 assert.deepEqual(calls,[4]);assert.deepEqual(dataset.vehicles.slice(0,3),preserved);
 assert.equal(dataset.photos.archivedSkipped,1);assert.equal(dataset.photos.skippedExistingPhotos,2);
 assert.equal(dataset.photos.withPhotos,2);assert.equal(dataset.photos.withoutPhotos,1);
});

test('failed or invalid weekly gallery refresh keeps the complete last good gallery and unrelated vehicle state',async()=>{
 for(const returned of [failure('inaccessible'),{...success(),gallery:gallery(now,{vin:'KM8S6DA22NU035178'})},null]){
  const dataset={vehicles:[vehicle(1,{listingPhotos:gallery('2026-10-20T21:00:00.000Z')})]},old=structuredClone(dataset.vehicles[0].listingPhotos);
  await refreshPhotos(dataset,{now,collector:async v=>{v.availability='mutated';delete v.listingPhotos;return returned;}});
  assert.deepEqual(dataset.vehicles[0].listingPhotos,old);
  assert.equal(dataset.vehicles[0].availability,'Seller availability unconfirmed');
  assert.equal(dataset.photos.collected,0);assert.equal(dataset.photos.withPhotos,1);
  assert.equal(dataset.vehicles[0].photoImport.checkedAt,now);
 }
 const dataset={vehicles:[vehicle(1,{listingPhotos:gallery()})]};
 await refreshPhotos(dataset,{now,force:true,collector:async()=>{throw Error('network failed');}});
 assert.deepEqual(dataset.vehicles[0].listingPhotos,gallery());assert.equal(dataset.vehicles[0].photoImport.status,'inaccessible');
});

test('respects the twenty-hour retry interval even when forcing canonical refresh',async()=>{
 const recent='2026-10-31T02:00:00.000Z',ready='2026-10-31T01:00:00.000Z';
 const dataset={vehicles:[vehicle(1,{photoImport:{checkedAt:recent}}),vehicle(2,{photoImport:{checkedAt:ready}}),vehicle(3,{listingPhotos:gallery(),photoImport:{checkedAt:recent}})]},calls=[];
 await refreshPhotos(dataset,{now,force:true,retryAfterHours:0,collector:async v=>{calls.push(v.id);return failure();}});
 assert.deepEqual(calls,[2]);assert.equal(dataset.photos.skippedRecentAttempt,2);
 assert.equal(dataset.vehicles[0].photoImport.checkedAt,recent);
});

test('caps total attempts and concurrent work while awaiting every started collector',async()=>{
 const dataset={vehicles:Array.from({length:60},(_,i)=>vehicle(i+1))};
 let active=0,peak=0,finished=0;
 await refreshPhotos(dataset,{now,maxAttempts:999,concurrency:999,collector:async(v,options)=>{
  assert.equal(options.timeoutMs,12000);active++;peak=Math.max(peak,active);
  await new Promise(resolve=>setTimeout(resolve,1));active--;finished++;return failure();
 }});
 assert.equal(dataset.photos.attempted,PHOTO_REFRESH_LIMITS.attempts);assert.equal(finished,45);
 assert.equal(peak,4);assert.equal(active,0);assert.equal(dataset.photos.deferred,15);
 assert.equal(dataset.vehicles.filter(v=>v.photoImport).length,45);
});

test('the deadline stops scheduling more candidates but waits for in-flight results',async()=>{
 const dataset={vehicles:[vehicle(1),vehicle(2),vehicle(3),vehicle(4)]};
 let time=0,finished=0;
 await refreshPhotos(dataset,{now,deadlineMs:10,concurrency:2,clock:()=>time,collector:async()=>{
  await new Promise(resolve=>setTimeout(resolve,1));time=11;finished++;return success();
 }});
 assert.equal(finished,2);assert.equal(dataset.photos.attempted,2);assert.equal(dataset.photos.collected,2);
 assert.equal(dataset.photos.deadlineReached,true);assert.equal(dataset.photos.deferred,2);
 assert.equal(dataset.photos.elapsedMs,11);
});
