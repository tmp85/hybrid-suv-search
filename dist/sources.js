import {validVin, safeUrl, canonicalListingUrl, vehicleKey} from './core.js';

export const MUSE_URL='https://tmp85.github.io/hybrid-suv-search/';
export function marketplace(url){
 let host;try{host=new URL(url).hostname.replace(/^www\./,'');}catch{return 'Unknown source';}
 if(['chatgpt.com','github.com','tmp85.github.io'].includes(host))return 'Unknown source';
 if(host==='craigslist.org'||host.endsWith('.craigslist.org'))return 'Craigslist';
 return ({'autotrader.com':'AutoTrader','cars.com':'Cars.com','edmunds.com':'Edmunds','iseecars.com':'iSeeCars','capitalone.com':'Capital One','cargurus.com':'CarGurus','truecar.com':'TrueCar','facebook.com':'Facebook Marketplace','carfax.com':'CARFAX','cartruckbuysell.com':'CarTruckBuySell'})[host]||'Dealer';
}
export const marketplaces=v=>[...new Set([...(v.sources||[]),...(v.observations||[])].map(s=>marketplace(s.url)).filter(s=>s!=='Unknown source'))].sort();
function hash(s){let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return (n>>>0).toString(36);}
function vinFrom(url){try{const u=new URL(url);return [...u.pathname.split('/'),...u.searchParams.values()].map(s=>s.toUpperCase()).find(validVin)||null;}catch{return null;}}
// Inventory/search URLs can describe many vehicles; only vehicle-specific URLs
// are identities. Original URLs, including query strings, remain in sources.
export function listingIdentity(url){
 const raw=canonicalListingUrl(url);if(!raw)return '';
 const u=new URL(raw);const p=u.pathname;
 if(!vinFrom(raw)&&!(/\/marketplace\/item\/\d+|\/(?:details|listing)\/\d+|\/listings\/[^/]+|\/[a-f0-9-]{20,}\.htm$/i.test(p)))return '';
 for(const key of [...u.searchParams.keys()])if(/^utm_|^(radius|edmcid)$/i.test(key))u.searchParams.delete(key);
 u.hash='';return u.href.replace(/\/$/,'');
}
export function deduplicate(vehicles){
 const result=[],aliases={};
 for(const input of vehicles){
  const v=structuredClone(input),urls=(v.sources||[]).map(s=>listingIdentity(s.url)).filter(Boolean);
  const match=result.find(x=>(v.vin&&x.vin===v.vin)||vehicleKey(x)===vehicleKey(v)||(!(v.vin&&x.vin&&v.vin!==x.vin)&&urls.some(url=>(x.sources||[]).some(s=>listingIdentity(s.url)===url))));
  if(!match){result.push(v);continue;}
  aliases[vehicleKey(v)]=vehicleKey(match);
  if(!match.vin&&v.vin)match.vin=v.vin;
  match.sources=match.sources||[];
  for(const s of v.sources||[])if(!match.sources.some(t=>t.url===s.url))match.sources.push(s);
  match.events=match.events||[];for(const event of v.events||[])if(!match.events.some(e=>e.date===event.date&&e.text===event.text))match.events.push(event);
  match.observations=match.observations||[];
  for(const o of v.observations||[])if(!match.observations.some(t=>JSON.stringify(t)===JSON.stringify(o)))match.observations.push(o);
  if(v.origin==='Muse'&&!match.observations.some(o=>o.source==='Muse'))match.observations.push({source:'Muse',price:v.price,checkedAt:v.checked,url:v.sources?.[0]?.url,notes:v.concern,priceBasis:v.feeNote,availability:v.availability});
 }
 return {vehicles:result,aliases};
}
export function museVehicles(rows,date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!rows.length||rows.some(r=>r.length!==8))throw Error('Muse report format changed; keeping the saved snapshot.');
 return rows.map((r,i)=>{
  const [title,type,miles,drivetrain,price,seller,concerns,link]=r.map(c=>c.text.trim()),url=safeUrl(r[7].url);
  const year=Number(title.match(/^\d{4}/)?.[0]),mileage=Number(miles.replace(/[^\d]/g,'')),amount=Number(price.replace(/[^\d.]/g,''));
  if(!year||!mileage||!amount||!url)throw Error('Muse listing is missing required fields; keeping the saved snapshot.');
  const names=[['Sorento','Kia Sorento'],['Santa Fe','Hyundai Santa Fe'],['Grand Cherokee','Jeep Grand Cherokee'],['Highlander','Toyota Highlander'],['Outlander','Mitsubishi Outlander'],['CR-V','Honda CR-V'],['CX-90','Mazda CX-90']];
  const [model,name]=names.find(([m])=>title.includes(m))||['',title.replace(/^\d{4}\s+/,'')];
  const trim=model?title.slice(title.indexOf(model)+model.length).replace(/\s*\([^)]*\)/g,'').trim():'';
  const vin=vinFrom(url),id=vin||'muse-'+hash([year,name,trim,mileage,seller].join('|'));
  const place=seller.includes('Kiefer Kia')?['Eugene','OR']:seller.includes('Bill Luke')?['Phoenix','AZ']:seller.includes('Sands Kia')?['Surprise','AZ']:seller.includes('Duarte CA')?['Duarte','CA']:['Unknown','Unknown'];
  const preliminary=/SRP|search.level|detail verification pending|inventory page/i.test(concerns);
  const observation={source:'Muse',url,checkedAt:date,price:amount,name,year,mileage,notes:concerns,priceBasis:'Muse report asking price; fee inclusion requires confirmation.',availability:preliminary?'Search-page evidence only; detail verification pending':'Listed in Muse report; seller availability unconfirmed'};
  return {id,vin,name,trim,year,mileage,price:amount,seller,city:place[0],state:place[1],drive:drivetrain.match(/^(AWD|4WD|FWD)/)?.[0]||'Unknown',type:type==='Full hybrid'?'HEV':'PHEV',rows:null,status:i<5?'shortlist':'watchlist',rank:10+i,title:'Unknown',owners:null,accidents:'Unknown',use:'Unknown',maintenance:'Unknown',fees:null,feeNote:observation.priceBasis,checked:date,availability:observation.availability,historySource:'Muse daily report; underlying documents not independently checked',reason:'Included in the Muse daily report. Read the original listing and report concerns before pursuing.',concern:concerns,sellerClaim:'See source report; claims need supporting evidence.',unknowns:['Seller-confirmed availability','Full history evidence','Fees / conditions',...(place[1]==='Unknown'?['Vehicle location']:[]),...(!vin?['VIN / cross-source identity']:[])],color:'sage',origin:'Muse',imported:true,sources:[{label:marketplace(url)+' · via Muse',url}],observations:[observation],events:[{date,text:'Muse report: '+concerns}]};
 });
}
export function parseMuseHtml(html){
 const doc=new DOMParser().parseFromString(html,'text/html');
 const heading=[...doc.querySelectorAll('h2')].find(h=>/All verified-active listings/i.test(h.textContent));
 let table=heading?.nextElementSibling;while(table&&table.tagName!=='TABLE')table=table.nextElementSibling;
 if(!table)throw Error('Muse listings table was not found.');
 const dateText=doc.querySelector('.meta')?.textContent.match(/\w+, (\w+ \d+, \d{4})/)?.[1];
 const date=dateText?new Date(dateText+' 12:00:00 GMT').toISOString().slice(0,10):null;
 const rows=[...table.querySelectorAll('tr')].slice(1).map(row=>[...row.querySelectorAll('td')].map(cell=>({text:cell.textContent,url:cell.querySelector('a')?.getAttribute('href')})));
 return {date,vehicles:museVehicles(rows,date)};
}

