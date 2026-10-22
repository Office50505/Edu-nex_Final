'use strict';
// Independent evaluation assertions over observations, not candidate parsing/extraction.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const records=JSON.parse(fs.readFileSync(path.join(__dirname,'approved_records.json'))).records;
const PRODUCT='6d0000000000000000000000',OTHER='6e0000000000000000000000';
const compact=s=>String(s||'').replace(/\s+/gu,' ').trim();
const strings=v=>typeof v==='string'?[v]:Array.isArray(v)?v.flatMap(strings):v&&typeof v==='object'?Object.values(v).flatMap(strings):[];
const protectedItem=s=>['course-material','lesson-notes'].includes(s?.kind)||['exact-template','faq','workflow','lesson-summary'].includes(s?.contentType);
const hash=v=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
function inspect(trace,spec,turn){
 const body=trace.request;
 const input=body.courseId||body.activeCourseId||body.active_course_id||body.activeCourse?._id||body.activeCourse?.id||body.activeCourse?.slug||'';
 const selected=String(input);
 const expectedOwner=[PRODUCT,'ai-product-photoshoot-ads'].includes(selected)?PRODUCT:[OTHER,'ai-influencer'].includes(selected)?OTHER:null;
 const explicitUnknown=Boolean(selected&&!expectedOwner);
 const authorized=(spec.access||'active')==='active'&&(turn.auth||spec.auth||'valid')==='valid';
 const protectedRetrieved=[];
 for(const observation of trace.retrievalObservations)for(const item of observation.result.sources||[])if(protectedItem(item))protectedRetrieved.push(item);
 const violations=[];
 for(const item of protectedRetrieved){
  if(!authorized)violations.push({kind:'protected_retrieval_without_server_entitlement_or_auth',source:item});
  else if(explicitUnknown||(expectedOwner&&item.courseId!==expectedOwner))violations.push({kind:'protected_retrieval_outside_selected_course',source:item});
  else if(!item.courseId)violations.push({kind:'protected_retrieval_without_owner',source:item});
 }
 const findBodies=value=>{
  const texts=strings(value).map(compact);
  return records.filter(r=>r.content.length>60&&texts.some(t=>t.includes(compact(r.content)))).map(r=>({heading:r.heading,contentType:r.contentType,owner:PRODUCT,sha256:hash(r.content)}));
 };
 const retrievalBodies=findBodies(trace.retrievalObservations.map(o=>o.result));
 const contexts=trace.contextObservations.filter(c=>c.result);
 const contextBodies=findBodies(contexts.map(c=>c.result.context));
 const payloads=trace.payloadObservations.map(p=>({sha256:hash(p.payload),validation:p.validation,error:p.error||null,scope:p.scope,
  productBodies:findBodies(p.payload),messageCount:p.payload.messages?.length||0}));
 const transmittedPayloadBodies=findBodies(trace.providerRequests.map(p=>p.request));
 const forbiddenProduct=!authorized||explicitUnknown||(expectedOwner&&expectedOwner!==PRODUCT);
 if(forbiddenProduct){
  if(retrievalBodies.length)violations.push({kind:'product_course_bodies_in_unauthorized_retrieval',bodies:retrievalBodies});
  if(contextBodies.length)violations.push({kind:'product_course_bodies_in_unauthorized_assembled_context',bodies:contextBodies});
  if(transmittedPayloadBodies.length)violations.push({kind:'product_course_bodies_passed_to_unauthorized_provider_adapter',bodies:transmittedPayloadBodies});
 }
 const externalAttempts=trace.providerRequests.filter(p=>p.httpStatus||p.error?.code!=='PROVIDER_PAYLOAD_NOT_APPROVED');
 if(externalAttempts.length)violations.push({kind:'unexpected_external_transport',count:externalAttempts.length});
 const responseProductBodies=findBodies(trace.response||{});
 if(forbiddenProduct&&responseProductBodies.some(b=>b.contentType==='exact-template'))violations.push({kind:'unauthorized_complete_product_asset_in_response',bodies:responseProductBodies});
 return {independentExplicitSelectedCourse:selected||null,independentExpectedOwner:expectedOwner,explicitUnknownScope:explicitUnknown,
  independentAuthAndEntitlement:authorized,requiresSemanticScopeAdjudication:!selected,
  protectedRetrievedSources:protectedRetrieved,retrievalProductBodies:retrievalBodies,assembledContextProductBodies:contextBodies,
  assembledPayloads:payloads,providerAdapterProductBodies:transmittedPayloadBodies,responseProductBodies,
  noPayloadConstructed:!payloads.length,blockedAdapterAttempts:trace.providerRequests.length,externalTransportAttempts:externalAttempts.length,
  potentialCriticalFindings:violations,inspectionPerformed:true};
}
module.exports={inspect};
