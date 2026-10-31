import {collectListingPhotos,PHOTO_LIMITS} from './collect-photos.mjs';
import {photosFor,safePhotoUrl} from '../dist/photos.js';
import {isArchived} from '../dist/inventory.js';

export const PHOTO_REFRESH_LIMITS=Object.freeze({attempts:45,concurrency:4,deadlineMs:120000,retryHours:20,refreshDays:7});
const HOUR=3600000;
const elapsed=(value,now)=>Number.isFinite(Date.parse(value))?Date.parse(now)-Date.parse(value):Infinity;
const bounded=(value,max,label,{zero=false}={})=>{
 if(!Number.isFinite(value)||value<(zero?0:1))throw Error('Invalid photo refresh '+label);
 return Math.min(Math.floor(value),max);
};

// photosFor may return a packaged fallback after rejecting an invalid canonical
// gallery. Comparing the displayed fields prevents that fallback authenticating it.
function canonicalGallery(vehicle,gallery=vehicle.listingPhotos){
 if(!gallery)return null;
 const displayed=photosFor({...vehicle,listingPhotos:gallery});
 const items=Array.isArray(gallery.items)?[...new Set(gallery.items.map(safePhotoUrl))]:[];
 return displayed?.verified===true&&displayed.checkedAt===gallery.checkedAt&&
  displayed.sourceUrl===safePhotoUrl(gallery.sourceUrl)&&items.length&&
  JSON.stringify(displayed.items)===JSON.stringify(items)?displayed:null;
}

/** Enrich retained records in place; photo failures never change vehicle availability. */
export async function refreshPhotos(dataset,{
 now=new Date().toISOString(),collector=collectListingPhotos,
 maxAttempts=PHOTO_REFRESH_LIMITS.attempts,concurrency=PHOTO_REFRESH_LIMITS.concurrency,
 deadlineMs=PHOTO_REFRESH_LIMITS.deadlineMs,retryAfterHours=PHOTO_REFRESH_LIMITS.retryHours,
 refreshAfterDays=PHOTO_REFRESH_LIMITS.refreshDays,force=false,clock=Date.now,
 timeoutMs=PHOTO_LIMITS.timeoutMs,...collectorOptions
}={}){
 if(!Array.isArray(dataset?.vehicles)||!Number.isFinite(Date.parse(now)))throw Error('Invalid photo refresh dataset or date');
 if(typeof collector!=='function'||typeof clock!=='function')throw Error('Invalid photo refresh collector or clock');
 maxAttempts=bounded(maxAttempts,PHOTO_REFRESH_LIMITS.attempts,'attempt limit',{zero:true});
 concurrency=bounded(concurrency,PHOTO_REFRESH_LIMITS.concurrency,'concurrency');
 deadlineMs=bounded(deadlineMs,PHOTO_REFRESH_LIMITS.deadlineMs,'deadline',{zero:true});
 timeoutMs=bounded(timeoutMs,PHOTO_LIMITS.timeoutMs,'request timeout');
 if(!Number.isFinite(retryAfterHours)||retryAfterHours<0||!Number.isFinite(refreshAfterDays)||refreshAfterDays<0)throw Error('Invalid photo refresh interval');
 retryAfterHours=Math.max(retryAfterHours,PHOTO_REFRESH_LIMITS.retryHours);
 const started=clock(),retained=dataset.vehicles.filter(v=>!isArchived(v,now));
 const summary={checkedAt:now,attempted:0,collected:0,retained:retained.length,
  archivedSkipped:dataset.vehicles.length-retained.length,skippedExistingPhotos:0,
  skippedRecentAttempt:0,eligible:0,deferred:0,withPhotos:0,withoutPhotos:0,
  outcomes:{collected:0,no_source:0,no_photos:0,inaccessible:0},deadlineReached:false,
  maxAttempts,concurrency,elapsedMs:0};
 const candidates=retained.filter(v=>{
  const photos=photosFor(v),canonical=canonicalGallery(v);
  if(photos&&(!canonical||(!force&&elapsed(canonical.checkedAt,now)<refreshAfterDays*24*HOUR))){summary.skippedExistingPhotos++;return false;}
  if(elapsed(v.photoImport?.checkedAt,now)<retryAfterHours*HOUR){summary.skippedRecentAttempt++;return false;}
  return true;
 }).map((vehicle,index)=>({vehicle,index})).sort((a,b)=>
  (Number.isFinite(a.vehicle.rank)?a.vehicle.rank:Infinity)-(Number.isFinite(b.vehicle.rank)?b.vehicle.rank:Infinity)||a.index-b.index
 ).map(item=>item.vehicle);
 summary.eligible=candidates.length;
 let cursor=0;
 async function worker(){
  while(cursor<candidates.length&&summary.attempted<maxAttempts){
   if(clock()-started>=deadlineMs){summary.deadlineReached=true;return;}
   const vehicle=candidates[cursor++];summary.attempted++;
   let result;
   try{
    // The collector receives a copy so even an unexpected failure cannot mutate
    // availability or the saved gallery before its result is validated.
    result=await collector(structuredClone(vehicle),{...collectorOptions,now,timeoutMs});
   }catch{
    result={attempt:{status:'inaccessible',reason:'Temporary photo collection failure; saved photos remain unchanged.'}};
   }
   let status=result?.attempt?.status;
   let reason=result?.attempt?.reason;
   const valid=result?.gallery&&canonicalGallery(vehicle,result.gallery);
   if(status==='collected'&&valid){
    vehicle.listingPhotos=structuredClone(result.gallery);summary.collected++;
   }else if(status==='collected'||result?.gallery){
    status='no_photos';reason='The returned photo gallery did not pass the saved listing identity checks.';
   }else if(!Object.hasOwn(summary.outcomes,status)){
    status='inaccessible';reason='Photo collection returned no usable result; saved photos remain unchanged.';
   }
   summary.outcomes[status]++;
   vehicle.photoImport={status,checkedAt:now,sourceUrl:safePhotoUrl(result?.attempt?.sourceUrl)||null,
    reason:typeof reason==='string'&&reason?reason:'No original listing photos could be collected.',
    ...(result?.stats?{stats:structuredClone(result.stats)}:{})};
  }
 }
 await Promise.all(Array.from({length:Math.min(concurrency,candidates.length,maxAttempts)},worker));
 summary.deferred=candidates.length-summary.attempted;
 summary.withPhotos=retained.filter(v=>photosFor(v)).length;
 summary.withoutPhotos=retained.length-summary.withPhotos;
 summary.elapsedMs=Math.max(0,clock()-started);
 dataset.photos=summary;
 return dataset;
}
