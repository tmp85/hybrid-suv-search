import {checkSeller} from './check-seller.mjs';
import {readFile,writeFile,mkdir,rename,copyFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {seed} from '../dist/data.js';
import {museRows,museDate} from '../dist/muse-snapshot.js';
import {museVehicles,listingIdentity} from '../dist/sources.js';
import {directListingUrl} from '../dist/listings.js';
import {buildInventory,normalizeMuse,parseMuseSupplement,validateDataset,rankVehicles,countInventory,isArchived} from '../dist/inventory.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
const output=resolve(root,option('--output')||'data/inventory.json');
const now=option('--now')||new Date().toISOString();
const exists=async p=>{try{await access(p);return true;}catch{return false;}};
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const digest=s=>createHash('sha256').update(s).digest('hex');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchText(url){
 let error;
 for(let attempt=0;attempt<3;attempt++){
  try{const r=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'HybridSearchData/1.0 (+https://github.com/tmp85/hybrid-suv-search)','Accept':'application/json,text/html'}});if(!r.ok)throw Error(`${new URL(url).hostname} HTTP ${r.status}`);const text=await r.text();if(text.length>3000000)throw Error('Source exceeds size limit');return text;}catch(e){error=e;if(attempt<2)await pause((attempt+1)*1500);}
 }
 throw error;
}
async function atomicWrite(path,data){await mkdir(dirname(path),{recursive:true});await writeFile(path+'.tmp',JSON.stringify(data,null,2)+'\n');await rename(path+'.tmp',path);}
let previous=null;
if(await exists(output)){try{previous=validateDataset(await json(output));}catch(e){throw Error('Existing dataset invalid; refusing overwrite: '+e.message);}}
const historical=normalizeMuse(await json(resolve(root,'dist/muse-feed-snapshot.json')));
const prior=normalizeMuse(await json(resolve(root,'dist/muse-prior-snapshot.json')));
// Anonymous legacy HTML rows remain recoverable in muse-snapshot.js; the
// later structured snapshot supersedes them without fuzzy duplicate guesses.
const seedVehicles=[...seed,...historical,...prior];
const overrides=await json(resolve(root,'data/verification-overrides.json'));
let muse=null,sourceError=null,provenance={},supplementError=null;
try{
 const fixture=option('--fixture');
 if(fixture){muse=await json(resolve(fixture));provenance={mode:'fixture',path:fixture};}
 else{
  const origin='https://raw.githubusercontent.com/tmp85/hybrid-suv-search/main/';
  const [raw,page]=await Promise.allSettled([fetchText(origin+'listings.json'),fetchText('https://tmp85.github.io/hybrid-suv-search/listings.json')]);
  if(raw.status==='rejected')throw raw.reason;
  muse=JSON.parse(raw.value);normalizeMuse(muse);
  provenance={origin:origin+'listings.json',originSha256:digest(raw.value),pagesSha256:page.status==='fulfilled'?digest(page.value):null,pagesMatchesOrigin:page.status==='fulfilled'&&digest(page.value)===digest(raw.value),sourceRecordCount:muse.listings.length};
  try{
   const html=await fetchText(origin+'index.html'),rows=parseMuseSupplement(html,muse.search_date);
   const supplement=rows.filter(r=>!muse.listings.some(v=>(r.vin&&r.vin===v.vin)||listingIdentity(r.url)===listingIdentity(v.url)));
   provenance.htmlSha256=digest(html);provenance.supplementRecordCount=supplement.length;
   provenance.supplementSource=origin+'index.html';muse.listings.push(...supplement);
  }catch(e){supplementError=e.message;}
 }
 normalizeMuse(muse);
}catch(e){muse=null;sourceError=e.message;}
let dataset=buildInventory({previous,seedVehicles,muse,now,revision:process.env.GITHUB_SHA||'local',sourceError,overrides});
dataset.sources.muse.provenance=muse?provenance:previous?.sources?.muse?.provenance||provenance;
if(supplementError){dataset.sources.muse.supplementError=supplementError;dataset.alerts.push('Muse HTML supplement unavailable: '+supplementError);}

