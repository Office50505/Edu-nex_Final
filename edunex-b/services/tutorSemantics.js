// Shared interpretation, independent of correction. Quoting a sales claim does
// not verify it; a locally labelled example or rejected claim is not sales copy.
const {negatedAt,motionPattern,moveNames}=require('./tutorNegation');
const normalize=s=>String(s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim();
const uncertain=s=>/\b(?:unknown|unconfirmed|unverified|uncertain|might|may|maybe|perhaps|possibly|shayad|shayd)\b|हो सकता|शायद|अज्ञात|अपुष्ट/iu.test(s);
const fictional=s=>/\bfictional\b[^.!?]{0,70}\b(?:scene|story|series|world|character|presenter|influencer|model)\b|\b(?:scene|story|series)\b[^.!?]{0,60}\bfictional\b|\b(?:write|create|imagine|invent)\b[^.!?]{0,40}\b(?:cartoon|fantasy)\b[^.!?]{0,30}\b(?:scene|story|world|series)\b|काल्पनिक/iu.test(s)
 && !/\b(?:real product|I sell|my business|actual property)\b/iu.test(s);

function clauseAt(text,start,end=start){
 const left=String(text).slice(0,start).split(/[.!?;।\n]|\b(?:but|however|yet|lekin|magar)\b/iu).at(-1);
 const right=String(text).slice(end).split(/[.!?;।\n]|\b(?:but|however|yet|lekin|magar)\b/iu)[0];
 return {text:left+String(text).slice(start,end)+right,before:left,after:right};
}
function interpretation(text,start=0,end=String(text).length,{prompt=false}={}){
 const c=clauseAt(text,start,end),before=c.before,after=c.after;
 const rejected=negatedAt(text,start,end)
  || /\b(?:unverified|unconfirmed|unknown|no evidence|rejected claim|not established|not guaranteed)\b[^,;.!?]{0,60}$/iu.test(before)
  || /^\s*(?:(?:is|are|remains?)\s+)?(?:unverified|unconfirmed|unknown|not confirmed|needs? verification)/iu.test(after)
  || /^\s*(?:[\p{L}\p{M}'-]+\s+){0,3}(?:nahi|nahin|नहीं|मत)\s*(?:है|हैं|दिखा|दिखे|होगा|चाहिए|hai|chahiye|bolo|kaho)/iu.test(after.split(/\b(?:and|aur|or|ya)\b|और|या/iu)[0]);
 const example=!prompt && /^\s*(?:[-*]\s*)?(?:\*\*)?(?:hypothetical(?: example)?(?: only)?|example(?: only)?|illustration|jaise|उदाहरण)\s*:/iu.test(c.text);
 const conditional=c.text.match(/\b(?:only if|if|when|provided that|agar)\b([^;.!?\n]*?)(?:,|\bthen\b|\btoh\b|$)|यदि([^।\n]*?)(?:,|तो|$)/iu);
 return {kind:rejected?'rejected':example?'example':conditional?'conditional':'assertion',clause:c.text,
  condition:conditional?.[0] || null,conditionBody:conditional?.[1] || conditional?.[2] || ''};
}
const denied=s=>{
 const t=String(s);return uncertain(t) || [...t.matchAll(/\b(?:no|not|never|without|nahi|nahin|nhi|mat)\b|नहीं|मत/giu)]
  .some(m=>!/^\s+(?:only|just)\b/iu.test(t.slice(m.index+m[0].length)));
};
function requires(text,pattern){
 return [...String(text).matchAll(new RegExp(pattern.source,pattern.flags.replace(/g/gu,'')+'g'))]
  .some(m=>interpretation(text,m.index,m.index+m[0].length).kind!=='rejected');
}
function supportsFact(detail,statements){
 const wanted=normalize(detail);if(!wanted)return false;
 const latest=statements.filter(s=>normalize(s).includes(wanted)).at(-1);
 return Boolean(latest && !denied(latest) && !/[?？]\s*$/u.test(latest)
  && !/\b(?:if|agar|hypothetical|example|pretend|claim|assume)\b|यदि|उदाहरण/iu.test(latest));
}
// Subject binding makes a condition about one object insufficient for another.
// Generic source-relative "required view" conditions apply to that same step.
function conditionSupports(condition,claim){
 return Boolean(condition && !denied(condition) && sameSubject(condition,claim));
}
function sameSubject(condition,claim){
 if(/required (?:view|framing|coverage)|this (?:view|framing)/iu.test(condition))return true;
 const subjects=s=>[...s.matchAll(/(?:\b(?:full|whole|entire|complete|poora|poore|poori|pura|puri)\b|पूरा|पूरी|पूरे)\s+([\p{L}\p{M}\d'-]+(?:\s+[\p{L}\p{M}\d'-]+){0,2})/giu)]
  .map(m=>normalize(m[1]).split(/\s+(?:is|are|will|can|ko|ka|ki|hai|view|shows|and)\b/iu)[0]);
 const offset=claim.indexOf(condition);
 const given=subjects(condition),wanted=subjects(offset>=0?claim.slice(offset+condition.length):claim);
 return !wanted.length || (given.length>0 && wanted.every(w=>given.some(g=>g===w || g.startsWith(w+' ') || w.startsWith(g+' '))));
}
// The existing camera resolver remains unchanged. Give it a consistent view
// of negated mentions and conceptual comparisons, then restore those spans.
function cameraEvidence(text){
 const spans=[];
 for(const move of moveNames)for(const m of String(text).matchAll(motionPattern(move))){
  const c=clauseAt(text,m.index,m.index+m[0].length);
  const comparison=/\b(?:narrows|widens|unsuitable|opposite|wrong direction|against|not (?:suitable|effective)|galat)\b/iu.test(c.text)
   && !/\b(?:use|make|generate|perform|karo)\b/iu.test(c.text);
  if(comparison || (interpretation(text,m.index,m.index+m[0].length).kind==='rejected'&&!negatedAt(text,m.index,m.index+m[0].length)))spans.push({start:m.index,end:m.index+m[0].length,value:m[0]});
 }
 const unique=spans.filter((s,i)=>spans.findIndex(x=>x.start===s.start&&x.end===s.end)===i).sort((a,b)=>b.start-a.start);
 let result=String(text);const saved=[];
 for(const s of unique){const key=`⟦OPERATION${saved.length}⟧`;saved.push([key,s.value]);result=result.slice(0,s.start)+key+result.slice(s.end);}
 return {text:result,restore:value=>saved.reduce((s,[key,original])=>s.split(key).join(original),String(value))};
}
const evidencePolicy='Learner reports establish facts; requests, assistant history and course examples do not. Preserve confirmed details, creative preferences, exact retained text and scene-scoped constraints. Fictional plots and labelled hypotheses may be invented; never turn them into claims about a real product or source photo. Conditions apply only to the same proposition and source view. Unknown photo coverage stays unknown in every section. Preserve the resolved cameraPlan throughout. For unknown facts, use a conditional useful alternative or a clearly labelled optional field. A required unfinished deliverable must remain incomplete; placeholders alone do not complete it.';
module.exports={normalize,uncertain,fictional,clauseAt,interpretation,denied,requires,supportsFact,conditionSupports,sameSubject,cameraEvidence,evidencePolicy};
