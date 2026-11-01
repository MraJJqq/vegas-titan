import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const jsFiles = [
'assets/js/signals/v9-events.js','assets/js/core/icon-registry.js','assets/js/core/market-universe.js','assets/js/core/market-data.js',
'assets/js/cards/card-view.js','assets/js/scroll/scroll-engine.js','assets/js/cards/card-system.js',
'assets/js/kline/kline-data.js','assets/js/kline/kline-chart.js','assets/js/kline/kline-controller.js',
'assets/js/signals/bottom-ticker.js'];
let failed=false; const fail=m=>{failed=true;console.error('FAIL:',m)};
for(const file of jsFiles){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0)fail(file+': '+(r.stderr||r.stdout).trim())}
const read=p=>fs.readFileSync(p,'utf8');
const symbols=[...read('assets/js/core/market-universe.js').matchAll(/\['([A-Z]+)','([A-Z0-9]+)'\]/g)];
if(symbols.length!==27)fail('Expected 27 instruments; found '+symbols.length);
const iconRegistry=read('assets/js/core/icon-registry.js');
const iconMap=[...iconRegistry.matchAll(/^\s*([A-Z0-9]+):'([^']+\.svg)'/gm)];
if(iconMap.length!==27)fail('Expected 27 Logo mappings; found '+iconMap.length);
const iconSymbols=new Set(iconMap.map(match=>match[1]));
for(const match of symbols){if(!iconSymbols.has(match[1]))fail('Logo mapping missing for '+match[1]);}
for(const match of iconMap){if(!fs.existsSync('assets/logos/'+match[2]))fail('Logo asset missing: '+match[2]);}
const cardViewSource=read('assets/js/cards/card-view.js');
if(!cardViewSource.includes('registry.load(item.symbol)'))fail('Card view must load Logo through the shared registry');
const gestureView=cardViewSource;
if(gestureView.includes('onClick')||gestureView.includes("addEventListener('click'"))fail('Legacy card click activation path remains');
if((gestureView.split("addEventListener('pointerdown'").length-1)!==1||(gestureView.split("addEventListener('pointerup'").length-1)!==1)fail('Card activation must have one pointer down/up owner');
if(!gestureView.includes('touch:7')||!gestureView.includes('Math.abs(touch.clientY-state.touchY)<8'))fail('Touch tap threshold must stay below the scroll engine drag threshold');
if(!gestureView.includes('document.elementFromPoint(event.clientX,event.clientY)')||!gestureView.includes('if(releaseCard!==state.card)return;'))fail('Card activation must confirm release over the originally pressed card');
if(!gestureView.includes('root.releasePointerCapture(activePointer.id)'))fail('Active pointer capture must be released during teardown');
const controllerSource=read('assets/js/kline/kline-controller.js');
if(!controllerSource.includes('registry.load(symbol)'))fail('K-line header must load Logo through the shared registry');
if(iconRegistry.includes('function warm(')||iconRegistry.includes('requestIdleCallback'))fail('Redundant Logo idle-prewarming code remains');
const market=read('assets/js/core/market-data.js');
if(!market.includes('/api/v3/market/candles?')||!market.includes('/api/v2/mix/market/candles?'))fail('Bitget spot/Mix endpoints missing');
if(!market.includes('visibleSymbols')||!market.includes('miniLastAt')||!market.includes('length:2'))fail('Visible-card mini-candle throttling missing');
if(!market.includes('neededFutures')||!market.includes('neededSpots'))fail('Market ticker processing must index only tracked instruments');
const kline=read('assets/js/kline/kline-data.js'),scrollEngine=read('assets/js/scroll/scroll-engine.js'),view=read('assets/js/cards/card-view.js'),card=read('assets/js/cards/card-system.js'),controller=read('assets/js/kline/kline-controller.js');
if(!scrollEngine.includes("removeEventListener('touchend',onTouchEnd,true)")||!scrollEngine.includes("removeEventListener('touchcancel',onTouchCancel,true)"))fail('Scroll touch listener teardown missing');
if(!scrollEngine.includes('event.touches.length!==1')||!scrollEngine.includes('event.touches.length===0'))fail('Card scrolling must ignore multi-touch and wait for all fingers to lift');
if(!scrollEngine.includes("state.mode==='handoff'")||!scrollEngine.includes('handoffStartSpeed')||!scrollEngine.includes('state.handoffDuration'))fail('Manual-to-auto card scrolling must use a continuous velocity handoff');
if(scrollEngine.includes('--mc-depth-blur'))fail('Unused card depth-blur state remains in scroll engine');
if(controller.includes('autoPhase')||controller.includes('targetIndex')||controller.includes('transitionTarget'))fail('Unused K-line controller state remains');
if(!scrollEngine.includes("state.timer=setTimeout(schedule,33)")||!scrollEngine.includes("state.mode==='touch')return")||!scrollEngine.includes('focus();'))fail('Adaptive scroll scheduler or direct touch-frame rendering missing');
if(!view.includes('const chartOwners=new WeakMap()'))fail('Card canvas resize lookup optimization missing');
if(!view.includes('if(candlesChanged&&item.candles.length&&isVisible(item))draw(item)')||!view.includes("root.removeEventListener('mc-slot-visibility',onSlotVisibility)"))fail('Offscreen mini-chart rendering optimization or shared visibility lifecycle missing');
if(!kline.includes('while(cache.size>90)'))fail('K-line cache bound missing');
if(!kline.includes('function commonPrefixLength(')||!kline.includes('updateIndicators(symbol,oldRows,rows,common)')||!kline.includes('merged.common<oldRows.length'))fail('K-line refresh must reuse one candle-prefix scan for EMA and change detection');
if(!kline.includes('/api/v2/mix/market/candles')||!kline.includes('/api/v2/mix/market/history-candles'))fail('K-line Bitget USDT-Futures endpoints missing');

