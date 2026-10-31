import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {collectListingPhotos,extractListingPhotos,PHOTO_LIMITS} from '../scripts/collect-photos.mjs';
import {listingIdentity} from '../dist/sources.js';
import {directListingUrl} from '../dist/listings.js';

const vin='5TDJGRFH0JS041065',otherVin='KM8S6DA22NU035178';
const source='https://www.capitalone.com/cars/vehicle-details/2018/Toyota/Highlander%2BHybrid/XLE/'+vin;
const image='https://autoimage.capitalone.com/dealer/2018-Toyota-Highlander-XLE-'+vin+'-front.jpg';
const v={vin,year:2018,name:'Toyota Highlander',sources:[{url:source,label:'Original Capital One listing'}]};
const now='2026-10-31T21:00:00.000Z';
const page=(entity={})=>`<title>Used 2018 Toyota Highlander Hybrid XLE</title><script type="application/ld+json">${JSON.stringify({'@type':'Vehicle',name:'2018 Toyota Highlander Hybrid',vehicleIdentificationNumber:vin,image,...entity})}</script>`;
const response=(body,type='text/html',status=200)=>new Response(body,{status,headers:{'content-type':type}});

// A complete PNG fixture with real compressed pixels, not a URL/HTML mock posing
// as an image. The collector checks its header and minimum size/dimensions.
function png(width=640,height=480){
 const crc=bytes=>{let c=0xffffffff;for(const n of bytes){c^=n;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
 const chunk=(name,data)=>{const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(name,4);data.copy(b,8);b.writeUInt32BE(crc(b.subarray(4,-4)),b.length-4);return b;};
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
 const pixels=Buffer.alloc(height*(width*3+1));let seed=17;
 for(let y=0;y<height;y++)for(let x=1;x<=width*3;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels[y*(width*3+1)+x]=seed>>>24;}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
const photograph=png();

test('collects VIN-bound original gallery, validates its cover, and leaves saved record untouched',async()=>{
 const second=image.replace('front','interior'),input=structuredClone(v),calls=[];
 const html=page()+`<img alt="2018 Toyota Highlander Hybrid Image 2 of 24" src="${second}"><img alt="Recommended car" src="https://images.example.com/recommendation.jpg">`;
 const result=await collectListingPhotos(input,{now,fetcher:async(url,options)=>{calls.push(url);assert.equal(options.redirect,'manual');assert.ok(options.signal);return url===source?response(html):response(photograph,'image/png');}});
 assert.equal(result.attempt.status,'collected');assert.equal(result.gallery.vin,vin);
 assert.deepEqual(result.gallery.items,[image,second]);assert.equal(result.gallery.sourceUrl,source);
 assert.equal(result.gallery.checkedAt,now);assert.equal(result.gallery.verified,true);
 assert.equal(result.gallery.sourceLabel,'Original Capital One listing');assert.equal(result.gallery.listingId,null);
 assert.deepEqual(calls,[source,image]);assert.equal(result.stats.sources,1);assert.equal(result.stats.requests,2);
 assert.deepEqual(input,v);
});

test('a recommendation VIN cannot authenticate another vehicle primary image',()=>{
 const html=page({vehicleIdentificationNumber:otherVin})+`<script>${JSON.stringify({recommendations:[{vehicleIdentificationNumber:vin}]})}</script><meta property="og:image" content="${image}">`;
 assert.equal(extractListingPhotos(html,v,source).items.length,0);
 const nested=`<title>2018 Toyota Highlander Hybrid</title><script type="application/ld+json">${JSON.stringify({'@type':'ItemList',itemListElement:[{'@type':'Vehicle',name:'2018 Toyota Highlander Hybrid',vehicleIdentificationNumber:vin,image}]})}</script>`;
 const numeric='https://www.cargurus.com/Cars/listing/123456789';
 assert.equal(extractListingPhotos(nested+`<meta property="og:image" content="${image}">`,v,numeric).items.length,0);
});

test('primary CarGurus loader data excludes recommendation images and rejects VIN disagreement',()=>{
 const url='https://www.cargurus.com/Cars/listing/460479314',car={vin:otherVin,year:2022,name:'Hyundai Santa Fe'};
 const primary='https://static.cargurus.com/images/forsale/santa-fe-front.jpeg';
 const html=identifier=>`<title>2022 Hyundai Santa Fe Hybrid Plug-In</title><script>window.__remixContext = ${JSON.stringify({state:{loaderData:{'routes/$intl.listing.$listingId':{listing:{title:{titleWithoutPrice:'2022 Hyundai Santa Fe Hybrid Plug-In'},vehicleIdentifierString:'VIN: '+identifier,primaryPhotoUrl:primary},recommendations:[{image:'https://example.com/wrong.jpg'}]}}}})};</script>`;
 assert.deepEqual(extractListingPhotos(html(otherVin),car,url).items,[primary]);
 assert.deepEqual(extractListingPhotos(html(vin),car,url).items,[]);
});

test('VIN-less original numeric listing gets a stable identity but a different redirected listing fails',async()=>{
 const url='https://www.cargurus.com/Cars/listing/460479314';
 const car={...v,vin:null,sources:[{url}]};
 const html=`<title>2018 Toyota Highlander Hybrid</title><meta property="og:url" content="${url}"><meta property="og:image" content="${image}">`;
 const result=await collectListingPhotos(car,{now,fetcher:async url=>url===car.sources[0].url?response(html):response(photograph,'image/png')});
 assert.equal(result.gallery.vin,null);assert.equal(result.gallery.listingId,listingIdentity(url));
 assert.equal(extractListingPhotos(html,car,url,url.replace('460479314','460479315')).items.length,0);
 assert.equal(extractListingPhotos(html.replace('2018','2019'),car,url).items.length,0);
});

test('visible exact VIN can confirm Open Graph but script-only VIN and conflicting primary VIN cannot',()=>{
 const url='https://www.cargurus.com/Cars/listing/460479314';
 const html=`<title>2018 Toyota Highlander Hybrid</title><meta property="og:image" content="${image}">`;
 assert.deepEqual(extractListingPhotos(html+`<p>VIN: ${vin}</p>`,v,url).items,[image]);
 assert.deepEqual(extractListingPhotos(html+`<script>{"vin":"${vin}"}</script>`,v,url).items,[]);
 assert.deepEqual(extractListingPhotos(html+`<p>VIN: ${otherVin}</p>`,v,source).items,[]);
});

test('denied sources and HTML access challenges never yield photos or image requests',async()=>{
 for(const status of [401,403,429]){
  let calls=0;const result=await collectListingPhotos(v,{now,fetcher:async()=>{calls++;return response(page(),'text/html',status);}});
  assert.equal(result.gallery,undefined);assert.equal(result.attempt.status,'inaccessible');assert.equal(calls,1);
 }
 let calls=0;const result=await collectListingPhotos(v,{now,fetcher:async()=>{calls++;return response('<title>Just a moment...</title>'+page());}});
 assert.equal(result.gallery,undefined);assert.equal(calls,1);assert.match(result.attempt.reason,/challenge/);
});

test('rejects placeholders, logos, stock photos, and unsafe image destinations before fetching them',async()=>{
 for(const image of ['https://images.example.com/no-image.jpg','https://images.example.com/stock-photo.jpg','https://images.example.com/logo.png','https://127.0.0.1/photo.jpg','https://user:secret@example.com/photo.jpg','http://images.example.com/car.jpg']){
  let calls=0;const result=await collectListingPhotos(v,{now,fetcher:async()=>{calls++;return response(page({image}));}});
  assert.equal(result.gallery,undefined,image);assert.equal(calls,1,image);
 }
});

test('HTML pretending to be an image, tiny graphics and excessive responses cannot become a gallery',async()=>{
 const cases=[()=>response('<html>Access denied</html>','text/html'),()=>response('<html>Access denied</html>','image/jpeg'),()=>response(png(40,40),'image/png'),()=>new Response(photograph,{headers:{'content-type':'image/png','content-length':String(PHOTO_LIMITS.imageBytes+1)}})];
 for(const cover of cases){const result=await collectListingPhotos(v,{now,fetcher:async url=>url===source?response(page()):cover()});assert.equal(result.gallery,undefined);}
 let calls=0;const result=await collectListingPhotos(v,{now,fetcher:async()=>{calls++;return response('x'.repeat(PHOTO_LIMITS.htmlBytes+1));}});
 assert.equal(result.gallery,undefined);assert.equal(calls,1);assert.match(result.attempt.reason,/size limit/);
});

test('redirects to local services or generic inventory pages are rejected',async()=>{
 for(const destination of ['https://127.0.0.1/private','https://localhost/private','https://www.capitalone.com/cars/']){
  const calls=[];const result=await collectListingPhotos(v,{now,fetcher:async url=>{calls.push(url);return url===source?new Response(null,{status:302,headers:{location:destination}}):response(page());}});
  assert.equal(result.gallery,undefined);assert.ok(!calls.includes('https://127.0.0.1/private'));assert.ok(!calls.includes('https://localhost/private'));
 }
});

test('image redirects cannot replace a matching vehicle photograph with a stock placeholder',async()=>{
 const placeholder='https://images.example.com/stock_images/default.jpg';
 const result=await collectListingPhotos(v,{now,fetcher:async url=>url===source?response(page()):url===image?new Response(null,{status:302,headers:{location:placeholder}}):response(photograph,'image/png')});
 assert.equal(result.gallery,undefined);assert.match(result.attempt.reason,/placeholder/);
});

test('tries at most two original sources, never searches elsewhere, and returns a later valid source',async()=>{
 const first='https://www.cargurus.com/Cars/listing/460479314',second='https://www.cargurus.com/Cars/listing/460479315',third='https://www.cargurus.com/Cars/listing/460479316';
 const car={...v,sources:[{url:first},{url:second},{url:third},{url:'https://www.cargurus.com/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action'}]};
 const calls=[];const result=await collectListingPhotos(car,{now,maxSources:99,fetcher:async url=>{calls.push(url);return url===first?response('', 'text/html',403):url===second?response(page()):response(photograph,'image/png');}});
 assert.equal(result.attempt.status,'collected');assert.equal(result.gallery.sourceUrl,second);assert.deepEqual(calls,[first,second,image]);
 const failed=[];await collectListingPhotos(car,{now,maxSources:99,fetcher:async url=>{failed.push(url);return response('','text/html',403);}});
 assert.deepEqual(failed,[first,second]);
});

test('temporary network failures return evidence of the attempt without erasing a last good gallery',async()=>{
 const car={...v,listingPhotos:{items:['https://images.example.com/saved.jpg']}};
 const before=structuredClone(car),result=await collectListingPhotos(car,{now,fetcher:async()=>{throw new Error('network disconnected');}});
 assert.equal(result.gallery,undefined);assert.equal(result.attempt.status,'inaccessible');assert.deepEqual(car,before);
});

test('Craigslist Product photos require matching VIN in both primary VIN field and original dealer URL',async()=>{
 const url='https://www.craigslist.org/view/d/hillsboro-2025-hyundai-santa-fe-hybrid/LukpoQTL8RGlMJv73SSeoA',vin='5NMP24G17SH062657';
 const car={vin,year:2025,name:'Hyundai Santa Fe',sources:[{url}]};
 const photos=Array.from({length:24},(_,i)=>`https://images.craigslist.org/car-${i}.jpg`);
 const html=(primary=vin,descriptionVin=vin)=>`<title>2025 Hyundai Santa Fe Hybrid SEL</title><div class="attr auto_vin"><span>VIN:</span><span>${primary}</span></div><script type="application/ld+json">${JSON.stringify({'@type':'Product',name:'2025 Hyundai Santa Fe Hybrid SEL',description:`Dealer link: https://www.royalmooresubaru.net/used-Hillsboro-2025-Hyundai-Santa Fe Hybrid-SEL-${descriptionVin} More details`,image:photos})}</script>`;
 assert.equal(directListingUrl(url,vin),'','photo route support must not widen seller availability checks');
 assert.deepEqual(extractListingPhotos(html(),car,url).items,photos.slice(0,8));
 assert.deepEqual(extractListingPhotos(html(otherVin),car,url).items,[]);
 assert.deepEqual(extractListingPhotos(html(vin,otherVin),car,url).items,[]);
 const result=await collectListingPhotos(car,{now,fetcher:async target=>target===url?response(html()):response(photograph,'image/png')});
 assert.equal(result.gallery.items.length,8);assert.equal(result.gallery.vin,vin);
 let calls=0;await collectListingPhotos({...car,vin:null},{now,fetcher:async()=>{calls++;return response(html());}});assert.equal(calls,0);
});

test('Newman gallery is bound to one primary Vehicle microdata block and its VIN table',async()=>{
 const url='https://newmanautonetwork.com/car-for-sale/kia-sorento-hybrid-for-sale-2023-kia-sorento-hybrid-ex/',vin='KNDRH4LG0P5224396';
 const car={vin,year:2023,name:'Kia Sorento',sources:[{url}]};
 const first='https://newmanautonetwork.com/cms/wp-content/uploads/112685-front.jpg',second=first.replace('front','interior');
 const block=primary=>`<div itemscope itemtype="http://schema.org/Vehicle"><meta itemprop="image" content="${first}"><div><h1 itemprop="name">Kia Sorento Hybrid for Sale | 2023 Kia Sorento Hybrid EX</h1><div id="home-slider-canvas"><ul><li><img data-full-image="${first}"></li><li><img data-full-image="${second}"></li></ul></div></div><table><tr class="listing_category_vin-number"><td>VIN Number: </td><td>${primary}</td></tr></table></div>`;
 const title='<title>2023 Kia Sorento Hybrid EX for Sale</title>';
 const html=title+block(vin)+`<img data-full-image="https://newmanautonetwork.com/recommended.jpg">`;
 assert.equal(directListingUrl(url,vin),'');
 assert.deepEqual(extractListingPhotos(html,car,url).items,[first,second]);
 assert.deepEqual(extractListingPhotos(title+block(otherVin),car,url).items,[]);
 assert.deepEqual(extractListingPhotos(title+block(vin)+block(otherVin),car,url).items,[]);
 const result=await collectListingPhotos(car,{now,fetcher:async target=>target===url?response(html):response(photograph,'image/png')});
 assert.equal(result.gallery.items.length,2);assert.equal(result.gallery.vin,vin);
});
