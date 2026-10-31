// Shared by the daily pipeline and the browser. Discovery agent is never a ranking input.
import {parseMuseJson, listingIdentity} from './sources.js';
import {validVin,safeUrl} from './core.js';
import {directListingUrl} from './listings.js';
import {adaptMuseFeed} from './muse-format.js';

export const LISTING_STATES=['verified_active','awaiting_verification','stale','confirmed_unavailable','excluded'];
const DAY=86400000;
const dateValue=v=>Date.parse(v||'');
const age=(date,now)=>Number.isFinite(dateValue(date))?(dateValue(now)-dateValue(date))/DAY:Infinity;
const key=v=>v.id||v.vin;
const union=(a=[],b=[])=>[...new Map([...a,...b].map(x=>[JSON.stringify(x),x])).values()];
const direct=v=>(v.sources||[]).some(s=>directListingUrl(s.url,v.vin));
const identity=(url,vin)=>{
 const value=listingIdentity(url)||directListingUrl(url,vin);if(!value)return '';
 try{const u=new URL(url),host=u.hostname.toLowerCase().replace(/^www\./,'');
  const id=host==='cargurus.com'?u.pathname.match(/\/(?:details|cars\/listing)\/(\d+)/i)?.[1]:host==='facebook.com'?u.pathname.match(/\/marketplace\/item\/(\d+)/)?.[1]:host==='autotrader.com'?u.pathname.match(/\/cars-for-sale\/vehicle\/(\d+)/)?.[1]:null;
  return id?host+':'+id:value;
 }catch{return '';}
};
export function qualifies(v){
 return ['HEV','PHEV'].includes(v.type)&&v.price>=20000&&v.price<=30000&&['AZ','CA','NV','OR','WA'].includes(v.state)&&!/(?:CR-V|Sportage|Tucson|Escape|RAV4|Outlander)/i.test(v.name||'');
}
export function listingState(v,now=new Date().toISOString()){
 if(['excluded','confirmed_unavailable'].includes(v.listingState)&&v.evidence?.reason)return v.listingState;
 if(v.listingState==='stale'||v.missingFromFeed||v.verification?.result==='inaccessible'||v.verification?.result==='not_found'||v.verification?.result==='redirected'||age(v.lastVerified||v.checked,now)>7)return 'stale';
 if(v.listingState==='awaiting_verification'||!direct(v)||!v.lastVerified)return 'awaiting_verification';
 return v.listingState==='verified_active'?'verified_active':'awaiting_verification';
}
export const isArchived=(v,now)=>['confirmed_unavailable','excluded'].includes(listingState(v,now));

export function rankVehicles(vehicles,now=new Date().toISOString()){
 const ranked=vehicles.map(input=>{
  const v=structuredClone(input),state=listingState(v,now);
  const history=[v.title,v.accidents,v.use].join(' ');
  // Transparent proxies, not brand-specific reliability or lifespan predictions.
  const mileage=Math.max(0,22-Math.max(0,(v.mileage||150000)-20000)/5000);
  const price=Math.max(0,18-(v.price-20000)/650);
  const remainingLife=Math.max(0,10-(new Date(now).getUTCFullYear()-v.year)*1.2);
  const clean=/reported clean|clean title|clean carfax/i.test(history)?10:0;
  const accident=/none reported|0 accidents|no accidents/i.test(history)?7:0;
  const owner=v.owners===1?4:0;
  const maintenance=/\b(?:documented|invoices available|service records verified)\b/i.test(v.maintenance||'')&&!/unknown|unverified|not documented/i.test(v.maintenance||'')?12:0;
  const awd=/AWD|4WD/i.test(v.drive||'')?4:0;
  const availability=state==='verified_active'?8:state==='awaiting_verification'?2:0;
  const risk=/rental|fleet|accident reported|buyback|lemon/i.test(history)&&!/^.*0 accidents.*$/.test(history)?5:0;
  v.score=Math.round((mileage+price+remainingLife+clean+accident+owner+maintenance+awd+availability-risk)*10)/10;
  v.rankReasons=[`Mileage / remaining-life proxy ${mileage.toFixed(1)}/22`,`Price value ${price.toFixed(1)}/18`,`Age proxy ${remainingLife.toFixed(1)}/10`,`History evidence ${clean+accident+owner}/21`,`Verified service documentation ${maintenance}/12`,`AWD bonus ${awd}/4`,`Availability evidence ${availability}/8`];
  v.priceDrop=0;
  const historyRows=(v.priceHistory||[]).filter(o=>o.url&&o.date&&Number.isFinite(o.price)).sort((a,b)=>dateValue(a.date)-dateValue(b.date));
  const last=historyRows.at(-1),prior=last&&historyRows.slice(0,-1).reverse().find(o=>identity(o.url,v.vin)===identity(last.url,v.vin)&&o.basis===last.basis&&dateValue(o.date)<dateValue(last.date));
  if(prior&&last.price<prior.price)v.priceDrop=prior.price-last.price;
  v.listingState=state;v.status=isArchived(v,now)?'removed':state==='verified_active'&&qualifies(v)?'shortlist':'watchlist';
  v.eligibility={qualifies:qualifies(v),reason:qualifies(v)?'Matches configured hybrid, midsize, price and location criteria; history still needs review.':'Outside configured hybrid, midsize, price or location criteria; preserved for audit.'};
  return v;
 });
 ranked.sort((a,b)=>Number(isArchived(a,now))-Number(isArchived(b,now))||Number(qualifies(b))-Number(qualifies(a))||b.score-a.score||String(key(a)).localeCompare(String(key(b))));
 return ranked.map((v,i)=>({...v,rank:i+1}));
}

