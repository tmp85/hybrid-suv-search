import {directListingUrl} from '../dist/listings.js';
import {listingIdentity,marketplace} from '../dist/sources.js';
import {validVin} from '../dist/core.js';

// These are per-vehicle ceilings, including when the upstream HTML is malformed.
export const PHOTO_LIMITS=Object.freeze({sources:2,redirects:2,htmlBytes:3000000,imageBytes:8000000,timeoutMs:12000,items:8});
const VIN=/\b[A-HJ-NPR-Z0-9]{17}\b/g;
const decode=s=>String(s||'').replace(/&#(?:x([\da-f]+)|(\d+));|&(amp|quot|apos|lt|gt);/gi,(_,hex,num,named)=>{
 if(hex||num){const n=parseInt(hex||num,hex?16:10);return n<=0x10ffff?String.fromCodePoint(n):'';}
 return {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'}[named.toLowerCase()];
});
const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m=>[m[1].toLowerCase(),decode(m[2]??m[3]??m[4])]));
const host=url=>new URL(url).hostname.toLowerCase().replace(/^www\./,'');

// Photo-only support for two observed original routes. This deliberately does
// not broaden the separate seller-availability checker or invent new URLs.
function directPhotoSource(url,vin){
 if(directListingUrl(url,vin))return url;
 if(!vin)return '';
 try{
  const u=new URL(url),h=host(url);
  if(h==='newmanautonetwork.com'&&/^\/car-for-sale\/[a-z0-9-]+\/?$/.test(u.pathname))return url;
  if(h==='craigslist.org'&&/^\/view\/d\/[a-z0-9-]+\/[A-Za-z0-9_-]{16,40}\/?$/.test(u.pathname))return url;
 }catch{}
 return '';
}

