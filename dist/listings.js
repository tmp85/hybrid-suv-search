import {safeUrl, validVin} from './core.js';
import {photosFor} from './photos.js';

// Qualify recorded vehicle links without inventing a URL from a VIN or search page.
// This establishes a direct destination, not current seller availability.
export function directListingUrl(value, vin = null){
 const url=safeUrl(value);if(!url)return '';
 const u=new URL(url);if(u.username||u.password)return '';
 let path;try{path=decodeURIComponent(u.pathname);}catch{return '';}
 const host=u.hostname.toLowerCase().replace(/^(www|m)\./,''),p=path.toLowerCase();
 const vins=path.toUpperCase().split(/[^A-Z0-9]+/).filter(validVin);
 if(vin&&vins.some(found=>found!==vin.toUpperCase()))return '';
 const hasVin=vins.length>0;
 const routes={
  'facebook.com':/^\/marketplace\/item\/\d+\/?$/,
  'truecar.com':/^\/used-cars-for-sale\/listing\/[a-hj-npr-z0-9]{17}(?:\/|$)/,
  'edmunds.com':/^\/[^/]+\/[^/]+\/\d{4}\/vin\/[a-hj-npr-z0-9]{17}\/?$/,
  'capitalone.com':/^\/cars\/vehicle-details\/.+\/[a-hj-npr-z0-9]{17}\/?$/,
  'carfax.com':/^\/vehicle\/[a-hj-npr-z0-9]{17}\/?$/,
  'cargurus.com':/^\/(?:details|cars\/listing)\/\d+\/?$/,
  'cars.com':/^\/vehicledetail\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/?$/,
  'autotrader.com':/^\/cars-for-sale\/vehicle\/\d+\/?$/,
  'iemotorsdirect.com':/^\/pre-owned-cars\/detail\/[^/]+\/\d+\/?$/,
  'cartruckbuysell.com':/^\/listings\/[^/]+-[a-f0-9]{8}\/?$/,
  'iseecars.com':/$a/ // Search results and opaque fragments need direct-page verification.
 };
 if(Object.hasOwn(routes,host))return routes[host].test(p)?url:'';
 // Dealer pages need a vehicle identifier in the path, never just a query VIN.
 if(/^\/(?:search|used-inventory)(?:\/|$)/.test(p)||/\/(?:index|search)\.(?:htm|html|php)$/.test(p))return '';
 if(hasVin&&/^\/(?:car\/|vehicle\/|viewdetails\/|inventory\/(?:used|new)-|used[-/]|new[-/])/.test(p))return url;
 if(/^\/used\/.+-[a-f0-9]{32}\.htm$/.test(p))return url;
 return '';
}

export function originalListing(vehicle){
 // Preserve explicit failed-verification findings, even after a local shortlist decision.
 if(['confirmed_unavailable','excluded'].includes(vehicle.listingState)||/^Original unavailable$/i.test(vehicle.availability||''))return null;
 const photos=photosFor(vehicle);
 const candidates=[
  ...(vehicle.verification?.url?[{url:vehicle.verification.url,label:'Latest direct verification',priority:-2}]:[]),
  ...(vehicle.lastVerified?(vehicle.observations||[]).filter(o=>o.checkedAt?.slice(0,10)===vehicle.lastVerified?.slice(0,10)).map(o=>({...o,priority:-1})):[]),
  ...(photos?.verified?[{url:photos.sourceUrl,label:photos.sourceLabel,priority:0}]:[]),
  ...(vehicle.sources||[]).map(s=>({...s,priority:/original|dealer.*listing/i.test(s.label||'')?1:2})),
  ...(vehicle.observations||[]).slice().reverse().map(o=>({...o,label:o.source||'Recorded listing',priority:3}))
 ];
 for(const source of candidates.sort((a,b)=>a.priority-b.priority)){
  if(source.verified===false||/redirect|unavailable|unverified|search evidence|inventory page/i.test(source.label||''))continue;
  const url=directListingUrl(source.url,vehicle.vin);
  if(url)return {url,label:source.label||new URL(url).hostname};
 }
 return null;
}
