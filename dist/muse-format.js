import {MUSE_URL} from './sources.js';

const hybridTypes=new Map([
 ['full hybrid','Full hybrid'],['full','Full hybrid'],['hev','Full hybrid'],
 ['plug-in hybrid','Plug-in hybrid'],['phev','Plug-in hybrid']
]);
const statuses=new Set(['active','unverified','unavailable','excluded','stale']);

function requiredText(value,field){
 if(typeof value!=='string'||!value.trim())throw Error('Invalid Muse v2 '+field);
 return value.trim();
}
function originalUrl(value){
 if(value==null||value==='')return null;
 if(typeof value!=='string')throw Error('Invalid Muse v2 listing URL');
 let url;try{url=new URL(value);}catch{throw Error('Invalid Muse v2 listing URL');}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Invalid Muse v2 listing URL');
 // Preserve the exported URL verbatim, including its query and source spelling.
 return value;
}

// Adapt structure, not evidence: upstream statuses and history remain source claims.
// The inventory normalizer decides dispositions and must remove provenance-only URLs
// from direct listing sources. The report URL only satisfies the legacy base parser.
export function adaptMuseFeed(feed){
 const result=structuredClone(feed);
 if(result?.schema_version!=='2.0')return result;
 if(!Array.isArray(result.listings)||result.listings.length>2000)throw Error('Invalid Muse v2 listing array');
 const ids=new Set();
 result.listings=result.listings.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Invalid Muse v2 listing');
  const id=requiredText(row.id,'source id');
  if(id.length>300||ids.has(id))throw Error('Invalid or duplicate Muse v2 source id');
  ids.add(id);
  const make=requiredText(row.make,'make');
  // Retain the original values when a caller adapts an already-adapted feed again.
  const prior=row.museV2?.schemaVersion==='2.0'?row.museV2:null;
  const model=requiredText(prior?prior.originalModel:row.model,'model');
  const originalHybridType=prior?prior.originalHybridType:row.hybrid_type;
  const hybridType=hybridTypes.get(requiredText(originalHybridType,'hybrid type').toLowerCase());
  if(!hybridType)throw Error('Invalid Muse v2 hybrid type');
  if(!statuses.has(row.status))throw Error('Invalid Muse v2 status');
  const url=originalUrl(prior?prior.originalUrl:row.url);
  const city=typeof row.city==='string'?row.city.trim():'';
  const state=typeof row.state==='string'?row.state.trim():'';
  const fullModel=model.toLowerCase()===make.toLowerCase()||model.toLowerCase().startsWith(make.toLowerCase()+' ')?model:make+' '+model;
  return {...row,
   listing_id:id,
   model:fullModel,
   hybrid_type:hybridType,
   location:[city,state].filter(Boolean).join(', '),
   verification_date:row.date_last_checked,
   url:url||MUSE_URL,
   // Never turn unavailable, stale or blocked into the legacy "sold" flag.
   verified_active:row.status==='active'&&url!==null?true:null,
   museV2:{schemaVersion:'2.0',sourceId:id,status:row.status,originalUrl:url,
    originalUrlMissing:url===null,originalModel:model,originalHybridType,reportUrl:MUSE_URL}
  };
 });
 return result;
}
