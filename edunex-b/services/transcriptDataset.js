// Dataset data and its README are untrusted reference material, never commands.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../transcripts/skillomate-rag-v1');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const norm=value=>String(value || '').replace(/\s+/gu,' ').trim();
const fail=message=>{throw new Error('Transcript dataset: '+message);};
const timestamp=value=>{
  if(!/^\d{2}:\d{2}:\d{2}\.\d{3}$/u.test(value || ''))return NaN;
  const [h,m,s]=value.split(':').map(Number);return m<60&&s<60?h*3600+m*60+s:NaN;
};
function readDataset(directory=ROOT){
  const hashes={},read=name=>{const bytes=fs.readFileSync(path.join(directory,'original',name));hashes[name]=sha(bytes);return bytes.toString('utf8');};
  const manifest=JSON.parse(read('manifest.json'));
  const rows=name=>read(name).split('\n').filter(s=>s.trim()).map(JSON.parse);
  const documents=rows('documents.jsonl'),chunks=rows('chunks.jsonl');
  return {manifest,documents,chunks,hashes};
}
function prepareDataset(dataset,catalog){
  const {manifest,documents,chunks,hashes}=dataset;
  if(manifest.document_count!==documents.length || manifest.chunk_count!==chunks.length)fail('manifest counts disagree');
  const unique=(rows,key,label)=>{const seen=new Set();for(const row of rows){if(!row[key] || seen.has(row[key]))fail('duplicate/missing '+label);seen.add(row[key]);}};
  unique(documents,'id','document ID');unique(documents,'lesson_key','lesson key');unique(chunks,'id','chunk ID');unique(chunks,'content_sha256','chunk content hash');
  unique(documents,'source_url','document media URL');
  const published=catalog.courses.filter(c=>c.status==='published');
  unique(published,'_id','published course ID');unique(published,'slug','published course slug');
  const lookup=new Map(documents.map(d=>[d.id,d]));
  const grouped=new Map(documents.map(d=>[d.id,[]]));
  for(const c of chunks){
    const d=lookup.get(c.document_id),m=c.metadata;
    if(!d || !m)fail('orphan chunk '+c.id);
    if(sha(c.retrieval_text)!==c.content_sha256)fail('retrieval content hash mismatch '+c.id);
    if(!c.text?.trim() || !c.original_text?.trim())fail('empty chunk '+c.id);
    for(const key of ['course','lesson_number','lesson_key','source_url','original_filename'])if(m[key]!==d[key])fail('inconsistent '+key+' '+c.id);
    if(!Number.isFinite(m.start_seconds)||!Number.isFinite(m.end_seconds)||m.start_seconds<0||m.end_seconds<=m.start_seconds
      ||Math.abs(timestamp(m.start_timestamp)-m.start_seconds)>0.001||Math.abs(timestamp(m.end_timestamp)-m.end_seconds)>0.001
      ||!Number.isFinite(timestamp(m.start_timestamp))||!Number.isFinite(timestamp(m.end_timestamp)))fail('invalid timestamps '+c.id);
    if(!Number.isInteger(m.segment_start_index)||!Number.isInteger(m.segment_end_index)||m.segment_start_index<1||m.segment_end_index<m.segment_start_index||m.segment_end_index>d.segment_count)fail('invalid segment bounds '+c.id);
    const original=d.original_text.split('\n').slice(m.segment_start_index-1,m.segment_end_index).join(' ');
    if(norm(original)!==norm(c.original_text))fail('chunk does not preserve original segments '+c.id);
    if(m.start_seconds<d.start_seconds||m.end_seconds>d.end_seconds)fail('chunk outside document time range '+c.id);
    grouped.get(d.id).push(c);
  }
  const mappings=[],records=[],aliases=new Map(),warnings=[];
  // Identity is proven by an exact stored media URL. Titles and lesson numbers
  // may corroborate it, but never authorize a different source video.
  for(const d of documents){
    if(!Number.isInteger(d.lesson_number)||d.lesson_number<1||!Number.isInteger(d.segment_count)||d.segment_count<1
      ||!d.original_text?.trim()||!d.hinglish_text?.trim()||d.original_text.split('\n').length!==d.segment_count
      ||!Number.isFinite(d.start_seconds)||!Number.isFinite(d.end_seconds)||d.start_seconds<0||d.end_seconds<=d.start_seconds)fail('invalid document '+d.id);
    const cs=grouped.get(d.id).sort((a,b)=>a.metadata.chunk_index-b.metadata.chunk_index);
    if(!cs.length)fail('document has no chunks '+d.id);
    let covered=0,lastStart=-1,lastEnd=-1;
    for(let i=0;i<cs.length;i++){
      const m=cs[i].metadata;
      if(m.chunk_index!==i+1||m.segment_start_index>covered+1||m.segment_end_index<=covered
        ||m.start_seconds<lastStart||m.end_seconds<=lastEnd)fail('incomplete or unordered segment coverage '+d.id);
      const overlap=covered?covered-m.segment_start_index+1:0;
      if(overlap>(manifest.chunking?.overlap_segments ?? 0))fail('excess segment duplication '+d.id);
      covered=m.segment_end_index;lastStart=m.start_seconds;lastEnd=m.end_seconds;
    }
    if(covered!==d.segment_count||cs[0].metadata.start_seconds!==d.start_seconds||cs.at(-1).metadata.end_seconds!==d.end_seconds)fail('incomplete document coverage '+d.id);
    const matches=published.flatMap(course=>(course.videos || []).filter(v=>v.videoUrl===d.source_url).map(video=>({course,video})));
    const mapping={documentId:d.id,datasetCourse:d.course,datasetLessonNumber:d.lesson_number,originalSourceUrl:d.source_url,
      documentHash:sha(JSON.stringify(d)),originalTextHash:sha(d.original_text),chunkIds:cs.map(c=>c.id),status:'quarantined'};
    if(matches.length!==1){mapping.reason=matches.length?'ambiguous_source_url':'source_video_not_published';mappings.push(mapping);continue;}
    const {course,video}=matches[0],duration=Number(video.duration || 0);
    if(Number(video.order)!==d.lesson_number){mapping.reason='published_lesson_order_mismatch';mappings.push(mapping);continue;}
    if(duration>0 && d.end_seconds>duration+0.05){mapping.reason='transcript_exceeds_published_video_duration';mappings.push(mapping);continue;}
    const coverageWarnings=[];
    if(!duration)coverageWarnings.push('video_duration_unknown');
    if(d.start_seconds>5)coverageWarnings.push('late_transcript_start');
    if(duration>0&&duration-d.end_seconds>5)coverageWarnings.push('transcript_ends_before_video');
    const lessonRows=(catalog.lessons || []).filter(l=>String(l.course)===String(course._id)&&String(l.videoId)===String(video._id));
    Object.assign(mapping,{status:'mapped',courseId:String(course._id),courseSlug:course.slug,courseName:course.title,
      lessonId:String(video._id),videoId:String(video._id),lessonDocumentId:lessonRows.length===1?String(lessonRows[0]._id):null,
      lessonIdentity:'published embedded video ID (canonical lesson ID used by the player)',lessonName:video.title,
      lessonNumber:Number(video.order),durationSeconds:duration || null,startSeconds:d.start_seconds,endSeconds:d.end_seconds,
      segmentCount:d.segment_count,allDatasetSegmentsCovered:true,coverageWarnings,automated:true,hinglishSource:d.hinglish_source});
    const owners=aliases.get(d.course)||new Set();owners.add(mapping.courseId);aliases.set(d.course,owners);
    if(coverageWarnings.length)warnings.push({documentId:d.id,warnings:coverageWarnings});
    mappings.push(mapping);
    for(const c of cs){
      const content=c.text+'\n\nOriginal transcript:\n'+c.original_text,m=c.metadata;
      records.push({courseId:mapping.courseId,courseSlug:course.slug,courseName:course.title,lessonId:mapping.lessonId,
        mediaId:mapping.videoId,videoId:mapping.videoId,lessonName:video.title,lessonNumber:Number(video.order),
        kind:'course-material',contentType:'transcript',sourceType:'transcript',chunkId:c.id,documentId:d.id,
        heading:video.title+' — '+m.start_timestamp+'–'+m.end_timestamp,
        sourceDocument:'transcripts/skillomate-rag-v1/original/chunks.jsonl#'+c.id,
        content,contentHash:sha(content),sourceHash:hashes['chunks.jsonl'],originalTextHash:sha(c.original_text),
        retrievalText:c.retrieval_text,originalText:c.original_text,hinglishText:c.text,originalSourceUrl:d.source_url,
        startSeconds:m.start_seconds,endSeconds:m.end_seconds,segmentStartIndex:m.segment_start_index,segmentEndIndex:m.segment_end_index,
        automated:true,timestampGranularity:'chunk',coverageWarnings,hinglishSource:d.hinglish_source});
    }
  }
  for(const [alias,owners]of aliases)if(owners.size!==1)fail('dataset course spans multiple published owners '+alias);
  // Record a possible lesson owner for audit only; quarantined text is never
  // indexed merely because an ordered lesson with a similar name exists.
  for(const mapping of mappings.filter(m=>m.status==='quarantined')){
    const owner=[...(aliases.get(mapping.datasetCourse)||[])][0];
    const course=published.find(c=>String(c._id)===owner),video=course?.videos.find(v=>Number(v.order)===mapping.datasetLessonNumber);
    if(video)mapping.candidate={courseId:owner,videoId:String(video._id),lessonName:video.title,publishedSourceUrl:video.videoUrl,durationSeconds:video.duration};
  }
  const expected=published.flatMap(c=>(c.videos || []).map(v=>({courseId:String(c._id),courseName:c.title,videoId:String(v._id),lessonName:v.title})))
    .filter(v=>!mappings.some(m=>m.status==='mapped'&&m.videoId===v.videoId&&m.courseId===v.courseId));
  return {schemaVersion:1,sourceHashes:hashes,catalogHash:sha(JSON.stringify(catalog)),courseAliases:Object.fromEntries([...aliases].map(([a,o])=>[a,[...o][0]])),
    mappings,records,audit:{documents:documents.length,chunks:chunks.length,mappedDocuments:mappings.filter(m=>m.status==='mapped').length,indexedChunks:records.length,
      duplicateChunks:0,originalSegments:documents.reduce((s,d)=>s+d.segment_count,0),allDatasetSegmentsCovered:true,warnings,missingPublishedLessons:expected,
      limitations:['Automated transcripts and rendered Hinglish are unreviewed.','Timestamps locate whole chunks; individual word/segment times are not provided.','Complete dataset segment coverage does not prove complete spoken content or coverage of silent video frames.']}};
}
let cached;
function loadIndex(directory=ROOT){
  try{
    const names=['index.json','original/manifest.json','original/documents.jsonl','original/chunks.jsonl'];
    const version=names.map(n=>{const s=fs.statSync(path.join(directory,n));return s.size+':'+s.mtimeMs;}).join('|');
    if(cached?.directory===directory&&cached.version===version)return cached.index;
    const index=JSON.parse(fs.readFileSync(path.join(directory,'index.json'),'utf8'));
    if(index.schemaVersion!==1)fail('unsupported index schema');
    for(const [name,hash]of Object.entries(index.sourceHashes))if(sha(fs.readFileSync(path.join(directory,'original',name)))!==hash)fail('original source integrity mismatch');
    const dataset=readDataset(directory),documents=new Map(dataset.documents.map(d=>[d.id,d])),chunks=new Map(dataset.chunks.map(c=>[c.id,c])),seen=new Set();
    for(const r of index.records){
      const chunk=chunks.get(r.chunkId),doc=documents.get(r.documentId);
      if(seen.has(r.chunkId)||!chunk||!doc||chunk.document_id!==doc.id||r.originalSourceUrl!==doc.source_url
        ||r.content!==chunk.text+'\n\nOriginal transcript:\n'+chunk.original_text||sha(r.content)!==r.contentHash
        ||r.originalText!==chunk.original_text||r.hinglishText!==chunk.text||r.retrievalText!==chunk.retrieval_text
        ||r.originalTextHash!==sha(chunk.original_text)||r.sourceHash!==index.sourceHashes['chunks.jsonl']
        ||r.lessonNumber!==doc.lesson_number||r.startSeconds!==chunk.metadata.start_seconds||r.endSeconds!==chunk.metadata.end_seconds)fail('indexed content/provenance integrity mismatch');
      seen.add(r.chunkId);
    }
    for(const [alias,owner]of Object.entries(index.courseAliases))if(!index.records.some(r=>r.courseId===owner&&documents.get(r.documentId)?.course===alias))fail('course alias provenance mismatch');
    cached={directory,version,index};return index;
  }catch(error){return {records:[],mappings:[],courseAliases:{},error:error.message};}
}
function bindRecords(index,courses){
  return index.records.filter(r=>{
    const owners=courses.filter(c=>String(c._id)===r.courseId&&c.slug===r.courseSlug&&c.status==='published');
    const videos=owners.length===1?(owners[0].videos || []).filter(v=>String(v._id)===r.mediaId&&Number(v.order)===r.lessonNumber&&v.videoUrl===r.originalSourceUrl):[];
    return videos.length===1&&(!(Number(videos[0].duration)>0)||r.endSeconds<=Number(videos[0].duration)+0.05);
  });
}
module.exports={ROOT,sha,norm,timestamp,readDataset,prepareDataset,loadIndex,bindRecords};