function explicitState(row){
 if(row.museV2?.status==='excluded'&&/buyback|buy.back|lemon|salvage|branded/i.test(row.title_history||''))return {state:'excluded',reason:'Muse reports exclusion: '+row.title_history};
 const evidence=[row.new_vs_prior,row.concerns].filter(Boolean).join(' ');
 if(/EXCLUDED[^.]{0,100}(?:buyback|buy.back|lemon|salvage|branded)|manufacturer buyback.*(?:reported|badge)/i.test(evidence))return {state:'excluded',reason:evidence};
 if(row.verified_active===false&&/(?:page.{0,30}(?:sold or removed|no longer available|already left the lot)|SOLD badge|vehicle has been sold or removed)/i.test(evidence))return {state:'confirmed_unavailable',reason:evidence};
 return null;
}
export function normalizeMuse(feed){
 feed=adaptMuseFeed(feed);
 if(!feed||!Array.isArray(feed.listings)||feed.listings.length>2000)throw Error('Invalid Muse listing array');
 for(const row of feed.listings){
  if(!row||!['Full hybrid','Plug-in hybrid'].includes(row.hybrid_type)||!Number.isInteger(row.year)||row.year<1990||row.year>2100||!Number.isFinite(row.price)||row.price<=0||!Number.isFinite(row.mileage)||row.mileage<0||typeof row.model!=='string'||!row.model.trim())throw Error('Invalid Muse vehicle fields');
  const d=row.verification_date||feed.search_date;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(dateValue(d))||new Date(d).toISOString().slice(0,10)!==d)throw Error('Invalid Muse observation date');
  if(row.verified_active!=null&&typeof row.verified_active!=='boolean')throw Error('Invalid Muse availability flag');
 }
 const parsed=parseMuseJson(feed);
 return parsed.vehicles.map((v,i)=>{
  const row=feed.listings[i],reported=explicitState(row),date=row.verification_date||feed.search_date;
  const history=String(row.history||'');
  const id=row.vin||row.listing_id||listingIdentity(row.url);
  if(!id)throw Error('Muse row needs a VIN or vehicle-specific listing identifier');
  v.id=row.vin||'muse-'+stableHash(id);v.vin=row.vin||null;
  v.title=/clean title|title no issues|clean CARFAX/i.test(history)?'Reported clean':'Unknown';
  v.accidents=/(?:0|no) accidents|accident.free/i.test(history)?'None reported':/1 accident/i.test(history)?'1 accident reported':'Unknown';
  v.owners=/(?:1|one)[- ](?:previous )?owner/i.test(history)?1:/2 (?:previous )?owners/i.test(history)?2:/3 (?:previous )?owners/i.test(history)?3:null;
  v.use=/rental/i.test(history)?'Rental reported':/fleet/i.test(history)?'Fleet reported':/personal/i.test(history)?'Personal reported':'Unknown';
  v.sellerClaim=history||'History not supplied';v.discoveryAgents=['Muse'];v.sourceIds=['muse:'+(row.vin||row.listing_id||listingIdentity(row.url))];
  v.lastVerified=row.verified_active===true?date:null;
  v.listingState=reported?.state||(row.verified_active===true&&direct(v)?'verified_active':row.verified_active===false?'stale':'awaiting_verification');
  v.evidence=reported?{source:'Muse',url:'https://tmp85.github.io/hybrid-suv-search/',date:feed.search_date,reason:reported.reason}:null;
  v.priceHistory=[{date,price:v.price,url:row.url,agent:'Muse',basis:v.feeNote}];
  v.currentObservation={source:'Muse',observedAt:date,url:row.url,priceBasis:v.feeNote};
  v.sourcePresence={muse:{present:true,observedAt:date,mode:'snapshot'}};
  v.reportedPriceChange=Number.isFinite(row.price_vs_prior)?row.price_vs_prior:null;
  v.events=union(v.events,[{date:feed.search_date,text:row.new_vs_prior||'Imported from Muse JSON feed.'}]);
  if(row.museV2){
   v.name=row.model;v.trim=row.trim||'';v.city=row.city||'Unknown';v.state=row.state||'Unknown';
   if(row.city&&row.state)v.unknowns=v.unknowns.filter(x=>x!=='Vehicle location');
   v.museReport={...row.museV2,checkedAt:date,firstDiscovered:row.date_first_discovered||null,titleHistory:row.title_history||null,accidentHistory:row.accident_history||null,historyBasis:row.history_basis||null,maintenanceHistory:row.maintenance_history||null,priceHistory:row.price_history||[],photos:row.photos||[]};
   if(!reported&&['unavailable','stale'].includes(row.museV2.status)){
    v.listingState='stale';v.availability='Muse reports '+row.museV2.status+'; current seller availability unconfirmed';
   }
   if(row.museV2.originalUrlMissing){
    v.sources=[];v.priceHistory=v.priceHistory.map(p=>({...p,url:null}));v.currentObservation.url=null;
    v.unknowns=union(v.unknowns,['Original vehicle listing URL']);
   }
   v.observations=v.observations.map(o=>({...o,url:row.museV2.originalUrl,availability:v.availability}));
   v.events=union(v.events,[{date,text:'Muse source status: '+row.museV2.status+'.'}]);
  }
  return v;
 });
}
// Independent reports are partial observations, never a complete inventory snapshot.
const independentStates=['ad_observed','awaiting_verification','inaccessible','not_found','confirmed_unavailable','excluded'];
function isoDate(value,field){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)||!Number.isFinite(dateValue(value))||new Date(value.slice(0,10)).toISOString().slice(0,10)!==value.slice(0,10))throw Error('Invalid independent '+field);
 return value;
}
function textField(value,field,optional=false,max=3000){
 if(optional&&(value==null||value===''))return '';
 if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('Invalid independent '+field);
 return value.trim();
}
function evidenceUrl(value,field){
 const url=safeUrl(value);if(!url)throw Error('Invalid independent '+field);
 const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)throw Error('Invalid independent '+field);
 return url;
}
export function normalizeIndependent(feed,now=new Date().toISOString()){
 if(feed?.schemaVersion!==1||feed.source!=='chatgpt-independent'||feed.mode!=='observations'||!Array.isArray(feed.listings)||feed.listings.length>500)throw Error('Invalid independent feed envelope');
 textField(feed.runId,'runId',false,200);if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(feed.runId))throw Error('Invalid independent runId');isoDate(feed.generatedAt,'generatedAt');isoDate(feed.reportDate,'reportDate');evidenceUrl(feed.reportUrl,'reportUrl');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(feed.reportDate)||!feed.generatedAt.includes('T')||dateValue(feed.generatedAt)>dateValue(now)+300000||dateValue(feed.reportDate)>dateValue(feed.generatedAt)+300000)throw Error('Invalid independent report/export time');
 if(!feed.writer||!['one_time','scheduled'].includes(feed.writer.mode))throw Error('Invalid independent writer mode');
 if(feed.writer.automationId!=null)textField(feed.writer.automationId,'automationId',false,200);
 if(feed.writer.runUrl!=null)evidenceUrl(feed.writer.runUrl,'writer runUrl');
 const seen=new Set();
 return feed.listings.map(row=>{
  if(!row||!['HEV','PHEV'].includes(row.type)||!Number.isInteger(row.year)||row.year<1990||row.year>2100||!Number.isFinite(row.price)||row.price<=0||!Number.isFinite(row.mileage)||row.mileage<0)throw Error('Invalid independent vehicle fields');
  const name=textField(row.name,'name',false,150),url=evidenceUrl(row.url,'listing URL'),observedAt=isoDate(row.observedAt,'observedAt');
  if(dateValue(observedAt)>dateValue(feed.generatedAt)+300000)throw Error('Independent observation is later than export');
  const vin=row.vin==null?null:String(row.vin).toUpperCase();if(vin&&!validVin(vin))throw Error('Invalid independent VIN');
  let itemId=identity(url,vin);
  if(!itemId&&row.listingId){const explicit=textField(row.listingId,'listingId',false,200),u=new URL(url);if(![...u.pathname.split('/'),...u.searchParams.values()].includes(explicit))throw Error('Independent listingId is not present in recorded URL');itemId=u.hostname.toLowerCase().replace(/^www\./,'')+':source-id:'+explicit;}
  if(!vin&&!itemId)throw Error('Independent listing needs a VIN or defensible listing identity');
  const sourceId='independent:'+(vin||itemId),id=vin||'independent-'+stableHash(itemId);
  if(seen.has(sourceId))throw Error('Duplicate independent listing identity');seen.add(sourceId);
  const verification=row.verification;if(!verification||!independentStates.includes(verification.status))throw Error('Invalid independent verification status');
  const note=textField(verification.note,'verification note');
  const verificationUrl=evidenceUrl(verification.evidenceUrl||url,'verification evidence URL');
  if(row.fees!=null&&(!Number.isFinite(row.fees)||row.fees<0))throw Error('Invalid independent fees');
  if(row.rows!=null&&![2,3].includes(row.rows))throw Error('Invalid independent rows');
  if(row.drive!=null&&!['AWD','4WD','FWD','RWD','Unknown'].includes(row.drive))throw Error('Invalid independent drivetrain');
  const history=row.history||{},titleMap={reported_clean:'Reported clean',seller_claimed_clean:'Seller claims clean',unknown:'Unknown',branded:'Reported branded title'};
  if(history.title!=null&&!Object.hasOwn(titleMap,history.title))throw Error('Invalid independent title classification');
  if(history.accidents!=null&&!['none_reported','reported','unknown'].includes(history.accidents))throw Error('Invalid independent accident classification');
  if(history.owners!=null&&(!Number.isInteger(history.owners)||history.owners<1||history.owners>50))throw Error('Invalid independent owner count');
  if(history.evidenceUrl)evidenceUrl(history.evidenceUrl,'history evidence URL');
  const priceBasis=textField(row.priceBasis,'priceBasis'),isObserved=verification.status==='ad_observed'&&!!directListingUrl(url,vin),archived=['confirmed_unavailable','excluded'].includes(verification.status);
  const state=archived?verification.status:isObserved?'verified_active':['inaccessible','not_found'].includes(verification.status)?'stale':'awaiting_verification';
  const observation={source:'ChatGPT independent',runId:feed.runId,url,checkedAt:observedAt,price:row.price,priceBasis,availability:note,notes:row.notes||''};
  return {id,vin,name,trim:textField(row.trim,'trim',true,150),year:row.year,price:row.price,mileage:row.mileage,city:textField(row.city,'city',false,100),state:textField(row.state,'state',false,30),drive:row.drive||'Unknown',type:row.type,rows:row.rows||null,seller:textField(row.seller,'seller',true,150),fees:row.fees??null,feeNote:priceBasis,title:titleMap[history.title||'unknown'],accidents:history.accidents==='none_reported'?'None reported':history.accidents==='reported'?'Accident reported':'Unknown',owners:history.owners??null,use:history.use||'Unknown',maintenance:history.maintenance||'Unknown',checked:observedAt,lastVerified:isObserved?observedAt:null,availability:note,listingState:state,status:archived?'removed':isObserved?'shortlist':'watchlist',origin:'ChatGPT independent',imported:true,color:'blue',discoveryAgents:['ChatGPT independent'],sourceIds:[sourceId],sourcePresence:{independent:{present:true,observedAt,mode:'observations',runId:feed.runId}},currentObservation:{source:'ChatGPT independent',observedAt,url,priceBasis},evidence:archived?{source:'ChatGPT independent',url:verificationUrl,date:observedAt,reason:note}:null,verification:['inaccessible','not_found'].includes(verification.status)?{result:verification.status,url:verificationUrl,checkedAt:observedAt,reason:note}:undefined,historySource:'ChatGPT independent report; history claims attributed to recorded sources',historyDate:observedAt.slice(0,10),sellerClaim:row.notes||note,reason:'Independent discovery; ranked with the same evidence rules as every source.',concern:row.notes||note,unknowns:['Seller-confirmed unsold status','Complete title/history evidence','Maintenance invoices','Battery condition'],sources:[{label:'Original listing · via ChatGPT independent',url},...(history.evidenceUrl&&history.evidenceUrl!==url?[{label:'Reported history evidence',url:history.evidenceUrl}]:[])],observations:[observation],priceHistory:[{date:observedAt,price:row.price,url,agent:'ChatGPT independent',basis:priceBasis}],events:[{date:observedAt,text:'ChatGPT independent observation: '+note}]};
 });
}
function stableHash(s){let x=2166136261;for(const c of s)x=Math.imul(x^c.charCodeAt(0),16777619);return (x>>>0).toString(36);}
 const decode=s=>s.replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#x27;|&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
