const {interpretation,conditionSupports,sameSubject,denied,uncertain}=require('./tutorSemantics');
// Whole-answer coverage claims. The subject is deliberately not an allowlist:
// a product, room, person or video still needs the same source evidence.
const source=/\b(?:photo(?:graph)?s?|images?|pictures?|reference|footage|frames?)\b|फोटो|तस्वीर/iu;
const whole=/(?:\b(?:full|whole|entire|complete|poora|poore|poori|pura|puri)\b|पूरा|पूरे|पूरी|संपूर्ण)\s+([\p{L}\p{M}][\p{L}\p{M}\d'-]*(?:\s+[\p{L}\p{M}][\p{L}\p{M}\d'-]*){0,5})/giu;
const extent=/\b(?:all|every)\s+(?:sides?|surfaces?|views?)\b|\bfrom edge to edge\b/iu;
const abstract=/^(?:frame|image|photo|reference|workflow|answer|prompt|script|sequence|course|lesson|plan|timeline|explanation|episode|production|process)\b/iu;
const result=/\b(?:reveal\w*|show\w*|display\w*|present\w*|see|visible|visibility|generate\w*|render\w*|depict\w*|deliver\w*|get|achieve\w*|recreat\w*|capture\w*|payoff|view|shot|clip|footage|dikha\w*|dikhay\w*|dikhe\w*|nazar\s+aay\w*)\b|दिखा|दिखे|नज़र/iu;
const possibility=/\b(?:maybe|perhaps|possibly|might|shayad|shayd)\b|शायद|हो सकता/iu;
const reliable=/\b(?:guarantee\w*|definitely|reliably|always|certainly|perfectly|100\s*%)\b|गारंटी/iu;
const norm=s=>s.toLowerCase().replace(/[*_`"“”]/gu,'').replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim();

function assetKey(s){
  if(/\b(?:both|all)\s+(?:source\s+)?(?:photos?|images?|references?)\b/iu.test(s))return 'all';
  for(const [key,words,n] of [['first','first|1st|pehli|pahli',1],['second','second|2nd|doosri|dusri',2],['third','third|3rd|teesri',3]]){
    if(new RegExp(`\\b(?:${words})\\b[^.!?;\\n]{0,65}\\b(?:photo(?:graph)?|image|picture|reference)\\b|\\b(?:photo|image|reference)\\s*${n}\\b`,'iu').test(s))return key;
  }
  return null;
}
function frameKind(s){
  if(/close[- ]up/iu.test(s))return 'close-up';
  if(/wide[- ](?:angle|shot|view)|wider\s+shot/iu.test(s))return 'wide';
  if(/rear[- ]view|side[- ]view|top[- ]down/iu.test(s))return norm(s.match(/rear[- ]view|side[- ]view|top[- ]down/iu)[0]);
  if(extent.test(s) || [...s.matchAll(whole)].some(m=>!abstract.test(m[1])))return 'full-object';
  return null;
}
function reportedCoverage(evidence,key,kind,claim){
  const statements=evidence.reportedStatements || evidence.reportedFacts || [];
  const count=statements.map(s=>s.match(/\b(one|two|three|ek|do|teen|[1-9])\b[^.!?]{0,25}\b(?:photos?|images?|pictures?)\b/iu)).filter(Boolean).at(-1)?.[1];
  const single=/^(?:one|ek|1)$/iu.test(count || '');
  const relevant=statements.filter(s=>{
    const owner=assetKey(s);
    const matches=owner==='all' || (key && owner===key) || (single && (!owner || owner==='first'))
      || (!key && !owner && !count);
    const type=frameKind(s);
    return matches && (!claim || sameSubject(s,claim)) && (type===kind || (kind==='full-object' && /(?:shows|contains|covers|includes)[^.!?]{0,55}\b(?:full|whole|entire)\b/iu.test(s)));
  });
  const fact=relevant.at(-1);
  return Boolean(fact && !denied(fact));
}

function localQualification(s,kind){
  const clean=s.replace(/[*_`"“”]/gu,'');
  const match=clean.match(/\b(?:only if|if|when|provided that|agar)\b[^.;!?\n]*|यदि[^।\n]*/iu);
  if(!match)return false;
  const condition=match[0].split(/,|\bthen\b|\btoh\b/iu)[0];
  const required=/required (?:view|framing|coverage)|this (?:view|framing)|complete view/iu.test(condition)
    || (kind==='full-object'?frameKind(condition)==='full-object':frameKind(condition)===kind);
  const remainder=clean.slice(clean.indexOf(condition)+condition.length).replace(/pull[- ]back/giu,'');
  const view=remainder.match(/\b(?:rear|back|underside)\b/iu)?.[0];
  const viewCovered=!view || new RegExp('\\b'+view+'\\b','iu').test(condition) || /required view/iu.test(condition);
  return viewCovered && conditionSupports(condition,clean) && required && source.test(condition) && /\b(?:covers|contains|shows|includes|provided|available|present|visible|confirms|has)\b|में|दिख/iu.test(condition)
    && !/\b(?:not|no|unknown|missing|lacks?|nahi|nahin|nhi)\b|नहीं/iu.test(condition);
}
const heading=s=>/^\s*(?:#{1,4}\s|\*\*[^\n]+\*\*\s*$)/u.test(s);
const assetDescription=s=>source.test(s) && (/(?:shows?|contains?|covers?|depicts?|includes?|exists?|dikhati|dikhata|dikhte|mein|है|दिखाती|दिखाता)/iu.test(s)
  || /(?:approved|supplied|provided|your|first|second|pehli|doosri)[^.!?;]{0,45}(?:close[- ]up|wide[- ]angle|rear[- ]view|side[- ]view)[^.!?;]{0,30}(?:photo|image)/iu.test(s));
function claimIn(s,evidence,key,label=false,prompt=false){
  const marker=[...s.matchAll(whole)][0] || result.exec(s);
  const status=interpretation(s,marker?.index || 0,(marker?.index || 0)+(marker?.[0].split(/\s/u)[0].length || 0),{prompt});
  if(['rejected','example'].includes(status.kind))return null;
  if(evidence.allowFictionalStaging && !assetDescription(s))return null;
  const kind=frameKind(s);
  const complete=extent.test(s) || [...s.matchAll(whole)].some(m=>!abstract.test(m[1]));
  if(complete && result.test(s) && reliable.test(s))return {kind:'generation-guarantee',coverage:'full-object'};
  if(kind && assetDescription(s) && !possibility.test(s) && !localQualification(s,kind) && !reportedCoverage(evidence,key,kind,s))return {kind:'source-framing',coverage:kind};
  const unseen=/(?:reveal(?:ing)?|show|expose|generate|reconstruct)[^.;!?]{0,65}\b(?:more|unseen|hidden|missing|underside|rear|back|beyond)\b/iu.test(s);
  if(!complete && !unseen)return null;
  // A requested crop is not an assertion about the original framing. A promise
  // that a prompt/clip reveals the complete subject is an output claim.
  if(/\b(?:request|ask for|obtain|need)\b[^.!?;]{0,70}(?:photo|image|reference|view)/iu.test(s)
    && !/\b(?:will|guarantee|generate)\b|karega|dikhayega/iu.test(s))return null;
  const conceptual=/\b(?:sahi|correct direction|right direction)\b/iu.test(s)
    && !/\b(?:will|guarantee|generate|reliably)\b|karega|dikhayega|dikha paoge/iu.test(s);
  if(conceptual || possibility.test(s))return null;
  if((result.test(s) || unseen || heading(s) || label) && !localQualification(s,'full-object') && !reportedCoverage(evidence,key,'full-object',s))return {kind:'result-coverage',coverage:'full-object'};
  return null;
}

function sectionKeys(lines){
  const keys=new Map();let start=0;
  const starts=lines.map((s,i)=>/^\s*(?:\*\*|#{1,4}\s*)?(?:Clip|Shot|Scene)\s*\d+/iu.test(s)?i:-1).filter(i=>i>=0);
  for(let n=0;n<starts.length;n++){
    start=starts[n];const end=starts[n+1] ?? lines.length;
    const found=[...new Set(lines.slice(start,end).map(assetKey).filter(Boolean))];
    if(found.length===1)for(let i=start;i<end;i++)keys.set(i,found[0]);
  }
  return keys;
}
function conditionalize(text,isHeading){
  if(isHeading){const close=text.endsWith('**')?'**':'';return text.slice(0,text.length-close.length)+' — only if the supplied reference covers this view; otherwise partial'+close;}
  const prefix=text.match(/^\s*(?:(?:[-*]|\d+[.)])\s+)?(?:\*\*[^*\n]+:\*\*\s*)?/u)?.[0] || '';
  let raw=text.slice(prefix.length).trim();
  const condition=interpretation(raw,0,0).condition;
  if(condition && raw.toLowerCase().startsWith(condition.toLowerCase()))raw=raw.slice(condition.length).trim();
  let body=raw.replace(/^(?:but|however|yet|lekin|magar)\b\s*,?\s*/iu,'').replace(/[.]$/u,'')
    .replace(/\bwill\b/giu,'may').replace(/\breliably\b|\bdefinitely\b|\balways\b|\bcertainly\b|\bperfectly\b|\b100\s*%/giu,'')
    .replace(/\bguaranteed\b/giu,'possible, subject to checking the generated output').replace(/\bguarantees?\b/giu,'aims to').replace(/\breveal karega\b/giu,'reveal kar sakta hai').replace(/\bdikhayega\b/giu,'dikha sakta hai');
  const move=body.match(/horizontal pan|vertical pan|\bpan\b|\btilt\b|pull[- ](?:out|back)|zoom[- ]out/iu)?.[0];
  if(move && !/editorial/iu.test(body))body=body.replace(move,'editorial '+move)+' within the supplied image bounds';
  return prefix+'Only if the supplied reference actually covers this framing and required view, '+body+'. Otherwise keep the same step with the available partial view or request the missing reference.';
}

function inspectCoverageClaims(reply,evidence,{rewrite=false}={}){
  const issues=[],edits=[];let answer=String(reply);
  if(!evidence.hasRealAsset)return {answer,issues,edits};
  const lines=answer.split('\n'),bindings=sectionKeys(lines);let inFence=false,inPrompt=false;
  for(let i=0;i<lines.length;i++){
    const line=lines[i];if(/^\s*```/u.test(line)){inFence=!inFence;continue;}
    if(/^\s*(?:\*\*|#{1,4})/u.test(line))inPrompt=/prompt/iu.test(line);
    // Example scope belongs to one proposition, never an entire line.
    // Condition cells in place; never flatten a useful scene table into prose.
    const table=/^\s*\|/u.test(line);
    const parts=table?line.split('|').slice(1,-1):heading(line)?[line]:line.split(/(?=\b(?:but|however|yet|lekin|magar)\b)/iu).flatMap(clause=>clause.match(/[^.!?।;]+[.!?।;]?/gu) || []);
    for(const span of parts){
      const key=assetKey(span) || bindings.get(i) || null;
      if(!inFence && !inPrompt && interpretation(span).kind==='example')continue;
      const claim=claimIn(span,evidence,key,table,inFence||inPrompt);if(!claim)continue;
      const replacement=conditionalize(span,heading(line));
      issues.push({code:'unverified_asset_coverage',claimKind:claim.kind,assetKey:key,span,replacement,repaired:false,
        detail:'Unknown source framing/complete-object coverage must stay unknown in every introduction, heading, explanation, edit note and conclusion. A conditional prompt cannot license a separate guarantee.'});
      if(rewrite && replacement!==span && answer.includes(span)){
        const start=answer.indexOf(span);
        // Give the newly conditioned clause its own sentence. Earlier unknown
        // evidence must survive, rather than swallowing the local condition.
        const before=answer.slice(0,start);
        const prefix=/^\s*(?:but|however|yet|lekin|magar)\b/iu.test(span)?before.replace(/,\s*$/u,'. '):before;
        answer=prefix+replacement+answer.slice(start+span.length);
        edits.push({code:'whole_answer_coverage_conditioned',before:span,after:replacement});
      }
    }
  }
  return {answer,issues,edits};
}
const coveragePolicy='Use the same source evidence in every answer section. Approved does not mean close-up, wide or full-object coverage. Do not assign framing to Photo 1/2 unless the learner reported it. Full-view headings, explanations, edit labels and conclusions must be conditional when coverage is unknown, even if the generation prompt already has safeguards. Do not promise a reliable complete-object generation. Preserve the camera plan and useful steps; condition the specific claim or request the missing reference.';
module.exports={inspectCoverageClaims,coveragePolicy};
