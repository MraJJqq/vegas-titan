/* Layer 3 composition root. No rendering, transport or scroll algorithms live here. */
(function(){
'use strict';
if(window.__VEGAS_MARKET_CARDS_MOUNTED__)return;
window.__VEGAS_MARKET_CARDS_MOUNTED__=true;
const root=document.getElementById('mc-left'),universe=window.VegasMarketUniverse;
if(!root||!universe||!window.VegasMarketCardView||!window.VegasMarketData||!window.VegasMarketCardScroll){
 console.error('[Vegas Layer 3] required foundation module missing');return;
}
let scroll=null;
function selectSymbol(symbol){
 const value=String(symbol||'').trim().toUpperCase();
 if(!/^[A-Z0-9.]+$/.test(value))return false;
 if(typeof window.VegasLayer5ShowSymbol==='function')window.VegasLayer5ShowSymbol(value);
 else window.__VEGAS_PENDING_LAYER5_SYMBOL=value;
 scroll?.resumeAfterSelection();
 return true;
}
const view=window.VegasMarketCardView.mount(root,universe,selectSymbol);
scroll=window.VegasMarketCardScroll.mount(root,view.slots());
window.VegasGetRealityStockMap=window.VegasMarketData.getStockMap;
let formalSymbols=[];
window.VegasApplyFormalSignals=function(){
 formalSymbols=[...new Set((window.VegasFormalSignalSymbols||[]).map(x=>String(x||'').trim().toUpperCase()).filter(Boolean))];
 view.setSignals(formalSymbols);
 if(typeof window.VegasLayer5SetAutoQueue==='function')window.VegasLayer5SetAutoQueue(formalSymbols);
 else window.__VEGAS_PENDING_LAYER5_QUEUE=formalSymbols.slice();
};
window.VegasApplyFormalSignals();
const visibleSymbols=()=>Array.from(root.querySelectorAll('.mc-slot.mc-in-view .mc-card[data-symbol]'),node=>node.dataset.symbol);
const stopData=window.VegasMarketData.mount(universe,snapshot=>view.update(snapshot),visibleSymbols);
window.addEventListener('pagehide',()=>{
 stopData?.();scroll.destroy();view.destroy();
},{once:true});
})();