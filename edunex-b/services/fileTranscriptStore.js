// Compose immutable transcript packs. Existing source records always keep
// their original bytes/provenance; conflicting additions fail closed.
const fs=require('node:fs'),path=require('node:path'),{isDeepStrictEqual}=require('node:util');
const D=require('./transcriptDataset');
const SUPPLEMENT=path.resolve(__dirname,'../transcripts/skillomate-rag-supplement-v1');
let cached;
const identity=r=>Object.fromEntries(['courseId','courseSlug','lessonId','mediaId','videoId','documentId','originalSourceUrl','contentHash','originalTextHash','startSeconds','endSeconds','segmentStartIndex','segmentEndIndex'].map(k=>[k,r[k]]));
function mergeIndexes(indexes,courses=[]){
 const records=[],mappings=[],aliases={},chunks=new Map(),documents=new Map(),media=new Map(),intervals=new Map();let skipped=0;
 for(const index of indexes){
  if(index.error)throw Error(index.error);
  for(const m of index.mappings){
   const old=documents.get(m.documentId);
   if(old){if(!isDeepStrictEqual(old,m))throw Error('Conflicting transcript mapping: '+m.documentId);continue;}
   const key=m.status==='mapped'?m.courseId+':'+m.lessonId:null;
   if(key&&media.has(key)&&media.get(key)!==m.documentId)throw Error('Duplicate transcript lesson identity: '+key);
   if(key)media.set(key,m.documentId);documents.set(m.documentId,m);mappings.push(m);
  }
  for(const r of index.records){
   const old=chunks.get(r.chunkId),key=r.courseId+':'+r.lessonId+':'+r.startSeconds+':'+r.endSeconds;
   if(old){if(!isDeepStrictEqual(identity(old),identity(r))||old.content!==r.content)throw Error('Conflicting transcript chunk: '+r.chunkId);skipped++;continue;}
   if(intervals.has(key))throw Error('Duplicate transcript chunk interval: '+key);
   if(documents.get(r.documentId)?.status!=='mapped')throw Error('Quarantined transcript indexed: '+r.chunkId);
   chunks.set(r.chunkId,r);intervals.set(key,r.chunkId);records.push(r);
  }
  for(const [alias,id]of Object.entries(index.courseAliases)){if(aliases[alias]&&aliases[alias]!==id)throw Error('Conflicting transcript alias: '+alias);aliases[alias]=id;}
 }
 const missing=courses.flatMap(c=>(c.videos||[]).map(v=>({courseId:String(c._id),courseName:c.title,videoId:String(v._id||v.id),lessonName:v.title})))
   .filter(v=>!mappings.some(m=>m.status==='mapped'&&m.courseId===v.courseId&&m.videoId===v.videoId));
 return {...indexes[0],records,mappings,courseAliases:aliases,fileSources:indexes.map(i=>i.sourceHashes),
  audit:{...indexes[0].audit,documents:mappings.length,mappedDocuments:mappings.filter(m=>m.status==='mapped').length,
   chunks:indexes.reduce((n,i)=>n+(i.audit?.chunks||0),0),indexedChunks:records.length,duplicateChunks:0,skippedIdenticalRecords:skipped,
   missingPublishedLessons:missing,warnings:indexes.flatMap(i=>i.audit?.warnings||[])}};
}
function loadFileTranscriptIndex(courses=[],{baseDirectory=D.ROOT,supplementDirectory=SUPPLEMENT}={}){
 try{
  const directories=[baseDirectory,supplementDirectory];
  const version=directories.flatMap(dir=>['index.json','original/manifest.json','original/documents.jsonl','original/chunks.jsonl'].map(name=>{
   const f=path.join(dir,name),s=fs.statSync(f);return f+':'+s.size+':'+s.mtimeMs;
  })).join('|');
  if(!cached||cached.version!==version){const indexes=directories.map(dir=>D.loadIndex(dir));for(const i of indexes)if(i.error)throw Error(i.error);cached={version,indexes};}
  return mergeIndexes(cached.indexes,courses);
 }catch(error){const base=D.loadIndex(baseDirectory);return {records:[],mappings:(base.mappings||[]).filter(m=>m.status==='quarantined'),courseAliases:{},error:'Transcript file fallback invalid: '+error.message};}
}
module.exports={SUPPLEMENT,mergeIndexes,loadFileTranscriptIndex};
