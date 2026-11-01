import fs from 'node:fs/promises';

const instruments = [
  ['AAPL','AAPLUSDT'],['MSFT','MSFTUSDT'],['GOOGL','GOOGLUSDT'],['AMZN','AMZNUSDT'],
  ['NVDA','NVDAUSDT'],['TSLA','TSLAUSDT'],['META','METAUSDT'],['INTC','INTCUSDT'],
  ['QCOM','QCOMUSDT'],['AMD','AMDUSDT'],['TSM','TSMUSDT'],['AVGO','AVGOUSDT'],
  ['ORCL','ORCLUSDT'],['ARM','ARMUSDT'],['MU','MUUSDT'],['ASML','ASMLUSDT'],
  ['SNDK','SNDKUSDT'],['SKHYNIX','SKHYUSDT'],['MRVL','MRVLUSDT'],['GLW','GLWUSDT'],
  ['HOOD','HOODUSDT'],['CBRS','CBRSUSDT'],['SPCX','SPCXUSDT'],['BTC','BTCUSDT'],
  ['HYPE','HYPEUSDT'],['XAU','XAUUSDT'],['CL','CLUSDT']
];
const base = 'https://api.bitget.com/api/v2/mix/market';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function get(path, params) {
  const url = new URL(base + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  const body = await response.json();
  if (!response.ok || body.code !== '00000' || !Array.isArray(body.data)) {
    throw new Error(`HTTP ${response.status}; code=${body.code}; msg=${body.msg || ''}`);
  }
  return body.data;
}
const iso = ms => ms ? new Date(ms).toISOString() : null;
const results = [];
for (const [name, symbol] of instruments) {
  const row = { name, symbol, latestStatus: 'FAIL', historyStatus: 'FAIL', paginationStatus: 'FAIL' };
  try {
    const latest = await get('/candles', { symbol, productType: 'USDT-FUTURES', granularity: '4H', limit: '2' });
    row.latestCount = latest.length;
    row.latestNewest = iso(Number(latest[0]?.[0]));
    row.latestOldest = iso(Number(latest.at(-1)?.[0]));
    if (!latest.length) throw new Error('Latest endpoint returned no candles');
    row.latestStatus = 'PASS';
  } catch (error) { row.latestError = String(error.message || error); }
  try {
    const first = await get('/history-candles', { symbol, productType: 'USDT-FUTURES', granularity: '4H', limit: '200' });
    row.historyPage1Count = first.length;
    row.historyNewest = iso(Number(first[0]?.[0]));
    row.historyOldest = iso(Number(first.at(-1)?.[0]));
    if (!first.length) throw new Error('History endpoint returned no candles');
    row.historyStatus = 'PASS';
    const oldest = Math.min(...first.map(c => Number(c[0])));
    const second = await get('/history-candles', {
      symbol, productType: 'USDT-FUTURES', granularity: '4H', limit: '200',
      endTime: String(oldest - 1)
    });
    row.historyPage2Count = second.length;
    const secondOldest = second.length ? Math.min(...second.map(c => Number(c[0]))) : null;
    const secondNewest = second.length ? Math.max(...second.map(c => Number(c[0]))) : null;
    row.page2Newest = iso(secondNewest);
    row.page2Oldest = iso(secondOldest);
    row.paginationStatus = !second.length || secondNewest < oldest ? 'PASS' : 'FAIL';
    if (row.paginationStatus === 'FAIL') row.paginationError = 'Second page did not move strictly older than page 1';
  } catch (error) { row.historyError = String(error.message || error); }
  results.push(row);
  console.log(JSON.stringify(row));
  await pause(120);
}
const summary = {
  testedAt: new Date().toISOString(),
  total: results.length,
  latestPass: results.filter(x => x.latestStatus === 'PASS').length,
  historyPass: results.filter(x => x.historyStatus === 'PASS').length,
  paginationPass: results.filter(x => x.paginationStatus === 'PASS').length,
  failures: results.filter(x => x.latestStatus !== 'PASS' || x.historyStatus !== 'PASS' || x.paginationStatus !== 'PASS'),
  results
};
await fs.mkdir('artifacts', { recursive: true });
await fs.writeFile('artifacts/bitget-kline-pool-test.json', JSON.stringify(summary, null, 2));
const lines = [
  '# Bitget 27-instrument 4H K-line API test',
  '',
  `Tested at: ${summary.testedAt}`,
  `Summary: latest ${summary.latestPass}/27; history ${summary.historyPass}/27; pagination ${summary.paginationPass}/27`,
  '',
  '| Instrument | Contract | Latest | Latest bars | History | Page 1 bars | Page 2 bars | Pagination |',
  '|---|---|---:|---:|---:|---:|---:|---:|',
  ...results.map(x => `| ${x.name} | ${x.symbol} | ${x.latestStatus} | ${x.latestCount ?? 0} | ${x.historyStatus} | ${x.historyPage1Count ?? 0} | ${x.historyPage2Count ?? 0} | ${x.paginationStatus} |`),
  '',
  'This test checks the live 4H latest/history endpoints and one backward pagination step per contract. It does not claim to download each contract\'s entire lifetime of history.'
];
await fs.writeFile('artifacts/bitget-kline-pool-test.md', lines.join('\n'));
if (summary.latestPass !== 27 || summary.historyPass !== 27 || summary.paginationPass !== 27) process.exitCode = 1;
