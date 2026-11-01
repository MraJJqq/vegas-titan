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
window.VegasIconRegistry=Object.freeze({
 get(symbol){const file=files[String(symbol||'').toUpperCase()];return file?base+file:'';},
 has(symbol){return Object.prototype.hasOwnProperty.call(files,String(symbol||'').toUpperCase());},
 symbols(){return Object.keys(files);}
});
})();
