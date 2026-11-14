// Provenance and contradiction checks over already retrieved, hash-checked
// records. Phrase overlap ranks candidate chunks; it is NOT a completeness
// threshold or a semantic proof requirement for a translated paraphrase.
const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim();
const stop=new Set('a an the and or is are of to in on for from with this that hai hain ka ki ke ko se mein me aur ek har yeh ye usi wahi kar karo use kya kyun hai'.split(' '));
const tokens=s=>norm(s).split(' ').filter(w=>w.length>1&&!stop.has(w));
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
const clock=seconds=>{const ms=Math.round(seconds*1000);return [Math.floor(ms/3600000),Math.floor(ms/60000)%60,Math.floor(ms/1000)%60].map(n=>String(n).padStart(2,'0')).join(':')+'.'+String(ms%1000).padStart(3,'0');};
const range=r=>r.timeRange||{startSeconds:r.startSeconds,endSeconds:r.endSeconds};
const span=r=>{const t=range(r);return clock(t.startSeconds)+'–'+clock(t.endSeconds);};
const label=r=>`Transcript: ${r.courseName} — Lesson ${r.lessonNumber}: ${r.lessonName} [${span(r)}]`;
const prose=r=>String(r.hinglishText||r.content||'').split('\n\nOriginal transcript:')[0];
const limitation=/\b(?:not always|not guaranteed|cannot guarantee|can't guarantee|may not|limitations?)\b|(?:perfect|guarantee)[^.!?\n]{0,45}\b(?:nahi|nahin)\b|\bAI ki limit\b|(?:परफेक्ट|गारंटी)[^।\n]{0,35}नहीं/iu;
function transcriptRecords(knowledge){
  return (knowledge.records||[]).filter(r=>r.sourceType==='transcript'&&r.lessonId&&r.courseId
    &&Number.isFinite(range(r).startSeconds)&&Number.isFinite(range(r).endSeconds));
}
function limitationQuotes(records){
  const seen=new Set(),out=[];
  for(const r of records)for(const sentence of prose(r).split(/(?<=[.!?।])\s+/u)){
    if(!limitation.test(sentence))continue;
    const key=r.courseId+':'+r.lessonId+':'+norm(sentence);
    if(!seen.has(key)){seen.add(key);out.push({record:r,text:sentence.trim()});}
  }
  return out;
}
function transcriptEvidenceContract(knowledge){
  const records=transcriptRecords(knowledge),limits=limitationQuotes(records);
  return records.map(r=>({sourceId:(knowledge.sources||[]).find(s=>s.chunkId===r.chunkId)?.id,
    chunkId:r.chunkId,courseId:r.courseId,lessonId:r.lessonId,videoId:r.videoId||r.mediaId,
    course:r.courseName,lesson:r.lessonName,lessonNumber:r.lessonNumber,timeRange:range(r),contentHash:r.contentHash,
    timestampGranularity:'chunk',spokenEventTimingAvailable:false,
    limitations:limits.filter(q=>q.record.chunkId===r.chunkId).map(q=>q.text)}));
}
function contradictsLimitation(claim,r){
  claim=claim.replace(/Transcript limitation\s*(?:\(quoted evidence\))?\s*:?/giu,'');
  // A shared phrase with its source negation removed is not supporting text.
  const claimWords=norm(claim).split(' '),negative=/^(?:not|never|cannot|nahi|nahin|नहीं)$/u;
  for(const q of limitationQuotes([r])){
    const sourceWords=norm(q.text).split(' ');
    for(let i=0;i<sourceWords.length;i++)if(negative.test(sourceWords[i])){
      const near=sourceWords.slice(Math.max(0,i-3),i).concat(sourceWords.slice(i+1,i+4));
      for(let j=0;j<near.length-1;j++){
        if(tokens(near[j]+' '+near[j+1]).length<2)continue;
        const at=claimWords.findIndex((w,k)=>w===near[j]&&claimWords[k+1]===near[j+1]);
        if(at>=0&&!claimWords.slice(Math.max(0,at-3),at+5).some(w=>negative.test(w)))return true;
      }
    }
  }
  return false;
}
function support(claim,r,records){
  const words=[...new Set(tokens(claim))],text=new Set(tokens(prose(r)));
  // Rank distinctive supporting words across this lesson's actual excerpts.
  // Boilerplate in a long answer cannot dilute an otherwise supported clause.
  return words.filter(w=>text.has(w)).reduce((n,w)=>n+1/(records.filter(x=>tokens(prose(x)).includes(w)).length||1),0);
}
function quotations(claim){
  return [...claim.matchAll(/["“]([^"”\n]+)["”]/gu)].map(m=>m[1]).filter(q=>tokens(q).length>=3);
}
function containsQuote(text,quote){
  if(norm(text).includes(norm(quote)))return true;
  // An explicit ellipsis can omit source words, but cannot reorder or add
  // them. It is not permission to treat an arbitrary paraphrase as a quote.
  const parts=quote.split(/\.{3}|…/u).map(norm).filter(Boolean);
  if(parts.length<2)return false;
  let at=0;const source=norm(text);
  for(const part of parts){const next=source.indexOf(part,at);if(next<0)return false;at=next+part.length;}
  return true;
}
function claimBefore(line,index){
  const prefix=line.slice(0,index).replace(/\(\s*$/u,'').trim().replace(/\*\*/gu,'');
  // Keep the whole quoted passage: splitting on periods previously validated
  // only its last sentence and assigned a multi-sentence quote to the tail chunk.
  const quote=[...prefix.matchAll(/["“]([^"”\n]+)["”]/gu)].at(-1);
  if(quote&&/^[\s.!?।]*$/u.test(prefix.slice(quote.index+quote[0].length)))return quote[0];
  return prefix.replace(/\([^()]*\)|\[S\d+\]/gu,'').split(/(?<=[.!?।])\s+/u)
    .filter(s=>tokens(s).length>=3).at(-1)?.replace(/^\s*[-*\d.)]+\s*/gu,'').trim()||'';
}
const unresolved='Transcript support not established for this statement.';
// The current source schema binds whole chunks, not words, sentences or event
// onsets. A point inside a chunk (even its first millisecond) proves coverage
// only. Neither a learner's timestamp nor a model disclaimer supplies alignment.
const timeToken=String.raw`(?<![\p{L}\p{N}:])(?:(?:\d{1,3}:)?\d{1,3}:\d{2}(?:\.\d{1,3})?|(?:\d+(?:\.\d+)?|twenty|thirty|forty|fifty|sixty)\s*(?:-?second(?:s| mark)?|secs?|s\b|minutes?|mins?|सेकंड|सेकण्ड|मिनट)|(?:second|minute)\s+\d+)(?![\p{L}\p{N}]|:\d)`;
const boundaryTime=/\b(?:at|from|near|around)\s+(?:the\s+)?(?:start|beginning|end)\s+of\s+(?:the\s+)?(?:chunk|excerpt|video|lesson)\b/iu;
const uncertainTime=/\b(?:cannot|can't|could not|does not|do not)\s+(?:\w+\s+){0,4}(?:confirm|verify|determine|establish|say|pinpoint|locate|assign)\b|\b(?:timing|time|onset|start)\b[^.!?]{0,60}\b(?:unknown|unverified|not (?:known|established|available|verified))\b|\b(?:confirm|verify|pata|maloom)[^.!?]{0,35}\b(?:nahi|nahin)\b|(?:पुष्टि|पता|सत्यापित)[^।]{0,30}नहीं/iu;
const sourceSpeech=/\b(?:instructor|teacher|speaker|explains?|explanation|says?|said|begins?|starts?|ends?|finishes?|spoken|taught|teaches|demo)\b|\b(?:bol|bola|kaha|samjha|batana|bataya|shuru)\b|इंस्ट्रक्टर|समझा|बताना|शुरू|कहा/iu;
function inspectTranscriptTiming(text,knowledge,records,{rewrite=false,message='',history=[]}={}){
  const issues=[],edits=[],removedTimes=new Set();
  const learnerTurns=[...history.filter(t=>t.role==='user').map(t=>t.content),message];
  const playback=/\b(?:paus\w*|stopp?\w*|seek\w*|rew(?:ind|ound)\w*|ruka|ruk|roka)\b|रोक|रुका/iu;
  const playbackKind=s=>/\brew(?:ind|ound)\w*\b/iu.test(s)?'rewind':/\bseek\w*\b/iu.test(s)?'seek':'pause';
  const learnerActor=/\b(?:I|you|we|main|maine|aap|aapne|tum|tumne|hum)\b|मैं|मैंने|आप|तुम/iu;
  const reports=learnerTurns.flatMap(turn=>String(turn).split(/(?<=[.!?।])\s+|\n/u)).filter(clause=>
    playback.test(clause)&&learnerActor.test(clause)&&!sourceSpeech.test(clause)
    && !/[?？]\s*$/u.test(clause)
    && !/\b(?:not|never|nahi|nahin|if|agar|maybe|perhaps|shayad|might|pretend|assume)\b|नहीं/iu.test(clause)&&new RegExp(timeToken,'iu').test(clause));
  // Mask citation ranges before splitting prose. Their millisecond precision
  // describes chunk bounds and must never be mistaken for event alignment.
  const references=[];
  let masked=text.replace(/\[(?:\d{2}:){2}\d{2}\.\d{3}[–-](?:\d{2}:){2}\d{2}\.\d{3}\]/gu,m=>{
    references.push(m);return '\uE100RANGE_'+(references.length-1)+'\uE101';
  });
  const punctuation=[];
  masked=masked.replace(/["“][^"”\n]+["”]/gu,q=>q.replace(/[.!?;]/gu,p=>{punctuation.push(p);return '\uE110P_'+(punctuation.length-1)+'\uE111';}));
  const restore=s=>s.replace(/\uE100RANGE_(\d+)\uE101/gu,(_,i)=>references[Number(i)])
    .replace(/\uE110P_(\d+)\uE111/gu,(_,i)=>punctuation[Number(i)]);
  const parts=masked.split(/((?<=[.!?।])\s+|\n+|;\s*|,?\s+\b(?:but|however|lekin|magar)\b\s+|,?\s+लेकिन\s+)/u);
  let changed=false,suggestionScope=false;
  const answer=parts.map((part,i)=>{
    if(i%2)return part;
    if(i&&!/^;/u.test(parts[i-1]))suggestionScope=false;
    // Recover the old validator's orphaned playback clause only when a single
    // actual learner report supplies the lost subject/time. Never guess.
    if(/^\s*(?:pause(?:d)?|stopped|rewound)(?:\s+kiya hai)?[.!?]?\s*$/iu.test(part)&&reports.length===1){
      issues.push({code:'learner_playback_statement_damaged',detail:part.trim(),repaired:false});
      if(rewrite){edits.push({code:'learner_playback_statement_restored'});return 'Learner report: '+reports[0];}
    }
    const times=[...part.matchAll(new RegExp(timeToken,'giu'))].filter(t=>{
      if(/^(?:9:16|16:9|1:1|4:5|3:2)$/u.test(t[0])
        && (/\b(?:aspect\s+ratio|ratio|vertical|portrait|landscape)\b/iu.test(part)
          || /["“](?:Use|Keep|Create|Show|Re-shoot|Generate|Make)\b/iu.test(part)))return false;
      if(t[0].includes(':'))return true;
      // Durations in course guidance ("a 5-second pan") are not event times.
      return /\b(?:at|around|near|by|from|after|before|about|roughly|approximately|timestamp)\s+(?:the\s+)?$/iu.test(part.slice(0,t.index))
        || /^\s*(?:[:—]|into\b|in\b|later\b|par\b|pe\b|ke aas-paas\b|पर|के आस-पास)/iu.test(part.slice(t.index+t[0].length));
    });
    if(!times.length&&!boundaryTime.test(part))return part;
    // A learner's playback action is not instructor speech. Require a matching
    // positive report from a learner turn, the same time, and a learner actor;
    // a report about an instructor never grants event-level source alignment.
    const learnerReport=times.length && playback.test(part) && learnerActor.test(part) && !sourceSpeech.test(part)
      && reports.some(clause=>playbackKind(clause)===playbackKind(part)&&times.every(t=>clause.includes(t[0])));
    if(learnerReport)return part;
    // A coverage statement is atemporal only if it makes no speech assertion.
    // A neighbouring caveat cannot license a second affirmative event clause.
    const affirmativeTail=/[,;]\s*(?:and\s+)?(?:at|around|near|by|from|(?:the\s+)?(?:instructor|teacher|speaker))\b|\band\s+(?:at|around|near|by|from)\b/iu;
    const citedIds=[...part.matchAll(/\[(S\d+)\]/gu)].map(m=>m[1]);
    const citedChunks=(knowledge.sources||[]).filter(s=>citedIds.includes(s.id)).map(s=>s.chunkId);
    const named=records.filter(r=>part.includes(r.courseName));
    const owners=citedIds.length?records.filter(r=>citedChunks.includes(r.chunkId)):named.length?named:records;
    const covered=times.every(t=>{
      const token=t[0].toLowerCase(),words={twenty:20,thirty:30,forty:40,fifty:50,sixty:60};
      const n=token.includes(':')?token.split(':').reduce((sum,v)=>sum*60+Number(v),0)
        :(Number(token.match(/\d+(?:\.\d+)?/u)?.[0])||words[token.match(/twenty|thirty|forty|fifty|sixty/u)?.[0]])*(/min|मिनट/u.test(token)?60:1);
      return Number.isFinite(n)&&owners.some(r=>range(r).startSeconds<=n&&range(r).endSeconds>=n);
    });
    const coverage=/\b(?:chunk|excerpt|range|coverage)\b/iu.test(part)
      && /\b(?:covers?|contains?|within|includes?|spans?)\b|\b(?:wale|waale)\s+(?:available\s+)?transcript\s+chunk\b/iu.test(part)&&!sourceSpeech.test(part)&&covered;
    const question=/^\s*(?:you (?:asked|requested)|your question|requested time|aapka sawaal)\b/iu.test(part)&&!sourceSpeech.test(part)
      &&times.length>0&&/^[\s.?!:'"”]*$/u.test(part.slice(times.at(-1).index+times.at(-1)[0].length));
    suggestionScope=suggestionScope||/^\s*(?:[-*]\s*)?(?:suggested|proposed|practical suggestion|example clip|creative timing)\b/iu.test(part);
    const suggestion=suggestionScope&&!sourceSpeech.test(part);
    const uncertaintyMatch=part.match(uncertainTime);
    const priorAssertion=/\b(?:explains?|says?|said|begins?|starts?|started|began|finishes?|demonstrates?|teaches|discusses?|shuru|bataya|samjhaya)\b|समझा|शुरू/iu;
    const uncertainty=Boolean(uncertaintyMatch)&&!priorAssertion.test(part.slice(0,uncertaintyMatch.index))
      &&!/^\s*(?:the\s+)?(?:instructor|teacher|speaker)\b/iu.test(part);
    if((coverage||question||suggestion||uncertainty)&&!affirmativeTail.test(part))return part;
    issues.push({code:'transcript_spoken_event_time_unsupported',detail:restore(part).trim(),repaired:false});
    if(!rewrite)return part;
    changed=true;for(const t of times)removedTimes.add(t[0]);
    // Retain an untimed explanation when the temporal lead-in can be removed
    // unambiguously. Other shapes lose only their unsupported sentence; the
    // rest of the answer, including definitions and prompts, stays intact.
    let summary=part.replace(new RegExp('^\\s*(?:[-*]\\s*)?(?:[^,;.!?\\n]{0,100}?)'+timeToken+'(?:\\s+(?:ke\\s+)?(?:aas-paas|par|pe|per|mein|mark|के आस-पास|पर))?(?:\\s*[,—:]\\s*|\\s+)','iu'),'');
    if(summary===part)summary=part.replace(new RegExp('\\s+(?:at|around|near|by|from)\\s+'+timeToken,'giu'),'');
    if(summary===part)return '';
    summary=summary.replace(/\b(?:begins?|starts?|began|started|finishes?|finished)\s+(explaining|discussing|describing|teaching)\b/giu,(_,verb)=>({explaining:'explains',discussing:'discusses',describing:'describes',teaching:'teaches'})[verb.toLowerCase()])
      .replace(/\bbatana shuru kiya(?: hai)?\b/giu,'bataya hai')
      .replace(/\bsamjhana shuru kiya(?: hai)?\b/giu,'samjhaya hai');
    if(new RegExp(timeToken,'iu').test(summary)||boundaryTime.test(summary)||/\b(?:begins?|starts?|started|began|ends?|finishes?|shuru|there|then)\b|शुरू/iu.test(summary))return '';
    return summary;
  }).join('');
  let result=restore(answer);
  if(changed){
    const language=knowledge.unifiedAccess?.language;
    const notice=language==='hinglish'
      ? 'Timestamp coverage: sirf poore transcript chunk ki time range available hai. Isse confirm nahi hota ki exact kis waqt koi baat boli gayi ya explanation shuru hua. Neeche topic ka summary hai; exact timed speech ka daava nahi hai.'
      : language==='hindi'
        ? 'टाइमस्टैम्प सीमा: केवल पूरे ट्रांसक्रिप्ट अंश की समय सीमा उपलब्ध है। इससे पुष्टि नहीं होती कि कोई बात ठीक कब कही गई या व्याख्या कब शुरू हुई। नीचे विषय का सार है, सटीक समय पर बोले गए शब्दों का दावा नहीं।'
        : 'Timestamp coverage: only whole transcript chunk ranges are available. They do not establish when a statement was spoken or an explanation began. The topic summary below makes no exact spoken-event timing claim.';
    // Echoing the requested point as a question is safe; it is never used to
    // assert that the source contains speech at that point.
    const requestedTimes=[...String(message).matchAll(new RegExp(timeToken,'giu'))].map(m=>m[0]).filter(t=>removedTimes.has(t));
    const query=requestedTimes.length?'Requested time: '+[...new Set(requestedTimes)].join(', ')+'.\n':'';
    result=query+notice+'\nAvailable chunk ranges: '+records.map(label).join('; ')+'.\n\n'+result.trim();
    edits.push({code:'transcript_spoken_event_time_corrected'});
  }
  return {answer:result,issues,edits};
}
function inspectTranscriptAnswer(reply,knowledge,{rewrite=false,message='',history=[]}={}){
  const records=transcriptRecords(knowledge);
  if(!knowledge.transcriptContext?.requested||!records.length)return {answer:String(reply),issues:[],edits:[]};
  let answer=String(reply);const issues=[],edits=[],assets=[];
  // Normalize only citations whose supplied identities/ranges agree with the
  // server-owned source. Do this before timing inspection: a citation range
  // is not instructor event timing, even when the model used a compound form.
  answer=answer.replace(/\[(S\d+),\s*([^\]\n]+)\]/gu,(match,id,tail)=>{
    const r=records.find(r=>(knowledge.sources||[]).find(s=>s.id===id)?.chunkId===r.chunkId);
    if(r&&tail===`${r.courseName} — ${r.lessonName}, ${span(r)}`)return `[${id}]`;
    if(/^S\d+(?:\s*,\s*S\d+)*$/u.test(tail))return '['+id+'], '+tail.split(/\s*,\s*/u).map(s=>'['+s+']').join(', ');
    issues.push({code:'transcript_citation_unknown_identity',detail:match,repaired:false});return match;
  }).replace(/\[((?:\d{2}:){2}\d{2}\.\d{3}[–-](?:\d{2}:){2}\d{2}\.\d{3})\]\s*\[(S\d+)\]/gu,(match,t,id)=>{
    const r=records.find(r=>(knowledge.sources||[]).find(s=>s.id===id)?.chunkId===r.chunkId);
    return r&&span(r)===t?`[${id}]`:match;
  });
  for(const r of [...(knowledge.records||[]),...require('./courseTutorRequest').exactTemplates(knowledge)])if(r.contentType==='exact-template'&&r.content&&answer.includes(r.content)){
    const marker='\uE000APPROVED_ASSET_'+assets.length+'\uE001';
    answer=answer.split(r.content).join(marker);assets.push({marker,content:r.content});
  }
  const timing=inspectTranscriptTiming(answer,knowledge,records,{rewrite,message,history});
  answer=timing.answer;issues.push(...timing.issues);edits.push(...timing.edits);
  // A source saying that the first result is not always correct does not
  // establish inevitable failure either. Keep the source's uncertainty when
  // a paraphrase strengthens that limitation in the opposite direction.
  const firstResultUncertain=records.some(r=>/\b(?:har baar[^.!?\n]{0,90}pehli baar[^.!?\n]{0,90}nahi|not always[^.!?\n]{0,90}first|first[^.!?\n]{0,90}not always)\b/iu.test(prose(r)));
  if(firstResultUncertain){
    const absolute=/\b(?:aapko|tumhe)\s+pehl[aei]\s+(?:attempt|baar)\b[^.!?\n]{0,70}\b(?:nahi|nahin)\s+(?:milega|aayega|hoga)\b[.!?]?|\b(?:you\s+)?(?:will not|won't|cannot)\s+(?:get|achieve|obtain|succeed)[^.!?\n]{0,70}\bfirst[- ](?:attempt|try|generation)\b[^.!?\n]*[.!?]?/giu;
    answer=answer.replace(absolute,claim=>{
      if([...history.filter(t=>t.role==='user').map(t=>t.content),message].some(t=>norm(t).includes(norm(claim))))return claim;
      issues.push({code:'transcript_caveat_strengthened',detail:claim,repaired:false});
      if(!rewrite)return claim;
      edits.push({code:'transcript_caveat_strength_corrected'});
      return /\b(?:aapko|tumhe)\b/iu.test(claim)?'pehle attempt mein sahi result milna guaranteed nahi hai.':'first-attempt success is not guaranteed.';
    });
  }
  const sources=knowledge.sources||[];
  const notes=(knowledge.records||[]).filter(r=>r.sourceType!=='transcript'&&r.contentType!=='exact-template');
  const noteLabel=s=>`Course notes: ${s.courseName} — ${s.lessonNumber?'Lesson '+s.lessonNumber+': ':''}${s.lessonName||s.section||s.heading}`;
  const issue=(code,detail)=>issues.push({code,detail,repaired:false});
  // This syntax is generated from source metadata, not from the model's range.
  const identities=[...new Set(records.flatMap(r=>[r.courseName+' — '+r.lessonName,`${r.courseName} — Lesson ${r.lessonNumber}: ${r.lessonName}`]))];
  const cite=new RegExp('\\[(S\\d+)\\]|(?:Transcript:\\s*)?('+identities.map(escape).join('|')+')\\s*\\[((?:\\d{2}:){2}\\d{2}\\.\\d{3})[–-]((?:\\d{2}:){2}\\d{2}\\.\\d{3})\\]','gu');
  const rendered=answer.split('\n').map(line=>{
    if(/^Transcript (?:source|references):/u.test(line))return line;
    return line.replace(cite,(match,id,identity,start,end,index)=>{
      const source=id?sources.find(s=>s.id===id):null;
      if(id&&source?.sourceType!=='transcript'){
        if(!source){issue('transcript_citation_unknown_source',id);return rewrite?unresolved:match;}
        // Course notes remain usable, but must never acquire a transcript time.
        return rewrite?noteLabel(source):match;
      }
      const cited=id?records.find(r=>r.chunkId===source?.chunkId):records.find(r=>identity.trim().endsWith(r.courseName+' — '+r.lessonName)&&span(r)===start+'–'+end)
        ||records.find(r=>identity.trim().endsWith(`${r.courseName} — Lesson ${r.lessonNumber}: ${r.lessonName}`)&&span(r)===start+'–'+end);
      const claim=claimBefore(line,index);
      const own=cited?records.filter(r=>r.courseId===cited.courseId&&r.lessonId===cited.lessonId):[];
      if(own.some(r=>contradictsLimitation(claim,r))){
        issue('transcript_caveat_contradicted',cited.chunkId);
        return rewrite?unresolved:match;
      }
      const quotes=quotations(claim).filter(q=>!own.some(r=>norm(q)===norm(r.lessonName)||norm(q)===norm(r.courseName)));
      const quoteRecords=quotes.length?own.filter(r=>quotes.every(q=>containsQuote(prose(r),q))):own;
      if(cited&&quotes.length&&!quoteRecords.length){
        const note=notes.find(r=>quotes.every(q=>norm(r.content).includes(norm(q))));
        // A supplied prompt from notes is useful guidance, but its wording is
        // not instructor speech. Do not give it a transcript timestamp.
        if(note&&!/\binstructor\b.{0,80}\b(?:said|says|bol|kaha|samjh)/iu.test(line.slice(Math.max(0,index-500),index))){
          issue('transcript_quote_is_course_note',note.chunkId);
          return rewrite?noteLabel(note):match;
        }
      }
      const candidates=quoteRecords.filter(r=>!contradictsLimitation(claim,r));
      const ranked=candidates.map(r=>({r,score:support(claim,r,own)}))
        .sort((a,b)=>b.score-a.score||Number(b.r.chunkId===cited.chunkId)-Number(a.r.chunkId===cited.chunkId));
      const best=ranked[0]?.r;
      // Positive evidence from another lesson can establish an owner conflict;
      // low overlap alone cannot establish that a paraphrase lacks evidence.
      const anchor=r=>{
        const words=norm(claim).split(' '),text=' '+norm(prose(r))+' ';
        return words.some((w,i)=>i+4<=words.length&&tokens(words.slice(i,i+4).join(' ')).length>=3
          &&text.includes(' '+words.slice(i,i+4).join(' ')+' '));
      };
      const elsewhere=records.filter(r=>!own.includes(r)).some(anchor);
      const ownerConflict=best&&!own.some(anchor)&&elsewhere;
      if(!cited||!best||ownerConflict){
        issue('transcript_citation_unsupported',cited?.chunkId||match);
        return rewrite?unresolved:match;
      }
      if(cited.chunkId!==best.chunkId)issue('transcript_citation_wrong_chunk',cited.chunkId+' -> '+best.chunkId);
      return rewrite?label(best):match;
    });
  }).join('\n');
  if(rewrite)answer=rendered;
  // Unknown/malformed course labels must not evade checking simply because
  // they do not match one of the server-owned identities above.
  const ranges=/\[(?:\d{2}:){2}\d{2}\.\d{3}[–-](?:\d{2}:){2}\d{2}\.\d{3}\]/gu;
  for(const line of answer.split('\n')){
    if(/^Transcript (?:source|references):/u.test(line))continue;
    for(const m of line.matchAll(ranges))if(!records.some(r=>line.slice(0,m.index).endsWith(r.courseName+' — '+r.lessonName+' ')
      ||line.slice(0,m.index).endsWith(`${r.courseName} — Lesson ${r.lessonNumber}: ${r.lessonName} `))){
      issue('transcript_citation_unknown_identity',m[0]);
      if(rewrite)answer=answer.replace(m[0],unresolved);
    }
  }
  if(/\(\s*[,;\s]*\)/u.test(answer)){
    issue('transcript_empty_citation','An empty citation survived source cleanup.');
    if(rewrite)answer=answer.replace(/\s*\(\s*[,;\s]*\)/gu,'');
  }
  if(rewrite)answer=answer.replace(/[,;]\s*\)/gu,')').replace(/\n{3,}/gu,'\n\n');
  for(const q of limitationQuotes(records)){
    // Preserve the source's actual limitation instead of inventing a stronger
    // paraphrase. The quote is tied to the exact chunk that contains it.
    if(!norm(answer).includes(norm(q.text))){
      issue('transcript_limitation_missing',q.record.chunkId+': '+q.text);
      if(rewrite)answer+='\n\nTranscript limitation (quoted evidence): '+q.text+' ('+label(q.record)+')';
    }
  }
  if(answer.includes(unresolved))issue('transcript_citation_unresolved',unresolved);
  for(const {marker,content} of assets)answer=answer.split(marker).join(content);
  if(rewrite&&answer!==String(reply))edits.push({code:'transcript_evidence_corrected'});
  return {answer,issues,edits};
}
module.exports={inspectTranscriptAnswer,limitationQuotes,transcriptRecords,transcriptEvidenceContract};
