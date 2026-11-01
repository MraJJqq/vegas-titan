/* Single source of truth for market logos: preload and decode before painting. */
(function(){
'use strict';
const files=Object.freeze({
 AAPL:'apple.svg',MSFT:'microsoft.svg',GOOGL:'google.svg',AMZN:'amazon.svg',
 NVDA:'nvidia.svg',TSLA:'tesla.svg',META:'meta.svg',INTC:'intel.svg',
 QCOM:'qualcomm.svg',AMD:'amd.svg',TSM:'tsmc.svg',AVGO:'broadcom.svg',
 ORCL:'oracle.svg',ARM:'arm.svg',MU:'micron.svg',ASML:'asml.svg',
 SNDK:'sandisk.svg',SKHYNIX:'sk-hynix.svg',MRVL:'marvell.svg',
 GLW:'corning.svg',HOOD:'robinhood.svg',CBRS:'cerence.svg',
 SPCX:'spacex.svg',BTC:'bitcoin.svg',HYPE:'hyperliquid.svg',
 XAU:'gold.svg',CL:'crude-oil.svg'
});
const base='./assets/logos/';
const loaded=new Map();
const requests=new WeakMap();
function keyOf(symbol){return String(symbol||'').trim().toUpperCase();}
function get(symbol){
 const file=files[keyOf(symbol)];
 return file?base+file:'';
}
function load(symbol){
 const key=keyOf(symbol),url=get(key);
 if(!url)return Promise.resolve('');
 if(loaded.has(key))return loaded.get(key);
 const promise=new Promise(resolve=>{
  const probe=new Image();
  probe.decoding='async';
  probe.onload=async()=>{
   try{
    if(typeof probe.decode==='function')await probe.decode();
    if(!probe.naturalWidth)throw new Error('Logo image is empty');
    resolve(url);
   }catch{
    loaded.delete(key);
    resolve('');
   }
  };
  probe.onerror=()=>{
   loaded.delete(key);
   resolve('');
  };
  probe.src=url;
 });
 loaded.set(key,promise);
 return promise;
}
function clear(element){
 if(!element)return;
 requests.set(element,(requests.get(element)||0)+1);
 element.classList.remove('is-logo-ready');
 element.style.backgroundImage='none';
 element.removeAttribute('data-logo-symbol');
}
function show(element,symbol){
 if(!element)return Promise.resolve(false);
 const key=keyOf(symbol);
 const request=(requests.get(element)||0)+1;
 requests.set(element,request);
 element.classList.remove('is-logo-ready');
 element.style.backgroundImage='none';
 element.dataset.logoSymbol=key;
 return load(key).then(url=>{
  if(!url||!element.isConnected||requests.get(element)!==request)return false;
  element.style.backgroundImage='url("'+url+'")';
  element.classList.add('is-logo-ready');
  return true;
 }).catch(()=>false);
}
window.VegasIconRegistry=Object.freeze({
 get,load,show,clear,
 has(symbol){return Object.prototype.hasOwnProperty.call(files,keyOf(symbol));},
 symbols(){return Object.keys(files);}
});
})();