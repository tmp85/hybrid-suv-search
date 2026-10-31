import {directListingUrl} from '../dist/listings.js';

export async function checkSeller(v,fetcher=fetch,checkedAt=new Date().toISOString()){
 const candidates=(v.sources||[]).filter(s=>directListingUrl(s.url,v.vin)&&!/(?:edmunds|cargurus|capitalone|iseecars|truecar|facebook|carfax|cartruckbuysell)\.com$/i.test(new URL(s.url).hostname));
 if(!v.vin||!candidates.length)return null;
 const url=candidates[0].url;
 try{
  const r=await fetcher(url,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'HybridSearchAvailability/1.0 (+https://github.com/tmp85/hybrid-suv-search)'}});
  if([401,403,429].includes(r.status))return {result:'inaccessible',checkedAt,url,httpStatus:r.status,reason:'Access restricted; availability unknown.'};
  if(!r.ok)return {result:r.status===404?'not_found':'inaccessible',checkedAt,url,httpStatus:r.status,reason:'Request failed; availability unknown.'};
  const body=await r.text();
  if(body.length>3000000)return {result:'inaccessible',checkedAt,url,reason:'Response too large; availability unknown.'};
  const title=body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'';
  if(/access denied|just a moment|verify you are human|robot check/i.test(title))return {result:'inaccessible',checkedAt,url,reason:'Access challenge; availability unknown.'};
  if(/vehicleStatus=unavailable/i.test(r.url))return {result:'unavailable',checkedAt,url,finalUrl:r.url,reason:'Direct seller URL explicitly labels this vehicle unavailable.'};
  if(r.redirected&&!directListingUrl(r.url,v.vin))return {result:'redirected',checkedAt,url,finalUrl:r.url,reason:'Seller redirected to a page without a direct vehicle identity; requires recheck.'};
  if(!body.toUpperCase().includes(v.vin))return {result:r.redirected?'redirected':'not_found',checkedAt,url,finalUrl:r.url,reason:'Vehicle identity not confirmed; requires recheck.'};
  const modelWords=String(v.name||'').split(/[\s-]+/).filter(w=>w.length>2&&!/^(Toyota|Kia|Hyundai|Ford|Jeep|Lexus|Mitsubishi|Mazda|Honda|Hybrid|Plug|PHEV)$/i.test(w));
  if(!title.includes(String(v.year))||!modelWords.some(w=>title.toLowerCase().includes(w.toLowerCase())))return {result:'not_found',checkedAt,url,finalUrl:r.url,reason:'Page title does not confirm the requested year and model; requires recheck.'};
  return {result:'observed',checkedAt,url,finalUrl:r.url,reason:'Direct seller page contains the matching VIN. Availability and current price still require seller confirmation.'};
 }catch(e){return {result:'inaccessible',checkedAt,url,reason:'Temporary request failure; availability unknown.'};}
}
