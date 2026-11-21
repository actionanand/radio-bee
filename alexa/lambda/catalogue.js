'use strict';
const https=require('node:https');
const ROOT='https://actionanand.github.io/radio-bee-data/';
// Alexa-hosted skills can run on Node 16, where global fetch is unavailable.
// This is deliberately a small, bounded HTTPS-only fallback for the two fixed data URLs.
function nativeFetch(url,{headers,signal}={}){
  return new Promise((resolve,reject)=>{
    const req=https.get(url,{headers,signal,timeout:4500},response=>{
      const status=response.statusCode||0;
      if(status<200||status>=300){response.resume();reject(Error('Catalogue HTTP status '+status));return;}
      const type=response.headers['content-type']||'';
      if(!/json/i.test(type)){response.resume();reject(Error('Expected catalogue JSON'));return;}
      const chunks=[];let bytes=0;
      response.on('data',chunk=>{
        bytes+=chunk.length;
        if(bytes>5*1024*1024){response.destroy(Error('Catalogue too large'));return;}
        chunks.push(chunk);
      });
      response.on('end',()=>resolve({
        ok:true,headers:{get:name=>String(response.headers[name.toLowerCase()]||'')},
        text:async()=>Buffer.concat(chunks).toString('utf8')
      }));
      response.on('error',reject);
    });
    req.on('timeout',()=>req.destroy(Error('Catalogue timed out')));
    req.on('error',reject);
  });
}
const cache=new Map(),TTL=300000;
async function getJson(file,{fetcher,now=Date.now()}={}){
  if(!['alexa/station-numbers.json','v2/stations.json'].includes(file))throw Error('Unsupported catalogue file');
  const url=ROOT+file,cached=cache.get(url);
  if(cached&&cached.until>now)return cached.data;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4500);
  try{
    const response=await (fetcher || globalThis.fetch || nativeFetch)(url,{signal:controller.signal,redirect:'error',headers:{Accept:'application/json'}});
    if(!response.ok||!/json/i.test(response.headers?.get?.('content-type')||''))throw Error('Catalogue response not available as JSON');
    const body=await response.text();
    if(body.length>5*1024*1024)throw Error('Catalogue too large');
    const data=JSON.parse(body);
    cache.set(url,{data,until:now+TTL});
    return data;
  }finally{clearTimeout(timer);}
}
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
function allowedStream(stream){
  if(stream?.verificationStatus!=='verified'||stream.rightsStatus!=='permission-granted'||
    stream.directListening?.status!=='allowed'||!['mp3','aac','hls'].includes(stream.format))return false;
  try{
    const u=new URL(stream.url);
    return u.protocol==='https:'&&(!u.port||u.port==='443')&&
      !u.username&&!u.password&&!u.hash&&u.hostname.includes('.')&&
      !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(u.hostname)&&
      !['localhost','local','internal'].some(x=>u.hostname===x||u.hostname.endsWith('.'+x));
  }catch{return false;}
}
function validateDirectory(registry,stations){
  if(registry?.schemaVersion!==1||registry.locale!=='en-IN'||
     JSON.stringify(registry.supportedBroadcastLanguages)!==JSON.stringify(['ta','en'])||
     !Array.isArray(registry.channels)||!Array.isArray(stations))throw Error('Invalid Alexa directory');
  const byId=new Map(stations.map(s=>[s.id,s])),channels=new Map(),names=new Map();
  for(const row of registry.channels){
    const station=byId.get(row.stationId);
    if(!Number.isInteger(row.number)||row.number<1||row.number>9999||channels.has(row.number)||
      !Array.isArray(row.spokenNames)||!row.spokenNames.length)throw Error('Invalid Alexa channel entry');
    if(!station||!Array.isArray(station.broadcastLanguages)||!station.broadcastLanguages.length||
      station.broadcastLanguages.some(x=>!['ta','en'].includes(x)))throw Error('Ineligible Alexa station');
    channels.set(row.number,{number:row.number,station});
    for(const alias of [...row.spokenNames,station.name]){
      const key=normalize(alias);
      if(!key||(names.has(key)&&names.get(key)!==row.number))throw Error('Ambiguous Alexa alias');
      names.set(key,row.number);
    }
  }
  if(channels.get(1)?.station.id!=='stage29-tamil-kadavul-murugan-fm'||
     channels.get(2)?.station.id!=='stage39-mugugan-songs-fm')throw Error('Murugan channel numbers must not change');
  return {channels,names};
}
async function directory(options={}){
  const [registry,stations]=await Promise.all([getJson('alexa/station-numbers.json',options),getJson('v2/stations.json',options)]);
  return validateDirectory(registry,stations);
}
const resetCache=()=>cache.clear();
module.exports={directory,normalize,allowedStream,validateDirectory,resetCache};
