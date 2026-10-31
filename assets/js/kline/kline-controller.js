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
const REFRESH_MS=15000;

let queue=[];
let currentIndex=0;
let active=0;
let mode='hidden';
let autoPhase='hold';
let autoTimer=0;
let autoTimerCallback=null;
let autoTimerDueAt=0;
let gesturePaused=false;
let pausedAutoTimer=null;
let manualTimer=0;
let refreshTimer=0;
let autoDueAt=0;
let transitionTarget=-1;
let autoSnapshot=null;
let manualSymbol='';
let manualDeadline=0;
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
  layer.style.transition=transition?'opacity '+duration+'ms ease-in-out,filter '+duration+'ms ease-in-out':'none';
  layer.style.opacity=selected?'1':'0';
  layer.style.filter=selected?'brightness(1)':'brightness(.25)';
  layer.classList.toggle('is-active',selected);
  layer.style.pointerEvents=selected?'auto':'none';
 });
}
function showRoot(){
 ensureChart();
 root.hidden=false;
 requestAnimationFrame(()=>chart&&chart.resize());
}
function updateHeader(symbol,rows,historyComplete){
 title.textContent=symbol;
 if(rows&&rows.length){
  const target=data.warmupBars||4000;
  error.hidden=rows.length>=target;
  if(rows.length<target){
   error.textContent=historyComplete?
    'Bitget可获取历史仅'+rows.length+'根，未达到红峰预热目标'+target+'根':
    '红峰历史预热中：'+rows.length+'/'+target+'根';
  }
 }
}
function loadLayer(index,symbol){
 const timeframe='4H';
 if(!symbol)return Promise.resolve(false);
 const view=views[index];
 const requestId=(view.requestId||0)+1;
 view.requestId=requestId;
 return data.load(symbol,timeframe).then(first=>{
  if(view.requestId!==requestId)return false;
  chart.setData(index,first,symbol,timeframe);
  view.symbol=symbol;
  view.period=timeframe;
  view.hasData=true;
  view.dataAt=Date.now();
  if(index===active&&symbol===currentSymbol())updateHeader(symbol,first,first.length>=(data.warmupBars||4000));
  if(first.length<(data.warmupBars||4000)){
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
    view.symbol=symbol;
    view.period=timeframe;
    view.hasData=true;
    view.dataAt=Date.now();
    if(index===active&&symbol===currentSymbol())updateHeader(symbol,rows,true);
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
  view.symbol=symbol;
  view.period=timeframe;
  view.hasData=true;
  view.dataAt=Date.now();
  if(index===active&&symbol===currentSymbol())updateHeader(symbol,rows,true);
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
  if(mode==='transitioning'||mode==='manual-transition'||mode==='restoring'){
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
 const fresh=view.symbol===symbol&&view.period==='4H'&&view.hasData&&Date.now()-view.dataAt<15000;
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
   updateHeader(symbol,views[to].rows);
   mode=manualSymbol?'manual':'idle';
   applyDeferredRefresh();
   if(typeof onComplete==='function')onComplete(true);
   return;
  }
  chart.sync(from,to);
  layers.forEach(layer=>{layer.style.willChange='opacity,filter';});
  setLayerStyles(from,false,0);
  layers[to].style.opacity='0';
  layers[to].style.filter='brightness(.25)';
  layers[to].getBoundingClientRect();
  setLayerStyles(to,true,transitionDuration);
  active=to;
  updateHeader(symbol,views[to].rows);
  const finish=()=>{
   if(id!==generation)return;
   layers.forEach(layer=>{layer.style.transition='';layer.style.willChange='auto';});
   mode=manualSymbol?'manual':'idle';
   applyDeferredRefresh();
   if(typeof onComplete==='function')onComplete(true);
  };
  if(duration<=0){
   setLayerStyles(to,false,0);
   finish();
  }else{
   autoTimer=setTimeout(()=>{
    autoTimer=0;
    finish();
   },duration);
  }
 });
}
function scheduleAutoHold(delay){
 clearAutoTimer();
 if(document.hidden||manualSymbol||queue.length<2||mode==='hidden')return;
 autoPhase='hold';
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
 transitionTarget=nextIndex;
 autoPhase='transition';
 autoDueAt=Date.now()+Math.max(0,duration);
 const id=++generation;
 beginTransition(queue[nextIndex],duration,'transitioning',id,ok=>{
  if(id!==generation||manualSymbol)return;
  if(!ok){
   scheduleAutoHold(1000);
   return;
  }
  currentIndex=nextIndex;
  transitionTarget=-1;
  preloadNext();
  scheduleAutoHold(HOLD_MS);
 });
}
function preloadNext(){
 if(manualSymbol||queue.length<2||document.hidden)return;
 const index=(currentIndex+1)%queue.length;
 const view=views[1-active];
 if(view.symbol===queue[index]&&view.period==='4H'&&view.hasData&&Date.now()-view.dataAt<15000)return;
 loadLayer(1-active,queue[index]);
}
function captureAutoProgress(){
 if(manualSymbol)return autoSnapshot;
 if(mode==='auto-hold'){
  return{phase:'hold',remaining:Math.max(0,autoDueAt-Date.now()),index:currentIndex};
 }
 if(mode==='transitioning'){
  return{phase:'transition',remaining:autoTimer?Math.max(0,autoDueAt-Date.now()):TRANSITION_MS,index:currentIndex,target:transitionTarget};
 }
 if(mode==='revealing'){
  return{phase:'hold',remaining:INITIAL_HOLD_MS,index:currentIndex};
 }
 return{phase:'hold',remaining:HOLD_MS,index:currentIndex};
}
function restoreAuto(){
 clearManualTimer();
 manualSymbol='';
 if(!queue.length){
  hide();
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
  updateHeader(source,views[active].rows);
  if(saved.phase==='transition'&&queue.length>1){
   const targetIndex=(currentIndex+1)%queue.length;
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
 const symbol=String(value||'').trim().toUpperCase();
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
 title.textContent=symbol;
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
 layer.style.opacity='1';
 layer.style.filter='brightness(.25)';
 layer.getBoundingClientRect();
 layer.style.transition='filter '+REVEAL_MS+'ms ease-out';
 requestAnimationFrame(()=>{
  if(mode==='revealing'&&!document.hidden)layer.style.filter='brightness(1)';
 });
 clearAutoTimer();
 armAutoTimer(()=>{
  if(mode!=='revealing')return;
  layer.style.transition='';
  layer.style.filter='brightness(1)';
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
 const next=[...new Set((values||[]).map(x=>String(x||'').trim().toUpperCase()).filter(x=>/^[A-Z0-9.]+$/.test(x)))];
 if(next.length===queue.length&&next.every((symbol,index)=>symbol===queue[index]))return;
 const previous=currentAutoSymbol();
 queue=next;
 const retained=queue.indexOf(previous);
 currentIndex=retained>=0?retained:0;
 if(autoSnapshot)autoSnapshot.index=currentIndex;
 if(!queue.length&&!manualSymbol){hide();return;}
 if(manualSymbol){
  if(autoSnapshot&&autoSnapshot.phase==='transition')autoSnapshot.target=(currentIndex+1)%queue.length;
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
}
function resume(event){
 if(!event||event.type!=='vr-gesture-end'||!gesturePaused)return;
 gesturePaused=false;
 if(pausedAutoTimer){
  const pending=pausedAutoTimer;
  pausedAutoTimer=null;
  armAutoTimer(pending.callback,pending.remaining);
 }
}

function onVisibility(){
 if(document.hidden){
  if(mode==='auto-hold'||mode==='transitioning'){
   autoSnapshot=captureAutoProgress();
  }
  if(manualSymbol)manualDeadline=Date.now()+Math.max(0,manualDeadline-Date.now());
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
   mode='manual';
   const remaining=Math.max(0,manualDeadline-Date.now());
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