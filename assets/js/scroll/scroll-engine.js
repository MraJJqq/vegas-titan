/* Layer 3 scroll engine. Resilient single-owner scheduler and loop normalization. */
(function(){
'use strict';
function mount(root,slots){
 if(!root||!slots?.length)throw Error('Scroll engine requires root and card slots');
 const ordered=slots.slice();
 const state={mode:'auto',raf:0,timer:0,lastTime:0,autoDelayUntil:performance.now()+250,
  wheelTarget:root.scrollTop,wheelSpeed:0,touchPending:false,touching:false,dragging:false,
  touchY:0,touchTime:0,touchSpeed:0,handoffStartSpeed:0,handoffStartTime:0,handoffDuration:700,lastScroll:root.scrollTop,looping:false};
 let gap=0,slotHeight=0,stride=0,totalHeight=0,geometryDirty=true,autoFraction=0,lastFocusRange='';
 let alive=true,lastErrorAt=0;
 const styleCache=new WeakMap();
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 function measure(){
  if(!geometryDirty)return;
  gap=parseFloat(getComputedStyle(root).rowGap)||0;
  slotHeight=ordered[0]?ordered[0].offsetHeight:0;
  stride=slotHeight+gap;
  totalHeight=ordered.length*slotHeight+gap*Math.max(0,ordered.length-1);
  geometryDirty=false;
 }
 function normalize(direction){
  if(state.looping||ordered.length<2)return;
  measure();state.looping=true;
  try{
   let top=root.scrollTop,guard=0,shift=0;
   if(direction>0){
    while(guard++<ordered.length&&ordered[0]&&top>=ordered[0].offsetHeight+gap){
     const first=ordered.shift(),distance=stride;
     root.appendChild(first);ordered.push(first);top-=distance;shift-=distance;
    }
   }else{
    while(guard++<ordered.length&&top<=0&&ordered[ordered.length-1]){
     const last=ordered.pop(),distance=stride;
     root.insertBefore(last,root.firstElementChild);ordered.unshift(last);top+=distance;shift+=distance;
    }
   }
   if(shift){
    root.scrollTop=top;state.lastScroll=root.scrollTop;lastFocusRange='';
    if(state.mode==='wheel')state.wheelTarget+=shift;
   }
  }finally{state.looping=false;}
 }
 function setStyle(node,scale,opacity){
  const old=styleCache.get(node)||{};
  if(old.scale!==scale){node.style.setProperty('--mc-focus-scale',scale);old.scale=scale;}
  if(old.opacity!==opacity){node.style.setProperty('--mc-page-opacity',opacity);old.opacity=opacity;}
  styleCache.set(node,old);
 }
 function focus(){
  measure();
  const height=root.clientHeight;if(!height||!stride)return;
  const top=root.scrollTop,first=clamp(Math.floor(top/Math.max(1,stride))-2,0,ordered.length-1);
  const last=clamp(Math.ceil((top+height)/Math.max(1,stride))+2,0,ordered.length);
  const center=top+height/2,range=Math.max(1,height*.58),fadeRange=Math.max(1,height*.5);
  const key=first+':'+last+':'+Math.round(top/2);
  if(key===lastFocusRange)return;
  lastFocusRange=key;
  for(let i=first;i<last;i++){
   const node=ordered[i],boxTop=i*stride,boxHeight=slotHeight;
   const visible=Math.max(0,Math.min(boxTop+boxHeight,top+height)-Math.max(boxTop,top));
   const ratio=Math.min(1,visible/Math.max(1,boxHeight)),distance=Math.abs(boxTop+boxHeight/2-center);
   const t=clamp(distance/range,0,1),e=t*t*(3-2*t),ft=clamp(distance/fadeRange,0,1),fe=ft*ft*(3-2*ft);
   const scale=(1-.12*e).toFixed(3);
   const opacity=Math.max(.06,(1-.68*fe)*Math.min(1,ratio*1.8)).toFixed(3);
   setStyle(node,scale,opacity);
  }
 }
 function requestFrame(){
  if(!alive||state.raf||document.hidden||state.mode==='touch')return;
  if(state.timer){if(state.mode==='auto')return;clearTimeout(state.timer);state.timer=0;}
  const schedule=()=>{state.timer=0;if(!alive||document.hidden||state.mode==='touch')return;try{state.raf=requestAnimationFrame(frame);}catch(error){recover(error);}};
  if(state.mode==='auto')state.timer=setTimeout(schedule,33);
  else schedule();
 }
 function cancelFrame(){if(state.timer){clearTimeout(state.timer);state.timer=0;}if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;state.lastTime=0;}
 function move(delta,direction){
  if(!Number.isFinite(delta)||Math.abs(delta)<.01)return;
  root.scrollTop+=delta;
  normalize(direction||Math.sign(delta));
  state.lastScroll=root.scrollTop;
 }
 function recover(error){
  const now=performance.now();
  state.raf=0;state.mode='auto';state.touching=false;state.dragging=false;
  state.looping=false;state.touchSpeed=state.wheelSpeed=0;
  state.wheelTarget=root.scrollTop;state.lastScroll=root.scrollTop;
  state.lastTime=0;state.autoDelayUntil=now+500;geometryDirty=true;lastFocusRange='';
  if(now-lastErrorAt>3000){console.error('[Vegas Layer 3] scroll frame recovered',error);lastErrorAt=now;}
 }
 function frame(now){
  state.raf=0;
  if(!alive||document.hidden)return;
  try{
   const dt=state.lastTime?clamp(now-state.lastTime,0,40):16.67;state.lastTime=now;
   if(state.mode==='wheel'){
    const diff=state.wheelTarget-root.scrollTop;
    move(diff*(1-Math.exp(-dt/32)),Math.sign(diff));
    state.wheelSpeed*=Math.exp(-dt/190);
    if(Math.abs(state.wheelSpeed)>.008)state.wheelTarget+=state.wheelSpeed*dt;
    if(Math.abs(state.wheelSpeed)<.025&&Math.abs(state.wheelTarget-root.scrollTop)<.6){
     state.mode='auto';state.wheelSpeed=0;state.autoDelayUntil=now+100;
    }
   }else if(state.mode==='handoff'){
    measure();
    const targetSpeed=totalHeight>0?totalHeight/120/1000:0;
    const progress=clamp((now-state.handoffStartTime)/state.handoffDuration,0,1);
    const eased=progress*progress*(3-2*progress);
    const speed=state.handoffStartSpeed+(targetSpeed-state.handoffStartSpeed)*eased;
    move(speed*dt,Math.sign(speed));
    if(progress>=1){state.mode='auto';state.touchSpeed=0;}
   }else if(state.mode==='auto'&&!state.touching&&now>=state.autoDelayUntil){
    measure();
    if(totalHeight>0&&ordered.length>1){
     autoFraction+=totalHeight/120*dt/1000;
     const pixels=Math.floor(autoFraction);
     if(pixels){autoFraction-=pixels;move(pixels,1);}
    }
   }
   focus();
  }catch(error){recover(error);}
  finally{if(state.mode==='auto'||state.mode==='wheel'||state.mode==='handoff')requestFrame();}
 }
 function onWheel(event){
  if(Math.abs(event.deltaY)<.1)return;
  event.preventDefault();
  const unit=event.deltaMode===1?16:event.deltaMode===2?root.clientHeight:1,delta=event.deltaY*unit;
  if(state.mode!=='wheel'){state.wheelTarget=root.scrollTop;state.wheelSpeed=0;}
  state.wheelTarget+=delta*1.28;
  state.wheelSpeed=clamp(state.wheelSpeed+delta*.022,-1.2,1.2);
  state.mode='wheel';state.autoDelayUntil=performance.now()+180;requestFrame();
 }
 function onTouchStart(event){
  if(event.touches.length!==1){
   if(state.touching)endTouch(true);
   else state.touchPending=false;
   return;
  }
  const touch=event.touches[0];if(!touch)return;
  state.touchPending=true;state.touching=false;state.dragging=false;
  state.touchY=touch.clientY;state.touchTime=performance.now();state.touchSpeed=0;
 }
 function onTouchMove(event){
  if(event.touches.length!==1){
   if(state.touching)endTouch(true);
   else state.touchPending=false;
   return;
  }
  const touch=event.touches[0];if(!touch||(!state.touchPending&&!state.touching))return;
  const now=performance.now(),delta=state.touchY-touch.clientY,elapsed=Math.max(1,now-state.touchTime);
  if(!state.dragging&&Math.abs(touch.clientY-state.touchY)<8)return;
  if(!state.dragging){
   state.touchPending=false;state.touching=true;state.mode='touch';cancelFrame();
  }
  state.dragging=true;event.preventDefault();
  if(Math.abs(delta)>.05){
   move(delta,Math.sign(delta));
   state.touchSpeed=clamp(state.touchSpeed*.35+clamp(delta/elapsed,-3.6,3.6)*.65,-3.6,3.6);
   focus();
  }
  state.touchY=touch.clientY;state.touchTime=now;
 }
 function endTouch(cancelled){
  if(state.touchPending){state.touchPending=false;return;}
  if(!state.touching)return;
  state.touching=false;state.dragging=false;
  if(!cancelled){
   state.handoffStartSpeed=clamp(state.touchSpeed*1.25,-3.6,3.6);
   state.handoffStartTime=performance.now();
   state.mode='handoff';state.autoDelayUntil=0;requestFrame();
  }else{
   state.touchSpeed=0;state.mode='auto';state.autoDelayUntil=performance.now()+250;requestFrame();
  }
 }
 function onTouchEnd(event){if(!event.touches||event.touches.length===0)endTouch(false);}
 function onTouchCancel(event){if(!event.touches||event.touches.length===0)endTouch(true);}
 function resetTouch(){
  if(state.touchPending){state.touchPending=false;return;}
  if(state.touching)endTouch(true);
  else{state.mode='auto';state.wheelSpeed=state.touchSpeed=0;state.autoDelayUntil=performance.now()+250;requestFrame();}
 }
 function onPageHide(){cancelFrame();state.touchPending=false;state.touching=false;state.dragging=false;state.mode='auto';}
 function onWindowBlur(){resetTouch();}
 function onScroll(){
  if(state.looping)return;
  const current=root.scrollTop,delta=current-state.lastScroll;
  if(Math.abs(delta)<.5)return;
  state.lastScroll=current;
  if(state.mode==='auto'&&!state.touching){
   normalize(Math.sign(delta));state.wheelTarget=root.scrollTop;state.wheelSpeed=0;
   state.autoDelayUntil=performance.now()+250;
  }
  requestFrame();
 }
 function onVisibility(){
  if(document.hidden){cancelFrame();state.mode='auto';state.touchPending=false;state.touching=false;state.dragging=false;state.touchSpeed=state.wheelSpeed=0;state.lastScroll=root.scrollTop;}
  else{state.autoDelayUntil=performance.now()+250;state.lastScroll=root.scrollTop;requestFrame();}
 }
 function onResize(){geometryDirty=true;lastFocusRange='';requestFrame();}
 root.style.scrollBehavior='auto';
 root.addEventListener('wheel',onWheel,{passive:false});
 root.addEventListener('scroll',onScroll,{passive:true});
 root.addEventListener('touchstart',onTouchStart,{passive:true});
 root.addEventListener('touchmove',onTouchMove,{passive:false});
 window.addEventListener('touchend',onTouchEnd,{capture:true,passive:true});
 window.addEventListener('touchcancel',onTouchCancel,{capture:true,passive:true});
 window.addEventListener('blur',onWindowBlur,{passive:true});
 window.addEventListener('focus',onVisibility,{passive:true});
 window.addEventListener('pageshow',onVisibility,{passive:true});
 window.addEventListener('pagehide',onPageHide,{passive:true});
 document.addEventListener('visibilitychange',onVisibility,{passive:true});
 window.addEventListener('resize',onResize,{passive:true});
 const observer='ResizeObserver'in window?new ResizeObserver(onResize):null;
 observer?.observe(root);ordered.forEach(node=>observer?.observe(node));
 const intersection='IntersectionObserver'in window?new IntersectionObserver(entries=>{
  entries.forEach(entry=>{
   entry.target.classList.toggle('mc-in-view',entry.isIntersecting);
   root.dispatchEvent(new CustomEvent('mc-slot-visibility',{detail:{slot:entry.target,visible:entry.isIntersecting}}));
  });
 },{root,threshold:.01}):null;
 ordered.forEach(node=>intersection?intersection.observe(node):node.classList.add('mc-in-view'));
 measure();focus();requestFrame();
 return{refresh:onResize,destroy(){
  alive=false;cancelFrame();observer?.disconnect();intersection?.disconnect();
  root.removeEventListener('wheel',onWheel);root.removeEventListener('scroll',onScroll);
  root.removeEventListener('touchstart',onTouchStart);root.removeEventListener('touchmove',onTouchMove);
  window.removeEventListener('touchend',onTouchEnd,true);window.removeEventListener('touchcancel',onTouchCancel,true);
  window.removeEventListener('blur',onWindowBlur);window.removeEventListener('focus',onVisibility);
  window.removeEventListener('pageshow',onVisibility);window.removeEventListener('pagehide',onPageHide);
  document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('resize',onResize);
 }};
}
window.VegasMarketCardScroll={mount};
})();