export function parseMuseSupplement(html,feedDate){
 const meta=html.match(/<p class="meta">([^<]+)/)?.[1];
 if(!meta)throw Error('Muse report date missing');
 const date=new Date(meta.split(' — ')[0]+' 12:00:00 GMT');
 if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==feedDate)throw Error('Muse HTML and JSON report dates disagree');
 const section=html.match(/<h2>All verified-active listings today \((\d+)\)<\/h2>\s*<table>([\s\S]*?)<\/table>/);
 if(!section)throw Error('Muse all-listings table contract changed');
 const rows=[...section[2].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].slice(1);
 if(rows.length!==Number(section[1]))throw Error('Muse HTML listing count mismatch');
 return rows.map(row=>{
  const raw=[...row[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map(m=>m[1]);
  if(raw.length!==9)throw Error('Muse table must have nine columns');
  const [vehicle,hybrid_type,miles,drivetrain,price,location,seller,history]=raw.map(decode),url=raw[8].match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g,'&');
  if(!listingIdentity(url))throw Error('Muse HTML record has no direct identity');
  const vin=url.toUpperCase().match(/[A-HJ-NPR-Z0-9]{17}/)?.[0]||null;
  return {year:Number(vehicle.slice(0,4)),model:vehicle.slice(5),trim:'',hybrid_type,mileage:Number(miles.replace(/\D/g,'')),drivetrain,price:Number(price.replace(/[^\d.]/g,'')),location,seller,history,concerns:history,url,vin,listing_id:listingIdentity(url),verification_date:feedDate,verified_active:true,new_vs_prior:'Muse HTML supplement: VIN not exported by the JSON feed; original listing ID retained.'};
 });
}

