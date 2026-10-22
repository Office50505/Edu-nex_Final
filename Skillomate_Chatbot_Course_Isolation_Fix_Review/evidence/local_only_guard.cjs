'use strict';
// Explicit safer alternative after approval rejection: no external requests, no model fixtures.
const deny=()=>{const error=new Error('External provider payload is not authorized; no network request sent');error.code='PROVIDER_PAYLOAD_NOT_APPROVED';throw error};
const originalFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>{
 const address=new URL(String(url));
 if(address.protocol!=='http:'||address.hostname!=='127.0.0.1')return Promise.reject(Object.assign(new Error('External provider payload is not authorized; no network request sent'),{code:'PROVIDER_PAYLOAD_NOT_APPROVED'}));
 return originalFetch(url,options);
};
for(const moduleName of ['node:http','node:https']){
 const module=require(moduleName);module.request=deny;module.get=deny;
}
const net=require('node:net'),connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
 const normalized=Array.isArray(args[0])?args[0]:args;
 const options=normalized[0];
 const host=typeof options==='object'&&!Array.isArray(options)?options.host:typeof normalized[1]==='string'?normalized[1]:null;
 if(host!=='127.0.0.1')return deny();
 return connect.apply(this,args);
};
