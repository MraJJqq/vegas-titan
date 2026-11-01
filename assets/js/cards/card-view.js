/* Layer 3 view: card DOM, rendering and selection only. */
(function(){
'use strict';
function price(value){
 return value>=100?value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):value>=1?value.toFixed(3):value.toFixed(4);
}
function draw(item){
 const canvas=item.nodes.chart,ctx=canvas?.getContext('2d'),rows=item.candles||[];
 if(!ctx||!rows.length)return;
 const rect=canvas.getBoundingClientRect(),w=Math.max(1,canvas.clientWidth||rect.width),h=Math.max(1,canvas.clientHeight||rect.height),dpr=Math.min(2,window.devicePixelRatio||1);
 const width=Math.round(w*dpr),height=Math.round(h*dpr);
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const data=rows.slice(-60),low=Math.min(...data.map(x=>x.low)),high=Math.max(...data.map(x=>x.high)),span=high-low||Math.max(Math.abs(high)*.001,1e-8);
 const y=v=>h-3-(v-low)/span*(h-6),step=w/data.length,body=Math.max(1,Math.min(4,step*.58));
 data.forEach((c,i)=>{
  const x=i*step+step/2,color=c.close>=c.open?'#00f5a0':'#ff3b6b';
  ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y(c.high));ctx.lineTo(x,y(c.low));ctx.stroke();
  ctx.fillStyle=color;ctx.fillRect(x-body/2,Math.min(y(c.open),y(c.close)),body,Math.max(1.2,Math.abs(y(c.close)-y(c.open))));
 });
}
function mount(root,instruments,onSelect){
 if(!root)throw Error('Layer 3 root missing');
 const items=instruments.map(item=>({...item,nodes:null,price:0,open:0,candles:[]}));
 const markup=item=>'<div class="mc-slot"><div class="mc-float" style="--d:'+(-item.index*.9)+'s"><div class="mc-card" id="mc-c'+item.index+'" data-symbol="'+item.symbol+'"><div class="mc-glow"></div><div class="mc-row"><div class="mc-sym"><span class="mc-ico" aria-hidden="true"></span><span class="mc-name">'+item.symbol+'<small>'+item.subtitle+'</small></span></div><span class="mc-chg">--</span></div><div class="mc-price">加载中</div><canvas class="mc-chart" aria-hidden="true"></canvas><div class="mc-tag">LIVE MARKET</div></div></div><div class="mc-gshadow" style="--d:'+(-item.index*.9)+'s"></div></div>';
 root.replaceChildren();
 root.insertAdjacentHTML('beforeend',items.map(markup).join(''));
 items.forEach(item=>{
  const card=root.querySelector('#mc-c'+item.index);
  item.nodes={card,price:card.querySelector('.mc-price'),change:card.querySelector('.mc-chg'),chart:card.querySelector('.mc-chart')};
  const icon=card.querySelector('.mc-ico');
  const registry=window.VegasIconRegistry;
  if(icon&&registry?.load&&registry?.show){
   registry.load(item.symbol).then(url=>registry.show(icon,item.symbol,url));
  }
 });
 const chartOwners=new WeakMap();
 items.forEach(item=>chartOwners.set(item.nodes.chart,item));
 const isVisible=item=>item.nodes.card.closest('.mc-slot')?.classList.contains('mc-in-view')===true;
 const resizeObserver='ResizeObserver'in window?new ResizeObserver(entries=>{
  entries.forEach(entry=>{const item=chartOwners.get(entry.target);if(item&&isVisible(item))draw(item);});
 }):null;
 function onSlotVisibility(event){
  const {slot,visible}=event.detail||{};if(!visible||!slot)return;
  const item=items.find(candidate=>candidate.nodes.card.closest('.mc-slot')===slot);
  if(item)draw(item);
 }
 root.addEventListener('mc-slot-visibility',onSlotVisibility);
 items.forEach(item=>resizeObserver?.observe(item.nodes.chart));
 function select(symbol){if(typeof onSelect==='function')onSelect(symbol);}
 function cardFromEvent(event){
  const path=typeof event.composedPath==='function'?event.composedPath():[];
  const node=path.find(value=>value instanceof Element&&value.matches('.mc-card[data-symbol]'));
  const card=node||(event.target instanceof Element?event.target.closest('.mc-card[data-symbol]'):null);
  return card&&root.contains(card)?card:null;
 }
 // Mouse and pen use the browser's native click activation.
 // Touch uses a separate pointer sequence so scrolling and taps remain distinct.
 let activeTouch=null,lastTouchActivation=null;
 function onTouchPointerDown(event){
  if(activeTouch||event.pointerType!=='touch'||!event.isPrimary)return;
  const card=cardFromEvent(event);if(!card)return;
  activeTouch={id:event.pointerId,card,symbol:card.dataset.symbol,x:event.clientX,y:event.clientY,moved:false};
 }
 function onTouchPointerMove(event){
  const state=activeTouch;if(!state||event.pointerId!==state.id)return;
  const dx=event.clientX-state.x,dy=event.clientY-state.y;
  if(dx*dx+dy*dy>=64)state.moved=true;
 }
 function clearTouchPointer(event){
  if(!activeTouch||event.pointerId!==activeTouch.id)return null;
  const state=activeTouch;activeTouch=null;return state;
 }
 function onTouchPointerUp(event){
  if(event.pointerType!=='touch')return;
  const state=clearTouchPointer(event);if(!state||state.moved)return;
  if(!state.card.isConnected||!root.contains(state.card)||state.card.dataset.symbol!==state.symbol)return;
  const releaseTarget=document.elementFromPoint(event.clientX,event.clientY);
  const releaseCard=releaseTarget instanceof Element?releaseTarget.closest('.mc-card[data-symbol]'):null;
  if(releaseCard!==state.card)return;
  lastTouchActivation={card:state.card,time:Date.now(),x:event.clientX,y:event.clientY};
  select(state.symbol);
 }
 function onTouchPointerCancel(event){clearTouchPointer(event);}
 function onClick(event){
  const card=cardFromEvent(event);if(!card)return;
  if(event.pointerType==='touch'){lastTouchActivation=null;return;}
  const touch=lastTouchActivation;
  if(event.detail!==0&&touch&&touch.card===card&&Date.now()-touch.time<800&&
   Math.hypot(event.clientX-touch.x,event.clientY-touch.y)<25){
   lastTouchActivation=null;return;
  }
  select(card.dataset.symbol);
 }
 root.addEventListener('pointerdown',onTouchPointerDown,true);
 root.addEventListener('pointermove',onTouchPointerMove,true);
 window.addEventListener('pointerup',onTouchPointerUp,true);
 window.addEventListener('pointercancel',onTouchPointerCancel,true);
 root.addEventListener('click',onClick,true);
 let pointerRaf=0,pointerEvent=null;
 function onPointerMove(event){
  if(event.pointerType==='touch')return;
  const card=event.target instanceof Element?event.target.closest('.mc-card'):null;
  if(!card)return;
  pointerEvent=event;
  if(pointerRaf)return;
  pointerRaf=requestAnimationFrame(()=>{
   pointerRaf=0;if(!pointerEvent)return;
   const e=pointerEvent;pointerEvent=null;
   const target=e.target instanceof Element?e.target.closest('.mc-card'):null;
   if(!target)return;
   const rect=target.getBoundingClientRect(),x=(e.clientX-rect.left)/Math.max(1,rect.width),y=(e.clientY-rect.top)/Math.max(1,rect.height);
   target.style.setProperty('--ry',((x-.5)*24)+'deg');target.style.setProperty('--rx',((.5-y)*20)+'deg');
  });
 }
 function resetTilt(event){
  const card=event.target instanceof Element?event.target.closest('.mc-card'):null;
  if(card&&(!event.relatedTarget||!card.contains(event.relatedTarget))){card.style.setProperty('--rx','0deg');card.style.setProperty('--ry','0deg');}
 }
 root.addEventListener('pointermove',onPointerMove,{passive:true});
 root.addEventListener('pointerout',resetTilt,{passive:true});
 ['pointerleave','pointerup','pointercancel'].forEach(type=>root.addEventListener(type,resetTilt,{passive:true}));
 function update(snapshot){
  items.forEach(item=>{
   const data=snapshot.get(item.symbol);if(!data)return;
   item.price=data.price||item.price;item.open=data.open||item.open;
   const candlesChanged=!!data.candles&&data.candles!==item.candles;
   if(candlesChanged)item.candles=data.candles;
   if(item.price>0&&item.open>0){
    const up=item.price>=item.open,direction=up?'up':'dn';
    if(item.lastDirection!==direction){
     item.nodes.card.classList.toggle('up',up);item.nodes.card.classList.toggle('dn',!up);
     item.nodes.card.style.setProperty('--mc-color',up?'#00f5a0':'#ff3b6b');
     item.lastDirection=direction;
    }
    if(item.lastPriceValue!==item.price||item.lastOpenValue!==item.open){
     const n=price(item.price),pct=(up?'+':'')+((item.price/item.open-1)*100).toFixed(2)+'%';
     if(item.nodes.price.textContent!==n)item.nodes.price.textContent=n;
     if(item.nodes.change.textContent!==pct)item.nodes.change.textContent=pct;
     item.lastPriceValue=item.price;item.lastOpenValue=item.open;
    }
   }
   if(candlesChanged&&item.candles.length&&isVisible(item))draw(item);
  });
 }
 function setSignals(symbols){
  const set=new Set(symbols);
  items.forEach(item=>{
   const active=set.has(item.symbol);
   if(item.formalSignal===active)return;
   item.formalSignal=active;
   if(active)item.nodes.card.setAttribute('data-formal-signal','true');
   else item.nodes.card.removeAttribute('data-formal-signal');
  });
 }
 function destroy(){
  resizeObserver?.disconnect();root.removeEventListener('mc-slot-visibility',onSlotVisibility);
  root.removeEventListener('pointerdown',onTouchPointerDown,true);
  root.removeEventListener('pointermove',onTouchPointerMove,true);
  window.removeEventListener('pointerup',onTouchPointerUp,true);
  window.removeEventListener('pointercancel',onTouchPointerCancel,true);
  root.removeEventListener('click',onClick,true);
  activeTouch=null;lastTouchActivation=null;
  root.removeEventListener('pointermove',onPointerMove);root.removeEventListener('pointerout',resetTilt);
  ['pointerleave','pointerup','pointercancel'].forEach(type=>root.removeEventListener(type,resetTilt));
  if(pointerRaf)cancelAnimationFrame(pointerRaf);
 }
 return{items,slots:()=>Array.from(root.querySelectorAll('.mc-slot')),update,setSignals,destroy};
}
window.VegasMarketCardView={mount};
})();