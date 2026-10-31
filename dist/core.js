import {marketplaces} from './sources.js';
export const STATES=['CA','OR','WA','NV','AZ'];
export const money=n=>Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n):'Unknown';
export const number=n=>Number.isFinite(n)?n.toLocaleString('en-US'):'Unknown';
export const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeUrl(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}}
export const validVin=value=>typeof value==='string'&&/^[A-HJ-NPR-Z0-9]{17}$/.test(value);
export const vehicleKey=v=>v.id||v.vin;
export function canonicalListingUrl(value){
 const safe=safeUrl(value);if(!safe)return '';
 const u=new URL(safe);if(u.username||u.password)return '';
 if(/(^|\.)facebook\.com$/i.test(u.hostname)){
  const m=u.pathname.match(/^\/marketplace\/item\/(\d+)(?:\/|$)/);
  if(m)return 'https://www.facebook.com/marketplace/item/'+m[1]+'/';
 }
 u.hash='';return u.href;
}
export function facebookItemId(value){
 const u=canonicalListingUrl(value);
 return u.match(/^https:\/\/www\.facebook\.com\/marketplace\/item\/(\d+)\/$/)?.[1]||null;
}
export function filterVehicles(vehicles,c,view='all',decisions={}){
 return vehicles.filter(v=>{
  const archived=['confirmed_unavailable','excluded'].includes(v.listingState)||v.availability==='Original unavailable';
  const status=archived?'removed':decisions[vehicleKey(v)]||v.status;
  if(view!=='removed'&&archived)return false;
  const query=c.query.trim().toLowerCase();
  if(view==='outside')return v.eligibility?.qualifies===false&&(!query||[v.vin,v.name,v.trim,v.year,v.city,v.state].join(' ').toLowerCase().includes(query))&&(!c.source||c.source==='all'||marketplaces(v).includes(c.source));
  if(view!=='removed'&&v.eligibility?.qualifies===false)return false;
  if(view==='all'&&status==='removed')return false;
  if(view==='shortlist'&&status!=='shortlist')return false;
  if(view==='watchlist'&&status!=='watchlist')return false;
  if(view==='removed'&&status!=='removed')return false;
  if(v.state==='Unknown'){if(c.includeUnknown===false)return false;}else if(!c.states.includes(v.state))return false;
  if(c.source&&c.source!=='all'&&!marketplaces(v).includes(c.source))return false;
  if(v.price!=null&&(v.price<c.minPrice||v.price>c.maxPrice))return false;
  if(v.mileage!=null&&v.mileage>c.maxMiles)return false;
  if(c.rows!=='all'&&v.rows!==Number(c.rows))return false;
  if(c.drive!=='all'&&v.drive!==c.drive)return false;
  if(c.type!=='all'&&v.type!==c.type)return false;
  if(c.cleanOnly&&v.title!=='Reported clean')return false;
  const q=c.query.trim().toLowerCase();
  return !q||[v.vin,v.name,v.trim,v.year,v.city,v.state].join(' ').toLowerCase().includes(q);
 }).sort((a,b)=>c.sort==='price'?(a.price??Infinity)-(b.price??Infinity):c.sort==='mileage'?(a.mileage??Infinity)-(b.mileage??Infinity):c.sort==='year'?(b.year??0)-(a.year??0):(a.rank??999)-(b.rank??999));
}
const text=(v,max=3000)=>typeof v==='string'?v.trim().slice(0,max):null;
function numeric(v,key,min,max){if(v==null||v==='')return null;const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)throw Error('Invalid '+key+'. Use a number between '+min+' and '+max+'.');return n;}
export function parseImport(raw){
 let parsed;try{parsed=JSON.parse(raw);}catch{throw Error('This is not valid JSON. Use the example format below.');}
 const list=Array.isArray(parsed)?parsed:parsed?.vehicles;
 if(!Array.isArray(list)||!list.length)throw Error('Provide an array of vehicles, or an object with a nonempty vehicles array.');
 if(list.length>200)throw Error('Import at most 200 vehicles at a time.');
 const seen=new Set();
 return list.map((v,i)=>{
  if(!v||typeof v!=='object')throw Error('Vehicle '+(i+1)+' is not an object.');
  const vin=String(v.vin||'').trim().toUpperCase()||null;
  if(vin&&!validVin(vin))throw Error('Vehicle '+(i+1)+' has an invalid VIN. Leave it null if unknown.');
  const url=v.url?canonicalListingUrl(v.url):null;
  if(v.url&&!url)throw Error('Use an http or https listing URL for vehicle '+(i+1)+'.');
  const itemId=facebookItemId(url),id=vin||(itemId?'fb-'+itemId:null);
  if(!id)throw Error('Vehicle '+(i+1)+' needs a valid VIN or a direct Facebook Marketplace item URL. Resolve Facebook share links to /marketplace/item/ first.');
  const identities=[...(vin?['vin:'+vin]:[]),...(url?['url:'+url]:[])];
  if(identities.some(k=>seen.has(k)))throw Error('Duplicate VIN or listing URL in this import. Keep one observation per listing.');
  identities.forEach(k=>seen.add(k));
  const state=text(v.state,2)?.toUpperCase()||null;
  if(state&&!STATES.includes(state))throw Error('State must be CA, OR, WA, NV or AZ for '+vin+'.');
  const checkedAt=text(v.checkedAt,40);
  if(checkedAt&&(!/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(checkedAt)||Number.isNaN(Date.parse(checkedAt))))throw Error('Use an ISO date or timestamp for checkedAt.');
  if(checkedAt&&new Date(checkedAt.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)!==checkedAt.slice(0,10))throw Error('checkedAt contains an invalid calendar date.');
  for(const k of ['year','rows'])if(v[k]!=null&&v[k]!==''&&!Number.isInteger(Number(v[k])))throw Error(k+' must be a whole number.');
  const type=text(v.hybridType,10);
  if(type&&!['HEV','PHEV'].includes(type))throw Error('hybridType must be HEV or PHEV; mild hybrids and EVs are outside this search.');
  const imageUrl=v.imageUrl?safeUrl(v.imageUrl):null;
  if(v.imageUrl&&(!imageUrl||new URL(imageUrl).protocol!=='https:'||new URL(imageUrl).username||new URL(imageUrl).password))throw Error('imageUrl must be a direct HTTPS photo URL without credentials.');
  return {imageUrl,id,vin,platform:itemId?'Facebook Marketplace':null,name:text(v.name,100),year:numeric(v.year,'year',1990,2100),price:numeric(v.price,'price',0,1000000),mileage:numeric(v.mileage,'mileage',0,1000000),fees:numeric(v.fees,'fees',0,100000),rows:numeric(v.rows,'rows',2,3),city:text(v.city,100),state,drive:text(v.drivetrain,20),type,trim:text(v.trim,100),titleHistory:text(v.titleHistory,300),availability:text(v.availability,500),checkedAt,url,notes:text(v.notes),priceBasis:text(v.priceBasis,500),sellerType:text(v.sellerType,50),listedAt:text(v.listedAt,60)};
 });
}
export function mergeObservations(existing,observations,source='Hermes',importedAt=new Date().toISOString()){
 const result=structuredClone(existing);let matched=0,added=0;
 for(const obs of observations){
  const byVin=obs.vin?result.find(x=>x.vin===obs.vin):null;
  const byUrl=obs.url?result.find(x=>[...(x.sources||[]),...(x.observations||[])].some(s=>canonicalListingUrl(s.url)===obs.url)):null;
  if(byVin&&byUrl&&byVin!==byUrl)throw Error('VIN and URL match two different saved records. Review those duplicates before importing.');
  let v=byVin||byUrl;
  if(v&&obs.vin&&v.vin&&obs.vin!==v.vin)throw Error('This listing URL is already associated with a different VIN. Verify the VIN before importing.');
  if(v)matched++;else{
   if(!obs.name||!obs.state)throw Error('New listing '+obs.id+' needs name and state.');
   v={vin:obs.vin,name:obs.name,trim:obs.trim||'',year:obs.year,mileage:obs.mileage,price:obs.price,fees:obs.fees,state:obs.state,city:obs.city||'Unknown',drive:obs.drive||'Unknown',type:obs.type||'Unknown',rows:obs.rows,status:'watchlist',rank:100+result.length,title:'Unknown',owners:null,accidents:'Unknown',use:'Unknown',maintenance:'Unknown',checked:obs.checkedAt?.slice(0,10)||null,availability:'Imported; unverified',historySource:'Imported claim; not independently verified',reason:'A new imported lead. Confirm segment, powertrain, fees, title and availability before recommending.',concern:obs.notes||'Independent verification pending.',sellerClaim:obs.titleHistory||'No underlying history evidence supplied.',unknowns:['Title / brands','Full history evidence','Fees / conditions','Service records','Actual availability'],color:'blue',sources:obs.url?[{label:source+' supplied listing',url:obs.url}]:[],events:[],imported:true,origin:source};
   v.id=obs.id;v.platform=obs.platform||null;
   v.feeNote=obs.priceBasis||'Fee inclusion, mandatory add-ons and pricing conditions are unknown.';
   if(!obs.vin)v.unknowns.unshift('VIN / cross-site duplicates');
   result.push(v);added++;
  }
  if(!v.vin&&obs.vin){v.vin=obs.vin;v.unknowns=(v.unknowns||[]).filter(x=>x!=='VIN / cross-site duplicates');}
  if(obs.url&&!(v.sources||[]).some(s=>canonicalListingUrl(s.url)===obs.url))v.sources.push({label:source+' supplied listing',url:obs.url});
  const record={...obs,source,importedAt};
  const key=JSON.stringify({...record,importedAt:null});
  v.observations=v.observations||[];
  if(!v.observations.some(o=>JSON.stringify({...o,importedAt:null})===key))v.observations.push(record);
 }
 return {vehicles:result,matched,added};
}
export function latestObservation(v,source){return v.observations?.filter(o=>o.source===source).at(-1)||null;}
export function latestHermes(v){return latestObservation(v,'Hermes');}
export function markdownExport(vehicles,notes={},decisions={}){
 const cell=x=>String(x??'Unknown').replace(/\|/g,'/').replace(/[\r\n]+/g,' ');
 return '# hybrid search — SUV Research\n\nExported '+new Date().toISOString()+'. Original research: October 15, 2026. Muse report and other observations keep their own recorded dates. No live availability guarantee.\n\n| Vehicle | VIN | Price | Miles | Location | Decision | Evidence / checked | Listing |\n|---|---|---:|---:|---|---|---|---|\n'+vehicles.map(v=>'| '+[v.year+' '+v.name+' '+v.trim,v.vin||'Unknown — URL tracked',money(v.price),number(v.mileage),v.city+', '+v.state,decisions[vehicleKey(v)]||v.status,v.availability+' / '+(v.checked||'unknown'),v.sources?.map(s=>s.url).join(' ; ')||'Unknown'].map(cell).join(' | ')+' |').join('\n')+'\n\n'+vehicles.map(v=>'## '+v.year+' '+v.name+' — '+(v.vin||'VIN unknown')+'\n\n'+v.feeNote+'\n\nHistory: '+v.title+'; '+v.accidents+'; '+v.use+'. '+v.historySource+'.\n\nConcern: '+v.concern+'\n\nPersonal notes: '+(notes[vehicleKey(v)]||'None')+'\n\n'+(v.observations||[]).map(o=>o.source+' observation (checked '+(o.checkedAt||'unknown')+'): '+money(o.price)+'; basis: '+(o.priceBasis||'unknown')+'; availability claim: '+(o.availability||'unknown')+'; '+(o.notes||'')+'\n').join('\n')).join('\n\n')+'\n\nAirfare, drive-home time and total travel costs pending buyer origin and destination. No sellers contacted.';
}