// Bounded respectful checks of direct dealer links only. HTTP status, a missing
// VIN or a redirect never proves a car was sold. No CAPTCHA or access bypasses.

if(!args.includes('--skip-checks')&&!option('--fixture')){
 const candidates=dataset.vehicles.filter(v=>!isArchived(v,now)&&v.sources?.some(s=>directListingUrl(s.url,v.vin))).slice(0,80);
 for(let i=0;i<candidates.length;i+=4){await Promise.all(candidates.slice(i,i+4).map(async v=>{
  const result=await checkSeller(v,fetch,now);if(!result)return;
  // A one-time verified observation remains recorded even if later checks are blocked.
  v.verification=result;
  if(result.result==='unavailable'){v.listingState='confirmed_unavailable';v.evidence={source:'Direct seller check',url:result.url,date:now.slice(0,10),reason:result.reason};}
  if(result.result==='observed'){v.lastVerified=now.slice(0,10);v.listingState='verified_active';v.missingFromFeed=false;}
 }));}
 dataset.vehicles=rankVehicles(dataset.vehicles,now);dataset.counts=countInventory(dataset.vehicles,now);
}
const dropAlert='Active inventory dropped by more than 35%; review verification changes and retained history.';
if(previous?.counts?.active>=5&&dataset.counts.active<previous.counts.active*0.65&&!dataset.alerts.includes(dropAlert))dataset.alerts.push(dropAlert);
if(dataset.alerts.length&&dataset.sources.muse.status==='connected')dataset.sources.muse.status='warning';
if(args.includes('--test-update')){
 // Exercise a real price change through the merger without publishing fabricated prices.
 const sample=structuredClone(muse);if(!sample)throw Error('Test update requires live source');
 const target=sample.listings.find(v=>v.vin);target.price+=1;
 const changed=buildInventory({previous:dataset,muse:sample,now,revision:'test-update'});
 const changedVehicle=changed.vehicles.find(v=>v.vin===target.vin);
 if(changedVehicle.price!==target.price||!changedVehicle.priceHistory.some(o=>o.price===target.price))throw Error('Test price update failed');
 dataset.testUpdate={passed:true,at:now,vin:target.vin,mode:'isolated +$1 fixture merged and validated; live public price unchanged'};
}
dataset.reconciliation=dataset.reconciliation.map(r=>{const v=dataset.vehicles.find(v=>v.id===r.vehicleId);return {...r,disposition:isArchived(v,now)?'archived':r.disposition};});
validateDataset(dataset);
if(previous){await atomicWrite(resolve(dirname(output),'inventory.previous.json'),previous);}
await atomicWrite(output,dataset);
if(!args.includes('--no-site-copy'))await atomicWrite(resolve(root,'dist/inventory.json'),dataset);
await atomicWrite(resolve(dirname(output),'health.json'),{generatedAt:now,sources:dataset.sources,counts:dataset.counts,alerts:dataset.alerts});
const summary=`Hybrid Search: ${dataset.counts.imported} retained, ${dataset.counts.active} active/new (${dataset.counts.qualifyingActive} qualifying), ${dataset.counts.stale} stale, ${dataset.counts.archived} archived. Muse ${dataset.sources.muse.status}, report ${dataset.sources.muse.reportDate||'unknown'}. Independent research export not connected.`;
console.log(summary);
for(const alert of dataset.alerts)console.log('::warning::'+alert.replace(/[\r\n]/g,' '));
if(process.env.GITHUB_STEP_SUMMARY)await writeFile(process.env.GITHUB_STEP_SUMMARY,summary+'\n\n'+dataset.alerts.map(a=>'- '+a).join('\n')+'\n',{flag:'a'});
if(process.env.GITHUB_OUTPUT)await writeFile(process.env.GITHUB_OUTPUT,`unhealthy=${dataset.alerts.length>0}\n`,{flag:'a'});