function prepare(v){
 const x=structuredClone(v);x.id=key(x);x.discoveryAgents=x.discoveryAgents||[x.origin||'ChatGPT'];
 x.sourceIds=x.sourceIds||[];x.priceHistory=x.priceHistory||[];
 x.currentObservation=x.currentObservation||{source:x.origin||'ChatGPT historical',observedAt:x.checked,url:x.sources?.[0]?.url||'',priceBasis:x.feeNote||''};
 x.sourcePresence=x.sourcePresence||{};
 if(x.discoveryAgents.includes('Muse')&&!x.sourcePresence.muse)x.sourcePresence.muse={present:!x.missingFromFeed,observedAt:x.lastVerified||x.checked,mode:'snapshot'};
 for(const o of x.observations||[])if(o.price!=null)x.priceHistory=union(x.priceHistory,[{date:o.checkedAt,price:o.price,url:o.url,agent:o.source,basis:o.priceBasis}]);
 for(const o of x.events||[])if(o.price!=null)x.priceHistory=union(x.priceHistory,[{date:o.date,price:o.price,url:x.sources?.[0]?.url||null,agent:x.origin||'ChatGPT',basis:o.text}]);
 if(!x.priceHistory.length&&x.price!=null)x.priceHistory=[{date:x.checked,price:x.price,url:x.sources?.[0]?.url||null,agent:x.origin||'ChatGPT',basis:x.feeNote}];
 if(!x.listingState){x.listingState='awaiting_verification';if(x.availability==='Original unavailable'){x.listingState='confirmed_unavailable';x.evidence={source:'ChatGPT retained research',date:x.checked,url:x.sources?.[0]?.url,reason:x.concern};}}
 return x;
}
function match(a,b){
 if(a.vin&&b.vin)return a.vin===b.vin;
 if(key(a)===key(b))return true;
 return (a.sources||[]).some(s=>identity(s.url,a.vin)&&(b.sources||[]).some(t=>identity(t.url,b.vin)===identity(s.url,a.vin)));
}
function observationOrder(a,b){
 const x=a.currentObservation||{source:a.origin,observedAt:a.checked,url:a.sources?.[0]?.url},y=b.currentObservation||{source:b.origin,observedAt:b.checked,url:b.sources?.[0]?.url};
 const xd=String(x.observedAt||'').slice(0,10),yd=String(y.observedAt||'').slice(0,10);
 if(String(x.observedAt).includes('T')&&String(y.observedAt).includes('T')&&dateValue(x.observedAt)!==dateValue(y.observedAt))return dateValue(y.observedAt)-dateValue(x.observedAt);
 if(xd!==yd)return yd.localeCompare(xd);
 if(x.source===y.source)return 1; // Later export by the same source can correct a quote.
 const evidenceRank=(v,o)=>Number(Number.isFinite(v.fees))+Number(!!v.lastVerified)+(!/(?:edmunds|cargurus|capitalone|iseecars|truecar|facebook|carfax|cars|autotrader)\.com$/i.test((()=>{try{return new URL(o.url).hostname;}catch{return '';}})())?2:0);
 const quality=evidenceRank(b,y)-evidenceRank(a,x);if(quality)return quality;
 // Same-day source-only dates are incomparable. Resolve ties by evidence content,
 // not attribution or ingestion order, and retain an explicit quote conflict.
 const signature=(v,o)=>JSON.stringify([o.url||'',o.priceBasis||'',v.price,v.mileage,v.name]);
 return signature(a,x).localeCompare(signature(b,y));
}
function merge(a,b){
 const latest=observationOrder(a,b)>=0;
 const result=latest?{...a,...b,id:a.id}:{...b,...a};
 result.vin=a.vin||b.vin||null;
 for(const field of ['sources','observations','events','discoveryAgents','priceHistory','sourceIds','verificationHistory','priceConflicts'])result[field]=union(a[field],b[field]);
 result.sourcePresence={...(a.sourcePresence||{}),...(b.sourcePresence||{})};
 if(a.price!==b.price&&String(a.checked).slice(0,10)===String(b.checked).slice(0,10)&&a.currentObservation?.source!==b.currentObservation?.source){
  result.priceConflicts=union(result.priceConflicts,[a,b].map(v=>({price:v.price,...v.currentObservation})));
  result.unknowns=union(result.unknowns,['Conflicting contemporaneous quotes; obtain a current written price.']);
 }
 if(a.verification)result.verificationHistory=union(result.verificationHistory,[a.verification]);
 if(b.verification)result.verificationHistory=union(result.verificationHistory,[b.verification]);
 if(a.verification&&b.lastVerified&&b.listingState==='verified_active'&&dateValue(b.lastVerified)>dateValue(a.verification.checkedAt)&&!b.verification)delete result.verification;
 if(a.verification&&b.verification&&dateValue(a.verification.checkedAt)>dateValue(b.verification.checkedAt))result.verification=a.verification;
 if(isArchived(a)){result.listingState=a.listingState;result.evidence=a.evidence;}
 if(isArchived(b)){result.listingState=b.listingState;result.evidence=b.evidence;}
 return result;
}
export function countInventory(vehicles,now){
 return {imported:vehicles.length,active:vehicles.filter(v=>!isArchived(v,now)&&listingState(v,now)!=='stale').length,stale:vehicles.filter(v=>listingState(v,now)==='stale').length,archived:vehicles.filter(v=>isArchived(v,now)).length,verified:vehicles.filter(v=>listingState(v,now)==='verified_active').length,awaitingVerification:vehicles.filter(v=>listingState(v,now)==='awaiting_verification').length,outsideCriteria:vehicles.filter(v=>!qualifies(v)).length,qualifyingActive:vehicles.filter(v=>!isArchived(v,now)&&listingState(v,now)!=='stale'&&qualifies(v)).length};
}
export function buildInventory({previous=null,seedVehicles=[],muse=null,independent=null,now=new Date().toISOString(),revision=null,sourceError=null,independentError=null,independentConfigured=false,independentAutomation=null,independentContentHash=null,overrides=[]}){
 let vehicles=[];
 for(const raw of [...(previous?.vehicles||seedVehicles)]){const v=prepare(raw),i=vehicles.findIndex(x=>match(x,v));if(i>=0)vehicles[i]=merge(vehicles[i],v);else vehicles.push(v);}
 const alerts=[],reconciliation=[];
 let independentRows=null;
 if(independent){try{
  independentRows=normalizeIndependent(independent,now);
  const prior=previous?.sources?.independent;
  if(prior?.lastExportAt&&(dateValue(independent.generatedAt)<dateValue(prior.lastExportAt)||independent.reportDate<prior.reportDate))throw Error('Independent export is older than the last successful export; retained last known good.');
  if(prior?.runId===independent.runId&&(prior.lastExportAt!==independent.generatedAt||(independentContentHash&&prior.contentHash&&independentContentHash!==prior.contentHash)))throw Error('Independent runId was reused with changed export content; use a new runId.');
 }catch(error){independent=null;independentError=error.message;independentConfigured=true;}}
 let health={...(previous?.sources?.muse||{}),lastAttemptAt:now};
 let independentHealth={...(previous?.sources?.independent||{}),lastAttemptAt:now};
 function applyRows(incoming,sourceKey){
  const ids=new Set();
  for(const v of incoming){const i=vehicles.findIndex(x=>match(x,v));if(i>=0){vehicles[i]=merge(vehicles[i],v);ids.add(key(vehicles[i]));}else{vehicles.push(v);ids.add(key(v));}}
  if(sourceKey==='muse')for(const v of vehicles)if(v.discoveryAgents.includes('Muse')&&!ids.has(key(v))&&!isArchived(v,now))v.sourcePresence={...(v.sourcePresence||{}),muse:{...(v.sourcePresence?.muse||{}),present:false,lastCheckedAt:now}};
  for(const v of incoming){const out=vehicles.find(x=>match(x,v));reconciliation.push({source:sourceKey,sourceId:v.sourceIds[0],vehicleId:key(out),disposition:isArchived(out,now)?'archived':qualifies(out)?'imported':'outside_criteria',reason:isArchived(out,now)?out.evidence.reason:qualifies(out)?'Merged by VIN or exact vehicle-specific URL.':'Outside price, location, midsize or hybrid criteria; retained for audit.'});}
 }
 if(muse){
  const incoming=normalizeMuse(muse);applyRows(incoming,'muse');
  if(previous?.sources?.muse?.imported&&incoming.length<previous.sources.muse.imported*0.65)alerts.push('Muse inventory dropped by more than 35%; missing records retained as stale.');
  if(age(muse.search_date,now)>2)alerts.push('Muse feed is more than 48 hours old.');
  health={...health,status:alerts.length?'warning':'connected',lastSuccessAt:now,reportDate:muse.search_date,error:null,imported:incoming.length,feedUrl:'https://tmp85.github.io/hybrid-suv-search/listings.json'};
 }else{health={...health,status:'error',error:sourceError||'Muse source unavailable; last known good vehicles retained.'};alerts.push(health.error);reconciliation.push(...(previous?.reconciliation||[]).filter(r=>r.source==='muse'||r.sourceId?.startsWith('muse:')));}
 if(independent){
  const incoming=independentRows;applyRows(incoming,'independent');
  const stale=age(independent.reportDate,now)>2;if(stale)alerts.push('Independent research feed is more than 48 hours old.');
  const verifiedAutomation=independentAutomation?.verified===true&&typeof independentAutomation.automationId==='string'&&!!independentAutomation.verifiedRunId&&!!independentAutomation.verificationUrl;
  const currentScheduled=verifiedAutomation&&independent.writer.mode==='scheduled'&&independent.writer.automationId===independentAutomation.automationId;
  independentHealth={...independentHealth,status:stale?'warning':'connected',lastSuccessAt:now,lastExportAt:independent.generatedAt,reportDate:independent.reportDate,error:null,imported:incoming.length,feedUrl:'https://raw.githubusercontent.com/tmp85/hybrid-suv-search/main/independent/listings.json',runId:independent.runId,reportUrl:independent.reportUrl,contentHash:independentContentHash,exporterMode:currentScheduled?'scheduled_verified':independent.writer.mode==='scheduled'?'scheduled_unverified':'one_time',automationVerified:verifiedAutomation,automationId:independent.writer.automationId||null,writer:independent.writer};
 }else{
  const configured=independentConfigured||!!previous?.sources?.independent?.lastSuccessAt;
  independentHealth={...independentHealth,status:configured?'error':'not_connected',lastSuccessAt:previous?.sources?.independent?.lastSuccessAt||null,reportDate:previous?.sources?.independent?.reportDate||null,error:independentError||'No valid independent export feed has been read. Historical research is retained.',exporterMode:previous?.sources?.independent?.exporterMode||'not_connected',automationVerified:previous?.sources?.independent?.automationVerified||false};
  if(configured)alerts.push('Independent research update failed: '+independentHealth.error);
  reconciliation.push(...(previous?.reconciliation||[]).filter(r=>r.source==='independent'||r.sourceId?.startsWith('independent:')));
 }
 // A partial independent report's omissions do not erase its prior observations.
 // Muse absence only makes a record missing when no fresh source still supports it.
 for(const v of vehicles){const presence=v.sourcePresence||{};v.missingFromFeed=presence.muse?.present===false&&!Object.values(presence).some(p=>p.present&&age(p.observedAt,now)<=7);}
 for(const override of overrides){const v=vehicles.find(x=>x.vin===override.vin||key(x)===override.vehicleId);if(v){
  if(['verified_active','stale'].includes(override.state)&&String(v.lastVerified||v.checked||'')>override.evidence.date)continue;
  v.listingState=override.state;v.evidence=override.evidence;
  if(override.state==='stale')v.missingFromFeed=true;
  if(override.state==='verified_active'){v.lastVerified=override.evidence.date;v.missingFromFeed=false;v.checked=override.evidence.date;v.verification={result:'verified',checkedAt:override.checkedAt||override.evidence.date,url:override.evidence.url,reason:override.evidence.reason};}
  if(Number.isFinite(override.price)){v.price=override.price;v.fees=override.fees??v.fees;v.feeNote=override.priceBasis||v.feeNote;v.priceHistory=union(v.priceHistory,[{date:override.checkedAt||override.evidence.date,price:v.price,url:override.evidence.url,agent:override.evidence.source,basis:v.feeNote}]);}
  v.events=union(v.events,[{date:override.evidence.date,text:override.evidence.reason}]);
 }}
 vehicles=rankVehicles(vehicles,now);
 if(previous?.counts?.active>=5&&countInventory(vehicles,now).active<previous.counts.active*0.65)alerts.push('Active inventory dropped by more than 35%; review verification changes and retained history.');
 const data={schemaVersion:1,generatedAt:now,revision,vehicles,sources:{muse:health,independent:independentHealth},counts:countInventory(vehicles,now),reconciliation,alerts};
 return validateDataset(data);
}
export function validateDataset(data){
 if(data?.schemaVersion!==1||!Number.isFinite(dateValue(data.generatedAt))||!Array.isArray(data.vehicles)||!data.vehicles.length||!data.sources?.muse||!data.sources?.independent||!Array.isArray(data.reconciliation)||!Array.isArray(data.alerts))throw Error('Invalid inventory envelope');
 const ids=new Set(),vins=new Set();
 for(const v of data.vehicles){
  if(!key(v)||ids.has(key(v))||!LISTING_STATES.includes(v.listingState)||!v.name||!Number.isFinite(v.price)||v.price<0||!Number.isFinite(v.mileage)||v.mileage<0||!Number.isInteger(v.year)||v.year<1990||v.year>2100)throw Error('Invalid or duplicate inventory vehicle '+key(v));
  ids.add(key(v));if(v.vin){if(!validVin(v.vin)||vins.has(v.vin))throw Error('Invalid or duplicate VIN '+v.vin);vins.add(v.vin);}
  if(!Array.isArray(v.sources)||v.sources.some(s=>!/^https?:\/\//.test(s.url)))throw Error('Invalid source URL');
  if(isArchived(v)&&!v.evidence?.reason)throw Error('Archived vehicle has no evidence');
 }
 for(const r of data.reconciliation)if(!ids.has(r.vehicleId))throw Error('Reconciliation references missing vehicle');
 if(JSON.stringify(data.counts)!==JSON.stringify(countInventory(data.vehicles,data.generatedAt)))throw Error('Inventory counts disagree');
 return data;
}
