// Executes focused UI test actions through the development app's live handlers.
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const req = createRequire(path.resolve(__dirname, '../../appcopyai/package.json'));
const WebSocket = req('ws');
async function main() {
  const source = fs.readFileSync(process.argv[2], 'utf8');
  const list = await (await fetch('http://localhost:8081/json/list')).json();
  const target = list.find(item => item.appId === 'com.alihussainkhan.skillomate.dev');
  if (!target) throw Error('No Skillomate development app connected');
  const ws = new WebSocket(target.webSocketDebuggerUrl.replace('localhost:8081', '[::1]:8081'), { origin: 'http://127.0.0.1:8081' });
  const marker = 'SKILLOMATE_LOCAL_UI_RETEST_' + require('node:crypto').randomUUID();
  const timer = setTimeout(() => { console.error('UI action timed out'); ws.close(); process.exitCode = 1; }, 15000);
  ws.on('open', () => {
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
    ws.send(JSON.stringify({ id: 2, method: 'Runtime.evaluate', params: { expression:
      `Promise.resolve().then(()=>{if(process.env.EXPO_PUBLIC_API_BASE!=='http://127.0.0.1:3129')throw Error('Refusing nonlocal API target');return (${source});}).then(value=>console.info('${marker}',JSON.stringify({ok:true,value}))).catch(error=>console.info('${marker}',JSON.stringify({ok:false,error:String(error.message)})))` } }));
  });
  ws.on('message', event => {
    const message = JSON.parse(String(event));
    if (message.method !== 'Runtime.consoleAPICalled' || message.params?.args?.[0]?.value !== marker) return;
    clearTimeout(timer);
    const result = JSON.parse(message.params.args[1].value);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    ws.close();
  });
  ws.on('error', error => { clearTimeout(timer); console.error(error.message); process.exitCode = 1; });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
