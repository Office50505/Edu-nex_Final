'use strict';
// Observation only for fixture-based tests; do not load in application servers.
const Module=require('node:module'),fs=require('node:fs'),path=require('node:path');
const originalLoad=Module._load;const calls=[];const mark=Symbol('phase14a-provider-observed');
Module._load=function(name,parent,isMain){
 const value=originalLoad.call(this,name,parent,isMain);
 if(value&&typeof value.requestTutorProvider==='function'&&!value[mark]){
  const original=value.requestTutorProvider;
  value.requestTutorProvider=async function(options){
   const call={index:calls.length+1,customFetchProvided:typeof options.fetchImpl==='function',status:'started',attempts:[]};calls.push(call);
   try{const result=await original.call(this,options);call.status=result.diagnostics.status;call.attempts=result.diagnostics.attempts;return result;}
   catch(error){call.status=error.code||error.name;call.attempts=error.diagnostics?.attempts||[];throw error;}
  };
  Object.defineProperty(value,mark,{value:true});
 }
 return value;
};
process.on('exit',()=>{
 const dir=process.env.PHASE14A_PROVIDER_EVIDENCE;
 if(dir)fs.writeFileSync(path.join(dir,'provider-process-'+process.pid+'.json'),JSON.stringify({pid:process.pid,method:'Provider adapter invocations in tests with external networking denied; custom fetch functions are injected fixtures',adapterInvocations:calls.length,transportAttempts:calls.reduce((n,c)=>n+c.attempts.length,0),calls},null,2)+'\n');
});
