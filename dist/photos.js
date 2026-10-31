import {safeUrl} from './core.js';
import {listingIdentity} from './sources.js';

// Each collection was taken from the original listing displaying this exact VIN.
// Kept outside browser-local records so existing notes and imports need no reset.
const listingPhotos={
 JTEAAAAH6NJ101083:{prefix:'venza-montclair',extension:'webp',count:6,sourceLabel:'IE Motors Direct',sourceUrl:'https://www.iemotorsdirect.com/pre-owned-cars/detail/2022-Toyota-Venza/1588507'},
 KNDRGDLG3N5107069:{prefix:'sorento-peoria',extension:'jpg',count:6,sourceLabel:'AutoNation Chevrolet Arrowhead',sourceUrl:'https://www.autonationchevroletarrowhead.com/used-Peoria%2B%2B-2022-Kia-Sorento%2BHybrid-S-KNDRGDLG3N5107069'},
 '2T2BGMCA5JC027777':{prefix:'lexus-henderson',extension:'jpg',count:1,sourceLabel:'EchoPark Las Vegas',sourceUrl:'https://www.echopark.com/car/2T2BGMCA5JC027777'}
};

export function safePhotoUrl(value){
 const url=safeUrl(value);if(!url)return '';
 const u=new URL(url);
 return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';
}

function canonicalPhotos(vehicle){
 const photos=vehicle.listingPhotos;
 if(!photos||photos.verified!==true||!Array.isArray(photos.items)||!photos.items.length||photos.items.length>50)return null;
 const sourceUrl=safePhotoUrl(photos.sourceUrl);
 if(!sourceUrl||!(vehicle.sources||[]).some(source=>safePhotoUrl(source.url)===sourceUrl))return null;
 if(vehicle.vin){
  if(photos.vin!==vehicle.vin)return null;
 }else{
  // Without a VIN, only a recognized vehicle-specific listing identity can bind
  // a gallery. A matching generic inventory/search URL is not enough.
  const identity=listingIdentity(sourceUrl);
  if(photos.vin||!identity||photos.listingId!==identity)return null;
 }
 const checkedAt=photos.checkedAt;
 if(typeof checkedAt!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/.test(checkedAt)||!Number.isFinite(Date.parse(checkedAt))||new Date(checkedAt.slice(0,10)).toISOString().slice(0,10)!==checkedAt.slice(0,10))return null;
 const items=photos.items.map(safePhotoUrl);
 if(items.some(url=>!url))return null;
 return {items:[...new Set(items)],sourceUrl,sourceLabel:typeof photos.sourceLabel==='string'&&photos.sourceLabel.trim()?photos.sourceLabel:'Original listing photos',checkedAt,verified:true};
}

export function photosFor(vehicle){
 const canonical=canonicalPhotos(vehicle);if(canonical)return canonical;
 const known=listingPhotos[vehicle.vin];
 if(known)return {...known,checkedAt:'2026-10-22',verified:true,items:Array.from({length:known.count},(_,i)=>`photos/${known.prefix}-${i+1}.${known.extension}`)};
 const supplied=[...(vehicle.observations||[])].reverse().find(o=>safePhotoUrl(o.imageUrl)&&safeUrl(o.url));
 if(!supplied)return null;
 return {items:[safePhotoUrl(supplied.imageUrl)],sourceUrl:safeUrl(supplied.url),sourceLabel:(supplied.source||'Agent')+' supplied photo',checkedAt:supplied.checkedAt||null,verified:false};
}