if(!card.includes('VegasLayer5ShowSymbol')||!card.includes('VegasLayer5SetAutoQueue'))fail('Card/K-line bridge missing');
if(!controller.includes('window.VegasLayer5ShowSymbol=selectSymbol')||!controller.includes('window.VegasLayer5SetAutoQueue=setQueue'))fail('K-line public contract missing');
if(!controller.includes('function ensureChart()')||!controller.includes('chart.destroy();chart=null;views=[];'))fail('Lazy K-line lifecycle missing');
const chartEngine=read('assets/js/kline/kline-chart.js');
if(!chartEngine.includes('const viewport={visibleBars:90,rightGap:3}'))fail('Canonical K-line viewport model missing');
if(chartEngine.includes('subscribeVisibleLogicalRangeChange'))fail('Legacy chart-range feedback loop remains');
if(!chartEngine.includes('requestAnimationFrame')||!chartEngine.includes('vr-gesture-start')||!chartEngine.includes('vr-gesture-end'))fail('RAF gesture lifecycle contract missing');
if(!chartEngine.includes('const appliedRanges=new WeakMap()')||!chartEngine.includes('appliedRanges.get(view)||currentRange(view)'))fail('K-line gesture frame range cache missing');
if(chartEngine.includes('view.chart.applyOptions({rightPriceScale:'))fail('K-line setData must not reapply unchanged chart options');
if(!chartEngine.includes('rectWidth:rect.width')||chartEngine.includes('const center=(p[0].x+p[1].x)/2,rect=g.view.gesture.getBoundingClientRect()'))fail('Pinch gesture layout measurement cache missing');
if(!controller.includes("root.addEventListener('vr-gesture-start',pause)")||!controller.includes("root.addEventListener('vr-gesture-end',resume)"))fail('K-line rotation is not coordinated with the unified gesture lifecycle');
const layerCss=read('assets/css/right-signal-scroll.css');
if(layerCss.includes('brightness(')||controller.includes('brightness(')||controller.includes('style.filter'))fail('K-line layers must not animate brightness filters');
if(!controller.includes('gesturePaused||mode===\'transitioning\'')||!controller.slice(controller.indexOf('function resume('),controller.indexOf('function onVisibility')).includes('applyDeferredRefresh()'))fail('K-line data refresh must defer during gestures and resume afterward');
if(!view.includes('item.lastDirection!==direction'))fail('Card market updates must skip redundant direction style writes');
if(!view.includes('item.lastPriceValue!==item.price')||!view.includes('item.formalSignal===active'))fail('Card view must skip unchanged price formatting and signal DOM writes');
if(!scrollEngine.includes('boxTop=i*stride,boxHeight=slotHeight'))fail('Scroll focus must use cached uniform slot geometry');
if(!kline.includes('const count=store.count()')||!kline.includes('records.slice(MAX_RECORDS).forEach(item=>store.delete(item.key))'))fail('IndexedDB pruning must run only after exceeding the cache bound');
if(!kline.includes('prior=old[common-length]')||!kline.includes('out=old.slice(0,common-length+1)'))fail('EMA continuation must use the aligned cached index');
if(kline.includes('WARMUP_BARS')||kline.includes('warmupBars')||!kline.includes('historyChecked:true'))fail('K-line history must load once without a fixed EMA warmup target');
if(!kline.includes('record.historyExhausted')||!kline.includes('historyExhausted:reachedHistoryStart'))fail('Verified history exhaustion must survive IndexedDB cache reloads');
if(kline.includes('record.emas')||kline.includes('emas[length]'))fail('Persisted EMA values must not bypass candle-history recalculation');
if(!kline.includes('row.time%14400===0'))fail('4H candle timestamps must align to UTC four-hour boundaries');
const appCss=read('assets/css/app.css');
if(!appCss.includes('--z-layer-kline:10;--z-layer-scroll:30;--z-layer-ticker:50'))fail('Explicit K-line < reserved middle layer < scroll/cards < ticker stacking order missing');
if(appCss.includes('--z-layer-between-min')||appCss.includes('--z-layer-between-max')||appCss.includes('--z-layer-cards'))fail('Obsolete layer z-index tokens remain');
const slotRule=appCss.match(/#market-cards-layer \.mc-slot\{[^}]*\}/)?.[0]||'';

const offscreenSlotRule=appCss.match(/#market-cards-layer \.mc-slot:not\(\.mc-in-view\)\{[^}]*\}/)?.[0]||'';
if(!offscreenSlotRule||offscreenSlotRule.includes('translateZ(0)')||!offscreenSlotRule.includes('backface-visibility:visible'))fail('Off-screen card slots must release forced GPU promotion while visible slots retain their original compositor path');
if(!appCss.includes('#market-cards-layer .mc-slot:not(.mc-in-view) .mc-float')||!appCss.includes('#market-cards-layer .mc-slot:not(.mc-in-view) .mc-gshadow')||!appCss.includes('#market-cards-layer .mc-slot:not(.mc-in-view) .mc-card::before')||!appCss.includes('animation-play-state:paused!important'))fail('Off-screen decorative animations must remain paused');
const focusBlock=scrollEngine.slice(scrollEngine.indexOf('function focus(){'),scrollEngine.indexOf('function requestFrame(){'));
if(!focusBlock.includes('Math.floor(top/Math.max(1,stride))-1')||!focusBlock.includes('Math.ceil((top+height)/Math.max(1,stride))+1')||focusBlock.includes(')-2')||focusBlock.includes(')+2'))fail('Scroll focus styling must use exactly one off-screen slot of look-ahead on each side');

if(!slotRule||slotRule.includes('filter:'))fail('Card slot must not create a filter backdrop root that blocks K-line glass blur');
if(!appCss.includes('#market-cards-layer{--up:#2ee6a6;position:fixed;z-index:var(--z-layer-scroll);')||!appCss.includes('#market-cards-layer .mc-columns{position:absolute;inset:0 auto 0 0;width:min(100vw,380px);min-width:0;min-height:0;overflow:visible;pointer-events:none;')||!appCss.includes('#market-cards-layer .mc-side{position:relative;z-index:2;'))fail('Only the real card scroll viewport may receive pointer/touch input above K-line');
const html=read('index.html');
const runtimeRefs=[...html.matchAll(/(?:src|href)=[\"']([^\"']+)[\"']/g)].map(match=>match[1]).filter(ref=>ref.startsWith('./assets/'));
for(const ref of runtimeRefs){const path=ref.split('?')[0].replace(/^\.\//,'');if(!fs.existsSync(path))fail('Referenced runtime asset missing: '+path);}
if(!runtimeRefs.some(ref=>ref.startsWith('./assets/js/scroll/scroll-engine.js?')))fail('Scroll engine entry reference missing');
const klinePos=html.indexOf('id="vegas-right-scroll"');
const scrollPos=html.indexOf('id="market-cards-layer"');
const tickerPos=html.indexOf('id="vegas-signal-ticker"');
if(!(klinePos>=0&&scrollPos>klinePos&&tickerPos>scrollPos))fail('DOM layer order must be K-line, scroll container/cards, then ticker');
if(!runtimeRefs.some(ref=>ref.startsWith('./assets/css/app.css?'))||!runtimeRefs.some(ref=>ref.startsWith('./assets/css/right-signal-scroll.css?')))fail('Required card/K-line stylesheets are not referenced');
if(!kline.includes("productType:'USDT-FUTURES'")||kline.includes("category:'SPOT'")||kline.includes("stock-info"))fail('K-line data source must use Bitget USDT Futures only');
if(!controller.includes('const MANUAL_TOTAL_MS=10000;')||!controller.includes('manualDeadline=now+MANUAL_TOTAL_MS;')||!controller.includes('Math.max(0,manualDeadline-Date.now())'))fail('Manual K-line timer must start at click and expire after 10 seconds');
if(!controller.includes('pausedManualRemaining=Math.max(0,manualDeadline-Date.now())')||!controller.includes('manualDeadline=Date.now()+remaining'))fail('Manual K-line timer gesture pause/resume contract missing');
if(!controller.includes('manualPausedRemaining=pausedManualRemaining!==null?pausedManualRemaining:Math.max(0,manualDeadline-Date.now())')||!controller.includes('manualDeadline=Date.now()+remaining'))fail('Manual K-line timer background pause/resume contract missing');
if(!controller.includes('if(id===generation&&manualSymbol===symbol)restoreAuto()'))fail('Stale manual click timer must not restore over a newer card selection');
if(controller.includes('warmupBars')||controller.includes('红峰历史预热')||controller.includes('预热目标'))fail('K-line controller must not enforce red-peak warmup');
if(!controller.includes('function preloadNext()')||!controller.includes('loadLayer(1-active,queue[index],{completeHistory:false});')||!controller.includes('function completeHistory('))fail('Next-symbol data preload contract missing');
for(const path of ['assets/js/core/market-data.js','assets/js/cards/card-view.js','assets/js/kline/kline-data.js','assets/js/kline/kline-chart.js','assets/js/kline/kline-controller.js']){const base=path.split('/').pop();if(!runtimeRefs.some(ref=>ref.split('?')[0].endsWith('/'+base)))fail('Runtime module reference missing: '+path);}
for(const p of ['assets/js/signals/v9-events.js','assets/js/core/market-universe.js','assets/js/core/market-data.js','assets/js/cards/card-view.js','assets/js/scroll/scroll-engine.js','assets/js/cards/card-system.js','assets/js/kline/kline-data.js'])if(!html.includes(p))fail('Entry point missing '+p);
if(!html.includes("chart.src='./assets/js/kline/kline-chart.js")||!html.includes("app.src='./assets/js/kline/kline-controller.js"))fail('Dynamic K-line loader missing');
const signalReader=read('assets/js/signals/v9-events.js');
const signalFeed=JSON.parse(read('data/v9-signals.json'));
if(!signalReader.includes('https://raw.githubusercontent.com/MraJJqq/vegas-titan/main/data/v9-signals.json'))fail('V1 must read the Vegas Titan V1 V9 signal feed directly');
if(!signalFeed.__daily_formal_signals__||!Array.isArray(signalFeed.__daily_formal_signals__.signals))fail('V1 V9 signal feed schema is invalid');
const runtimeFiles=[...jsFiles,'index.html'];
for(const file of runtimeFiles)if(/vegas-octopus-v2|octopus-v2/i.test(read(file)))fail('V1 runtime must not depend on V2: '+file);
if(!failed)console.log('PASS: syntax, 27 instruments, Bitget endpoints, module paths and card/K-line contracts.');else process.exitCode=1;
