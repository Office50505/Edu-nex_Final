const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const recovery = require('../services/applePurchaseRecovery');
const productId = 'com.skillomate.premium.monthly';
const expired = { entitlementState: 'EXPIRED', entitlementActive: false };
const active = { entitlementState: 'ACTIVE', entitlementActive: true };
// Compact JWS-shaped fixture; the mocked backend below does not authenticate it.
const signedTransaction = 'eyJhbGciOiJFUzI1NiJ9.' + 'a'.repeat(80) + '.' + 'b'.repeat(86);
const purchase = { id: 'old-transaction', productId, purchaseToken: signedTransaction };

test('concurrent callbacks share verification and finishing; failed attempts remain retryable', async () => {
  const verify = recovery.createAppleTransactionVerifier();
  let calls = 0, release;
  const task = async () => { calls++; return new Promise(resolve => { release = resolve; }); };
  const first = verify(purchase, task), second = verify(purchase, task);
  assert.equal(first, second);
  await Promise.resolve();
  release(active);
  assert.equal(await first, active);
  assert.equal(await verify(purchase, task), active);
  assert.equal(calls, 1);
  const retry = recovery.createAppleTransactionVerifier();
  await assert.rejects(retry(purchase, async () => { throw Error('verification unavailable'); }));
  assert.equal(await retry(purchase, async () => active), active);
});

test('recovery verifies expired pending transactions before refresh and ignores unrelated products', async () => {
  const order = [];
  const result = await recovery.recoverApplePurchases({ productId,
    readPending: async () => [purchase, { ...purchase, id: 'other', productId: 'another.product' }],
    verify: async item => { order.push('verify:'+item.id); order.push('finish:'+item.id); return expired; },
    refresh: async () => { order.push('refresh'); return expired; },
  });
  assert.deepEqual(order, ['verify:old-transaction', 'finish:old-transaction', 'refresh']);
  assert.equal(result.entitlement.entitlementActive, false);
});

test('restore includes expired history without publishing duplicate events and deduplicates transactions', async () => {
  let options, calls = 0;
  const result = await recovery.recoverApplePurchases({ productId, includeAvailable: true,
    readPending: async () => [purchase],
    readAvailable: async value => { options = value; return [purchase, {...purchase, id:'renewal'}]; },
    verify: async () => { calls++; return active; }, refresh: async () => active,
  });
  assert.equal(calls, 2);
  assert.deepEqual(options, { onlyIncludeActiveItemsIOS: false, alsoPublishToEventListenerIOS: false });
  assert.equal(result.entitlement, active);
});

test('failed ownership verification stops recovery; pending approval is not finished', async () => {
  let refreshed = false, verified = false;
  await assert.rejects(recovery.recoverApplePurchases({ productId,
    readPending: async () => [purchase], verify: async () => { throw Error('Linked to another account'); },
    refresh: async () => { refreshed = true; },
  }), /another account/);
  assert.equal(refreshed, false);
  const result = await recovery.recoverApplePurchases({ productId,
    readPending: async () => [{...purchase, purchaseState:'pending'}],
    verify: async () => { verified = true; }, refresh: async () => expired,
  });
  assert.equal(result.awaitingApproval, true);
  assert.equal(verified, false);
});

