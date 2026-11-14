// Shared request interpretation for course packs. Student data never becomes
// verified lesson facts; the plan only guides selection and answer structure.
const asset = /\b(?:prompts?|templates?|wording|text|line)\b|प्रॉम्प्ट|प्रॉम्पट|टेम्पलेट/iu;
const source = /\b(?:approved|stored|saved|course|canonical|lesson\s*\d+|message\s*\d+|l\d+|master\s+style)\b|कोर्स|पाठ/iu;
const copying = /\b(?:copy|paste|return|show|give|send|provide|quote|do|bhejo|chahiye)\b|दो|दीजिए|भेजो/iu;
const exact = /\b(?:exact|approved|original|verbatim|unchanged|as[- ]is|full|complete)\b|पूरा|सटीक|जैसा/iu;
const adapting = /\b(?:adapt|customi[sz]e|customi[sz]ed|custom|rewrite|modify|tailor)\b/iu;
const problem = /\b(?:too\s+(?:dark|bright)|dark|overexpos\w*|underexpos\w*|blown[- ]out|uneven|mismatch\w*|inconsisten\w*|drift\w*|unexpected|unwanted|flicker\w*|morph\w*|glitch\w*|changed?|changing|changes|different|wrong|fails?|failing|doesn't|not\s+(?:work\w*|match\w*|consistent)|badal\w*|alag|dark\s+aa|bright\s+hai|kya\s+karu|kaise\s+fix)\b|बदल|अलग|खराब|अंधेरा|चमक|नहीं मिल/iu;
const preservation = /\b(?:keep|preserve|retain|unchanged|original|same|do\s+not\s+(?:change|add|remove)|don't\s+(?:change|add|remove)|rakh\w*|mat\s+badal\w*)\b|वही|असली|मत बदल|ज्यों/iu;
const topics = {
  lighting: /light|expos|dark|bright|shadow|sunlight|roshni|अंधेरा|रोशनी|चमक/iu,
  appearance: /appear|colou?r|character|face|identity|outfit|product|display|reference|chehra|kapde|रंग|चेहरा|कपड़े/iu,
  voice: /voice|audio|pitch|accent|awaaz|awaz|आवाज़|आवाज/iu,
  transitions: /transition|video|clips?|frames?|cut|motion|jump|morph|सीन|फ्रेम/iu,
};
const split = text => String(text || '').split(/(?<=[.!?])\s+|[;\n]+/u).map(s => s.trim()).filter(Boolean);

function courseTutorRequest(message, history = []) {
  const text = String(message || '').slice(0, 2000);
  const clauses = split(text);
  let copyRequested = clauses.some(clause => {
    const candidate = clause.replace(/\bowner[-\s]+approved\b/giu, 'owner confirmed');
    return asset.test(candidate) && copying.test(candidate) && exact.test(candidate)
      && (source.test(candidate) || /\b(?:copy|paste|quote)\b.{0,60}\b(?:template|verbatim|unchanged)\b/iu.test(candidate));
  });
  const lastUser = history.filter(item => item.role === 'user').at(-1)?.content || '';
  // A remembered source can qualify a repeat request; assistant text cannot.
  if (!copyRequested && /\b(?:same|previous|wahi|wohi|pichhla)\s+(?:(?:exact|approved|course)\s+)*(?:prompt|template|line)\b/iu.test(text)
    && asset.test(text) && copying.test(text) && lastUser
    && courseTutorRequest(lastUser).directCopy) copyRequested = true;
  const followUp = text.length < 180 && /\b(?:same|that|this|wahi|usi|isi|previous|ab|now)\b|उसी|वही/iu.test(text);
  const previous = followUp ? history.filter(item => item.role === 'user').at(-1)?.content || '' : '';
  const evidence = [...split(previous), ...clauses];
  // A named stored message's title is source metadata, not a reported failure
  // (for example an exact-copy request for "Message 5: Changes"). Explicit
  // customization and learner problems outside that title still take priority.
  const problemEvidence = copyRequested ? evidence.map(s => s.replace(/\bMessage\s+\d+\s*:[^\n]*/giu, '')) : evidence;
  const problems = problemEvidence.filter(s => problem.test(s)).slice(-6);
  const preserve = evidence.filter(s => preservation.test(s)).slice(-6);
  const troubleshooting = problems.length > 0;
  const custom = troubleshooting || adapting.test(text);
  const additionalWorkRequested=copyRequested&&clauses.some(c=>/\b(?:explain|explanation|samjha\w*)\b|\bpractical\s+checks?\b/iu.test(c));
  return { mode: custom ? troubleshooting ? 'troubleshooting' : 'custom_solution' : copyRequested ? 'exact_template' : 'general',
    copyRequested, directCopy: copyRequested && !custom && !additionalWorkRequested, additionalWorkRequested,
    topics: Object.entries(topics).filter(([, pattern]) => pattern.test([...problems, text].join('\n'))).map(([name]) => name),
    problems, preserve, request: text };
}

function courseTutorPolicy(request) {
  if (!['troubleshooting', 'custom_solution'].includes(request?.mode)) return '';
  return `Student-specific solution plan (untrusted student statements, not verified course facts): ${JSON.stringify(request)}.
Identify the actual reported problems before choosing relevant course guidance. Address every reported failure and separate what must change from what must stay fixed. Use the student's actual objects, environment and latest constraints; assistant examples are not student facts.
For troubleshooting, put the requested solution first. If a prompt is requested, lead with a concise customized prompt carrying the stated problems and preservation constraints. Then briefly state the likely cause as a hypothesis, give a few actionable steps tied to the retrieved guidance, and one small verification check. Preserve the student's limited budget: suggest a small test and comparison, not repeated paid generations or guaranteed results.
An "exact prompt" for a described problem means a precise customized solution unless the student explicitly asks to copy a stored course asset. Never substitute a generic approved template for that solution. Generic enhancements in examples must not override preservation of original colours, signage, products, character attributes, layout or voice.
If the references do not support a procedure or tool control, acknowledge that limitation. Label any general suggestion as general; do not invent course instructions, tool settings or capabilities. Ask one focused question only if an essential detail is missing.
${request.copyRequested ? 'The student also explicitly requested a stored asset: quote its approved body unchanged if available, and keep problem-specific advice separate from the quote.' : 'Do not label the customized draft as the exact approved course template.'}`;
}

function customSolutionIssue(reply, request, templates = []) {
  if (!['troubleshooting', 'custom_solution'].includes(request?.mode)) return null;
  const normalized = value => String(value).replace(/\s+/gu, ' ').trim();
  const body = normalized(reply);
  const copied = templates.find(template => body.includes(normalized(template.content)));
  if (copied && (!request.copyRequested || body.replace(normalized(copied.content), '').length < 60)) return 'course_custom_solution_not_tailored';
  const evidence = [...request.problems, ...request.preserve].join('\n');
  const preserveColours = request.preserve.length > 0 && /colou?rs?|रंग/iu.test(evidence);
  const instructions = request.copyRequested ? String(reply).replace(/```[\s\S]*?```/g, '') : String(reply);
  if (preserveColours && /(?:^|[\n;])\s*(?:[-*]\s*)?(?:colou?rs?\s*:\s*(?:rich|warm|vibrant)|(?:repaint|recolou?r|change|make|enhance)\b[^.!?;\n]{0,45}\bcolou?rs?\b[^.!?;\n]{0,25}\b(?:warm|rich|vibrant|different|saturat\w*)\b)/imu.test(instructions)) return 'course_preservation_conflict';
  return null;
}

// Approval is a claim about a registered asset, not about writing quality or
// the student's physical reference. Use the same unchanged-body rule as the
// existing exact-template paths; never infer approval from notes similarity.
const promptProvenancePolicy='Label a prompt Approved Prompt, exact course template or verbatim course asset only when its entire body is an unchanged verified exact-template asset with the correct source course and lesson. Label a filled slot, rewritten example, translated body or added instruction "Customized AI Prompt"; keep the correct source course and lesson citation and preserve the customized body. It is not a verbatim approved asset. Apply this distinction to headings, introductions, captions, source references and conclusions. Preserve useful customized prompts and their conditional reference constraints.';
function exactTemplates(knowledge={}) {
  const {createHash}=require('node:crypto');
  const courses=knowledge.unifiedAccess?.courses || [],seen=new Set();
  return [...(knowledge.approvedTemplates||[]),...(knowledge.records||[])].filter(r=>{
    if(r.contentType!=='exact-template'||!r.content)return false;
    const owner=courses.find(c=>String(c._id||c.id)===String(r.courseId));
    if(!owner)return false;
    const hash=createHash('sha256').update(r.content).digest('hex');
    if(r.contentHash&&hash!==r.contentHash)return false;
    const key=r.courseId+':'+(r.lessonId||r.lessonNumber||'')+':'+hash;
    if(seen.has(key))return false;seen.add(key);return true;
  }).map(r=>({...r,courseName:courses.find(c=>String(c._id||c.id)===String(r.courseId)).title}));
}

function inspectPromptProvenance(reply,knowledge,{rewrite=false}={}) {
  const text=String(reply),templates=exactTemplates(knowledge),issues=[],edits=[],changes=[];
  const {referenceCondition}=require('./tutorVisualEvidence');
  const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim();
  const blocks=[];
  for(const m of text.matchAll(/(^|\n)[ \t]*(```|~~~)[^\n]*\n([\s\S]*?)\n[ \t]*\2(?=[ \t]*(?:\n|$))/gu)){
    blocks.push({start:m.index+m[1].length,end:m.index+m[0].length,body:m[3],kind:'fence'});
  }
  const fenced=at=>blocks.some(b=>b.kind==='fence'&&at>=b.start&&at<b.end);
  for(const m of text.matchAll(/(?:^|\n)[ \t]*["“]([\s\S]*?)["”](?=[ \t]*(?:\n|$))/gu))if(!fenced(m.index)){
    blocks.push({start:m.index+(m[0].startsWith('\n')?1:0),end:m.index+m[0].length,body:m[1],kind:'quote'});
  }
  for(const m of text.matchAll(/^[^\n]*?:[ \t]*["“]([^\n]+)["”][ \t]*$/gmu))if(!fenced(m.index)){
    const start=m.index+m[0].indexOf(m[1])-1;
    if(!blocks.some(b=>start>=b.start&&start<b.end))blocks.push({start,end:m.index+m[0].length,body:m[1],kind:'inline'});
  }
  blocks.sort((a,b)=>a.start-b.start);
  const protectedRanges=templates.flatMap(r=>[...text.matchAll(new RegExp(r.content.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&'),'gu'))].map(m=>[m.index,m.index+m[0].length]));
  const bridge=s=>s.split('\n').map(line=>line.split(referenceCondition).join('')).every(line=>!line.trim() || /^\s*(?:---+|```\w*|~~~\w*)\s*$/u.test(line)
    || /^\s*(?:\*\*)?(?:sources?|course notes)\s*:/iu.test(line)
    || /^\s*(?:\*\*|#{1,6}\s)(?:approved|original|exact|customized)[^\n]*prompt/iu.test(line));
  const registeredAfter=lineEnd=>protectedRanges.map(([start,end])=>({start,end,body:text.slice(start,end),kind:'registered'}))
    .find(b=>b.start>=lineEnd&&bridge(text.slice(lineEnd,b.start))
      && /^\s*(?:---+|```|~~~|#{1,6}\s|\*\*|$)/u.test(text.slice(b.end))
      && !blocks.some(other=>other.start<=b.start&&other.end>=b.end&&other.body!==b.body));
  const claims=/\b(?:(?:exact|unchanged|verbatim|original)[ \t]+)?(?:course[ -])?approved(?:[ \t]+[\p{L}\p{N}&'’-]+){0,8}?[ \t]+(?:prompts?|templates?|(?:course[ \t]+)?(?:assets?|quotes?))\b|\b(?:exact|verbatim|unchanged|original|canonical)[ \t]+(?:approved[ \t]+)?course[ \t]+(?:prompts?|templates?|assets?|quotes?)\b|\b(?:prompts?|templates?)[ \t]+(?:is|are)[ \t]+(?:the[ \t]+)?(?:approved|verbatim|canonical)\b|\b(?:prompts?|templates?)[ \t]*(?:[—:-][ \t]*|\([ \t]*)approved\b|(?:स्वीकृत|अनुमोदित)[ \t]+प्रॉम्प्ट|\bapproved\b/giu;
  for(const m of text.matchAll(claims)){
    if(protectedRanges.some(([a,b])=>m.index>=a&&m.index+m[0].length<=b))continue;
    const lineStart=text.lastIndexOf('\n',m.index)+1,lineEnd=text.indexOf('\n',m.index)<0?text.length:text.indexOf('\n',m.index);
    const line=text.slice(lineStart,lineEnd),local=m.index-lineStart;
    // An application-owned physical-reference condition cannot hide a source
    // claim. Strip it only for metadata classification, never body matching.
    const labelLine=line.split(referenceCondition).join('');
    const sourceLine=/^\s*(?:[-*]\s*)?(?:\*\*)?(?:sources?|references?|citations?|course notes|स्रोत)\b/iu.test(labelLine);
    if(/^approved$/iu.test(m[0])&&!sourceLine)continue;
    const clause=line.slice(0,local).split(/[.!?;।]/u).at(-1);
    if(/\bowner[- ]$/iu.test(clause))continue;
    if(/\b(?:not|never|isn't|aren't|cannot|nahi|nahin)\b[^:]{0,45}$|नहीं[^:]{0,30}$/iu.test(clause))continue;
    if(/^\s*(?:nahi\b|nahin\b|नहीं)/iu.test(line.slice(local+m[0].length)))continue;
    // General discussion of approved prompts is not approval of a presented
    // asset. Keep reliability explanations and explicit denials unchanged.
    if(!sourceLine&&/^\s+(?:can|may|might|should|must|cannot|don't|do not|is not|are not|aren't|isn't|never)\b/iu.test(line.slice(local+m[0].length)))continue;
    const following=blocks.find(b=>b.start>=m.index+m[0].length&&(!text.slice(lineEnd,b.start).trim()||b.start<lineEnd));
    const preceding=blocks.filter(b=>b.end<=m.index&&(!text.slice(b.end,lineStart).trim()||b.end>lineStart)).at(-1);
    let chosen=sourceLine?(preceding||following):following;
    // Plain, unquoted bodies are accepted only as one complete paragraph.
    if(!chosen){
      const rest=text.slice(lineEnd).replace(/^\n[ \t]*\n/u,'\n'),start=lineEnd+(text.slice(lineEnd).length-rest.length)+1;
      const body=rest.slice(1).split(/\n[ \t]*\n|\n(?=[ \t]*(?:#{1,6}\s|\*\*))/u)[0];
      if(body?.trim()&&!/^\s*(?:#{1,6}\s|\*\*)/u.test(body))chosen={start,end:start+body.length,body,kind:'plain'};
    }
    // A canonical asset can contain blank paragraphs and can follow separate
    // source metadata. Match the whole registered body across that metadata;
    // never truncate it to the first paragraph or accept a changed fence.
    if(!chosen||chosen.kind==='plain')chosen=registeredAfter(lineEnd)||chosen;
    // A new heading cannot borrow the preceding asset when its own body is
    // missing or plain text. Trailing source/prose assertions may refer back.
    if(!chosen&&!/\*\*|^\s*#{1,6}\s|:\s*$/u.test(line))chosen=preceding;
    const summary=/\b(?:all|these|both|every|above|below)\b/iu.test(line)&&/\b(?:prompts|templates|assets|quotes)\b/iu.test(line);
    const selected=summary?blocks:(chosen?[chosen]:[]);
    const matches=selected.map(b=>templates.filter(r=>r.content===b.body));
    const exact=selected.length>0&&matches.every(list=>list.length>0);
    // Bind explicit source IDs and source names to this claim, never to an
    // unrelated later course mention or another exact block in the answer.
    const courses=knowledge.unifiedAccess?.courses||[];
    const owns=(course,value)=>norm(value).includes(norm(course.title.replace(/\s+course$/iu,'')));
    const localOwners=courses.filter(c=>owns(c,line));
    const parent=!localOwners.length&&!sourceLine?text.slice(0,lineStart).split('\n').filter(h=>/^\s*(?:#{1,6}\s|\*\*)/u.test(h)&&courses.some(c=>owns(c,h))).at(-1):'';
    const metadata=chosen?.start>=lineEnd&&bridge(text.slice(lineEnd,chosen.start))?text.slice(lineEnd,chosen.start):'';
    const ownerText=(parent?parent+'\n':'')+line+'\n'+metadata;
    const owners=courses.filter(c=>owns(c,ownerText));
    const cited=[...line.matchAll(/\[(S\d+)\]/gu)].map(id=>(knowledge.sources||[]).find(s=>s.id===id[1]));
    const localLessons=[...line.matchAll(/\bLesson\s*0?(\d+)/giu)].map(n=>Number(n[1]));
    const lessons=localLessons.length?localLessons:[...ownerText.matchAll(/\bLesson\s*0?(\d+)/giu)].map(n=>Number(n[1]));
    const named=templates.filter(t=>{
      if(owners.length&&!owners.some(c=>String(c._id||c.id)===String(t.courseId)))return false;
      if(lessons.length&&!lessons.includes(Number(t.lessonNumber)))return false;
      const title=norm(t.heading).replace(/^lesson \d+ /u,'');
      return title.length>5&&norm(line).includes(title);
    });
    const identified=templates.filter(t=>t.chunkId&&line.includes(t.chunkId));
    const scoped=matches.map(list=>list.filter(r=>(!owners.length||(summary?owners.some(c=>String(c._id||c.id)===String(r.courseId)):owners.every(c=>String(c._id||c.id)===String(r.courseId))))
      &&(!lessons.length||lessons.includes(Number(r.lessonNumber)))
      &&(!named.length||named.every(t=>t.content===r.content))
      &&(!identified.length||identified.every(t=>t.chunkId===r.chunkId))
      &&cited.every(s=>s&&String(s.courseId)===String(r.courseId)&&(!s.lessonId||String(s.lessonId)===String(r.lessonId)))));
    if(exact&&scoped.every(list=>list.length===1)&&(owners.length||cited.length||summary))continue;
    let before=m[0],after=/\b(?:prompts|templates|assets|quotes)\b/iu.test(m[0])?'Customized AI Prompts':'Customized AI Prompt';
    // A uniquely identified immutable body can retain approval with corrected
    // ownership. Remove the conflicting label/reference instead of changing
    // the asset or borrowing another course's approval.
    if(exact&&!summary&&matches[0].length===1){
      const r=matches[0][0],source=`Approved Prompt — ${r.courseName}${r.lessonNumber?` — Lesson ${r.lessonNumber}`:''}: ${r.heading}`;
      const begin=chosen.kind==='inline'&&chosen.start<lineEnd?chosen.start:lineEnd;
      if(chosen.end<=lineStart){before=line;after=source;}
      else {before=text.slice(lineStart,begin);after=source+(begin<lineEnd?': ':'');}
    }
    issues.push({code:'prompt_provenance_mismatch',span:before,replacement:after,repaired:rewrite,detail:exact?'Approval ownership does not match the verified complete template body.':'This complete body is not an unchanged verified exact-template asset. Label it as Customized AI Prompt.'});
    if(rewrite&&!changes.some(c=>c.start<=m.index&&c.end>=m.index+m[0].length)){
      const start=before===m[0]?m.index:lineStart;
      changes.push({start,end:start+before.length,after});edits.push({code:'prompt_provenance_corrected',before,after});
    }
  }
  // The converse matters too: a byte-identical registered body must not be
  // presented as a rewritten learner draft. Only relabel a uniquely matched,
  // complete adjacent asset; a filled placeholder remains customized.
  for(const m of text.matchAll(/^.*\bCustomized AI Prompt\b[^\n]*$/gmu)){
    const lineEnd=m.index+m[0].length,b=registeredAfter(lineEnd);
    if(!b)continue;
    const matches=templates.filter(t=>t.content===b.body);if(matches.length!==1)continue;
    const r=matches[0],after=`Approved Prompt — ${r.courseName}${r.lessonNumber?` — Lesson ${r.lessonNumber}`:''}: ${r.heading}`;
    if(changes.some(c=>c.start<lineEnd&&c.end>m.index))continue;
    issues.push({code:'prompt_provenance_mismatch',span:m[0],replacement:after,repaired:rewrite,detail:'The complete unchanged registered body is an approved course asset, separate from customization.'});
    if(rewrite){changes.push({start:m.index,end:lineEnd,after});edits.push({code:'prompt_provenance_corrected',before:m[0],after});}
  }
  let answer=text;for(const c of changes.sort((a,b)=>b.start-a.start))answer=answer.slice(0,c.start)+c.after+answer.slice(c.end);
  return {answer,issues,edits};
}

module.exports = { courseTutorRequest, courseTutorPolicy, customSolutionIssue, exactTemplates, inspectPromptProvenance, promptProvenancePolicy };
