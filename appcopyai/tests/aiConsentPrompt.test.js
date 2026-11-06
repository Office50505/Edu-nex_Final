const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../services/aiConsentPrompt.js'),'utf8')
  .replace(/^import .*;\n/gm,'').replace(/export /g,'');
function fixture(granted=false) {
  const alerts=[],links=[],writes=[];
  const state={granted,disclosure:'Full synthetic privacy disclosure'};
  const c={Alert:{alert:(...args)=>alerts.push(args)},Linking:{openURL:async url=>links.push(url)},
    readAiConsent:async()=>state,saveAiConsent:async value=>writes.push(value)};
  vm.createContext(c);vm.runInContext(source,c);
  return {c,alerts,links,writes};
}
test('native disclosure requires an explicit Allow AI tap',async()=>{
  for(const choice of ['Not now','Allow AI','dismiss','Privacy policy']) {
    const f=fixture();const pending=f.c.askAiConsent({disclosure:'Full synthetic privacy disclosure'});
    const [title,text,buttons,options]=f.alerts[0];
    assert.equal(title,'Allow AI data sharing?');assert.equal(text,'Full synthetic privacy disclosure');
    if(choice==='dismiss')options.onDismiss();else buttons.find(x=>x.text===choice).onPress();
    assert.equal(await pending,choice==='Allow AI');
    assert.equal(f.links.length,choice==='Privacy policy'?1:0);
  }
});
test('data controls can withdraw permission and report success only after persistence',async()=>{
  const f=fixture(true);const pending=f.c.manageAiConsent({session:{},user:{}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.writes.length,0);
  f.alerts[0][2].find(x=>x.text==='Withdraw permission').onPress();
  await pending;assert.equal(f.writes[0].granted,false);
  assert.equal(f.alerts[1][0],'AI data sharing off');
});
test('keeping permission or dismissing controls does not change the record',async()=>{
  for(const dismiss of [false,true]) {
    const f=fixture(true);const pending=f.c.manageAiConsent({session:{},user:{}});
    await new Promise(resolve=>setImmediate(resolve));
    if(dismiss)f.alerts[0][3].onDismiss();else f.alerts[0][2][0].onPress();
    await pending;assert.equal(f.writes.length,0);
  }
});
