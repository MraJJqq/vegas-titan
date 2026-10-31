import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const jsFiles = [
'assets/js/signals/v9-events.js','assets/js/core/market-universe.js','assets/js/core/market-data.js',
'assets/js/cards/card-view.js','assets/js/scroll/scroll-engine.js','assets/js/cards/card-system.js',
'assets/js/kline/kline-data.js','assets/js/kline/kline-chart.js','assets/js/kline/kline-controller.js',
'assets/js/signals/bottom-ticker.js'];
let failed=false; const fail=m=>{failed=true;console.error('FAIL:',m)};
for(const file of jsFiles){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0)fail(file+': '+(r.stderr||r.stdout).trim())}
const read=p=>fs.readFileSync(p,'utf8');
const symbols=[...read('assets/js/core/market-universe.js').matchAll(/\['([A-Z]+)','([A-Z0-9]+)'\]/g)];
if(symbols.length!==27)fail('Expected 27 instruments; found '+symbols.length);
const market=read('assets/js/core/market-data.js');
if(!market.includes('/api/v3/market/candles?')||!market.includes('/api/v2/mix/market/candles?'))fail('Bitget spot/Mix endpoints missing');
if(!market.includes('visibleSymbols')||!market.includes('miniLastAt')||!market.includes('length:2'))fail('Visible-card mini-candle throttling missing');
const kline=read('assets/js/kline/kline-data.js'),scrollEngine=read('assets/js/scroll/scroll-engine.js'),view=read('assets/js/cards/card-view.js'),card=read('assets/js/cards/card-system.js'),controller=read('assets/js/kline/kline-controller.js');
if(!scrollEngine.includes("removeEventListener('touchend',onTouchEnd,true)")||!scrollEngine.includes("removeEventListener('touchcancel',onTouchCancel,true)"))fail('Scroll touch listener teardown missing');
if(scrollEngine.includes('--mc-depth-blur'))fail('Unused card depth-blur state remains in scroll engine');
if(controller.includes('autoPhase')||controller.includes('targetIndex')||controller.includes('transitionTarget'))fail('Unused K-line controller state remains');
if(!scrollEngine.includes("state.timer=setTimeout(schedule,33)")||!scrollEngine.includes("state.mode==='touch')return")||!scrollEngine.includes('focus();'))fail('Adaptive scroll scheduler or direct touch-frame rendering missing');
if(!view.includes('const chartOwners=new WeakMap()'))fail('Card canvas resize lookup optimization missing');
if(!view.includes('if(candlesChanged&&item.candles.length&&isVisible(item))draw(item)')||!view.includes("root.removeEventListener('mc-slot-visibility',onSlotVisibility)"))fail('Offscreen mini-chart rendering optimization or shared visibility lifecycle missing');
if(!kline.includes('while(cache.size>90)'))fail('K-line cache bound missing');
if(!kline.includes('/api/v3/market/candles')||!kline.includes('/api/v2/mix/market/candles'))fail('K-line Bitget endpoints missing');

