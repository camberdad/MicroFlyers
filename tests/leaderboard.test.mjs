import test from 'node:test';
import assert from 'node:assert/strict';
import { Leaderboard } from '../src/leaderboard.js';
import { ONLINE_LEADERBOARD } from '../src/online-config.js';
import { Pilot } from '../src/progress.js';

const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};
const config={apiKey:'AIzaTestKey',projectId:'microflyers-test'};
/** Fake Firebase REST endpoints that record every request. */
function fakeApi(handler) {
  const calls=[];
  const fetch=async (url,options={})=>{
    calls.push({url,options});
    const {status=200,body=null}=await handler(url,options)??{};
    return {ok:status>=200&&status<300,status,text:async()=>body===null?'':JSON.stringify(body)};
  };
  return {fetch,calls};
}
const doc=(name,value,detail='')=>({document:{fields:{name:{stringValue:name},value:{doubleValue:value},detail:{stringValue:detail},updatedAt:{timestampValue:'2026-11-18T01:00:00Z'}}}});

test('the leaderboard stays off until a Firebase web app is configured',()=>{
  const fetch=async()=>{};
  assert.ok(!ONLINE_LEADERBOARD.apiKey||ONLINE_LEADERBOARD.projectId,'shipped config is blank or complete');
  assert.equal(new Leaderboard({},fetch).enabled,false);
  assert.equal(new Leaderboard({apiKey:'k',projectId:'bad/../id'},fetch).enabled,false);
  assert.equal(new Leaderboard(config,fetch).enabled,true);
});

test('top scores run a Firestore query on the board, ordered for the mode, and are cleaned and cached',async()=>{
  const api=fakeApi(()=>({body:[doc('ace<b>',28.5,'gold medal'),{document:{fields:{name:{stringValue:'BAD'},value:{stringValue:'x'}}}},{readTime:'t'}]}));
  const board=new Leaderboard(config,api.fetch,memory());
  const rows=await board.top('rings:kitchen:2');
  assert.match(api.calls[0].url,/projects\/microflyers-test\/databases\/\(default\)\/documents\/boards\/rings%3Akitchen%3A2:runQuery\?key=AIzaTestKey$/);
  const query=JSON.parse(api.calls[0].options.body).structuredQuery;
  assert.equal(query.orderBy[0].direction,'ASCENDING');assert.equal(query.from[0].collectionId,'entries');
  assert.deepEqual(rows,[{name:'ACEB',value:28.5,detail:'gold medal',date:'2026-11-18'}]);
  await board.top('rings:kitchen:2');assert.equal(api.calls.length,1,'cached');
  await board.top('blitz:living');assert.equal(JSON.parse(api.calls[1].options.body).structuredQuery.orderBy[0].direction,'DESCENDING');
  assert.equal(await board.top('evil:board'),null);
});

test('submitting signs in anonymously once, writes only improvements with a server timestamp, and returns rank',async()=>{
  let stored=null;
  const api=fakeApi((url,options)=>{
    if(url.includes('accounts:signUp'))return {body:{idToken:'id-1',refreshToken:'refresh-1',localId:'uid-1',expiresIn:'3600'}};
    if(url.includes('/entries/uid-1?'))return stored?{body:{fields:{value:{doubleValue:stored}}}}:{status:404,body:{error:{message:'not found'}}};
    if(url.endsWith(':commit?key=AIzaTestKey')){stored=JSON.parse(options.body).writes[0].update.fields.value.doubleValue;return {body:{}};}
    if(url.includes(':runAggregationQuery'))return {body:[{result:{aggregateFields:{better:{integerValue:'2'}}}}]};
    return {body:[]};
  });
  const storage=memory(),board=new Leaderboard(config,api.fetch,storage);
  assert.equal(await board.submit('blitz:living',{name:'ace one',value:4200.12345,detail:'40 pops',version:16}),3);
  const commit=api.calls.find(c=>c.url.includes(':commit'));
  assert.equal(commit.options.headers.Authorization,'Bearer id-1');
  const write=JSON.parse(commit.options.body).writes[0];
  assert.equal(write.update.name,'projects/microflyers-test/databases/(default)/documents/boards/blitz:living/entries/uid-1');
  assert.deepEqual(write.update.fields,{board:{stringValue:'blitz:living'},name:{stringValue:'ACE ONE'},value:{doubleValue:4200.123},detail:{stringValue:'40 pops'},uid:{stringValue:'uid-1'},version:{integerValue:'16'}});
  assert.deepEqual(write.updateTransforms,[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]);
  const aggregation=JSON.parse(api.calls.find(c=>c.url.includes(':runAggregationQuery')).options.body);
  assert.equal(aggregation.structuredAggregationQuery.structuredQuery.where.fieldFilter.op,'GREATER_THAN');
  const commits=()=>api.calls.filter(c=>c.url.includes(':commit')).length;
  await board.submit('blitz:living',{name:'ACE',value:100});
  assert.equal(commits(),1,'a worse run is not written');
  assert.equal(api.calls.filter(c=>c.url.includes('signUp')).length,1,'session reused');
  assert.match(storage.getItem('microflyers.online.v1'),/refresh-1/,'refresh token kept for the next visit');
});

test('a returning player refreshes their stored session instead of creating a new identity',async()=>{
  const storage=memory();storage.setItem('microflyers.online.v1',JSON.stringify({projectId:'microflyers-test',refreshToken:'old',uid:'uid-9'}));
  const api=fakeApi(url=>url.includes('securetoken')?{body:{id_token:'id-9',refresh_token:'new',user_id:'uid-9',expires_in:'3600'}}:{body:{}});
  const session=await new Leaderboard(config,api.fetch,storage).signIn();
  assert.equal(session.uid,'uid-9');assert.ok(!api.calls.some(c=>c.url.includes('signUp')));
});

test('server errors surface so the game falls back to local scores; players can opt out of sharing',async()=>{
  const api=fakeApi(()=>({status:403,body:{error:{message:'PERMISSION_DENIED'}}}));
  const board=new Leaderboard(config,api.fetch,memory());
  await assert.rejects(board.top('blitz:living'),/403/);
  await assert.rejects(board.submit('blitz:living',{name:'A',value:5}),/403/);
  const storage=memory(),pilot=new Pilot(storage);assert.equal(pilot.state.shareOnline,true);
  pilot.setShareOnline(false);assert.equal(new Pilot(storage).state.shareOnline,false);
});
