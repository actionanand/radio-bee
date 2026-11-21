'use strict';
const {directory,allowedStream,normalize}=require('./catalogue');
const say=(text,end=false)=>({version:'1.0',response:{outputSpeech:{type:'PlainText',text},shouldEndSession:end}});
// AudioPlayer lifecycle events occur outside a skill session; Alexa forbids shouldEndSession there.
const silent=()=>({version:'1.0',response:{}});
const slot=(intent,key)=>intent?.slots?.[key]?.resolutions?.resolutionsPerAuthority?.flatMap(r=>r.values||[]).find(x=>x.value?.name)?.value?.name||intent?.slots?.[key]?.value||'';
const tokenNumber=token=>{const m=/^radiobee:channel:(\d{1,4}):[a-z0-9-]+$/.exec(token||'');return m?Number(m[1]):null;};
const current=event=>tokenNumber(event?.context?.AudioPlayer?.token||event?.request?.token);
function play(row,offset=0){
  if(!row)return say('That channel is not listed in Radio Bee. Try another channel number.');
  const stream=row.station.streams?.find(allowedStream);
  if(!stream)return say('Channel '+row.number+', '+row.station.name+', is not approved for Alexa playback yet. Please try another station.');
  return {version:'1.0',response:{
    outputSpeech:{type:'PlainText',text:'Playing '+row.station.name+'.'},
    directives:[{type:'AudioPlayer.Play',playBehavior:'REPLACE_ALL',audioItem:{
      stream:{url:stream.url,token:'radiobee:channel:'+row.number+':'+row.station.id,offsetInMilliseconds:Math.max(0,Math.floor(offset))}
    }}],shouldEndSession:true
  }};
}
const stop=()=>({version:'1.0',response:{directives:[{type:'AudioPlayer.Stop'}],shouldEndSession:true}});
const number=value=>{const n=Number(String(value).replace(/,/g,'').trim());return Number.isSafeInteger(n)&&n>0&&n<=9999?n:null;};
async function dispatch(event,options={}){
  const request=event?.request;
  if(!request?.type)return silent();
  if(request.type.startsWith('AudioPlayer.')||request.type==='SessionEndedRequest')return silent();
  if(request.type==='LaunchRequest')return say('Welcome to Radio Bee. Say play channel one, or play a radio station by name.');
  if(request.type!=='IntentRequest')return silent();
  const intent=request.intent||{},name=intent.name;
  if(['AMAZON.StopIntent','AMAZON.PauseIntent','AMAZON.CancelIntent'].includes(name))return stop();
  if(name==='AMAZON.HelpIntent')return say('Say play channel one, play Suryan FM Chennai, next channel, or stop.');
  if(name==='AMAZON.FallbackIntent')return say('I did not recognize that request. Please say play channel one.');
  if(!['PlayChannelIntent','PlayStationIntent','StationNumberIntent','NextChannelIntent','PreviousChannelIntent',
    'CurrentChannelIntent','AMAZON.NextIntent','AMAZON.PreviousIntent','AMAZON.ResumeIntent'].includes(name))
    return say('Please say play channel one.');
  const d=await directory(options),channel=current(event);
  if(name==='PlayChannelIntent')return play(d.channels.get(number(slot(intent,'channelNumber'))));
  if(name==='PlayStationIntent'){
    const n=d.names.get(normalize(slot(intent,'stationName')));
    return n?play(d.channels.get(n)):say('I could not find that station. Please try its full name or channel number.');
  }
  if(name==='StationNumberIntent'){
    const n=d.names.get(normalize(slot(intent,'stationName')));
    return n?say(d.channels.get(n).station.name+' is channel '+n+'.'):say('I could not find that station.');
  }
  if(name==='CurrentChannelIntent'){
    const row=d.channels.get(channel);
    return say(row?'This is channel '+row.number+', '+row.station.name+'.':'I cannot identify the current Radio Bee channel.');
  }
  if(name==='AMAZON.ResumeIntent')return play(d.channels.get(channel),event?.context?.AudioPlayer?.offsetInMilliseconds||0);
  if(!channel)return say('First play a radio station by its name or channel number.');
  const list=[...d.channels.keys()].sort((a,b)=>a-b),at=list.indexOf(channel);
  if(at<0)return say('I could not find the current channel.');
  const direction=['NextChannelIntent','AMAZON.NextIntent'].includes(name)?1:-1;
  return play(d.channels.get(list[(at+direction+list.length)%list.length]));
}
exports.handler=async event=>{
  try{return await dispatch(event);}
  catch(error){console.error('RadioBee Alexa error:',String(error?.message||'unknown'));return say('Radio Bee station data is temporarily unavailable. Try again later.',true);}
};
exports.dispatch=dispatch;
exports.channelFromToken=tokenNumber;
