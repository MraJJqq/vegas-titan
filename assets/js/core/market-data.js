/* Layer 3 Bitget data engine. Owns all market requests, caches and polling. */
(function(){
'use strict';
if(window.VegasMarketData)return;
const API='https://api.bitget.com',REFRESH_MS=15000,MINI_REFRESH_MS=60000;
let stockMap=null,stockMapAt=0,stockMapPromise=null,refreshTimer=0,refreshing=false,stopped=false;
const miniLastAt=new Map(),miniInFlight=new Set();
const snapshots=new Map();
function request(path){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 return fetch(API+path,{cache:'no-store',signal:controller.signal}).then(async response=>{
  if(!response.ok)throw Error('Bitget HTTP '+response.status);
  const json=await response.json();
  if(json.code!=='00000'||!Array.isArray(json.data))throw Error(json.msg||'Bitget data invalid');
  return json.data;
 }).finally(()=>clearTimeout(timer));
}
function getStockMap(){
 if(stockMap&&Date.now()-stockMapAt<300000)return Promise.resolve(stockMap);
 if(stockMapPromise)return stockMapPromise;
 stockMapPromise=request('/api/v3/reality/market/stock-info').then(rows=>{
  const map=new Map(rows.filter(x=>x?.code&&x?.symbol).map(x=>[String(x.code).toUpperCase(),String(x.symbol)]));
  const special=rows.find(x=>x?.symbol&&(/SKHYNIX/i.test(String(x.code||''))||/SK\s*HYNIX/i.test(String(x.name||''))||/RSKHYUSDT/i.test(String(x.symbol||''))));
  if(special)map.set('SKHYNIX',String(special.symbol));
  stockMap=map;stockMapAt=Date.now();return map;
 }).finally(()=>{stockMapPromise=null;});
 return stockMapPromise;
}
function normalizeMini(rows){
 return rows.map(row=>({time:Number(row[0]),open:Number(row[1]),high:Number(row[2]),low:Number(row[3]),close:Number(row[4])}))
 .filter(c=>Number.isFinite(c.time)&&c.open>0&&c.high>0&&c.low>0&&c.close>0&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close));
}
async function refreshMini(instruments,visibleSymbols){
 if(stopped||document.hidden)return;
 const visible=new Set((Array.isArray(visibleSymbols)?visibleSymbols:[]).map(x=>String(x||'').toUpperCase()));
 if(!visible.size)return;
 const now=Date.now();
 const queue=instruments.filter(item=>visible.has(item.symbol)&&now-(miniLastAt.get(item.symbol)||0)>=MINI_REFRESH_MS&&!miniInFlight.has(item.symbol));
 if(!queue.length)return;
 const map=await getStockMap().catch(()=>stockMap);
 let cursor=0;
 async function worker(){
  while(cursor<queue.length&&!stopped&&!document.hidden){
   const item=queue[cursor++],previous=snapshots.get(item.symbol),symbol=item.isSpotStock?map?.get(item.symbol):item.contract;
   if(!symbol)continue;
   miniInFlight.add(item.symbol);
   const limit=previous?.candles?.length?'3':'60';
   const path=item.isSpotStock
    ?'/api/v3/market/candles?'+new URLSearchParams({category:'SPOT',symbol,interval:'1H',limit})
    :'/api/v2/mix/market/candles?'+new URLSearchParams({symbol,productType:'USDT-FUTURES',granularity:'1H',limit});
   try{
    const incoming=normalizeMini(await request(path)),merged=new Map((previous?.candles||[]).map(c=>[c.time,c]));
    incoming.forEach(c=>merged.set(c.time,c));
    const candles=[...merged.values()].sort((a,b)=>a.time-b.time).slice(-60);
    snapshots.set(item.symbol,{...(previous||{}),candles});
    miniLastAt.set(item.symbol,Date.now());
   }catch(error){
    console.warn('[Vegas Market Data] mini candles failed:',item.symbol,error);
   }finally{
    miniInFlight.delete(item.symbol);
   }
  }
 }
 await Promise.all(Array.from({length:2},worker));
}
async function refresh(instruments,onUpdate,getVisibleSymbols){
 if(stopped||document.hidden||refreshing)return;
 refreshing=true;
 try{
  const [futuresResult,spotsResult,mapResult]=await Promise.allSettled([
   request('/api/v2/mix/market/tickers?productType=USDT-FUTURES'),
   request('/api/v3/market/tickers?category=SPOT'),
   getStockMap()
  ]);
  const map=mapResult.status==='fulfilled'?mapResult.value:stockMap;
  const neededFutures=new Set(instruments.filter(item=>!item.isSpotStock).map(item=>String(item.contract).toUpperCase()));
  const neededSpots=new Set(instruments.filter(item=>item.isSpotStock).map(item=>String(map?.get(item.symbol)||'').toUpperCase()).filter(Boolean));
  const futures=futuresResult.status==='fulfilled'?new Map():null;
  const spots=spotsResult.status==='fulfilled'?new Map():null;
  if(futures)for(const ticker of futuresResult.value){const symbol=String(ticker.symbol||'').toUpperCase();if(neededFutures.has(symbol))futures.set(symbol,ticker);}
  if(spots)for(const ticker of spotsResult.value){const symbol=String(ticker.symbol||'').toUpperCase();if(neededSpots.has(symbol))spots.set(symbol,ticker);}
  instruments.forEach(item=>{
   const previous=snapshots.get(item.symbol)||{candles:[]};
   const exchangeSymbol=item.isSpotStock?map?.get(item.symbol):item.contract;
   const ticker=item.isSpotStock?(exchangeSymbol&&spots?.get(exchangeSymbol.toUpperCase())):futures?.get(item.contract);
   if(!ticker)return;
   const price=Number(item.isSpotStock?ticker.lastPrice:ticker.lastPr);
   const open=Number(item.isSpotStock?ticker.openPrice24h:ticker.open24h);
   if(!(price>0&&open>0))return;
   snapshots.set(item.symbol,{...previous,price,open,exchangeSymbol,updatedAt:Date.now()});
  });
  if(typeof onUpdate==='function')onUpdate(new Map(snapshots));
  // Mini-candles are decorative card data; never delay live ticker rendering on them.
  refreshMini(instruments,typeof getVisibleSymbols==='function'?getVisibleSymbols():[])
   .catch(error=>console.warn('[Vegas Market Data] mini refresh failed:',error));
 }finally{
  refreshing=false;
 }
}
function schedule(instruments,onUpdate,getVisibleSymbols){
 if(stopped||document.hidden||refreshTimer)return;
 refreshTimer=setTimeout(async()=>{
  refreshTimer=0;
  try{await refresh(instruments,onUpdate,getVisibleSymbols)}catch(error){console.warn('[Vegas Market Data] refresh failed:',error);}
  schedule(instruments,onUpdate,getVisibleSymbols);
 },REFRESH_MS);
}
function start(instruments,onUpdate,getVisibleSymbols){
 stopped=false;
 refresh(instruments,onUpdate,getVisibleSymbols).catch(error=>console.warn('[Vegas Market Data] initial refresh failed:',error)).finally(()=>schedule(instruments,onUpdate,getVisibleSymbols));
}
function onVisibility(){
 if(document.hidden){if(refreshTimer)clearTimeout(refreshTimer);refreshTimer=0;return;}
 refreshTimer=0;refresh(instrumentsRef,updateRef,visibleRef).catch(error=>console.warn('[Vegas Market Data] resume failed:',error)).finally(()=>schedule(instrumentsRef,updateRef,visibleRef));
}
let instrumentsRef=[],updateRef=null,visibleRef=null;
function mount(instruments,onUpdate,getVisibleSymbols){
 instrumentsRef=instruments;updateRef=onUpdate;visibleRef=getVisibleSymbols;
 document.addEventListener('visibilitychange',onVisibility,{passive:true});
 start(instruments,onUpdate,getVisibleSymbols);
 return destroy;
}
function destroy(){
 stopped=true;if(refreshTimer)clearTimeout(refreshTimer);refreshTimer=0;
 document.removeEventListener('visibilitychange',onVisibility);
}
window.VegasMarketData={mount,destroy,getStockMap,request};
})();