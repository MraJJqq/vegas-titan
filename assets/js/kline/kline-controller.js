/* Layer 5 composition root. Single scheduler for automatic rotation and 10-second manual insertion. */
(function(){
'use strict';
if(window.__VEGAS_LAYER5_MOUNTED__)return;
const root=document.getElementById('vegas-right-scroll');
const LWC=window.LightweightCharts,data=window.VegasKlineData;
if(!root||!LWC||!data||!window.VegasKlineChart){
 console.error('[Vegas Layer 5] required foundation module missing');return;
}
window.__VEGAS_LAYER5_MOUNTED__=true;
const single=root.querySelector('.vr-single');
const title=root.querySelector('.vr-symbol');
const logo=root.querySelector('.vr-logo');
const logoFallback=root.querySelector('.vr-logo-fallback');
const error=root.querySelector('.vr-error');
const layers=[0,1].map(index=>{
 const layer=document.createElement('div');
 layer.className='vr-fade-layer'+(index===0?' is-active':'');
 layer.dataset.layer=String(index);
 single.prepend(layer);
 return layer;
});

const HOLD_MS=5000;
const TRANSITION_MS=5000;
const MANUAL_TOTAL_MS=10000;
const REVEAL_MS=1000;
const INITIAL_HOLD_MS=4000;
const REFRESH_MS=60000;

let queue=[];
let currentIndex=0;
let active=0;
let mode='hidden';
let autoTimer=0;
let autoTimerCallback=null;
let autoTimerDueAt=0;
let gesturePaused=false;
let pausedAutoTimer=null;
let manualTimer=0;
let refreshTimer=0;
let autoDueAt=0;
let autoSnapshot=null;
let manualSymbol='';
let manualDeadline=0;
let manualPausedRemaining=null;
let generation=0;
let initialShown=false;
let refreshPending=false;
let chart=null;
let views=[];

function ensureChart(){
 if(!chart){
  chart=window.VegasKlineChart.create(root,layers,LWC,()=>active);
  views=chart.views;
 }
 return chart;
}
function clearAutoTimer(){
 if(autoTimer){clearTimeout(autoTimer);autoTimer=0;}
 autoTimerCallback=null;
 autoTimerDueAt=0;
 pausedAutoTimer=null;
}
function armAutoTimer(callback,delay){
 clearAutoTimer();
 const wait=Math.max(0,delay);
 autoTimerCallback=callback;
 autoTimerDueAt=Date.now()+wait;
 autoTimer=setTimeout(()=>{
  autoTimer=0;
  autoTimerCallback=null;
  autoTimerDueAt=0;
  callback();
 },wait);
}
function clearManualTimer(){
 if(manualTimer){clearTimeout(manualTimer);manualTimer=0;}
}
function clearRefreshTimer(){
 if(refreshTimer){clearTimeout(refreshTimer);refreshTimer=0;}
}
function currentAutoSymbol(){
 return queue[currentIndex]||'';
}
function currentSymbol(){
 return manualSymbol||currentAutoSymbol();
}
function setLayerStyles(index,transition,duration){
 layers.forEach((layer,i)=>{
  const selected=i===index;
  layer.style.transition=transition?'opacity '+duration+'ms ease-in-out':'none';
  layer.style.opacity=selected?'1':'0';
  layer.classList.toggle('is-active',selected);
  layer.style.pointerEvents=selected?'auto':'none';
 });
}
function showRoot(){
 ensureChart();
 root.hidden=false;
 requestAnimationFrame(()=>chart&&chart.resize());
}
function logoUrlFor(symbol){return window.VegasIconRegistry?.get(symbol)||'';}
let headerRequest=0;
function canonicalSymbol(value){
 const raw=String(value||'').trim().toUpperCase();if(!raw)return '';
 const item=(window.VegasMarketUniverse||[]).find(entry=>String(entry.symbol||'').trim().toUpperCase()===raw||String(entry.contract||'').trim().toUpperCase()===raw);
 return item?String(item.symbol).trim().toUpperCase():raw;
}
function syncHeader(){
 const view=views[active],symbol=canonicalSymbol(view?.symbol);if(!view?.hasData||!symbol)return;
 const request=++headerRequest;title.textContent=symbol;
 const src=logoUrlFor(symbol);
 if(logo){
  logo.onerror=()=>{if(request!==headerRequest)return;logo.hidden=true;if(logoFallback){logoFallback.hidden=false;logoFallback.textContent=symbol.slice(0,1);}};
  if(src){logo.hidden=false;if(logo.getAttribute('src')!==src)logo.src=src;if(logoFallback)logoFallback.hidden=true;}
  else{logo.removeAttribute('src');logo.hidden=true;}
 }
 if(logoFallback&&!src){logoFallback.hidden=false;logoFallback.textContent=symbol.slice(0,1);}
 if(view.rows&&view.rows.length){const target=data.warmupBars||4000;error.hidden=view.rows.length>=target;if(view.rows.length<target)error.textContent=view.historyComplete?'Bitget可获取历史仅'+view.rows.length+'根，未达到红峰预热目标'+target+'根':'红峰历史预热中：'+view.rows.length+'/'+target+'根';}
}
function loadLayer(index,symbol,options={}){
 const timeframe='4H';
 if(!symbol)return Promise.resolve(false);
 const view=views[index];
 const requestId=(view.requestId||0)+1;
 view.requestId=requestId;
 return data.load(symbol,timeframe).then(first=>{
  if(view.requestId!==requestId)return false;
  chart.setData(index,first,symbol,timeframe);
  view.rows=first;
  view.symbol=canonicalSymbol(symbol);
  view.historyComplete=false;
  view.period=timeframe;
  view.hasData=true;
  view.dataAt=Date.now();
  if(index===active)syncHeader();
  if(options.completeHistory!==false&&first.length<(data.warmupBars||4000)){
   data.complete(symbol,timeframe,first).then(rows=>{
    if(view.requestId!==requestId)return;
    if(view.symbol!==symbol||view.period!==timeframe)return;
    if(mode==='transitioning'||mode==='manual-transition'||mode==='restoring'){
     view.pendingRows=rows;
     view.pendingSymbol=symbol;
     view.pendingPeriod=timeframe;
     return;
    }
    chart.setData(index,rows,symbol,timeframe);
    view.rows=rows;
    view.symbol=canonicalSymbol(symbol);
    view.historyComplete=true;
    view.period=timeframe;
    view.hasData=true;
    view.dataAt=Date.now();
    if(index===active)syncHeader();
   }).catch(exception=>{
    if(index===active&&symbol===currentSymbol()){
     error.textContent='历史数据补齐失败 · '+String(exception.message||exception).slice(0,42);
     error.hidden=false;
    }
   });
  }
  return true;
 }).catch(exception=>{
  if(view.requestId===requestId&&index===active&&symbol===currentSymbol()){
   error.textContent='行情暂不可用 · '+String(exception.message||exception).slice(0,42);
   error.hidden=false;
  }
  return false;
 });
}
function onKlineDataUpdated(event){
 const detail=event.detail||{};
 const symbol=canonicalSymbol(detail.symbol);
 if(detail.period!=='4H'||!Array.isArray(detail.rows)||!symbol)return;
 const index=views.findIndex(view=>canonicalSymbol(view.symbol)===symbol&&view.period==='4H'&&view.hasData);
 if(index<0)return;
 const view=views[index];
 if(mode==='transitioning'||mode==='manual-transition'||mode==='restoring'){
  view.pendingRows=detail.rows;view.pendingSymbol=symbol;view.pendingPeriod='4H';return;
 }
 chart.setData(index,detail.rows,symbol,'4H');
 view.rows=detail.rows;view.dataAt=Date.now();view.historyComplete=view.historyComplete||detail.rows.length>=(data.warmupBars||4000);
 if(index===active)syncHeader();
}
window.addEventListener('vegas-kline-data-updated',onKlineDataUpdated);
function applyDeferredRefresh(){
 if(mode==='transitioning'||mode==='manual-transition'||mode==='restoring')return;
 views.forEach((view,index)=>{
  if(!view.pendingRows)return;
  const rows=view.pendingRows;
  const symbol=view.pendingSymbol||view.symbol;
  const timeframe=view.pendingPeriod||view.period;
  view.pendingRows=null;
  view.pendingSymbol=null;
  view.pendingPeriod=null;
  chart.setData(index,rows,symbol,timeframe);
  view.rows=rows;
  view.symbol=canonicalSymbol(symbol);
  view.period=timeframe;
  view.hasData=true;
  view.dataAt=Date.now();
  if(index===active)syncHeader();
 });
 if(refreshPending){
  refreshPending=false;
  scheduleRefresh(0);
 }
}
function scheduleRefresh(delay){
 clearRefreshTimer();
 if(document.hidden||!currentSymbol()||mode==='hidden')return;
 refreshTimer=setTimeout(()=>{
  refreshTimer=0;
  if(gesturePaused||mode==='transitioning'||mode==='manual-transition'||mode==='restoring'){
   refreshPending=true;
   return;
  }
  const symbol=currentSymbol();
  loadLayer(active,symbol).then(()=>scheduleRefresh(REFRESH_MS));
 },delay===undefined?REFRESH_MS:delay);
}
function beginTransition(symbol,duration,kind,id,onComplete){
 const from=active;
 const to=1-from;
 mode=kind;
 const view=views[to];
 const fresh=view.symbol===symbol&&view.period==='4H'&&view.hasData&&view.historyComplete&&Date.now()-view.dataAt<15000;
 const ready=fresh?Promise.resolve(true):loadLayer(to,symbol);
 ready.then(loaded=>{
  if(id!==generation||document.hidden)return;
  if(!loaded||!views[to].hasData){
   mode=manualSymbol?'manual':'idle';
   if(typeof onComplete==='function')onComplete(false);
   return;
  }
  const transitionDuration=typeof duration==='function'?Math.max(0,duration()):duration;
  if(id!==generation||document.hidden)return;
  if(transitionDuration<=0){
   active=to;
   setLayerStyles(to,false,0);
   syncHeader();
   mode=manualSymbol?'manual':'idle';
   applyDeferredRefresh();
   if(typeof onComplete==='function')onComplete(true);
   return;
  }
  chart.sync(from,to);
  layers.forEach(layer=>{layer.style.willChange='opacity';});
  setLayerStyles(from,false,0);
  layers[to].style.opacity='0';
  layers[to].getBoundingClientRect();
  setLayerStyles(to,true,transitionDuration);
  active=to;
  syncHeader();
  const finish=()=>{
   if(id!==generation)return;
   layers.forEach(layer=>{layer.style.transition='';layer.style.willChange='auto';});
   mode=manualSymbol?'manual':'idle';
   applyDeferredRefresh();
   if(typeof onComplete==='function')onComplete(true);
  };
  if(transitionDuration<=0){
   setLayerStyles(to,false,0);
   finish();
  }else{
   armAutoTimer(finish,transitionDuration);
  }
 });
}
function scheduleAutoHold(delay){
 clearAutoTimer();
 if(document.hidden||manualSymbol||queue.length<2||mode==='hidden')return;
 autoDueAt=Date.now()+Math.max(0,delay);
 mode='auto-hold';
 armAutoTimer(()=>{
  if(manualSymbol||document.hidden)return;
  startAutoTransition(TRANSITION_MS);
 },Math.max(0,delay));
}
function startAutoTransition(duration){
 if(document.hidden||manualSymbol||queue.length<2)return;
 clearAutoTimer();
 const nextIndex=(currentIndex+1)%queue.length;
 autoDueAt=Date.now()+Math.max(0,duration);
 const id=++generation;
 beginTransition(queue[nextIndex],duration,'transitioning',id,ok=>{
  if(id!==generation||manualSymbol)return;
  if(!ok){
   scheduleAutoHold(1000);
   return;
  }
  currentIndex=nextIndex;
  preloadNext();
  scheduleAutoHold(HOLD_MS);
 });
}
function preloadNext(){
 if(manualSymbol||queue.length<2||document.hidden)return;
 const index=(currentIndex+1)%queue.length;
 const view=views[1-active];
 if(view.symbol===queue[index]&&view.period==='4H'&&view.hasData&&view.historyComplete&&Date.now()-view.dataAt<15000)return;
 loadLayer(1-active,queue[index],{completeHistory:false});
}
function captureAutoProgress(){
 if(manualSymbol)return autoSnapshot;
 if(mode==='auto-hold'){
  return{phase:'hold',remaining:Math.max(0,autoDueAt-Date.now()),index:currentIndex};
 }
 if(mode==='transitioning'){
  return{phase:'transition',remaining:autoTimer?Math.max(0,autoDueAt-Date.now()):TRANSITION_MS,index:currentIndex};
 }
 if(mode==='revealing'){
  return{phase:'hold',remaining:INITIAL_HOLD_MS,index:currentIndex};
 }
 return{phase:'hold',remaining:HOLD_MS,index:currentIndex};
}
function fadeOutAndHide(){
 const id=++generation;
 clearAutoTimer();
 clearManualTimer();
 clearRefreshTimer();
 mode='exiting';
 root.hidden=false;
 layers.forEach((layer,index)=>{
  layer.style.transition='none';
  layer.style.pointerEvents='none';
  layer.style.opacity=index===active?'1':'0';
 });
 layers[active].getBoundingClientRect();
 layers[active].style.transition='opacity '+TRANSITION_MS+'ms ease-in-out';
 layers[active].style.opacity='0';
 armAutoTimer(()=>{
  if(id!==generation||mode!=='exiting')return;
  hide();
 },TRANSITION_MS);
}
function restoreAuto(){
 clearManualTimer();
 manualSymbol='';
 if(!queue.length){
  fadeOutAndHide();
  return;
 }
 const saved=autoSnapshot||{phase:'hold',remaining:HOLD_MS,index:currentIndex};
 autoSnapshot=null;
 currentIndex=queue.length?Math.max(0,Math.min(saved.index,queue.length-1)):0;
 const source=currentAutoSymbol();
 const id=++generation;
 clearAutoTimer();
 mode='restoring';
 const sourceView=views[active];
 const restoreSource=sourceView.symbol===source&&sourceView.period==='4H'&&sourceView.hasData?
  Promise.resolve(true):loadLayer(active,source);
 restoreSource.then(ok=>{
  if(id!==generation||manualSymbol||document.hidden)return;
  if(!ok){
   mode='idle';
   scheduleAutoHold(1000);
   return;
  }
  setLayerStyles(active,false,0);
  syncHeader();
  if(saved.phase==='transition'&&queue.length>1){
   startAutoTransition(Math.max(0,saved.remaining));
  }else{
   mode='idle';
   preloadNext();
   scheduleAutoHold(Math.max(0,saved.remaining));
  }
  scheduleRefresh();
 });
}
function selectSymbol(value){
 const symbol=canonicalSymbol(value);
 if(!/^[A-Z0-9.]+$/.test(symbol))return false;
 const now=Date.now();
 if(!manualSymbol)autoSnapshot=captureAutoProgress();
 manualSymbol=symbol;
 manualDeadline=now+MANUAL_TOTAL_MS;
 clearAutoTimer();
 clearManualTimer();
 clearRefreshTimer();
 const id=++generation;
 mode='manual-loading';
 showRoot();
 
 error.hidden=true;
 const remaining=()=>Math.max(0,manualDeadline-Date.now());
 const start=()=>{
  if(id!==generation||manualSymbol!==symbol||document.hidden)return;
   if(remaining()<=0){restoreAuto();return;}
  beginTransition(symbol,()=>Math.min(TRANSITION_MS,remaining()),'manual-transition',id,()=>{
   if(id!==generation||manualSymbol!==symbol)return;
   mode='manual';
  });
 };
 const dominant=()=>{
  const opacity=layers.map(layer=>parseFloat(getComputedStyle(layer).opacity)||0);
  active=opacity[1]>opacity[0]?1:0;
  setLayerStyles(active,false,0);
 };
 dominant();
 start();
 manualTimer=setTimeout(()=>{
  manualTimer=0;
  if(id===generation&&manualSymbol===symbol)restoreAuto();
 },Math.max(0,remaining()));
 scheduleRefresh();
 return true;
}
function beginReveal(){
 const layer=layers[active];
 mode='revealing';
 layer.style.transition='none';
 layer.style.opacity='0';
  layer.getBoundingClientRect();
  layer.style.transition='opacity '+REVEAL_MS+'ms ease-out';
 requestAnimationFrame(()=>{
  if(mode==='revealing'&&!document.hidden)layer.style.opacity='1';
 });
 clearAutoTimer();
 armAutoTimer(()=>{
  if(mode!=='revealing')return;
  layer.style.transition='';
  initialShown=true;
  mode='idle';
  scheduleAutoHold(INITIAL_HOLD_MS);
 },REVEAL_MS);
}
function hide(){
 ++generation;
 clearAutoTimer();
 clearManualTimer();
 clearRefreshTimer();
 mode='hidden';
 manualSymbol='';
 autoSnapshot=null;
 root.hidden=true;
 views.forEach(view=>{
  view.requestId=(view.requestId||0)+1;
  view.hasData=false;
  view.symbol='';
 });
 if(chart){
  chart.capture(views[active]);
  chart.destroy();chart=null;views=[];
 }
}
function setQueue(values){
 const next=[...new Set((values||[]).map(canonicalSymbol).filter(x=>/^[A-Z0-9.]+$/.test(x)))];
 if(next.length===queue.length&&next.every((symbol,index)=>symbol===queue[index]))return;
 const previous=currentAutoSymbol();
 queue=next;
 const retained=queue.indexOf(previous);
 currentIndex=retained>=0?retained:0;
 if(autoSnapshot)autoSnapshot.index=currentIndex;
 if(!queue.length&&!manualSymbol){hide();return;}
 if(manualSymbol){
  return;
 }
 ++generation;
 clearAutoTimer();
 clearRefreshTimer();
 views.forEach(view=>{
  view.pendingRows=null;
  view.pendingSymbol=null;
  view.pendingPeriod=null;
 });
 setLayerStyles(active,false,0);
 if(!queue.length){hide();return;}
 showRoot();
 const symbol=currentAutoSymbol();
 loadLayer(active,symbol).then(ok=>{
  if(!ok||manualSymbol)return;
  if(!initialShown)beginReveal();
  else{
   mode='idle';
   preloadNext();
   scheduleAutoHold(HOLD_MS);
  }
  scheduleRefresh();
 });
}

let pausedTransitionStyles=null;
let pausedManualRemaining=null;
function pause(event){
 if(!event||event.type!=='vr-gesture-start'||gesturePaused||mode==='hidden')return;
 gesturePaused=true;
 if(autoTimer&&autoTimerCallback){
  pausedAutoTimer={callback:autoTimerCallback,remaining:Math.max(0,autoTimerDueAt-Date.now())};
  clearTimeout(autoTimer);
  autoTimer=0;
  autoTimerCallback=null;
  autoTimerDueAt=0;
 }
 if(mode==='transitioning'||mode==='manual-transition'){
  pausedTransitionStyles={
   remaining:pausedAutoTimer?pausedAutoTimer.remaining:Math.max(0,autoTimerDueAt-Date.now()),
   target:active
  };
  pausedTransitionStyles.styles=layers.map(layer=>{
   const style=getComputedStyle(layer);
   return{opacity:style.opacity};
  });
  layers.forEach((layer,index)=>{
   layer.style.transition='none';
   layer.style.opacity=pausedTransitionStyles.styles[index].opacity;
  });
 }
 if(manualTimer){
  pausedManualRemaining=Math.max(0,manualDeadline-Date.now());
  clearManualTimer();
 }
}
function resume(event){
 if(!event||event.type!=='vr-gesture-end'||!gesturePaused)return;
 gesturePaused=false;
 if(pausedTransitionStyles){
  const pending=pausedTransitionStyles;
  pausedTransitionStyles=null;
  const duration=pending.remaining;
  layers.forEach((layer,index)=>{
   layer.style.transition=duration>0?'opacity '+duration+'ms ease-in-out':'none';
   const selected=index===pending.target;
   layer.style.opacity=selected?'1':'0';
  });
 }
 if(pausedAutoTimer){
  const pending=pausedAutoTimer;
  pausedAutoTimer=null;
  armAutoTimer(pending.callback,pending.remaining);
 }
 if(pausedManualRemaining!==null){
  const remaining=pausedManualRemaining;
  pausedManualRemaining=null;
  manualDeadline=Date.now()+remaining;
  clearManualTimer();
  manualTimer=setTimeout(()=>{
   manualTimer=0;
   if(manualSymbol)restoreAuto();
  },remaining);
 }
 applyDeferredRefresh();
}

function onVisibility(){
 if(document.hidden){
  if(mode==='auto-hold'||mode==='transitioning'){
   autoSnapshot=captureAutoProgress();
  }
  if(manualSymbol){
   manualPausedRemaining=pausedManualRemaining!==null?pausedManualRemaining:Math.max(0,manualDeadline-Date.now());
   manualDeadline=0;
  }
  ++generation;
  gesturePaused=false;
  clearAutoTimer();
  clearManualTimer();
  clearRefreshTimer();
  views.forEach(view=>{view.requestId=(view.requestId||0)+1;});
  mode='hidden';
  return;
 }
 const symbol=currentSymbol();
 if(!symbol)return;
 showRoot();
 const id=++generation;
 loadLayer(active,symbol).then(ok=>{
  if(!ok||id!==generation)return;
  setLayerStyles(active,false,0);
  if(manualSymbol){
   const remaining=manualPausedRemaining!==null?manualPausedRemaining:Math.max(0,manualDeadline-Date.now());
   manualPausedRemaining=null;
   manualDeadline=Date.now()+remaining;
   mode='manual';
   manualTimer=setTimeout(()=>{manualTimer=0;if(id===generation&&manualSymbol)restoreAuto();},remaining);
  }else if(!initialShown){
   beginReveal();
  }else{
   const saved=autoSnapshot||{phase:'hold',remaining:HOLD_MS,index:currentIndex};
   autoSnapshot=null;
   if(saved.phase==='transition'&&queue.length>1)startAutoTransition(saved.remaining);
   else scheduleAutoHold(saved.remaining);
  }
  scheduleRefresh();
 });
}
root.addEventListener('vr-gesture-start',pause);
root.addEventListener('vr-gesture-end',resume);
document.addEventListener('visibilitychange',onVisibility,{passive:true});
window.VegasLayer5ShowSymbol=selectSymbol;
window.VegasLayer5SetAutoQueue=setQueue;
const pendingQueue=window.__VEGAS_PENDING_LAYER5_QUEUE;
if(Array.isArray(pendingQueue)){
 delete window.__VEGAS_PENDING_LAYER5_QUEUE;
 setQueue(pendingQueue);
}else{
 setQueue(window.VegasFormalSignalSymbols||[]);
}
if(window.__VEGAS_PENDING_LAYER5_SYMBOL){
 const pending=window.__VEGAS_PENDING_LAYER5_SYMBOL;
 delete window.__VEGAS_PENDING_LAYER5_SYMBOL;
 selectSymbol(pending);
}
})();