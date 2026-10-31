/* Layer 5 chart engine. Owns chart instances, gestures, resize and viewport memory. */
(function(){
'use strict';
const EMA=window.VegasKlineData.emas,PERIODS=window.VegasKlineData.periods;
const COLORS=['#f5d76e','#00B0FF','#00B0FF','#f4d35e','#f4d35e','#ff4e5e','#ff4e5e'];
const SECONDS={'1H':3600,'4H':14400,'1D':86400},KEY='vegas-layer5-viewport-v3';
function create(root,layers,LWC,getActive){
 let viewport={barSpacing:5,rightOffset:3,visibleBars:null,rightEdgeOffset:-3,period:'4H'};
 try{
  const saved=JSON.parse(localStorage.getItem(KEY)||'null');
  if(saved&&typeof saved==='object'){
   if(Number.isFinite(saved.barSpacing))viewport.barSpacing=Math.max(.5,Math.min(30,saved.barSpacing));
   if(Number.isFinite(saved.rightOffset))viewport.rightOffset=Math.max(-50,Math.min(100,saved.rightOffset));
   if(Number.isFinite(saved.visibleBars)&&saved.visibleBars>0)viewport.visibleBars=Math.max(1,Math.min(5000,saved.visibleBars));
   if(Number.isFinite(saved.rightEdgeOffset))viewport.rightEdgeOffset=Math.max(-5000,Math.min(50000,saved.rightEdgeOffset));
   if(PERIODS.includes(saved.period))viewport.period=saved.period;
  }
 }catch{}
 let saveTimer=0,resizeFrame=0;
 function save(){try{localStorage.setItem(KEY,JSON.stringify(viewport))}catch{}}
 function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{saveTimer=0;save()},180);}
 const views=layers.map(layer=>{
  const host=document.createElement('div');host.className='vr-chart';layer.append(host);
  const gesture=document.createElement('div');gesture.className='vr-gesture-layer';gesture.setAttribute('aria-label','K线视窗手势控制');layer.append(gesture);
  const chart=LWC.createChart(host,{
   autoSize:false,attributionLogo:false,
   layout:{background:{type:LWC.ColorType.Solid,color:'rgba(0,0,0,0)'},textColor:'rgba(210,232,255,.72)',fontSize:11},
   grid:{vertLines:{visible:false},horzLines:{visible:false}},
   rightPriceScale:{visible:false,borderVisible:false,mode:LWC.PriceScaleMode.Logarithmic,autoScale:true,scaleMargins:{top:.10,bottom:.10}},
   leftPriceScale:{visible:false,borderVisible:false},
   timeScale:{visible:false,borderVisible:false,rightOffset:3,barSpacing:5,minBarSpacing:.5,shiftVisibleRangeOnNewBar:false},
   crosshair:{vertLine:{visible:false},horzLine:{visible:false}},
   handleScroll:{mouseWheel:false,pressedMouseMove:false,horzTouchDrag:false,vertTouchDrag:false},
   handleScale:{mouseWheel:false,pinch:false,axisPressedMouseMove:false}
  });
  const candle=chart.addSeries(LWC.CandlestickSeries,{
   upColor:'rgba(0,0,0,0)',downColor:'#ff5c7c',borderUpColor:'#2ee6a6',borderDownColor:'#ff5c7c',
   wickUpColor:'#2ee6a6',wickDownColor:'#ff5c7c',lastValueVisible:false,priceLineVisible:false
  });
  const lines=EMA.map((length,index)=>chart.addSeries(LWC.LineSeries,{color:COLORS[index],lineWidth:index?2:1,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false}));
  return{layer,host,gesture,chart,candle,lines,rows:[],symbol:'',period:'4H',applying:false,applyId:0,gesturing:false,expectedRange:null,expectedTimer:0};
 });
 function activeView(){return views[getActive()];}
 function capture(view,syncPeers=false){
  if(!view?.rows.length)return;
  const scale=view.chart.timeScale(),range=scale.getVisibleLogicalRange();
  if(!range||!Number.isFinite(range.from)||!Number.isFinite(range.to)||range.to<=range.from)return;
  const options=scale.options();
  viewport.visibleBars=Math.max(1,range.to-range.from);
  viewport.barSpacing=Number.isFinite(options.barSpacing)?options.barSpacing:viewport.barSpacing;
  viewport.rightOffset=Number.isFinite(options.rightOffset)?options.rightOffset:viewport.rightOffset;
  viewport.rightEdgeOffset=view.rows.length-1-range.to;
  viewport.period=view.period;scheduleSave();
  // A viewport adjustment is global: mirror it immediately to every loaded symbol view.
  if(syncPeers){
   views.forEach(peer=>{
    if(peer!==view&&peer.rows.length)apply(peer,peer.rows,peer.period,false);
   });
  }
 }
 function apply(view,rows,period,commit=true){
  if(!rows?.length)return;
  const ratio=(SECONDS[viewport.period]||14400)/(SECONDS[period]||14400);
  const width=Math.max(1,view.host.clientWidth||innerWidth||1);
  const visible=viewport.visibleBars===null?Math.max(30,Math.floor(width/viewport.barSpacing)):Math.max(1,viewport.visibleBars*ratio);
  const edge=viewport.rightEdgeOffset*ratio,scale=view.chart.timeScale(),to=rows.length-1-edge;
  scale.applyOptions({barSpacing:viewport.barSpacing,rightOffset:viewport.rightOffset});
  view.applyId++;view.applying=true;
  if(view.expectedTimer)clearTimeout(view.expectedTimer);
  view.expectedRange={from:to-visible,to};
  try{scale.setVisibleLogicalRange(view.expectedRange);}catch(error){console.warn('[Vegas Kline] viewport apply failed',error);view.expectedRange=null;view.applying=false;}
  // Chart range notifications may arrive after the next animation frame.
  // Keep a bounded suppression window and also match the exact target range.
  view.expectedTimer=setTimeout(()=>{
   view.expectedTimer=0;view.expectedRange=null;view.applying=false;
  },350);
  if(commit){viewport.visibleBars=visible;viewport.rightEdgeOffset=edge;viewport.period=period;scheduleSave();}
 }
 views.forEach((view,index)=>view.chart.timeScale().subscribeVisibleLogicalRangeChange(()=>{
  if(index!==getActive()||view.gesturing)return;
  const actual=view.chart.timeScale().getVisibleLogicalRange(),expected=view.expectedRange;
  if(expected){
   if(actual&&Math.abs(actual.from-expected.from)<.75&&Math.abs(actual.to-expected.to)<.75){
    if(view.expectedTimer)clearTimeout(view.expectedTimer);
    view.expectedTimer=0;view.expectedRange=null;view.applying=false;
   }
   return;
  }
  if(!view.applying)capture(view,true);
 }));
 function setData(index,rows,symbol,period,preserve=false){
  const view=views[index];if(!view)return;
  // Always capture the active chart before replacing its data, including symbol/period changes.
  // The single shared viewport is then reapplied to every symbol and timeframe.
  if(index===getActive()&&view.rows.length)capture(view);
  view.candle.setData(rows);
  view.lines.forEach((series,i)=>series.setData(window.VegasKlineData.ema(rows,EMA[i])));
  view.rows=rows;view.symbol=symbol;view.period=period;
  view.chart.applyOptions({rightPriceScale:{autoScale:true,scaleMargins:{top:.10,bottom:.10}}});
  apply(view,rows,period,index===getActive());
 }
 function sync(from,to){
  capture(views[from]);
  if(views[to].rows.length)apply(views[to],views[to].rows,views[to].period,true);
 }
 function resize(){
  if(root.hidden)return;
  const w=Math.max(1,root.clientWidth||innerWidth||1),h=Math.max(1,root.clientHeight||innerHeight||1);
  views.forEach(view=>{try{view.chart.resize(w,h)}catch(error){console.warn('[Vegas Kline] resize failed',error);}});
 }
 function scheduleResize(){
  if(root.hidden||resizeFrame)return;
  resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;resize();});
 }
 const resizeObserver='ResizeObserver'in window?new ResizeObserver(scheduleResize):null;
 resizeObserver?.observe(root);window.addEventListener('resize',scheduleResize,{passive:true});
 const pointers=new Map();let gesture=null;
 function range(view){const r=view.chart.timeScale().getVisibleLogicalRange();return r&&r.to>r.from?{from:r.from,to:r.to,width:r.to-r.from}:null;}
 let viewportCommitFrame=0;
 function commitViewport(view){
  if(viewportCommitFrame)cancelAnimationFrame(viewportCommitFrame);
  viewportCommitFrame=requestAnimationFrame(()=>{viewportCommitFrame=0;if(view===activeView())capture(view,true);});
 }
 function applyRange(view,from,to){if(to>from)try{view.chart.timeScale().setVisibleLogicalRange({from,to})}catch{}}
 function down(event){
  const view=views[getActive()];if(!view.rows.length)return;
  event.preventDefault();try{event.currentTarget.setPointerCapture(event.pointerId)}catch{}
  if(view.expectedTimer)clearTimeout(view.expectedTimer);
  view.expectedTimer=0;view.expectedRange=null;view.applying=false;
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});view.gesturing=true;
  const r=range(view);if(!r)return;
  if(pointers.size===1)gesture={type:'drag',view,range:r,startX:event.clientX,spacing:Math.max(.5,view.chart.timeScale().options().barSpacing||5)};
  else if(pointers.size===2){const p=[...pointers.values()];gesture={type:'pinch',view,range:r,distance:Math.max(1,Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)),center:(p[0].x+p[1].x)/2};}
 }
 function move(event){
  if(!pointers.has(event.pointerId)||!gesture)return;
  event.preventDefault();pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  const view=gesture.view;
  if(pointers.size>=2&&gesture.type==='pinch'){
   const p=[...pointers.values()].slice(0,2),distance=Math.max(1,Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)),center=(p[0].x+p[1].x)/2;
   const width=Math.max(2,Math.min(5000,gesture.range.width*gesture.distance/distance)),rect=view.gesture.getBoundingClientRect();
   const shift=(gesture.center-center)/Math.max(1,rect.width)*gesture.range.width,mid=(gesture.range.from+gesture.range.to)/2+shift;
   applyRange(view,mid-width/2,mid+width/2);
  }else if(gesture.type==='drag'){
   const dx=event.clientX-gesture.startX,shift=-dx/gesture.spacing;
   applyRange(view,gesture.range.from+shift,gesture.range.to+shift);
  }
 }
 function up(event){
  if(!pointers.has(event.pointerId))return;
  const view=gesture?.view||activeView();pointers.delete(event.pointerId);
  if(pointers.size===1){const [id,p]=[...pointers.entries()][0],r=range(view);if(r)gesture={type:'drag',view,range:r,startX:p.x,spacing:Math.max(.5,view.chart.timeScale().options().barSpacing||5)};}
  else{gesture=null;view.gesturing=false;commitViewport(view);}
 }
 views.forEach(view=>{
  view.gesture.addEventListener('pointerdown',down,{passive:false});
  view.gesture.addEventListener('pointermove',move,{passive:false});
  view.gesture.addEventListener('pointerup',up,{passive:true});
  view.gesture.addEventListener('pointercancel',up,{passive:true});
  view.gesture.addEventListener('wheel',event=>{
   const r=range(view);if(!r)return;event.preventDefault();
   const width=Math.max(2,Math.min(5000,r.width*(event.deltaY>0?1.12:.89)));
   applyRange(view,r.to-width,r.to);commitViewport(view);
  },{passive:false});
 });
 function onPageHide(){capture(activeView());save();}
 window.addEventListener('pagehide',onPageHide,{passive:true});
 return{views,setData,sync,capture,resize:scheduleResize,destroy(){
  save();clearTimeout(saveTimer);if(resizeFrame)cancelAnimationFrame(resizeFrame);if(viewportCommitFrame)cancelAnimationFrame(viewportCommitFrame);
  resizeObserver?.disconnect();window.removeEventListener('resize',scheduleResize);window.removeEventListener('pagehide',onPageHide);
  views.forEach(view=>{if(view.expectedTimer)clearTimeout(view.expectedTimer);view.chart.remove();view.gesture.remove();view.host.remove();});
 }};
}
window.VegasKlineChart={create};
})();