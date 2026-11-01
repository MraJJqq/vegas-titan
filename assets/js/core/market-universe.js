/* Immutable Layer 3 instrument universe. Order is a visual contract. */
(function(){
'use strict';
const rows=[
['AAPL','AAPLUSDT'],['MSFT','MSFTUSDT'],['GOOGL','GOOGLUSDT'],['AMZN','AMZNUSDT'],['NVDA','NVDAUSDT'],['TSLA','TSLAUSDT'],['META','METAUSDT'],['INTC','INTCUSDT'],['QCOM','QCOMUSDT'],['AMD','AMDUSDT'],['TSM','TSMUSDT'],['AVGO','AVGOUSDT'],['ORCL','ORCLUSDT'],['ARM','ARMUSDT'],['MU','MUUSDT'],['ASML','ASMLUSDT'],['SNDK','SNDKUSDT'],['SKHYNIX','SKHYNIXUSDT'],['MRVL','MRVLUSDT'],['GLW','GLWUSDT'],['HOOD','HOODUSDT'],['CBRS','CBRSUSDT'],['SPCX','SPCXUSDT'],['BTC','BTCUSDT'],['HYPE','HYPEUSDT'],['XAU','XAUUSDT'],['CL','CLUSDT']
];
const stocks=new Set(rows.slice(0,23).map(row=>row[0]));
const logoFiles={AAPL:'apple.svg',MSFT:'microsoft.svg',GOOGL:'google.svg',AMZN:'amazon.svg',NVDA:'nvidia.svg',TSLA:'tesla.svg',META:'meta.svg',INTC:'intel.svg',QCOM:'qualcomm.svg',AMD:'amd.svg',TSM:'tsmc.svg',AVGO:'broadcom.svg',ORCL:'oracle.svg',ARM:'arm.svg',MU:'micron.svg',ASML:'asml.svg',SNDK:'sandisk.svg',SKHYNIX:'sk-hynix.svg',MRVL:'marvell.svg',GLW:'corning.svg',HOOD:'robinhood.svg',CBRS:'cerence.svg',SPCX:'spacex.svg',BTC:'bitcoin.svg',HYPE:'hyperliquid.svg',XAU:'gold.svg',CL:'crude-oil.svg'};
const names={"AAPL":"Apple","MSFT":"Microsoft","GOOGL":"Alphabet","AMZN":"Amazon","NVDA":"NVIDIA","TSLA":"Tesla","META":"Meta","INTC":"Intel","QCOM":"Qualcomm","AMD":"AMD","TSM":"TSMC","AVGO":"Broadcom","ORCL":"Oracle","ARM":"Arm","MU":"Micron","ASML":"ASML","SNDK":"SanDisk","SKHYNIX":"SK hynix","MRVL":"Marvell","GLW":"Corning","HOOD":"Robinhood","CBRS":"Cerence","SPCX":"SpaceX","BTC":"Bitcoin","HYPE":"Hyperliquid","XAU":"Gold","CL":"Crude Oil"};
window.VegasMarketUniverse=Object.freeze(rows.map(([symbol,contract],index)=>Object.freeze({
 symbol,contract,index,name:names[symbol]||symbol,isSpotStock:stocks.has(symbol),
 subtitle:symbol==='BTC'||symbol==='HYPE'?'永续合约':symbol==='XAU'?'黄金永续合约':symbol==='CL'?'原油期货':'美股行情',
 iconUrl:'./assets/logos/'+logoFiles[symbol]
})));
})();