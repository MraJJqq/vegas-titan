/* Central icon registry for every market instrument.
 * To add an icon: add one SYMBOL: filename entry here and place the SVG in assets/logos/.
 * Card rendering and market data must not maintain separate icon mappings.
 */
(function(){
'use strict';
const files=Object.freeze({
 AAPL:'apple.svg',
 MSFT:'microsoft.svg',
 GOOGL:'google.svg',
 AMZN:'amazon.svg',
 NVDA:'nvidia.svg',
 TSLA:'tesla.svg',
 META:'meta.svg',
 INTC:'intel.svg',
 QCOM:'qualcomm.svg',
 AMD:'amd.svg',
 TSM:'tsmc.svg',
 AVGO:'broadcom.svg',
 ORCL:'oracle.svg',
 ARM:'arm.svg',
 MU:'micron.svg',
 ASML:'asml.svg',
 SNDK:'sandisk.svg',
 SKHYNIX:'sk-hynix.svg',
 MRVL:'marvell.svg',
 GLW:'corning.svg',
 HOOD:'robinhood.svg',
 CBRS:'cerence.svg',
 SPCX:'spacex.svg',
 BTC:'bitcoin.svg',
 HYPE:'hyperliquid.svg',
 XAU:'gold.svg',
 CL:'crude-oil.svg'
});
const base='./assets/logos/';
const loaded=new Map();
function load(symbol){
 const key=String(symbol||'').toUpperCase();
 const url=get(key);
 if(!url)return Promise.resolve('');
 if(loaded.has(key))return loaded.get(key);
 const promise=new Promise(resolve=>{
  const img=new Image();img.decoding='async';
  img.onload=()=>{if(typeof img.decode==='function')img.decode().catch(()=>{}).finally(()=>resolve(url));else resolve(url);};
  img.onerror=()=>{loaded.delete(key);resolve('');};
  img.src=url;
 });
 loaded.set(key,promise);return promise;
}
function get(symbol){const file=files[String(symbol||'').toUpperCase()];return file?base+file:'';}
window.VegasIconRegistry=Object.freeze({
 get,load,
 has(symbol){return Object.prototype.hasOwnProperty.call(files,String(symbol||'').toUpperCase());},
 symbols(){return Object.keys(files);}
});
})();