export const MUSE_FEED_URL = new URL('listings.json', MUSE_URL).href;
export function parseMuseJson(data){
 if(!data || !/^\d{4}-\d{2}-\d{2}$/.test(data.search_date) || !Array.isArray(data.listings) || !data.listings.length)throw Error('Invalid Muse JSON feed');
 const vehicles=data.listings.map((row,i)=>{
  const date=row.verification_date||data.search_date;
  const cells=[`${row.year} ${row.model} ${row.trim||''}`,row.hybrid_type,String(row.mileage),row.drivetrain,String(row.price),row.seller,[row.history,row.concerns].filter(Boolean).join(' · '),'View listing'].map(text=>({text:String(text||'')}));
  cells[7].url=row.url;
  const v=museVehicles([cells],date)[0];
  if(row.vin){if(!validVin(row.vin))throw Error('Invalid Muse VIN');v.id=v.vin=row.vin;}
  const place=String(row.location||'').match(/^(.*),\s*(CA|OR|WA|NV|AZ)$/);
  if(place){v.city=place[1];v.state=place[2];}
  v.status=row.verified_active===false?'removed':row.verified_active===true&&date===data.search_date?'shortlist':'watchlist';
  v.rank=10+i;
  // Published report evidence is attributed to Muse, never promoted to independent verification.
  v.historySource='Muse JSON feed; history claims attributed to its report';
  v.availability=row.verified_active===false?'Muse reports sold, removed or excluded':row.verified_active===true?'Ad observed by Muse '+date+'; unsold status unconfirmed':'Muse could not reverify availability';
  v.observations[0].availability=v.availability;
  v.observations[0].notes=cells[6].text;
  v.unknowns=v.unknowns.filter(x=>!(place&&x==='Vehicle location')&&!(v.vin&&x==='VIN / cross-source identity'));
  return v;
 });
 return {date:data.search_date,vehicles};
}
export function mergeMuseReport(existing,report){
 const updated=structuredClone(existing);
 for(const v of updated)if(v.origin==='Muse'&&v.status==='shortlist'&&v.checked<report.date)v.status='watchlist';
 for(const incoming of report.vehicles){
  let matches=updated.filter(v=>(v.vin&&v.vin===incoming.vin)||vehicleKey(v)===vehicleKey(incoming)||(!(v.vin&&incoming.vin&&v.vin!==incoming.vin)&&listingIdentity(incoming.sources[0].url)&&v.sources?.some(s=>listingIdentity(s.url)===listingIdentity(incoming.sources[0].url))));
  // Upgrade legacy anonymous records only with a unique, tightly matched seller/model observation.
  if(!matches.length)matches=updated.filter(v=>!v.vin&&v.origin==='Muse'&&v.year===incoming.year&&v.name===incoming.name&&v.seller===incoming.seller&&Math.abs(v.mileage-incoming.mileage)<1000&&v.sources?.some(s=>s.url===incoming.sources[0].url));
  const old=matches.length===1?matches[0]:null;
  if(!old){updated.push(incoming);continue;}
  const previous=structuredClone(old);
  if(old.origin==='Muse'&&incoming.checked>=old.checked){Object.assign(old,incoming);old.id=previous.id;}
  old.sources=[...(previous.sources||[])];for(const s of incoming.sources)if(!old.sources.some(x=>x.url===s.url))old.sources.push(s);
  old.observations=[...(previous.observations||[])];for(const o of incoming.observations)if(!old.observations.some(x=>JSON.stringify(x)===JSON.stringify(o)))old.observations.push(o);
  old.events=[...(previous.events||[])];for(const ev of incoming.events)if(!old.events.some(x=>x.date===ev.date&&x.text===ev.text))old.events.push(ev);
 }
 return deduplicate(updated).vehicles;
}
