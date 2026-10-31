/* Layer 5 viewport engine. One canonical viewport, RAF-coalesced gestures, no chart-range feedback loop. */
(function(){
'use strict';
const EMA=window.VegasKlineData.emas;
const COLORS=['#f5d76e','#00B0FF','#00B0FF','#f4d35e','#f4d35e','#ff4e5e','#ff4e5e'];
const STORAGE_KEY='vegas-layer5-viewport-v4';
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function create(root,layers,LWC,getActive){
 const viewport={visibleBars:90,rightGap:3};
 try{
  const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
  if(saved&&Number.isFinite(saved.visibleBars))viewport.visibleBars=clamp(saved.visibleBars,2,5000);
  if(saved&&Number.isFinite(saved.rightGap))viewport.rightGap=clamp(saved.rightGap,-5000,50000);
 }catch{}
 let saveTimer=0,resizeFrame=0,gestureFrame=0,wheelEndTimer=0;
 let activeGesture=null,wheelGesture=false,destroyed=false;
 const views=layers.map(layer=>{
  const host=document.createElement('div');host.className='vr-chart';layer.append(host);
  const gesture=document.createElement('div');gesture.className='vr-gesture-layer';gesture.setAttribute('aria-label','K线视窗手势控制');layer.append(gesture);
  const chart=LWC.createChart(host,{
   autoSize:false,attributionLogo:false,
   layout:{background:{type:LWC.ColorType.Solid,color:'rgba(0,0,0,0)'},textColor:'rgba(210,232,255,.72)',fontSize:11},
   grid:{vertLines:{visible:false},horzLines:{visible:false}},
   rightPriceScale:{visible:false,borderVisible:false,mode:LWC.PriceScaleMode.Logarithmic,autoScale:true,scaleMargins:{top:.10,bottom:.10}},
   leftPriceScale:{visible:false,borderVisible:false},
   timeScale:{visible:false,borderVisible:false,rightOffset:0,barSpacing:5,minBarSpacing:.5,shiftVisibleRangeOnNewBar:false},
   crosshair:{vertLine:{visible:false},horzLine:{visible:false}},
   handleScroll:{mouseWheel:false,pressedMouseMove:false,horzTouchDrag:false,vertTouchDrag:false},
   handleScale:{mouseWheel:false,pinch:false,axisPressedMouseMove:false}
  });
  const candle=chart.addSeries(LWC.CandlestickSeries,{
   upColor:'rgba(0,0,0,0)',downColor:'#ff5c7c',borderUpColor:'#2ee6a6',borderDownColor:'#ff5c7c',
   wickUpColor:'#2ee6a6',wickDownColor:'#ff5c7c',lastValueVisible:false,priceLineVisible:false
  });
  const lines=EMA.map((length,index)=>chart.addSeries(LWC.LineSeries,{color:COLORS[index],lineWidth:index?2:1,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false}));
  return{layer,host,gesture,chart,candle,lines,rows:[],symbol:'',period:'4H'};
 });
 const activeView=()=>views[getActive()];
 function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(viewport));}catch{}}
 function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{saveTimer=0;save();},120);}
 function targetRange(rows){
  const to=rows.length-1-viewport.rightGap;
  return{from:to-viewport.visibleBars,to};
 }
 function apply(view){
  if(!view||!view.rows.length)return;
  const range=targetRange(view.rows);
  try{view.chart.timeScale().setVisibleLogicalRange(range);}catch(error){console.warn('[Vegas Kline] apply viewport failed',error);}
 }
 function applyPeers(except){
  views.forEach(view=>{if(view!==except&&view.rows.length)apply(view);});
 }
 function read(view){
  const r=view?.chart.timeScale().getVisibleLogicalRange();
  if(!r||!Number.isFinite(r.from)||!Number.isFinite(r.to)||r.to<=r.from)return false;
  viewport.visibleBars=clamp(r.to-r.from,2,5000);
  viewport.rightGap=clamp(view.rows.length-1-r.to,-5000,50000);
  return true;
 }
 function commit(view){
  if(!view||view!==activeView()||!read(view))return;
  save();applyPeers(view);
 }
 function setData(index,rows,symbol,period){
  const view=views[index];if(!view||!Array.isArray(rows)||!rows.length)return;
  view.candle.setData(rows);
  view.lines.forEach((series,i)=>series.setData(window.VegasKlineData.ema(rows,EMA[i])));
  view.rows=rows;view.symbol=symbol;view.period='4H';
  view.chart.applyOptions({rightPriceScale:{autoScale:true,scaleMargins:{top:.10,bottom:.10}}});
  apply(view);
 }
 function sync(from,to){
  const source=views[from],target=views[to];
  if(!source||!target)return;
  if(source===activeView())read(source);
  if(target.rows.length)apply(target);
 }
 function capture(view){if(read(view)){save();applyPeers(view);}}
 function resize(){
  if(destroyed||root.hidden)return;
  const width=Math.max(1,root.clientWidth||innerWidth||1),height=Math.max(1,root.clientHeight||innerHeight||1);
  views.forEach(view=>{try{view.chart.resize(width,height);}catch(error){console.warn('[Vegas Kline] resize failed',error);}});
  // A layout resize must never become a user zoom. Reapply the canonical viewport.
  views.forEach(apply);
 }
 function scheduleResize(){
  if(root.hidden||resizeFrame||destroyed)return;
  resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;resize();});
 }
 const resizeObserver='ResizeObserver'in window?new ResizeObserver(scheduleResize):null;
 resizeObserver?.observe(root);window.addEventListener('resize',scheduleResize,{passive:true});

 const pointers=new Map(),pendingPoints=new Map();
 function emit(type,kind){root.dispatchEvent(new CustomEvent(type,{detail:{kind}}));}
 function begin(kind,view){
  if(!activeGesture){activeGesture={kind,view};emit('vr-gesture-start',kind);}
 }
 function end(kind){
  if(!activeGesture&&!wheelGesture)return;
  const view=activeGesture?.view||activeView();
  activeGesture=null;wheelGesture=false;
  if(gestureFrame){cancelAnimationFrame(gestureFrame);gestureFrame=0;}
  pendingPoints.clear();
  commit(view);
  emit('vr-gesture-end',kind);
 }
 function currentRange(view){const r=view.chart.timeScale().getVisibleLogicalRange();return r&&r.to>r.from?{from:r.from,to:r.to,width:r.to-r.from}:null;}
 function applyRange(view,from,to){
  if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from)return;
  try{view.chart.timeScale().setVisibleLogicalRange({from,to});}catch{}
 }
 function point(event){return{x:event.clientX,y:event.clientY};}
 function onPointerDown(event){
  const view=views[getActive()];if(!view?.rows.length)return;
  if(event.pointerType==='mouse'&&event.button!==0)return;
  event.preventDefault();
  try{event.currentTarget.setPointerCapture(event.pointerId);}catch{}
  pointers.set(event.pointerId,point(event));pendingPoints.set(event.pointerId,point(event));
  begin('pointer',view);
  const r=currentRange(view);if(!r)return;
  const rect=view.gesture.getBoundingClientRect();
  if(pointers.size===1)activeGesture={kind:'drag',view,base:r,startX:event.clientX,pixelsPerBar:rect.width/Math.max(1,r.width)};
  else if(pointers.size===2){
   const p=[...pointers.values()];
   activeGesture={kind:'pinch',view,base:r,startDistance:Math.max(1,Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)),startCenter:(p[0].x+p[1].x)/2};
  }
 }
 function scheduleGestureFrame(){
  if(gestureFrame)return;
  gestureFrame=requestAnimationFrame(()=>{
   gestureFrame=0;
   const g=activeGesture;if(!g)return;
   pendingPoints.forEach((p,id)=>pointers.set(id,p));pendingPoints.clear();
   if(g.kind==='drag'&&pointers.size===1){
    const p=[...pointers.values()][0],shift=(g.startX-p.x)/Math.max(.01,g.pixelsPerBar);
    applyRange(g.view,g.base.from+shift,g.base.to+shift);
   }else if(g.kind==='pinch'&&pointers.size>=2){
    const p=[...pointers.values()].slice(0,2),distance=Math.max(1,Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y));
    const center=(p[0].x+p[1].x)/2,rect=g.view.gesture.getBoundingClientRect();
    const width=clamp(g.base.width*g.startDistance/distance,2,5000);
    const shift=(g.startCenter-center)/Math.max(1,rect.width)*g.base.width;
    const mid=(g.base.from+g.base.to)/2+shift;
    applyRange(g.view,mid-width/2,mid+width/2);
   }
  });
 }
 function onPointerMove(event){
  if(!pointers.has(event.pointerId)||!activeGesture)return;
  event.preventDefault();pendingPoints.set(event.pointerId,point(event));scheduleGestureFrame();
 }
 function onPointerEnd(event){
  if(!pointers.has(event.pointerId))return;
  pointers.delete(event.pointerId);pendingPoints.delete(event.pointerId);
  if(pointers.size===1){
   const view=activeGesture?.view||activeView(),p=[...pointers.values()][0],r=currentRange(view),rect=view.gesture.getBoundingClientRect();
   if(r)activeGesture={kind:'drag',view,base:r,startX:p.x,pixelsPerBar:rect.width/Math.max(1,r.width)};
  }else if(!pointers.size)end('pointer');
 }
 function onPointerCancel(){pointers.clear();pendingPoints.clear();end('pointer-cancel');}
 function onWheel(event){
  const view=views[getActive()];if(!view?.rows.length)return;
  const r=currentRange(view);if(!r)return;
  event.preventDefault();
  if(!wheelGesture){wheelGesture=true;begin('wheel',view);}
  const rect=view.gesture.getBoundingClientRect(),anchor=clamp((event.clientX-rect.left)/Math.max(1,rect.width),0,1);
  const factor=event.deltaY>0?1.10:.91,width=clamp(r.width*factor,2,5000);
  const logicalAnchor=r.from+anchor*r.width,anchorRatio=anchor;
  const from=logicalAnchor-anchorRatio*width;
  applyRange(view,from,from+width);
  clearTimeout(wheelEndTimer);
  wheelEndTimer=setTimeout(()=>{wheelEndTimer=0;end('wheel');},160);
 }
 views.forEach(view=>{
  view.gesture.addEventListener('pointerdown',onPointerDown,{passive:false});
  view.gesture.addEventListener('pointermove',onPointerMove,{passive:false});
  view.gesture.addEventListener('pointerup',onPointerEnd,{passive:true});
  view.gesture.addEventListener('pointercancel',onPointerCancel,{passive:true});
  view.gesture.addEventListener('lostpointercapture',onPointerEnd,{passive:true});
  view.gesture.addEventListener('wheel',onWheel,{passive:false});
 });
 function onPageHide(){pointers.clear();pendingPoints.clear();end('pagehide');capture(activeView());save();}
 function onBlur(){if(pointers.size)onPointerCancel();}
 function onVisibility(){if(document.hidden){pointers.clear();pendingPoints.clear();end('visibility');capture(activeView());save();}}
 window.addEventListener('pagehide',onPageHide,{passive:true});
 window.addEventListener('blur',onBlur,{passive:true});
 document.addEventListener('visibilitychange',onVisibility,{passive:true});
 return{views,setData,sync,capture,resize:scheduleResize,destroy(){
  if(destroyed)return;destroyed=true;
  clearTimeout(saveTimer);clearTimeout(wheelEndTimer);
  if(resizeFrame)cancelAnimationFrame(resizeFrame);
  if(gestureFrame)cancelAnimationFrame(gestureFrame);
  pointers.clear();pendingPoints.clear();activeGesture=null;
  save();resizeObserver?.disconnect();window.removeEventListener('resize',scheduleResize);
  window.removeEventListener('pagehide',onPageHide);window.removeEventListener('blur',onBlur);
  document.removeEventListener('visibilitychange',onVisibility);
  views.forEach(view=>{view.chart.remove();view.gesture.remove();view.host.remove();});
 }};
}
window.VegasKlineChart={create};
})();