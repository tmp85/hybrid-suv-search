import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {normalizeIndependent,validateDataset,isArchived} from '../dist/inventory.js';
import {directListingUrl} from '../dist/listings.js';

const read=async path=>JSON.parse(await readFile(path,'utf8'));
const website=await read(process.argv[2]);
const inventory=validateDataset(await read(process.argv[3]||'audit/independent-inventory.json'));
const feed=await read('independent/listings.json');
const rows=normalizeIndependent(feed);
assert.equal(inventory.sources.independent.runId,feed.runId);
assert.equal(inventory.sources.independent.imported,rows.length);
assert.equal(website.vehicles.length,inventory.vehicles.length);
const results=rows.map(row=>{
 const receipt=inventory.reconciliation.find(r=>r.source==='independent'&&r.sourceId===row.sourceIds[0]);
 assert(receipt,'Missing independent reconciliation: '+row.sourceIds[0]);
 const canonical=inventory.vehicles.find(v=>v.id===receipt.vehicleId);
 const visible=website.vehicles.find(v=>(v.id||v.vin)===receipt.vehicleId);
 assert(canonical&&visible,'Missing exported public vehicle: '+receipt.vehicleId);
 assert.equal(visible.price,canonical.price);
 assert(visible.discoveryAgents.includes('ChatGPT independent'));
 assert(visible.priceHistory.some(o=>o.date===row.checked&&o.price===row.price));
 return {id:receipt.vehicleId,sourceId:row.sourceIds[0],name:visible.year+' '+visible.name,price:visible.price,state:visible.listingState,observedAt:row.checked,inPublicWebsite:true,archived:isArchived(visible),hasQualifiedDirectUrl:visible.sources.some(s=>directListingUrl(s.url,visible.vin))};
});
const report={checkedAt:new Date().toISOString(),publicUrl:'https://hybrid-suv-search.tmp85.chatgpt.site/',websiteExportedAt:website.exportedAt,records:website.vehicles.length,revision:inventory.revision,generatedAt:inventory.generatedAt,feedRunId:feed.runId,sourceHealth:inventory.sources.independent,counts:inventory.counts,results};
await writeFile('audit/independent-acceptance.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