function hookFixture({ pending = [purchase], available = pending, entitlement = expired, verifyError, requestError, onRequest, onVerify } = {}) {
  let callbacks, stateIndex = 0;
  const states = [ { appAccountToken:'test-account' }, false, '', '', 'ready' ];
  const order = [], logs = [];
  const source = fs.readFileSync(require.resolve('../services/useAppleSubscriptions'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export function useAppleSubscriptions', 'function useAppleSubscriptions');
  const context = {
    Platform:{OS:'ios'}, AppState:{}, ...recovery,
    useCallback:fn=>fn, useEffect(){}, useMemo:fn=>fn(), useRef:current=>({current}),
    useState(initial){ const index=stateIndex++; return [states[index] ?? initial, value => {states[index]=typeof value==='function'?value(states[index]):value;}]; },
    ErrorCode:{UserCancelled:'user-cancelled',Pending:'pending',DeferredPayment:'deferred-payment',AlreadyOwned:'already-owned'},
    APPLE_SUBSCRIPTION_PRODUCT_IDS:{monthly:productId},
    recordApplePurchaseError:(stage,error)=>logs.push({stage,error}),
    getPendingTransactionsIOS:async()=>{order.push('pending');return pending;},
    readAvailablePurchases:async()=>{order.push('available');return available;},
    useDeferredIapConnection:options=>{callbacks=options;return {connected:true,subscriptions:[{id:productId}],
      finishTransaction:async()=>order.push('finish'),
      requestPurchase:async()=>{order.push('purchase');await onRequest?.(callbacks);if(requestError)throw requestError;},
    };},
    session:{requestJson:async (path,options)=>{
      if(path.endsWith('/verify')){
        const body=JSON.parse(options.body);
        assert.equal(recovery.isAppleSignedTransaction(body.signedTransaction),true,'Backend must receive compact JWS, never a transaction ID');
        order.push('verify');await onVerify?.(body);if(verifyError)throw verifyError;return entitlement;
      }
      order.push('refresh');return entitlement;
    }},
  };
  vm.runInNewContext(source+'\nresult=useAppleSubscriptions({user:{_id:"learner"},session});',context);
  return { hook:context.result, callbacks:()=>callbacks, states, order, logs };
}

test('Subscribe clears a verified expired unfinished transaction before requesting a new purchase', async () => {
  const f=hookFixture(); await f.hook.purchase();
  assert.deepEqual(f.order,['pending','verify','finish','refresh','purchase']);
});

test('Subscribe does not start another purchase when recovery finds active access or fails verification', async () => {
  const paid=hookFixture({entitlement:active});await paid.hook.purchase();
  assert.equal(paid.order.includes('purchase'),false);
  const rejected=hookFixture({verifyError:Error('Linked to another account')});await rejected.hook.purchase();
  assert.equal(rejected.order.includes('finish'),false);
  assert.equal(rejected.order.includes('purchase'),false);
  assert.match(rejected.states[2],/another account/);
});

test('duplicate and already-owned callbacks recover without displaying the generic purchase error', async () => {
  for(const code of ['duplicate-purchase','already-owned']) {
    const f=hookFixture({entitlement:active});
    f.callbacks().onPurchaseError({code});
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(f.order,['pending','available','verify','finish','refresh']);
    assert.equal(f.states[2],'');assert.equal(f.states[1],false);
    assert.match(f.states[3],/active/);
  }
});

test('rapid Subscribe taps cannot submit two native purchase requests', async () => {
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const f=hookFixture({pending:[],onRequest:()=>gate});
  const first=f.hook.purchase(); await new Promise(resolve=>setImmediate(resolve));
  await f.hook.purchase();release();await first;
  assert.equal(f.order.filter(item=>item==='purchase').length,1);
});

test('duplicate callback during successful verification shares work and releases the purchase lock', async () => {
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const f=hookFixture({entitlement:active,onVerify:()=>gate});
  f.callbacks().onPurchaseSuccess(purchase);
  f.callbacks().onPurchaseError({code:'duplicate-purchase'});
  release();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.order.filter(item=>item==='verify').length,1);
  assert.equal(f.order.filter(item=>item==='finish').length,1);
  assert.equal(f.states[1],false);assert.equal(f.states[2],'');
});

test('pending approval blocks another charge and cancellation unlocks checkout', async () => {
  const pending=hookFixture({pending:[{...purchase,purchaseState:'pending'}]});
  await pending.hook.purchase();
  assert.equal(pending.order.includes('purchase'),false);
  assert.equal(pending.order.includes('finish'),false);
  assert.match(pending.states[3],/pending approval/);
  const cancelled=hookFixture({pending:[],requestError:{code:'user-cancelled'}});
  await cancelled.hook.purchase();
  assert.equal(cancelled.states[1],false);assert.equal(cancelled.states[2],'');
  assert.match(cancelled.states[3],/cancelled/);
});

test('duplicate errors delivered through both callback and request rejection do not leave checkout busy', async () => {
  const error={code:'duplicate-purchase'};
  const f=hookFixture({requestError:error,onRequest:callbacks=>callbacks.onPurchaseError(error)});
  await f.hook.purchase();
  assert.equal(f.order.filter(item=>item==='finish').length,1);
  assert.equal(f.states[1],false);assert.equal(f.states[2],'');
});

test('native pending transaction ID is replaced by the same transaction’s JWS before backend verification', async () => {
  let submitted;
  const snapshot={...purchase,purchaseToken:'2000001234567890'};
  const f=hookFixture({pending:[snapshot],available:[purchase],onVerify:body=>{submitted=body.signedTransaction;}});
  await f.hook.purchase();
  assert.equal(submitted,signedTransaction);
  assert.deepEqual(f.order,['pending','available','verify','finish','refresh','purchase']);
});

test('recovery never verifies or finishes an ID-only transaction when its signed history is absent', async () => {
  const f=hookFixture({pending:[{...purchase,purchaseToken:'2000001234567890'}],available:[]});
  await f.hook.purchase();
  assert.equal(f.order.includes('verify'),false);
  assert.equal(f.order.includes('finish'),false);
  assert.equal(f.order.includes('purchase'),false);
  assert.match(f.states[2],/signed data/);
});

test('signed-data fallback cannot substitute another transaction or product', async () => {
  const snapshot={...purchase,purchaseToken:purchase.id};
  for (const wrong of [{...purchase,id:'another-transaction'}, {...purchase,productId:'another.product'}]) {
    await assert.rejects(recovery.resolveAppleSignedPurchase(snapshot,async()=>[wrong]),/signed data/);
  }
  for (const token of [null,'1234567890123456','a'.repeat(150),'aaa.bbb.ccc']) {
    assert.equal(recovery.isAppleSignedTransaction(token),false);
  }
});

test('direct purchase callbacks also recover ID-only snapshots without sending IDs to the backend', async () => {
  const f=hookFixture({available:[purchase]});
  f.callbacks().onPurchaseSuccess({...purchase,purchaseToken:'2000001234567890'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.order,['available','verify','finish']);
  assert.equal(f.states[2],'');
});

test('multiple pending snapshots use one history read and each keeps its own signed data', async () => {
  const second={...purchase,id:'another-transaction',purchaseToken:signedTransaction.replace(/b/g,'c')};
  const submitted=[];let historyReads=0;
  await recovery.recoverApplePurchases({productId,
    readPending:async()=>[{...purchase,purchaseToken:purchase.id},{...second,purchaseToken:second.id}],
    readAvailable:async()=>{historyReads++;return [second,purchase];},
    verify:async item=>submitted.push([item.id,item.purchaseToken]),refresh:async()=>expired,
  });
  assert.equal(historyReads,1);
  assert.deepEqual(submitted,[[purchase.id,purchase.purchaseToken],[second.id,second.purchaseToken]]);
});
