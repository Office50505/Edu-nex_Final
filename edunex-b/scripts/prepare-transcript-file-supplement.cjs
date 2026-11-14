// Insert-only file supplement from a verified read-only MongoDB snapshot.
// Existing transcripts, mappings and indexes are compared, never replaced.
const fs=require('node:fs'),path=require('node:path'),{isDeepStrictEqual}=require('node:util');
const D=require('../services/transcriptDataset'),S=require('../services/localTranscriptStore'),F=require('../services/fileTranscriptStore');
const serialize=rows=>rows.map(r=>JSON.stringify(r)).join('\n')+'\n';
async function prepare({snapshotPath,catalogPath,directory=F.SUPPLEMENT,apply=false}){
 const base=D.loadIndex();if(base.error)throw Error(base.error);
 const dataset=D.readDataset(),snapshotBytes=fs.readFileSync(snapshotPath),snapshot=JSON.parse(snapshotBytes),catalog=JSON.parse(fs.readFileSync(catalogPath));
 const fakeDb={databaseName:'verified_snapshot',collection(name){return {find(){return {sort(){return {toArray:async()=>structuredClone(name===S.DOCUMENTS?snapshot.documents:snapshot.chunks)}}}}};}};
 const verified=await S.databaseIndex(fakeDb,catalog.courses),docMap=new Map(dataset.documents.map(r=>[r.id,r])),chunkMap=new Map(dataset.chunks.map(r=>[r.id,r])),conflicts=[];
 const incomingDocs=[],incomingChunks=[];
 for(const row of snapshot.documents){const old=docMap.get(row._id);if(old&&!isDeepStrictEqual(old,row.raw))conflicts.push({id:row._id,reason:'existing_document_differs'});else if(!old)incomingDocs.push(row.raw);}
 for(const row of snapshot.chunks){const old=chunkMap.get(row._id);if(old&&!isDeepStrictEqual(old,row.raw))conflicts.push({id:row._id,reason:'existing_chunk_differs'});else if(!old)incomingChunks.push(row.raw);}
 // Verify the union's natural identities and source URLs before any write.
 const unionManifest={document_count:dataset.documents.length+incomingDocs.length,chunk_count:dataset.chunks.length+incomingChunks.length,chunking:{overlap_segments:Math.max(dataset.manifest.chunking?.overlap_segments||0,...snapshot.documents.map(r=>r.provenance.overlapSegments||0))}};
 try{D.prepareDataset({manifest:unionManifest,documents:[...dataset.documents,...incomingDocs],chunks:[...dataset.chunks,...incomingChunks],hashes:dataset.hashes},catalog);}catch(e){conflicts.push({reason:e.message});}
 const report={mode:apply?'insert-only':'dry-run',baseMappedRecords:base.records.length,verifiedMongoRecords:verified.records.length,
  proposedAddedRecords:incomingChunks.length,inserted:0,skipped:base.records.length,conflicting:conflicts.length,conflicts,missing:0,
  addedDocumentIds:incomingDocs.map(r=>r.id),quarantinedDocuments:base.mappings.filter(m=>m.status==='quarantined').map(m=>m.documentId),overwritten:0,deleted:0};
 if(conflicts.length)return {...report,status:'BLOCKED_CONFLICT'};
 if(!incomingChunks.length)throw Error('No supplement records were identified');
 const manifest={schema_version:1,document_count:incomingDocs.length,chunk_count:incomingChunks.length,chunking:unionManifest.chunking,
  source:'Insert-only supplement of verified local MongoDB records; source text is reference data, never instructions.'};
 const contents={'original/manifest.json':JSON.stringify(manifest,null,2)+'\n','original/documents.jsonl':serialize(incomingDocs),'original/chunks.jsonl':serialize(incomingChunks)};
 const hashes=Object.fromEntries(Object.entries(contents).map(([file,text])=>[path.basename(file),D.sha(text)]));
 const index=D.prepareDataset({manifest,documents:incomingDocs,chunks:incomingChunks,hashes},catalog);
 for(const r of index.records)r.sourceDocument=path.relative(path.resolve(__dirname,'..'),path.join(directory,'original/chunks.jsonl')).split(path.sep).join('/')+'#'+r.chunkId;
 if(index.records.length!==incomingChunks.length||index.mappings.some(m=>m.status!=='mapped'))throw Error('Supplement has unavailable/unverified sources');
 const ids=new Set(incomingChunks.map(c=>c.id));
 contents['index.json']=JSON.stringify(index,null,2)+'\n';
 contents['published-catalog.json']=JSON.stringify(catalog,null,2)+'\n';
 contents['source-provenance.json']=JSON.stringify({snapshotSHA256:D.sha(snapshotBytes),catalogSHA256:D.sha(fs.readFileSync(catalogPath)),
  documents:snapshot.documents.filter(r=>incomingDocs.some(d=>d.id===r._id)).map(r=>({id:r._id,rawHash:r.rawHash,sourceHashes:r.provenance.sourceHashes})),
  chunks:snapshot.chunks.filter(r=>ids.has(r._id)).map(r=>({id:r._id,rawHash:r.rawHash,contentHash:r.record.contentHash,sourceHashes:r.provenance.sourceHashes}))},null,2)+'\n';
 contents['README.md']='# Skillomate transcript supplement\n\nReference data only. This insert-only supplement contains the verified 11 Landing Page and 13 E-commerce transcript lessons. It does not replace or reindex skillomate-rag-v1. Original segment text, lesson IDs, URLs and timestamps are preserved. The base Influencer Lesson 1 quarantine and missing Real Estate sources remain in force.\n';
 const existing=[];
 for(const [name,text]of Object.entries(contents)){const file=path.join(directory,name);if(fs.existsSync(file)){if(!fs.readFileSync(file).equals(Buffer.from(text)))conflicts.push({file:name,reason:'existing_supplement_file_differs',existingSHA256:D.sha(fs.readFileSync(file)),incomingSHA256:D.sha(text)});else existing.push(name);}}
 if(conflicts.length)return {...report,conflicting:conflicts.length,conflicts,status:'BLOCKED_CONFLICT'};
 const indexExists=existing.includes('index.json');
 if(indexExists&&existing.length!==Object.keys(contents).length)return {...report,conflicting:1,conflicts:[{reason:'incomplete_existing_supplement'}],status:'BLOCKED_CONFLICT'};
 if(apply){for(const [name,text]of Object.entries(contents)){if(existing.includes(name))continue;const file=path.join(directory,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text,{flag:'wx'});}}
 const inserted=apply&&!indexExists?index.records.length:0,skipped=base.records.length+(indexExists?index.records.length:0);
 let total=base.records.length;
 if(apply||indexExists){const loaded=D.loadIndex(directory);if(loaded.error)throw Error(loaded.error);const merged=F.mergeIndexes([base,loaded],catalog.courses);total=merged.records.length;
  const available=new Map(merged.records.map(r=>[r.chunkId,r]));for(const r of verified.records){const actual=available.get(r.chunkId);if(!actual||actual.contentHash!==r.contentHash||actual.courseId!==r.courseId||actual.lessonId!==r.lessonId||actual.startSeconds!==r.startSeconds||actual.endSeconds!==r.endSeconds)throw Error('File retrieval does not match verified MongoDB '+r.chunkId);}
 }
 return {...report,status:apply||indexExists?'PASS':'READY_INSERT_ONLY',inserted,skipped,proposedAddedRecords:indexExists?0:index.records.length,mergedRecords:total,missing:apply||indexExists?verified.records.length-total:incomingChunks.length,filesAdded:apply?Object.keys(contents).filter(n=>!existing.includes(n)):[]};
}
if(require.main===module){const args=process.argv.slice(2),value=n=>args[args.indexOf(n)+1];if(!args.includes('--snapshot')||!args.includes('--catalog'))throw Error('Use --snapshot JSON --catalog JSON [--out DIR] [--apply]');prepare({snapshotPath:value('--snapshot'),catalogPath:value('--catalog'),directory:args.includes('--out')?path.resolve(value('--out')):F.SUPPLEMENT,apply:args.includes('--apply')}).then(r=>{console.log(JSON.stringify(r,null,2));if(r.status==='BLOCKED_CONFLICT')process.exitCode=1;}).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={prepare};
