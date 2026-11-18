import test from 'node:test';
import assert from 'node:assert/strict';
import { Leaderboard } from '../src/leaderboard.js';
import { ONLINE_LEADERBOARD } from '../src/online-config.js';
import { Pilot, cleanPilot } from '../src/progress.js';

const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};
/** Fake Supabase REST endpoint that records every request. */
function fakeApi(handler) {
  const calls=[];
  const fetch=async (url,options={})=>{
    calls.push({url,options});
    const {status=200,body=null}=await handler(url,options)??{};
    return {ok:status>=200&&status<300,status,text:async()=>body===null?'':JSON.stringify(body)};
  };
  return {fetch,calls};
}

test('the leaderboard stays off until a secure project is configured',()=>{
  assert.equal(ONLINE_LEADERBOARD.url===''||ONLINE_LEADERBOARD.url.startsWith('https://'),true,'shipped config is blank or HTTPS');
  const fetch=async()=>{};
  assert.equal(new Leaderboard({url:'',key:''},fetch).enabled,false);
  assert.equal(new Leaderboard({url:'http://evil.example',key:'k'},fetch).enabled,false,'no plain HTTP to remote hosts');
  assert.equal(new Leaderboard({url:'https://x.supabase.co/',key:'k'},fetch).enabled,true);
  assert.equal(new Leaderboard({url:'http://localhost:4174',key:'k'},fetch).enabled,true,'local test server allowed');
});

test('top scores query the right board and order, clean names and cache briefly',async()=>{
  const api=fakeApi(()=>({body:[{name:'ace<b>',value:'28.5',detail:'gold medal',updated_at:'2026-11-18T01:00:00Z'},{name:'BOB',value:'oops'}]}));
  const board=new Leaderboard({url:'https://x.supabase.co',key:'sb_publishable_abc'},api.fetch);
  const rows=await board.top('rings:kitchen:2');
  assert.match(api.calls[0].url,/\/rest\/v1\/scores\?select=name,value,detail,updated_at&board=eq\.rings%3Akitchen%3A2&order=value\.asc/);
  assert.equal(api.calls[0].options.headers.apikey,'sb_publishable_abc');
  assert.equal(api.calls[0].options.headers.Authorization,undefined,'publishable keys are not sent as bearer tokens');
  assert.deepEqual(rows,[{name:'ACEB',value:28.5,detail:'gold medal',date:'2026-11-18'}]);
  await board.top('rings:kitchen:2');assert.equal(api.calls.length,1,'cached');
  await board.top('blitz:living');assert.match(api.calls[1].url,/order=value\.desc/);
  assert.equal(await board.top('evil:board'),null);assert.equal(api.calls.length,2);
});

test('submissions go through the validating RPC and return a world rank',async()=>{
  const api=fakeApi((url)=>url.endsWith('/rpc/submit_score')?{body:3}:{body:[]});
  const board=new Leaderboard({url:'https://x.supabase.co',key:'eyJhbGciOi.legacy.anon'},api.fetch);
  await board.top('blitz:living');
  const rank=await board.submit('blitz:living',{name:'ace one',value:4200.12345,detail:'40 pops',player:'p-1',version:16});
  assert.equal(rank,3);
  const call=api.calls[1];
  assert.equal(call.options.method,'POST');assert.equal(call.options.headers.Authorization,'Bearer eyJhbGciOi.legacy.anon');
  assert.deepEqual(JSON.parse(call.options.body),{p_board:'blitz:living',p_name:'ACE ONE',p_value:4200.123,p_detail:'40 pops',p_player:'p-1',p_version:16});
  await board.top('blitz:living');assert.equal(api.calls.length,3,'a submission refreshes the cached board');
  assert.equal(await board.submit('blitz:living',{name:'X',value:NaN,player:'p'}),null);
  assert.equal(await board.submit('blitz:living',{name:'X',value:5}),null,'needs a player id');
});

test('server errors surface as failures so the game can fall back to local scores',async()=>{
  const api=fakeApi(()=>({status:400,body:{message:'implausible score'}}));
  const board=new Leaderboard({url:'https://x.supabase.co',key:'k'},api.fetch);
  await assert.rejects(board.submit('blitz:living',{name:'A',value:1e9,player:'p'}),/400/);
  await assert.rejects(board.top('blitz:living'),/400/);
});

test('each browser gets a stable anonymous player id and can opt out of sharing',()=>{
  const storage=memory(),pilot=new Pilot(storage);
  assert.match(pilot.state.playerId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(pilot.state.shareOnline,true);
  pilot.setShareOnline(false);
  const again=new Pilot(storage);assert.equal(again.state.playerId,pilot.state.playerId);assert.equal(again.state.shareOnline,false);
  assert.notEqual(cleanPilot({schema:1,playerId:'not-a-uuid'}).playerId,'not-a-uuid');
});
