'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {dispatch,channelFromToken}=require('../lambda/index');
const {allowedStream,validateDirectory,normalize,resetCache}=require('../lambda/catalogue');
const models = {
 'en-IN': require('../skill-package/interactionModels/custom/en-IN.json'),
 'en-US': require('../skill-package/interactionModels/custom/en-US.json'),
};
const registry={schemaVersion:1,locale:'en-IN',supportedBroadcastLanguages:['ta','en'],channels:[
 {number:1,stationId:'stage29-tamil-kadavul-murugan-fm',spokenNames:['murugan radio']},
 {number:2,stationId:'stage39-mugugan-songs-fm',spokenNames:['murugan songs fm']},
 {number:3,stationId:'air-nagercoil',spokenNames:['air nagercoil']}
]};
const approved=url=>({url,format:'mp3',verificationStatus:'verified',rightsStatus:'permission-granted',directListening:{status:'allowed'}});
const stations=[
 {id:registry.channels[0].stationId,name:'Tamil Kadavul Murugan',broadcastLanguages:['ta'],streams:[approved('https://radio.example.com/murugan.mp3')]},
 {id:registry.channels[1].stationId,name:'Mugugan Songs FM',broadcastLanguages:['ta'],streams:[{...approved('https://stream.zeno.fm/abc'),verificationStatus:'unverified',rightsStatus:'unconfirmed',directListening:{status:'needs-review'}}]},
 {id:'air-nagercoil',name:'Akashvani Nagercoil',broadcastLanguages:['ta','en'],streams:[approved('https://radio.example.com/air.mp3')]}
];
const fetcher=async url=>({ok:true,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify(url.includes('station-numbers.json')?registry:stations)});
const options={fetcher,now:Date.now()};
const event=(name,slots={},token)=>({request:{type:'IntentRequest',intent:{name,slots:Object.fromEntries(Object.entries(slots).map(([k,value])=>[k,{value}]))}},context:token?{AudioPlayer:{token}}:{}});
const token='radiobee:channel:1:stage29-tamil-kadavul-murugan-fm';
for (const [locale, model] of Object.entries(models)) {
 test(`${locale} model supports the existing invocation, intents, and slot types`,()=>{
  const language = model.interactionModel.languageModel;
  assert.equal(language.invocationName,'radio bee');
  const intents = language.intents;
  for (const name of ['PlayChannelIntent','PlayStationIntent','StationNumberIntent',
    'NextChannelIntent','PreviousChannelIntent','CurrentChannelIntent']) {
    assert.ok(intents.some(i=>i.name===name), `${locale} missing ${name}`);
  }
  assert.equal(intents.find(i=>i.name==='PlayChannelIntent').slots[0].type,'AMAZON.NUMBER');
  assert.equal(intents.find(i=>i.name==='PlayStationIntent').slots[0].type,'AMAZON.SearchQuery');
  assert.equal(intents.find(i=>i.name==='StationNumberIntent').slots[0].type,'AMAZON.SearchQuery');
  assert.ok(intents.find(i=>i.name==='PlayChannelIntent').samples.includes('play channel {channelNumber}'));
  assert.ok(intents.find(i=>i.name==='PlayStationIntent').samples.includes('play {stationName}'));
 });
}
test('registry rejects non-Tamil/English stations and ambiguous aliases',()=>{
 assert.equal(validateDirectory(registry,stations).channels.size,3);
 assert.equal(normalize('  Murugan Songs FM!! '),'murugan songs fm');
 assert.throws(()=>validateDirectory(registry,stations.map(s=>s.id==='air-nagercoil'?{...s,broadcastLanguages:['ta','si']}:s)),/Ineligible/);
});
test('Alexa trial playback accepts direct candidates without falsifying approval metadata',()=>{
 assert.equal(allowedStream(approved('https://radio.example.com/live.mp3')),true);
 for(const url of ['http://radio.example.com/live.mp3','https://radio.example.com:8000/live.mp3','https://127.0.0.1/live.mp3'])assert.equal(allowedStream(approved(url)),false,url);
 const candidate={...approved('https://radio.example.com/live.mp3'),verificationStatus:'unverified',rightsStatus:'unconfirmed',directListening:{status:'needs-review'}};
 assert.equal(allowedStream(candidate),true);
 assert.equal(allowedStream({...candidate,format:'unknown'}),false);
 assert.equal(allowedStream({...candidate,url:'https://stream.zeno.fm/example',format:'unknown'}),true);
 assert.equal(allowedStream({...candidate,format:'wav'}),false);
 assert.equal(allowedStream({...candidate,url:'https://radio.example.com:2020/live'}),false);
});
test('plays channel one with AudioPlayer and returns immediately',async()=>{
 resetCache();const r=await dispatch(event('PlayChannelIntent',{channelNumber:'1'}),options);
 assert.equal(r.response.directives[0].type,'AudioPlayer.Play');
 assert.equal(r.response.directives[0].audioItem.stream.url,'https://radio.example.com/murugan.mp3');
 assert.equal(r.response.shouldEndSession,true);
});
test('channel 2 attempts trial playback from its existing Zeno candidate',async()=>{
 const r=await dispatch(event('PlayChannelIntent',{channelNumber:'2'}),options);
 assert.equal(r.response.directives[0].type,'AudioPlayer.Play');
 assert.equal(r.response.directives[0].audioItem.stream.url,'https://stream.zeno.fm/abc');
});
test('station lookup resolves aliases and channel numbers',async()=>{
 const a=await dispatch(event('PlayStationIntent',{stationName:'air nagercoil'}),options);
 assert.equal(a.response.directives[0].audioItem.stream.url,'https://radio.example.com/air.mp3');
 const b=await dispatch(event('StationNumberIntent',{stationName:'murugan songs fm'}),options);
 assert.match(b.response.outputSpeech.text,/channel 2/);
});
test('next and previous use fixed numbers; playback lifecycle event is silent',async()=>{
 assert.equal(channelFromToken(token),1);
 const next=await dispatch(event('NextChannelIntent',{},token),options);
 assert.equal(next.response.directives[0].audioItem.stream.url,'https://stream.zeno.fm/abc');
 const prev=await dispatch(event('PreviousChannelIntent',{},token),options);
 assert.equal(prev.response.directives[0].audioItem.stream.url,'https://radio.example.com/air.mp3');
 const lifecycle=await dispatch({request:{type:'AudioPlayer.PlaybackNearlyFinished',token}},options);
 assert.equal(lifecycle.response.directives,undefined);
});

test('channels without Alexa-compatible HTTPS:443 media keep a clear response',async()=>{
 resetCache();
 const restrictedStations=stations.map(s=>s.id===registry.channels[1].stationId?
   {...s,streams:[{...s.streams[0],url:'https://radio.example.com:8006/live.mp3',format:'mp3'}]}:s);
 const trialFetcher=async url=>({ok:true,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify(url.includes('station-numbers.json')?registry:restrictedStations)});
 const r=await dispatch(event('PlayChannelIntent',{channelNumber:'2'}),{fetcher:trialFetcher,now:Date.now()});
 assert.match(r.response.outputSpeech.text,/no Alexa-compatible HTTPS stream on port 443/);
 assert.equal(r.response.directives,undefined);
 resetCache();
});
test('stop and pause use AudioPlayer.Stop; launch welcomes',async()=>{
 for(const name of ['AMAZON.StopIntent','AMAZON.PauseIntent'])
   assert.equal((await dispatch(event(name),options)).response.directives[0].type,'AudioPlayer.Stop');
 assert.match((await dispatch({request:{type:'LaunchRequest'}},options)).response.outputSpeech.text,/Welcome/);
});