if(!card.includes('VegasLayer5ShowSymbol')||!card.includes('VegasLayer5SetAutoQueue'))fail('Card/K-line bridge missing');
if(!controller.includes('window.VegasLayer5ShowSymbol=selectSymbol')||!controller.includes('window.VegasLayer5SetAutoQueue=setQueue'))fail('K-line public contract missing');
if(!controller.includes('function ensureChart()')||!controller.includes('chart.destroy();chart=null;views=[];'))fail('Lazy K-line lifecycle missing');
const chartEngine=read('assets/js/kline/kline-chart.js');
if(!chartEngine.includes('const viewport={visibleBars:90,rightGap:3}'))fail('Canonical K-line viewport model missing');
if(chartEngine.includes('subscribeVisibleLogicalRangeChange'))fail('Legacy chart-range feedback loop remains');
if(!chartEngine.includes('requestAnimationFrame')||!chartEngine.includes('vr-gesture-start')||!chartEngine.includes('vr-gesture-end'))fail('RAF gesture lifecycle contract missing');
if(!chartEngine.includes('const appliedRanges=new WeakMap()')||!chartEngine.includes('appliedRanges.get(view)||currentRange(view)'))fail('K-line gesture frame range cache missing');
if(!chartEngine.includes('rectWidth:rect.width')||chartEngine.includes('const center=(p[0].x+p[1].x)/2,rect=g.view.gesture.getBoundingClientRect()'))fail('Pinch gesture layout measurement cache missing');
if(!controller.includes("root.addEventListener('vr-gesture-start',pause)")||!controller.includes("root.addEventListener('vr-gesture-end',resume)"))fail('K-line rotation is not coordinated with the unified gesture lifecycle');
const appCss=read('assets/css/app.css');
if(!appCss.includes('--z-layer-kline:10;--z-layer-between:20;--z-layer-scroll:30;--z-layer-ticker:50'))fail('Explicit K-line < reserved middle layer < scroll/cards < ticker stacking order missing');
if(appCss.includes('--z-layer-between-min')||appCss.includes('--z-layer-between-max')||appCss.includes('--z-layer-cards'))fail('Obsolete layer z-index tokens remain');
const slotRule=appCss.match(/#market-cards-layer \.mc-slot\{[^}]*\}/)?.[0]||'';
if(!slotRule||slotRule.includes('filter:'))fail('Card slot must not create a filter backdrop root that blocks K-line glass blur');
if(!appCss.includes('#market-cards-layer{--up:#2ee6a6;position:fixed;z-index:var(--z-layer-scroll);')||!appCss.includes('#market-cards-layer .mc-columns{position:absolute;inset:0 auto 0 0;width:min(100vw,380px);min-width:0;min-height:0;overflow:visible;pointer-events:none;')||!appCss.includes('#market-cards-layer .mc-side{position:relative;z-index:2;'))fail('Only the real card scroll viewport may receive pointer/touch input above K-line');
const html=read('index.html');
if(!html.includes('scroll-engine.js?v=adaptive-frame-scheduler-1'))fail('Adaptive scroll scheduler cache version missing');
const klinePos=html.indexOf('id="vegas-right-scroll"');
const scrollPos=html.indexOf('id="market-cards-layer"');
const tickerPos=html.indexOf('id="vegas-signal-ticker"');
if(!(klinePos>=0&&scrollPos>klinePos&&tickerPos>scrollPos))fail('DOM layer order must be K-line, scroll container/cards, then ticker');
if(!html.includes('app.css?v=card-glass-backdrop-fix-1')||!html.includes('right-signal-scroll.css?v=layer-hit-test-rebuild-1'))fail('Card glass backdrop or layer hit-test cache version missing');
for(const p of ['assets/js/signals/v9-events.js','assets/js/core/market-universe.js','assets/js/core/market-data.js','assets/js/cards/card-view.js','assets/js/scroll/scroll-engine.js','assets/js/cards/card-system.js','assets/js/kline/kline-data.js'])if(!html.includes(p))fail('Entry point missing '+p);
if(!html.includes("chart.src='./assets/js/kline/kline-chart.js")||!html.includes("app.src='./assets/js/kline/kline-controller.js"))fail('Dynamic K-line loader missing');
const signalReader=read('assets/js/signals/v9-events.js');
const signalFeed=JSON.parse(read('data/v9-signals.json'));
if(!signalReader.includes('https://raw.githubusercontent.com/MraJJqq/vegas-titan/main/data/v9-signals.json'))fail('V1 must read the Vegas Titan V1 V9 signal feed directly');
if(!signalFeed.__daily_formal_signals__||!Array.isArray(signalFeed.__daily_formal_signals__.signals))fail('V1 V9 signal feed schema is invalid');
const runtimeFiles=[...jsFiles,'index.html'];
for(const file of runtimeFiles)if(/vegas-octopus-v2|octopus-v2/i.test(read(file)))fail('V1 runtime must not depend on V2: '+file);
if(!failed)console.log('PASS: syntax, 27 instruments, Bitget endpoints, module paths and card/K-line contracts.');else process.exitCode=1;
