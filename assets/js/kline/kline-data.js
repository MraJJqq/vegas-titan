/* Layer 5 Bitget USDT-Futures 4H candle engine. IndexedDB persistence + incremental EMA cache. */
(function(){
'use strict';
const API='https://api.bitget.com',WARMUP_BARS=4000,PERIOD='4H';
const DB_NAME='vegas-titan-kline-cache',DB_VERSION=1,STORE='series',MAX_RECORDS=36;
const cache=new Map(),inflight=new Map(),backfills=new Map(),emaCache=new Map();
let dbPromise=null;
function openDB(){
 if(!('indexedDB'in window))return Promise.resolve(null);
 if(dbPromise)return dbPromise;
 dbPromise=new Promise(resolve=>{
  let request;
  try{request=indexedDB.open(DB_NAME,DB_VERSION);}catch(error){resolve(null);return;}
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'key'});};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>resolve(null);
  request.onblocked=()=>resolve(null);
 });
 return dbPromise;
}
async function readRecord(key){
 const db=await openDB();if(!db)return null;
 return new Promise(resolve=>{
  try{const request=db.transaction(STORE,'readonly').objectStore(STORE).get(key);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>resolve(null);}
  catch(error){resolve(null);}
 });
}
async function writeRecord(record){
 const db=await openDB();if(!db)return;
 await new Promise(resolve=>{
  try{
   const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
   store.put(record);
   const count=store.count();
   count.onsuccess=()=>{
    if(count.result<=MAX_RECORDS)return;
    const request=store.getAll();
    request.onsuccess=()=>{
     const records=(request.result||[]).sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
     records.slice(MAX_RECORDS).forEach(item=>store.delete(item.key));
    };
   };
   tx.oncomplete=tx.onerror=tx.onabort=()=>resolve();
  }catch(error){resolve();}
 });
}
function keyFor(symbol,period){return String(symbol).toUpperCase()+'|'+period;}
function hydrate(key,record){
 if(!record||!Array.isArray(record.rows))return;
 const rows=record.rows.filter(row=>row&&Number.isFinite(row.time)&&Number.isFinite(row.close));
 if(!rows.length)return;
 cache.set(key,{rows,at:0,historyChecked:!!record.historyChecked});
 const symbol=key.split('|')[0],saved=record.emas||{};
 Object.keys(saved).forEach(length=>{if(Array.isArray(saved[length]))emaCache.set(symbol+'|'+PERIOD+'|'+length,saved[length]);});
}
async function ensureCached(symbol,period){
 const key=keyFor(symbol,period);
 if(cache.has(key))return cache.get(key).rows;
 const record=await readRecord(key);if(record)hydrate(key,record);
 return cache.get(key)?.rows||[];
}
function snapshot(symbol,rows){
 const emas={};
 [12,36,43,144,169,576,676].forEach(length=>{const values=emaCache.get(symbol+'|'+PERIOD+'|'+length);if(values)emas[length]=values;});
 return{key:keyFor(symbol,PERIOD),symbol,period:PERIOD,rows,emas,historyChecked:!!cache.get(keyFor(symbol,PERIOD))?.historyChecked,savedAt:Date.now()};
}
function persist(symbol,rows){writeRecord(snapshot(symbol,rows)).catch(()=>{});}
async function request(path){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{const response=await fetch(API+path,{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('Bitget HTTP '+response.status);const json=await response.json();if(json.code!=='00000'||!Array.isArray(json.data))throw Error(json.msg||'Bitget response invalid');return json.data;}
 finally{clearTimeout(timer);}
}
function normalize(rows){
 return rows.filter(row=>Array.isArray(row)&&row.slice(0,5).every(v=>Number.isFinite(+v)&&+v>0))
 .map(row=>({time:Math.floor(+row[0]/1000),open:+row[1],high:+row[2],low:+row[3],close:+row[4]}))
 .filter(row=>row.time>0&&row.high>=Math.max(row.open,row.close)&&row.low<=Math.min(row.open,row.close));
}
async function context(symbol,period){
 if(period!==PERIOD)throw Error('Bitget K-line only supports 4H');
 const contract=String(symbol||'').toUpperCase().replace(/USDT$/,'')+'USDT';
 return{
  latest:'/api/v2/mix/market/candles',
  history:'/api/v2/mix/market/history-candles',
  latestParams:{symbol:contract,productType:'USDT-FUTURES',granularity:PERIOD,limit:'1000'},
  historyParams:{symbol:contract,productType:'USDT-FUTURES',granularity:PERIOD,limit:'200'},
  pageLimit:200
 };
}
function sameCandle(a,b){return !!a&&!!b&&a.time===b.time&&a.open===b.open&&a.high===b.high&&a.low===b.low&&a.close===b.close;}
function updateIndicators(symbol,oldRows,newRows){
 [12,36,43,144,169,576,676].forEach(length=>{
  const key=symbol+'|'+PERIOD+'|'+length,old=emaCache.get(key)||[];
  let common=0,limit=Math.min(oldRows.length,newRows.length);
  while(common<limit&&sameCandle(oldRows[common],newRows[common]))common++;
  if(common===oldRows.length&&old.length&&newRows.length===oldRows.length)return;
  let out=[],value=0,start=0;
  if(common>=length&&old.length){
   const priorTime=oldRows[common-1].time,prior=old[common-length];
   if(prior&&prior.time===priorTime){out=old.slice(0,common-length+1);value=prior.value;start=common;}
  }
  if(!start){
   if(newRows.length<length){emaCache.set(key,[]);return;}
   value=newRows.slice(0,length).reduce((sum,row)=>sum+row.close,0)/length;
   out=[{time:newRows[length-1].time,value}];start=length;
  }
  const factor=2/(length+1);
  for(let i=start;i<newRows.length;i++){value=newRows[i].close*factor+value*(1-factor);out.push({time:newRows[i].time,value});}
  emaCache.set(key,out);
 });
}
function mergeRows(symbol,period,oldRows,incoming){
 const merged=new Map(oldRows.map(row=>[row.time,row]));incoming.forEach(row=>merged.set(row.time,row));
 const rows=[...merged.values()].sort((a,b)=>a.time-b.time);
 if(rows.length>WARMUP_BARS+1000)rows.splice(0,rows.length-(WARMUP_BARS+1000));
 updateIndicators(symbol,oldRows,rows);return rows;
}
async function refreshLatest(symbol,period,key){
 if(inflight.has(key))return inflight.get(key);
 const promise=(async()=>{
  const cached=cache.get(key);
  const ctx=await context(symbol,period),params={...ctx.latestParams};
  params.limit=cached&&cached.rows.length?'10':'1000';
  const incoming=normalize(await request(ctx.latest+'?'+new URLSearchParams(params)));
  if(!incoming.length)throw Error('No valid candles for '+symbol);
  const oldEntry=cache.get(key),oldRows=oldEntry?.rows||[];
  const missingIndicators=[12,36,43,144,169,576,676].some(n=>!emaCache.has(symbol+'|'+PERIOD+'|'+n));
  const rows=mergeRows(symbol,period,oldRows,incoming);
  const changed=rows.length!==oldRows.length||rows.some((row,i)=>!sameCandle(row,oldRows[i]));
  cache.set(key,{rows,at:Date.now(),historyChecked:!!oldEntry?.historyChecked});
  if(changed||!oldRows.length||missingIndicators)persist(symbol,rows);
  while(cache.size>90)cache.delete(cache.keys().next().value);
  if(changed&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('vegas-kline-data-updated',{detail:{symbol,period,rows}}));
  return rows;
 })();
 inflight.set(key,promise);try{return await promise;}finally{if(inflight.get(key)===promise)inflight.delete(key);}
}
async function latest(symbol,period){
 if(period!==PERIOD)throw Error('Only 4H candles are enabled');
 const key=keyFor(symbol,period);
 await ensureCached(symbol,period);
 const cached=cache.get(key);
 if(cached&&cached.rows.length){
  if(Date.now()-cached.at>=20000)refreshLatest(symbol,period,key).catch(()=>{});
  return cached.rows;
 }
 return refreshLatest(symbol,period,key);
}
async function history(symbol,period,firstRows){
 if(period!==PERIOD)throw Error('Only 4H history is enabled');
 const key=keyFor(symbol,period);if(backfills.has(key))return backfills.get(key);
 const promise=(async()=>{
  const cachedRows=await ensureCached(symbol,period);
  if(cache.get(key)?.historyChecked&&cachedRows.length)return cachedRows;
  const seed=cachedRows.length>firstRows.length?cachedRows:firstRows;
  const ctx=await context(symbol,period),all=new Map(seed.map(row=>[row.time,row]));
  let oldest=Math.min(...all.keys()),endTime=oldest*1000-1;
  const maxPages=Math.ceil(WARMUP_BARS/ctx.pageLimit)+2;
  for(let page=0;page<maxPages&&all.size<WARMUP_BARS;page++){
   const params={...ctx.historyParams,endTime:String(endTime)},rows=normalize(await request(ctx.history+'?'+new URLSearchParams(params)));
   if(!rows.length)break;
   let added=0;rows.forEach(row=>{if(!all.has(row.time)){all.set(row.time,row);added++;}});
   const nextOldest=Math.min(...rows.map(row=>row.time));if(!added||!Number.isFinite(nextOldest)||nextOldest>=oldest)break;
   oldest=nextOldest;endTime=oldest*1000-1;
  }
  const latestRows=cache.get(key)?.rows||[];latestRows.forEach(row=>all.set(row.time,row));
  const result=[...all.values()].sort((a,b)=>a.time-b.time),oldRows=cache.get(key)?.rows||[];
  updateIndicators(symbol,oldRows,result);cache.set(key,{rows:result,at:Date.now(),historyChecked:true});persist(symbol,result);
  while(cache.size>90)cache.delete(cache.keys().next().value);return result;
 })();
 backfills.set(key,promise);try{return await promise;}finally{if(backfills.get(key)===promise)backfills.delete(key);}
}
function ema(rows,length,symbol){
 if(rows.length<length)return[];
 if(symbol){const saved=emaCache.get(String(symbol).toUpperCase()+'|'+PERIOD+'|'+length);if(saved&&saved.length===rows.length-length+1&&saved[saved.length-1]?.time===rows[rows.length-1].time)return saved;}
 let value=rows.slice(0,length).reduce((sum,row)=>sum+row.close,0)/length;
 const factor=2/(length+1),out=[{time:rows[length-1].time,value}];
 for(let i=length;i<rows.length;i++){value=rows[i].close*factor+value*(1-factor);out.push({time:rows[i].time,value});}
 return out;
}
window.VegasKlineData={load:latest,complete:history,ema,warmupBars:WARMUP_BARS,periods:[PERIOD],emas:[12,36,43,144,169,576,676],cache:{type:'IndexedDB',period:PERIOD}};
})();