function publicUrl(value,base){
 try{
  const u=new URL(decode(value),base),h=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443'))return '';
  // Source feeds cannot cause requests to local services or literal IP addresses.
  if(!h.includes('.')||h.endsWith('.local')||h.endsWith('.localhost')||h.endsWith('.internal')||/^[\d.]+$/.test(h)||h.includes(':'))return '';
  return u.href;
 }catch{return '';}
}
function photoUrl(value,base){
 const url=typeof value==='string'?publicUrl(value,base):'';
 if(!url)return '';
 const u=new URL(url);
 if(/(?:^|[\/_.-])(?:placeholder|no[-_]?image|no[-_]?photo|image[-_]?not[-_]?available|logo|favicon|stock[-_]?(?:photo|image)s?|default[-_]?vehicle)(?:[\/_.-]|$)/i.test(decode(u.pathname)))return '';
 return url;
}
function modelMatches(text,vehicle){
 let title=decode(text).toLowerCase();try{title=decodeURIComponent(title);}catch{}
 title=title.replace(/[^a-z0-9]+/g,' ');
 const words=String(vehicle.name||'').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
 return Boolean(vehicle.year&&words.length&&new RegExp(`\\b${vehicle.year}\\b`).test(title)&&words.every(w=>new RegExp(`\\b${w}\\b`).test(title)));
}
function vinIn(value){return [...String(value||'').toUpperCase().matchAll(VIN)].map(m=>m[0]).filter(validVin);}
function sameListing(a,b,vin){
 try{
  if(host(a)!==host(b)||!directPhotoSource(b,vin))return false;
  if(listingIdentity(a)&&listingIdentity(a)===listingIdentity(b))return true;
  if(host(a)==='cargurus.com')return a.match(/\/(?:details|listing)\/(\d+)/i)?.[1]===b.match(/\/(?:details|listing)\/(\d+)/i)?.[1];
  if(vin&&vinIn(decode(new URL(a).pathname)).includes(vin)&&vinIn(decode(new URL(b).pathname)).includes(vin))return true;
  const path=u=>decode(new URL(u).pathname).replace(/\/$/,'').toLowerCase();
  return path(a)===path(b);
 }catch{return false;}
}
function jsonObjectAfter(text,marker){
 const at=text.indexOf(marker);if(at<0)return null;
 const start=text.indexOf('{',at+marker.length);if(start<0)return null;
 let depth=0,string=false,escape=false;
 for(let i=start;i<text.length;i++){
  const c=text[i];
  if(string){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')string=false;continue;}
  if(c==='"')string=true;
  else if(c==='{')depth++;
  else if(c==='}'&&--depth===0){try{return JSON.parse(text.slice(start,i+1));}catch{return null;}}
 }
 return null;
}
function structuredVehicles(html){
 const found=[];
 const add=node=>{
  if(!node||typeof node!=='object')return;
  const types=[node['@type']].flat();
  if(types.some(t=>['Vehicle','Car','Product'].includes(t)))found.push(node);
  // Only schema roots, graph roots, and explicitly designated primary entities.
  // Never descend through recommendations, item lists, offers, or arbitrary data.
  if(types.includes('WebPage'))for(const primary of [node.mainEntity].flat())add(primary);
 };
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
  if(attrs(m[1]).type?.toLowerCase()!=='application/ld+json')continue;
  try{for(const root of [JSON.parse(m[2])].flat()){add(root);if(Array.isArray(root?.['@graph']))root['@graph'].forEach(add);}}catch{}
 }
 return found;
}
function imageValues(value){return [value].flat().flatMap(item=>typeof item==='string'?[item]:item&&typeof item==='object'?[item.contentUrl||item.url||'']:[]);}
function divBlock(html,start){
 let depth=0;
 for(const tag of html.slice(start).matchAll(/<\/?div\b[^>]*>/gi)){
  if(/^<\//.test(tag[0]))depth--;else depth++;
  if(depth===0)return html.slice(start,start+tag.index+tag[0].length);
 }
 return '';
}
function craigslistVin(entity,html,vin){
 if(!vin)return false;
 const primary=html.match(/<div\b[^>]*class=["'][^"']*\bauto_vin\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||'';
 if(vinIn(decode(primary.replace(/<[^>]*>/g,' '))).join()!==vin)return false;
 if([...new Set(vinIn(entity.description))].join()!==vin)return false;
 // This source publishes VIN in the original dealer URL inside Product's
 // description rather than in vehicleIdentificationNumber.
 const dealerUrl=String(entity.description||'').match(new RegExp(`https://[a-z0-9.-]+/[^<>"\\n]*?${vin}(?=\\s|$|[?&#])`,'i'))?.[0];
 return Boolean(dealerUrl&&publicUrl(dealerUrl)&&vinIn(decode(new URL(dealerUrl).pathname)).includes(vin));
}

// Parsing is deliberately separate from the network policy to keep provenance
// checks testable. A returned URL has not passed the image download check yet.
export function extractListingPhotos(html,vehicle,sourceUrl,finalUrl=sourceUrl){
 const vin=validVin(vehicle.vin)?vehicle.vin.toUpperCase():null;
 if(!sameListing(sourceUrl,finalUrl,vin))return {items:[],reason:'The source redirected away from the original vehicle listing.'};
 const metadata={};for(const m of html.matchAll(/<meta\b[^>]*>/gi)){const a=attrs(m[0]);if(a.property||a.name)metadata[(a.property||a.name).toLowerCase()]=a.content||'';}
 const title=metadata['og:title']||decode(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]||'');
 if(!modelMatches(title,vehicle))return {items:[],reason:'The primary page title does not match the vehicle year and model.'};
 if(!vin&&!listingIdentity(sourceUrl))return {items:[],reason:'No VIN or stable direct listing identity is available.'};
 const primaryUrl=metadata['og:url'];
 if(primaryUrl&&!sameListing(sourceUrl,publicUrl(primaryUrl,finalUrl),vin))return {items:[],reason:'The primary page identifies a different listing.'};
 let images=[],confirmed=false;
 if(host(sourceUrl)==='newmanautonetwork.com'){
  const roots=[...html.matchAll(/<div\b[^>]*>/gi)].filter(m=>/^https?:\/\/schema\.org\/Vehicle$/.test(attrs(m[0]).itemtype||''));
  if(roots.length!==1||!vin)return {items:[],reason:'A single primary dealer Vehicle block with a known VIN is required.'};
  const block=divBlock(html,roots[0].index);
  const name=decode(block.match(/<h1\b[^>]*itemprop=["']name["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]*>/g,' ')||'');
  const rows=[...block.matchAll(/<tr\b[^>]*class=["'][^"']*\blisting_category_vin-number\b[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi)];
  if(!modelMatches(name,vehicle)||rows.length!==1||vinIn(rows[0]?.[1].replace(/<[^>]*>/g,' ')).join()!==vin)return {items:[],reason:'The primary dealer Vehicle block does not match the saved VIN and model.'};
  for(const m of block.matchAll(/<meta\b[^>]*>/gi)){const a=attrs(m[0]);if(a.itemprop==='image')images.push(a.content);}
  const slider=[...block.matchAll(/<div\b[^>]*>/gi)].find(m=>attrs(m[0]).id==='home-slider-canvas');
  if(slider)for(const m of divBlock(block,slider.index).matchAll(/<img\b[^>]*>/gi)){const url=photoUrl(attrs(m[0])['data-full-image'],sourceUrl);if(url&&host(url)==='newmanautonetwork.com')images.push(url);}
  confirmed=true;
 }
 if(host(sourceUrl)==='cargurus.com'){
  const context=jsonObjectAfter(html,'window.__remixContext =');
  const listing=context?.state?.loaderData?.['routes/$intl.listing.$listingId']?.listing;
  if(listing){
   const found=vinIn(listing.vehicleIdentifierString);
   if(!modelMatches(listing.title?.titleWithoutPrice||listing.title?.titleWithPrice,vehicle)||(vin&&!found.includes(vin)))return {items:[],reason:'The primary CarGurus listing does not match the saved vehicle.'};
   confirmed=true;images.push(listing.primaryPhotoUrl);
  }
 }
 const entities=structuredVehicles(html);
 if(!confirmed&&entities.length){
  const matches=entities.filter(entity=>{
   const found=vinIn(entity.vehicleIdentificationNumber||entity.vin);
   if(!found.length&&host(sourceUrl)==='craigslist.org'&&craigslistVin(entity,html,vin))found.push(vin);
   if(vin?!found.includes(vin):found.length>1)return false;
   if(!modelMatches(entity.name||`${entity.modelDate||''} ${entity.manufacturer?.name||entity.brand?.name||''} ${entity.model||''}`,vehicle))return false;
   const url=entity.url||entity.offers?.url;
   return entities.length===1||Boolean(url&&sameListing(sourceUrl,publicUrl(url,sourceUrl),vin));
  });
  if(matches.length!==1)return {items:[],reason:'Structured vehicle identity is missing, ambiguous, or belongs to another vehicle.'};
  confirmed=true;images.push(...imageValues(matches[0].image));
 }
 if(!confirmed){
  // VINs hidden in recommendation scripts cannot authenticate an Open Graph image.
  const visible=decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/<[^>]*>/g,' '));
  const primaryVins=[...new Set([...visible.matchAll(/\bVIN\s*[:#]?\s*([A-HJ-NPR-Z0-9]{17})\b/gi)].map(m=>m[1].toUpperCase()))];
  const boundVin=vin&&vinIn(decode(new URL(sourceUrl).pathname)).includes(vin);
  if(vin&&!boundVin&&(primaryVins.length!==1||primaryVins[0]!==vin))return {items:[],reason:'The primary listing does not provide matching VIN evidence.'};
  if(vin&&primaryVins.some(found=>found!==vin))return {items:[],reason:'The visible primary VIN conflicts with the saved vehicle.'};
  confirmed=true;images.push(metadata['og:image']);
 }
 if(confirmed&&host(sourceUrl)==='capitalone.com'&&vin){
  for(const m of html.matchAll(/<img\b[^>]*>/gi)){
   const a=attrs(m[0]),url=photoUrl(a.src,sourceUrl);
   if(url&&host(url)==='autoimage.capitalone.com'&&vinIn(decode(new URL(url).pathname)).includes(vin)&&modelMatches(a.alt,vehicle)&&/\bImage \d+ of \d+\b/i.test(a.alt))images.push(url);
  }
 }
 const seen=new Set(),items=[];
 for(const image of images){
  const url=photoUrl(image,sourceUrl);if(!url)continue;
  const u=new URL(url),key=u.origin+u.pathname;
  if(!seen.has(key)){seen.add(key);items.push(url);}
  if(items.length>=PHOTO_LIMITS.items)break;
 }
 return {items,reason:items.length?'Photos identify the original vehicle listing.':'No usable vehicle photo was exposed by the original listing.'};
}

class PhotoFailure extends Error{constructor(status,reason){super(reason);this.status=status;}}
async function boundedBytes(response,limit){
 if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw new PhotoFailure('inaccessible','Response exceeds the photo collector size limit.');}
 const reader=response.body?.getReader();if(!reader)return new Uint8Array();
 const chunks=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit)throw new PhotoFailure('inaccessible','Response exceeds the photo collector size limit.');chunks.push(value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
async function request(url,fetcher,stats,timeoutMs){
 let current=url;
 for(let redirects=0;redirects<=PHOTO_LIMITS.redirects;redirects++){
  if(!publicUrl(current))throw new PhotoFailure('inaccessible','Unsafe source or image destination was rejected.');
  stats.requests++;
  const r=await fetcher(current,{redirect:'manual',signal:AbortSignal.timeout(timeoutMs),headers:{'User-Agent':'HybridSearchPhotos/1.0 (+https://github.com/tmp85/hybrid-suv-search)'}});
  if([301,302,303,307,308].includes(r.status)){
   await r.body?.cancel();
   const next=publicUrl(r.headers.get('location'),current);
   if(!next||redirects===PHOTO_LIMITS.redirects)throw new PhotoFailure('inaccessible','Unsafe or excessive redirect was rejected.');
   current=next;continue;
  }
  if(!r.ok){await r.body?.cancel();throw new PhotoFailure('inaccessible',`Source returned HTTP ${r.status}; access restrictions are not bypassed.`);}
  if(!publicUrl(r.url||current)){await r.body?.cancel();throw new PhotoFailure('inaccessible','Unsafe final response URL was rejected.');}
  return {response:r,url:r.url||current};
 }
}
function dimensions(bytes,type){
 const b=Buffer.from(bytes);
 if(type==='image/png'&&b.length>24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return [b.readUInt32BE(16),b.readUInt32BE(20)];
 if((type==='image/jpeg'||type==='image/jpg')&&b[0]===255&&b[1]===216){
  let i=2;while(i+8<b.length){if(b[i++]!==255)break;while(b[i]===255)i++;const marker=b[i++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;const length=b.readUInt16BE(i);if(length<2||i+length>b.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return [b.readUInt16BE(i+5),b.readUInt16BE(i+3)];i+=length;}
 }
 if(type==='image/webp'&&b.length>=30&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'){
  const kind=b.toString('ascii',12,16);
  if(kind==='VP8X')return [1+b.readUIntLE(24,3),1+b.readUIntLE(27,3)];
  if(kind==='VP8 '&&b[23]===157&&b[24]===1&&b[25]===42)return [b.readUInt16LE(26)&16383,b.readUInt16LE(28)&16383];
  if(kind==='VP8L'&&b[20]===47)return [1+(((b[22]&63)<<8)|b[21]),1+(((b[24]&15)<<10)|(b[23]<<2)|((b[22]&192)>>6))];
 }
 return [0,0];
}

/** Collect fresh, attributable photo metadata; callers retain their last good gallery on failure. */
export async function collectListingPhotos(vehicle,{fetcher=fetch,now=new Date().toISOString(),timeoutMs=PHOTO_LIMITS.timeoutMs,maxSources=PHOTO_LIMITS.sources}={}){
 const checkedAt=typeof now==='function'?now():now;
 const vin=validVin(vehicle.vin)?vehicle.vin.toUpperCase():null;
 const stats={sources:0,requests:0,htmlBytes:0,imageBytes:0};
 const sourceRank=s=>({'capitalone.com':0,'cargurus.com':1})[host(s.url)]??2;
 const candidates=[...new Map((vehicle.sources||[]).filter(s=>publicUrl(s.url)&&directPhotoSource(s.url,vin)).map(s=>[s.url,s])).values()].sort((a,b)=>sourceRank(a)-sourceRank(b)).slice(0,Math.max(0,Math.min(PHOTO_LIMITS.sources,maxSources)));
 let attempt={status:'no_source',checkedAt,sourceUrl:null,reason:'No supported original direct listing URL is available.'};
 for(const source of candidates){
  stats.sources++;attempt={status:'inaccessible',checkedAt,sourceUrl:source.url,reason:'Photo source could not be read.'};
  try{
   const page=await request(source.url,fetcher,stats,Math.max(1,Math.min(timeoutMs,PHOTO_LIMITS.timeoutMs)));
   if(!/^text\/html(?:;|$)/i.test(page.response.headers.get('content-type')||'')){await page.response.body?.cancel();throw new PhotoFailure('no_photos','The original listing did not return an HTML page.');}
   const bytes=await boundedBytes(page.response,PHOTO_LIMITS.htmlBytes);stats.htmlBytes+=bytes.length;
   const html=new TextDecoder().decode(bytes);
   const title=decode(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]||'');
   if(/access denied|just a moment|verify you are human|robot check|captcha|security check/i.test(title)||/id=["'](?:cf-challenge|challenge-form|px-captcha)/i.test(html))throw new PhotoFailure('inaccessible','Access challenge detected; it was not bypassed.');
   const extracted=extractListingPhotos(html,vehicle,source.url,page.url);
   if(!extracted.items.length)throw new PhotoFailure('no_photos',extracted.reason);
   const cover=await request(extracted.items[0],fetcher,stats,Math.max(1,Math.min(timeoutMs,PHOTO_LIMITS.timeoutMs)));
   if(!photoUrl(cover.url,source.url)){await cover.response.body?.cancel();throw new PhotoFailure('no_photos','The listing image redirected to a placeholder or unsupported destination.');}
   const type=(cover.response.headers.get('content-type')||'').split(';')[0].toLowerCase().trim();
   if(!/^image\/(?:jpeg|jpg|png|webp)$/.test(type)){await cover.response.body?.cancel();throw new PhotoFailure('no_photos','The listing cover did not return a supported photograph.');}
   const image=await boundedBytes(cover.response,PHOTO_LIMITS.imageBytes);stats.imageBytes+=image.length;
   const [width,height]=dimensions(image,type);
   if(image.length<5000||width<300||height<180||width>20000||height>20000)throw new PhotoFailure('no_photos','The listing cover failed image size or format validation.');
   return {gallery:{items:extracted.items,sourceUrl:source.url,sourceLabel:source.label||marketplace(source.url),checkedAt,vin,listingId:vin?null:listingIdentity(source.url),verified:true},attempt:{status:'collected',checkedAt,sourceUrl:source.url,reason:`Collected ${extracted.items.length} original listing photo${extracted.items.length===1?'':'s'}; cover image validated.`},stats};
  }catch(error){attempt={...attempt,status:error.status||'inaccessible',reason:error instanceof PhotoFailure?error.message:'Temporary network or timeout failure; saved photos remain unchanged.'};}
 }
 return {attempt,stats};
}
