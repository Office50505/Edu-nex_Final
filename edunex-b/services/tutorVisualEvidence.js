// This text-only pipeline has learner reports, not inspected image pixels.
// Neither course samples nor assistant history establish what a photo contains.
const {negatedAt}=require('./tutorNegation');
const {inspectCoverageClaims}=require('./tutorCoverageClaims');
const semantics=require('./tutorSemantics');
const norm=s=>String(s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim();
const stop=new Set('a an the is are was were has have contains shows depicts with of on in at to its it and my your this photo photograph image picture reference source original supplied same camera angle viewpoint height fixed'.split(' '));
const tokens=s=>norm(s).split(' ').filter(w=>w && !stop.has(w));
const uncertain=semantics.uncertain,denied=semantics.denied;
// A reference proposal is not an observation. This same local condition is
// used in generation instructions, deterministic projection and final checks.
const referenceCondition='Conditional passage — existing details/required views apply only if reference-confirmed; use available assets and preserve actual items, serving and every student constraint: ';
const referenceHeadingCondition=' — conditional on the actual reference and all preserved constraints';
const referencePolicy='For reference-based customization, learner reports establish item/serving facts; course examples and assistant history do not. Do not instantiate unknown physical details from examples. Bind usable drafts to the actual items, portions, appearance and available inputs. Optional creative directions are conditional proposals, not observations. Permissible lighting, composition and editing changes may be proposed without claiming they already exist in the reference; they never establish serving identity or asset availability. Apply the reference condition locally to every application instruction, descriptive example, heading and conclusion, including inside copyable prompts. Exact course quotations stay separate with their source owner. The application condition is: '+referenceCondition;

function visualEvidence(message,history=[]) {
  const turns=[...history.filter(t=>t.role==='user').map(t=>t.content),message];
  const text=turns.join('\n');
  const assets=/\b(?:photo(?:graph)?s?|images?|pictures?|stills?|footage|reference|clips?)\b|फोटो|तस्वीर/iu.test(text);
  const fictional=semantics.fictional(text);
  const hasRealAsset=assets;
  const preserveSource=hasRealAsset && /\b(?:same|original|approved|unchanged|preserve|no new|only|sirf|wahi)\b|\bbina\b[^.!?\n]{0,90}\b(?:badle|badlo|change)|नहीं|वही|बिना[^।\n]{0,60}बदल/iu.test(text);
  const reportedStatements=turns.flatMap(t=>t.split(/(?<=[.!?।;])\s+|\n/u)).filter(s=>s.trim() && !/\?\s*$/u.test(s)
    && !/\b(?:example|e\.g\.|jaise|imagine|please say|claim|pretend)\b|उदाहरण/iu.test(s)
    && !/^\s*(?:please\s+)?(?:use|make|add|show|generate|create|write|keep|preserve|reveal|can|could|should|assume)\b/iu.test(s))
    .filter(s=>/\b(?:photo(?:graph)?s?|images?|reference|frame|footage|serve|serving|dish|drink|combo|there is|there are|my\s+\w+\s+(?:has|is)|the\s+\w+\s+(?:has|is))\b|Room Lock|फोटो|तस्वीर/iu.test(s));
  const reportedFacts=reportedStatements.filter(s=>!uncertain(s) && !denied(s));
  const stagingMentions=turns.flatMap(t=>[...t.matchAll(/\b(?:virtual staging|virtually stag|add furniture|add props)\b/giu)].map(m=>({text:t,start:m.index,end:m.index+m[0].length})));
  const staging=stagingMentions.at(-1);
  const lockedEnvironment=/(?:keep|preserve|lock)[^.!?]{0,90}(?:background|layout|all (?:existing )?objects)|(?:background|layout|all (?:existing )?objects)[^.!?]{0,45}(?:unchanged|same|original|locked)/iu.test(text);
  const referenceTask=hasRealAsset&&!fictional
    && semantics.requires(message,/\breferences?|\bsource\b|\bsupplied\b|\buploaded\b|\boriginal\b|फोटो|तस्वीर/iu)
    && semantics.requires(message,/\b(?:prepare|create|make|build|draft|rewrite|generate|edit|keep|preserve|steps|workflow|taiyar|banao|banau|rakho|unchanged)\b|बनाओ|तैयार|बिना/iu);
  return {hasRealAsset,preserveSource,referenceTask,fictional,allowFictionalStaging:fictional&&!lockedEnvironment,
    allowStaging:Boolean(staging && !negatedAt(staging.text,staging.start,staging.end)),
    reportedFacts,reportedStatements,
    reportedFullCoverage:reportedFacts.some(s=>!/\b(?:not|no|unknown|nahi|nahin)\b|नहीं/iu.test(s)
      && /(?:photo|image|reference)[^.!?]{0,70}(?:shows|covers|contains|includes)[^.!?]{0,35}(?:full|whole|entire)|full[- ](?:product|object|subject)\s+(?:photo|image)/iu.test(s)),
    provenance:'Learner-reported text only; no visual inspection. Requests, course examples and assistant drafts are not observations.',
    unknowns:hasRealAsset?['Unreported image boundaries, occluded surfaces, objects and camera viewpoint remain unknown.']:[]};
}

function supports(detail,evidence) {
  const wanted=tokens(detail);if(!wanted.length)return false;
  const relevant=(evidence.reportedStatements || evidence.reportedFacts).filter(s=>wanted.every(w=>tokens(s).includes(w))
    || ((denied(s) || uncertain(s))
      && wanted.filter(w=>tokens(s).includes(w)).length>=Math.max(1,Math.ceil(wanted.length*0.6))));
  const latest=relevant.at(-1);
  return Boolean(latest && !denied(latest) && !uncertain(latest));
}

function conditionalCoverage(sentence,requirement='') {
  const {condition}=semantics.interpretation(sentence,0,0);
  if(!condition || !semantics.conditionSupports(condition,sentence))return false;
  if(requirement==='coverage')return /required view|full|whole|entire|coverage/iu.test(condition);
  return !requirement || tokens(requirement.split(/,|\bthen\b|\btoh\b/iu)[0]).every(w=>tokens(condition).includes(w));
}
const propositionAt=(line,index)=>{
  const start=Math.max(...['.','!','?',';','।'].map(c=>line.lastIndexOf(c,index-1)))+1;
  const end=line.slice(index).search(/[.!?;।]/u);
  return line.slice(start,end<0?line.length:index+end);
};

function isReferenceBound(text){
  const plain=String(text).replace(/^\s*(?:[-*]|\d+[.)])\s+/u,'').trim().replace(/^["“]/u,'');
  return plain.startsWith(referenceCondition) || plain.endsWith(referenceHeadingCondition+'**') || plain.endsWith(referenceHeadingCondition);
}
function projectReferenceDirections(text,evidence,{rewrite}){
  if(evidence.allowFictionalStaging)return {answer:String(text),issues:[],edits:[]};
  const lines=String(text).split('\n'),issues=[],edits=[];
  let inFence=false,draft=false,quoted=false;
  const asset=/\uE200EXACT_\d+\uE201/gu;
  const bind=unit=>{
    if(!/[\p{L}\p{N}]/u.test(unit)||isReferenceBound(unit))return unit;
    // Actual learner statements may be echoed; examples and requests are not
    // promoted into known facts by overlap with course material.
    const plain=norm(unit.replace(/[*`"“”]/gu,''));
    if((evidence.reportedFacts||[]).some(f=>norm(f)===plain))return unit;
    const prefix=unit.match(/^\s*(?:(?:[-*]|\d+[.)])\s+)?/u)?.[0]||'';
    const body=unit.slice(prefix.length),quote=/^["“]/u.test(body)?body[0]:'';
    const replacement=prefix+quote+referenceCondition+body.slice(quote.length);
    issues.push({code:'unbound_reference_direction',span:unit,replacement,repaired:rewrite,
      detail:'An application direction is a conditional proposal unless its physical details are learner-confirmed. Bind the entire direction, not selected object names.'});
    if(!rewrite)return unit;
    edits.push({code:'reference_direction_conditioned',before:unit,after:replacement});return replacement;
  };
  const answer=lines.map((line,i)=>{
    if(/^\s*```/u.test(line)){inFence=!inFence;return line;}
    if(/^Transcript (?:source|references):/u.test(line)||!line.trim())return line;
    const heading=/^\s*(?:#{1,4}\s|\*\*[^\n]+\*\*\s*$)/u.test(line);
    if(heading)draft=/^\s*(?:#{1,4}\s*|\*\*)?(?:customized|draft|revised|final|generation)\b[^\n]*\bprompt\b/iu.test(line);
    if(/["“](?:Use|Keep|Create|Show|Re-shoot|Generate|Make)\b/iu.test(line))quoted=true;
    const application=/^\s*(?:[-*]\s*|\d+[.)]\s*)?(?:\*\*)?(?:use|keep|create|show|re-shoot|generate|make|preserve|add|place|insert|position)\b|\b(?:your|source|supplied|uploaded)\s+(?:photo|image|reference)\s+(?:has|shows|contains|depicts)\b/iu.test(line);
    const active=inFence||draft||quoted||evidence.referenceTask&&application;
    if(/["”]\s*$/u.test(line))quoted=false;
    if(!active)return line;
    if(/^\s*(?:\*\*)?(?:source|course notes|reference|citation)s?\s*:/iu.test(line))return line;
    // Protected blocks cannot exempt neighbouring, unprotected prose.
    if(asset.test(line)){asset.lastIndex=0;return line.split(/(\uE200EXACT_\d+\uE201)/gu).map(part=>/^\uE200/u.test(part)?part:bind(part)).join('');}
    asset.lastIndex=0;
    if(heading){
      if(isReferenceBound(line))return line;
      const close=line.endsWith('**')?'**':'';
      const replacement=line.slice(0,line.length-close.length)+referenceHeadingCondition+close;
      issues.push({code:'unbound_reference_direction',span:line,replacement,repaired:rewrite,detail:'The heading describes a conditional reference proposal.'});
      if(rewrite)edits.push({code:'reference_direction_conditioned',before:line,after:replacement});return rewrite?replacement:line;
    }
    if(/^\s*\|/u.test(line)){
      // Preserve table shape and pure scene/timing cells. Header cells may
      // also contain descriptive claims, so they receive the same check.
      if(/^\s*\|[\s:|\-]+$/u.test(line))return line;
      return line.split('|').map((cell,n,all)=>n===0||n===all.length-1||/^\s*[\d\s:–.\-]+\s*$/u.test(cell)?cell:bind(cell)).join('|');
    }
    return bind(line);
  }).join('\n');
  return {answer,issues,edits};
}

function inspectVisualEvidence(reply,evidence,{rewrite=true,protectedAssets=[],sourceRecords=[]}={}) {
  const assets=[];
  let input=String(reply);
  for(const asset of protectedAssets.filter(Boolean))if(input.includes(asset)){
    const marker='\uE200EXACT_'+assets.length+'\uE201';assets.push([marker,asset]);input=input.split(asset).join(marker);
  }
  // An explicitly labelled exact course quotation is evidence about the
  // course, not a customized assertion about the learner's serving.
  input=input.replace(/(^[^\n]*?(?:approved|course notes|source quote)[^\n]*\n)(```[^\n]*\n([\s\S]*?)```)/gimu,(match,heading,block,body)=>{
    if(!sourceRecords.some(r=>r.content&&r.content.includes(body.trim())))return match;
    const marker='\uE200EXACT_'+assets.length+'\uE201';assets.push([marker,block]);return heading+marker;
  });
  // Source-bound transcript quotations are observations about a course, not
  // application directions. A label alone cannot exempt invented content.
  input=input.replace(/^Transcript limitation \(quoted evidence\): (.+) \(Transcript: [^\n]+\)$/gmu,(line,quote)=>{
    if(!sourceRecords.some(r=>r.sourceType==='transcript' && r.content?.includes(quote)))return line;
    const marker='\uE200EXACT_'+assets.length+'\uE201';assets.push([marker,line]);return marker;
  });
  const restore=s=>assets.reduce((text,[marker,asset])=>text.split(marker).join(asset),s);
  const coverage=inspectCoverageClaims(input,evidence,{rewrite});
  let answer=coverage.answer;const issues=[...coverage.issues],edits=[...coverage.edits];
  if(!evidence.hasRealAsset)return {answer:restore(answer),issues,edits};
  const projected=projectReferenceDirections(answer,evidence,{rewrite});
  answer=projected.answer;issues.push(...projected.issues);edits.push(...projected.edits);
  const flag=(code,span,detail,replacement,all=false)=>{
    if(issues.some(i=>i.code===code && i.span===span))return;
    issues.push({code,span,detail,repaired:false});
    if(rewrite && replacement && span!==replacement && answer.includes(span)){
      answer=all?answer.split('this same '+span).join(replacement).split(span).join(replacement):answer.replace(span,replacement);edits.push({code:'visual_assumption_bounded',before:span,after:replacement});
    }
  };
  let inFence=false,inDraft=false,inQuotedPrompt=false;
  for(const line of answer.split(/\n|(?<=[.!?।;])\s+(?=[\p{Lu}])/u)) {
    if(/^\s*```/u.test(line)){inFence=!inFence;continue;}
    if(/^\s*(?:#{1,4}\s|\*\*)/u.test(line))inDraft=/(?:customized|draft|revised|final|generation|still.image|video)\s+(?:draft\s+)?prompt/iu.test(line);
    if(/["“](?:Use|Keep|Create|Show|Re-shoot|Generate|Make)\b/iu.test(line))inQuotedPrompt=true;
    const prompt=inFence || inDraft || inQuotedPrompt;
    if(/["”]\s*$/u.test(line))inQuotedPrompt=false;
    const example=semantics.interpretation(line,0,0,{prompt}).kind==='example';

    if(!evidence.preserveSource || example || isReferenceBound(line))continue;
    const suggestion=!prompt && /\b(?:optional|suggestion|could|might|idea|possibility)\b|ho sakta/iu.test(line);
    if(suggestion)continue;


    for(const m of line.matchAll(/\[([^\]\n]+)\]/gu)) {
      const detail=m[1];
      // Symbolic fields and directions to inspect actual data are not asserted
      // objects. Concrete examples inside a ready prompt still are not facts.
      if(/^[A-Z_\d ]+$/u.test(detail) || /^(?:describe|insert|your|actual|verified|confirmed)\b/iu.test(detail) || supports(detail,evidence))continue;
      if(/\b(?:on|in|behind|beside|with|wall|floor|background|left|right|colour|color)\b/iu.test(detail))flag('unsupported_visual_detail',m[0],
        'Do not copy hypothetical props, backdrop or positions into a source-preserving prompt. Bind to the actual objects/appearance in the reference, or ask the learner to confirm details.',
        'the objects and background actually visible in the supplied image, unchanged and in their original positions');
    }
    const viewpoints=/\b(?:camera\s+(?:angle|viewpoint|height)[^.;!?"\n]{0,50}(?:eye[- ]level|overhead|top[- ]down|low[- ]angle|rear[- ]view|\d+(?:\.\d+)?[- ]degrees?))|\ban?\s+(?:eye[- ]level|overhead|top[- ]down|low[- ]angle|rear[- ]view|\d+(?:\.\d+)?[- ]degrees?)\s+(?:view|shot|angle)\b/giu;
    for(const m of line.matchAll(viewpoints)) {
      // A course explanation can discuss angles without selecting a new
      // viewpoint for a learner's actual reference image.
      if(!prompt&&!evidence.referenceTask&&!/\b(?:source|supplied|uploaded|your)\b/iu.test(line))continue;
      const view=m[0].match(/eye[- ]level|overhead|top[- ]down|low[- ]angle|rear[- ]view|\d+(?:\.\d+)?[- ]degrees?/iu)[0];
      if(negatedAt(line,m.index,m.index+m[0].length) || conditionalCoverage(propositionAt(line,m.index),view))continue;
      if(!supports(view,evidence))flag('unsupported_visual_viewpoint',m[0],
        'The source camera height/angle was not reported. Preserve its actual viewpoint rather than inventing a replacement viewpoint.',
        'camera angle and height stay exactly as in the supplied image');
    }
    for(const m of line.matchAll(/\b(?:add|place|insert|position)\s+(?:a|an|some)\s+[^.;!?"\n]+|\b(?:the|my|your|this|source)\s+(?:[\p{L}-]+\s+){0,4}(?:has|contains|features|shows|depicts)\s+[^.;!?"\n]+|\b(?:the\s+)?(?:background|wall|floor|ceiling)\s+is\s+[^.;!?"\n]+/giu)) {
      if((evidence.allowStaging || evidence.allowFictionalStaging) && /^(?:add|place|insert|position)\b|\b(?:staged|proposed|imagined|fictional)\b/iu.test(m[0]))continue;
      if(/\b(?:has|have)\s+(?:approved|requested|chosen|selected|confirmed|specified)\b/iu.test(m[0]))continue;
      if(evidence.allowFictionalStaging && !/\b(?:photo|image|reference|source)\b/iu.test(m[0]))continue;
      if(negatedAt(line,m.index,m.index+m[0].split(/\s/u)[0].length) || conditionalCoverage(propositionAt(line,m.index),m[0]) || /\b(?:same as|unchanged|actually visible|already visible|original positions|as (?:in|shown in)|exactly as|describe)\b/iu.test(m[0]) || supports(m[0],evidence))continue;
      flag('unsupported_visual_detail',m[0],
        'This source-preserving prompt specifies an unreported object/background. Refer to the actual source appearance and positions; separate optional staged examples from the usable prompt.',
        'preserve the objects and background actually visible in the supplied image in their original positions');
    }
  }
  return {answer:restore(answer),issues,edits};
}

module.exports={visualEvidence,inspectVisualEvidence,supports,referencePolicy,referenceCondition};
