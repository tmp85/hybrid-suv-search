import {safeUrl} from './core.js';

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

export function photosFor(vehicle){
 const known=listingPhotos[vehicle.vin];
 if(known)return {...known,checkedAt:'2026-10-22',verified:true,items:Array.from({length:known.count},(_,i)=>`photos/${known.prefix}-${i+1}.${known.extension}`)};
 const supplied=[...(vehicle.observations||[])].reverse().find(o=>safePhotoUrl(o.imageUrl)&&safeUrl(o.url));
 if(!supplied)return null;
 return {items:[safePhotoUrl(supplied.imageUrl)],sourceUrl:safeUrl(supplied.url),sourceLabel:(supplied.source||'Agent')+' supplied photo',checkedAt:supplied.checkedAt||null,verified:false};
}
