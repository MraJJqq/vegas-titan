/* V9 formal signal feed: single source is Vegas V9; this module only reads and distributes it. */
(function(){
  if(window.__VEGAS_V9_EVENTS_INIT__)return;
  window.__VEGAS_V9_EVENTS_INIT__=true;
  const STATE_URL="https://raw.githubusercontent.com/MraJJqq/vegas-titan/main/data/v9-signals.json";
  const CORE_ORDER=["BTC","HYPE","XAU","CL"];
  const STOCK_ORDER=["AAPL","MSFT","GOOGL","AMZN","NVDA","TSLA","META","INTC","QCOM","AMD","TSM","AVGO","ORCL","ARM","MU","ASML","SNDK","SKHYNIX","MRVL","GLW","HOOD","CBRS","SPCX"];
  const ALLOWED=new Set(CORE_ORDER.concat(STOCK_ORDER));
  const $=id=>document.getElementById(id);
  let refreshInProgress=false;
  let hasSuccessfulState=false;
  let pageQueueInitialized=false;
  let pageQueue=[];

  function symbolName(raw){
    let s=String(raw||"").trim().toUpperCase();
    if(s.endsWith("USDT"))s=s.slice(0,-4);
    if(s==="CLU")s="CL";
    return s;
  }
  function todayBeijing(){
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const p={};parts.forEach(x=>{p[x.type]=x.value});
    return p.year+"-"+p.month+"-"+p.day;
  }
  function shuffled(values){
    const result=values.slice();
    for(let i=result.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [result[i],result[j]]=[result[j],result[i]];
    }
    return result;
  }
  function initialPageQueue(values,date){
    const result=shuffled(values);
    if(result.length<2)return result;
    const key="vegas-titan:last-kline-first:"+date;
    try{
      const previous=window.localStorage.getItem(key);
      if(previous&&result[0]===previous){
        const swapIndex=1+Math.floor(Math.random()*(result.length-1));
        [result[0],result[swapIndex]]=[result[swapIndex],result[0]];
      }
      window.localStorage.setItem(key,result[0]);
    }catch(error){
      // Storage may be unavailable; keep the randomized queue without blocking signals.
    }
    return result;
  }
  function renderSymbols(targetId,symbols){
    const target=$(targetId);
    if(!target)return;
    const renderKey="symbols:"+symbols.join(",");
    if(target.dataset.v9RenderKey===renderKey)return;
    target.dataset.v9RenderKey=renderKey;
    target.replaceChildren();
    if(!symbols.length){
      const empty=document.createElement("span");
      empty.className="v9-nochange";
      empty.textContent="▰ No change ▰";
      target.appendChild(empty);
      return;
    }
    symbols.forEach(symbol=>{
      const item=document.createElement("span");
      item.className="v9-symbol";
      item.textContent="▰ "+symbol+" ▰";
      target.appendChild(item);
    });
  }
  function renderMessage(message){
    ["v9Stocks","v9Core"].forEach(id=>{
      const target=$(id);
      if(!target)return;
      const renderKey="message:"+message;
      if(target.dataset.v9RenderKey===renderKey)return;
      target.dataset.v9RenderKey=renderKey;
      target.replaceChildren();
      const item=document.createElement("span");
      item.className="v9-nochange";
      item.textContent=message;
      target.appendChild(item);
    });
  }
  async function fetchStateJson(){
    const controller=new AbortController();
    const timeout=window.setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch(STATE_URL+"?t="+Date.now(),{cache:"no-store",signal:controller.signal});
      if(!response.ok)throw new Error("V9信号源 HTTP "+response.status);
      return await response.json();
    }catch(error){
      if(error&&error.name==="AbortError")throw new Error("V9信号源请求超时（10秒）");
      throw error;
    }finally{
      window.clearTimeout(timeout);
    }
  }
  async function refreshV9State(){
    if(document.hidden||refreshInProgress)return;
    refreshInProgress=true;
    try{
      const state=await fetchStateJson();
      const daily=state&&state.__daily_formal_signals__;
      if(!daily||!Array.isArray(daily.signals))throw new Error("状态格式无效");
      hasSuccessfulState=true;
      if(daily.date!==todayBeijing()){
        window.VegasFormalSignalSymbols=[];
        if(typeof window.VegasApplyFormalSignals==="function")window.VegasApplyFormalSignals();
        renderMessage("等待今日扫描");
        return;
      }
      const seen=new Set();
      for(const signal of daily.signals){
        if(!signal||signal.formal_signal!==true)continue;
        const s=symbolName(signal.symbol);
        if(ALLOWED.has(s))seen.add(s);
      }
      if(!pageQueueInitialized){
        pageQueue=initialPageQueue(Array.from(seen),daily.date);
        pageQueueInitialized=true;
      }else{
        pageQueue=pageQueue.filter(symbol=>seen.has(symbol));
        const additions=Array.from(seen).filter(symbol=>!pageQueue.includes(symbol));
        pageQueue.push(...shuffled(additions));
      }
      window.VegasFormalSignalSymbols=pageQueue.slice();
      if(typeof window.VegasApplyFormalSignals==="function")window.VegasApplyFormalSignals();
      renderSymbols("v9Stocks",STOCK_ORDER.filter(s=>seen.has(s)));
      renderSymbols("v9Core",CORE_ORDER.filter(s=>seen.has(s)));
    }catch(error){
      const detail=String(error&&error.message||error).slice(0,70);
      if(!hasSuccessfulState)renderMessage("读取失败："+detail);
      console.warn("V9 formal signal feed refresh failed; retaining last valid state:",error);
    }finally{
      refreshInProgress=false;
    }
  }
  let refreshTimer=0;
  function scheduleRefresh(){
    if(document.hidden||refreshTimer)return;
    refreshTimer=window.setTimeout(()=>{
      refreshTimer=0;
      refreshV9State().finally(scheduleRefresh);
    },30*1000);
  }
  refreshV9State().finally(scheduleRefresh);
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden){
      if(refreshTimer)window.clearTimeout(refreshTimer);
      refreshTimer=0;
      return;
    }
    refreshV9State().finally(scheduleRefresh);
  },{passive:true});
})();
