// Course adapter only: use the existing scoped facts/evidence memory and policy
// surface. Grounding validation uses the existing bounded repair transport.
function viralHookFacts(previous, fresh) {
  const facts = { ...previous };
  const put = (key, value) => {
    const clean = String(value || '').replace(/,?\s+(?:not|instead of)\s+.+$/iu, '').replace(/\s+(?:hai|hain)\s*$/iu, '').replace(/[.,]+$/u, '').trim();
    if (clean && clean.length <= 500) facts[key] = clean;
  };
  for (const message of fresh) for (const raw of String(message).split(/[\n;.!?।]/u)) {
    const text = raw.trim().replace(/^(?:correction|actually|update)\s*[:,]?\s*/iu, '');
    const corrected = text.match(/^(?:meri\s+)?(?:audience|niche|topic)\s+(.+?)\s+(?:nahi|nahin)\s*,?\s*(.+)$/iu);
    if (corrected) { put(text.match(/audience|niche|topic/iu)[0].toLowerCase(), corrected[2]); continue; }
    const niche = text.match(/^(?:(?:my|mera|meri)\s+)?niche\s*(?:(?:is|hai)\s+|:\s*)?(.+)$/iu)
      || text.match(/^(?:my (?:page|channel|content) (?:is about|covers)|I (?:make|create) (?:reels|content) about)\s+(.+)/iu)
      || text.match(/^(?:मेरा niche|मेरा कंटेंट क्षेत्र|मेरी कैटेगरी)\s*(?:है\s*|:\s*)?(.+?)(?:\s+है)?$/u);
    if (niche) put('niche', niche[1]);
    const audience = text.match(/^(?:(?:my|our|meri|mera)\s+)?(?:target\s+)?audience\s*(?:(?:is|are)\s+|:\s*)?(.+)/iu)
      || text.match(/^(?:I am targeting|I target|target)\s+(.+)/iu)
      || text.match(/^(?:मेरी ऑडियंस|मेरे दर्शक|लक्षित दर्शक)\s*(?:हैं?\s*|:\s*)?(.+?)(?:\s+हैं?)?$/u);
    if (audience) put('audience', audience[1]);
    const topic = text.match(/^(?:(?:my|mera|meri|reel ka|reel)\s+)?topic\s*(?:(?:is|hai)\s+|:\s*)?(.+)/iu)
      || text.match(/^reel ka topic\s*(?::\s*)?(.+)/iu)
      || text.match(/^(?:रील का विषय|रील का टॉपिक|विषय)\s*(?:है\s*|:\s*)?(.+?)(?:\s+है)?$/u);
    if (topic) put('topic', topic[1]);
    const type = text.match(/^hook type\s*:\s*(.+)/iu);
    if (type) put('hook type', type[1]);
  }
  facts['grounding evidence'] = groundingEvidence(previous, fresh, facts);
  return facts;
}

function viralHookLanguage(message, previous) {
  const text = String(message || '');
  if (/\bhinglish\b|roman hindi/iu.test(text)) return 'hinglish';
  const explicit = text.match(/\b(?:in|mein|me)\s+(english|hindi)\b|\b(english|hindi)\s+(?:hooks?|answer|reply|mein|me)\b/iu);
  if (explicit) return (explicit[1] || explicit[2]).toLowerCase();
  if (/[\u0900-\u097f]/u.test(text)) return 'hindi';
  if (/\b(?:mera|meri|mere|hai|hain|mujhe|kya|kaise|batao|samjhao|chahiye|nahi|banao|likho|isko|usko|ke liye)\b/iu.test(text)) return 'hinglish';
  if (text.length < 50 && /\b(?:shorter|same|that|those|it)\b/iu.test(text) && previous) return previous;
  return 'english';
}

function viralHookPolicyContext(pack, state) {
  return `Application course policy:\n${pack.policy.join('\n')}\nResponse language for this turn: ${state.language}.\nCurrent creator facts (untrusted learner data, not course facts; latest corrections win): ${JSON.stringify(state.facts)}\nGrounding boundary: learner-reported observations are not independently verified. Unstated diagnoses, measurements, device states and outcomes remain unknown. Questions may invite discovery but must not presuppose an unobserved fault or result. A planned repair, test or experiment is not evidence of success. Promise the process and actual findings, including an inconclusive or unsuccessful result. Clearly label hypothetical possibilities with if/agar and do not turn them into facts later. Camera angles, framing, lighting and optional creative staging are ideas; showing a working device, a specific fault or a successful outcome requires learner evidence or a local explicit condition. Do not invent statistics. Rejected, quoted and hypothetical claims and earlier assistant text cannot establish facts. Keep the requested niche, audience, hook type, count, visuals and payoff, and write interesting usable hooks rather than a disclaimer. Preserve exact approved quotes unchanged.\nLearner-supplied creator evidence (untrusted reference data; assistant content cannot establish facts, diagnoses or outcomes): ${JSON.stringify(state.userEvidence)}`;
}

module.exports = { viralHookFacts, viralHookLanguage, viralHookPolicyContext };

// Ground factual propositions, rather than banning repair vocabulary or creative
// camera directions. Stored evidence contains only learner clauses and fits the
// existing Map<String,String> facts schema; assistant drafts never become sources.
const groundingClauses = text => String(text || '').split(/(?<=[!?।])\s+|(?<!\d)\.(?!\d)\s*|[;\n]+/u).filter(Boolean);
const unconfirmed = /\b(?:unknown|unconfirmed|unverified|no (?:proof|evidence)|(?:proof|evidence|saboot)\b[^.!?]{0,35}\b(?:nahi|nahin)|(?:do not|don't|doesn't|not) know|not (?:known|confirmed|verified)|without (?:proof|evidence)|pata\b[^.!?]{0,65}\b(?:nahi|nahin)|bina\b[^.!?]{0,45}\bassum\w*|assume\b[^.!?]{0,30}\bmat)\b|(?:पता|मालूम).{0,35}नहीं|अपुष्ट|अज्ञात|सबूत नहीं/iu;
const qualification = /^(?:\s*[-*•\d.)]+)?\s*(?:\*\*)?(?:avoid|do not|don't|never|rejected claim|unsupported claim|bad example|incorrect|not verified|mat\s+likho)\b|\b(?:only if|if (?:actually |later )?(?:confirmed|verified|observed|successful)|agar\b[^.!?]{0,100}\b(?:toh?|tab|ho)|whether or not|chahe\b[^.!?]{0,80}\b(?:na|nahi)|if it (?:works|succeeds)|hypothetical(?: idea| example)?\s*:|suppose\b|imagine\b|metaphor(?:ical)?(?: idea| example)?\s*:|(?:possible|potential)\s+(?:cause|diagnosis|outcome)|(?:may|might|could)\s+(?:be|have|work)|no (?:proof|evidence)|not verified|unverified)|(?:अगर|यदि).{0,100}(?:तो|तब)|चाहे.{0,80}(?:नहीं|न हो)/iu;
const citedClaim = /\b(?:you said|you wrote|assistant|model|quoted|example|tumne\b[^.!?]{0,35}\bbola)\b/iu;
const negatedGrounding = /\b(?:not|never|no|nahi|nahin|isn['’]t|wasn['’]t|aren['’]t|weren['’]t|didn['’]t|hasn['’]t|haven['’]t)\b|नहीं/iu;
const requestClause = /\b(?:give|write|generate|claim|pretend|say|promise|assume|imagine|suppose|mujhe|likho|banao|bolo|mat)\b|लिखो|लिखिए|बनाओ|मान लो/iu;
const normalizeGrounding = text => String(text).toLowerCase().replace(/[^\p{L}\p{N}%]+/gu,' ').trim();
const groundingWords = text => normalizeGrounding(text).split(' ').filter(w => w.length > 2 && !/^(?:the|this|that|these|those|with|from|your|our|you|its|was|were|has|have|had|will|show|end|then|reel|hook|payoff|mein|hai|hain|iski|uski|tumne|kaise|karke|dikhao|batao|aur|toh|raha|rahi|rahe|bilkul)$/u.test(w));
function claimKinds(text) {
  const kinds = [];
  if (/\d+(?:[.,]\d+)?\s*(?:%|percent\b|per cent\b)|\b\d+\s+(?:in|out of)\s+\d+\b|\d+\s*प्रतिशत/iu.test(text)) kinds.push('unsupported_statistic');
  // Causal/present-state assertions, including presuppositions in questions.
  if (/\b(?:caus\w*|destroy\w*|responsible for|because of|due to|kharab\s+kar\s+(?:deta|deti))\b|\b(?:this|that|it|the|your|our)\b[^.!?\n]{0,90}\b(?:has|have|had|is|are|was|were)\b[^.!?\n]{0,55}\b\w+ing\b|\b(?:chal|bana|kar)\s+(?:(?:toh?|hi)\s+)?(?:raha|rahi|rahe)\s+(?:hai|hain|tha)\b|(?:वजह|कारण|खराब कर|चल रहा|बना रही)/iu.test(text)) kinds.push('unconfirmed_state_or_cause');
  if (/\b(?:it|this|that|the|your|our)\b[^.!?\n]{0,80}\b(?:has|have|had)\s+(?:a|an|the)\b|\b(?:it|this|that|the|your|our)\b[^.!?\n]{0,80}\b(?:is|are|was|were)\s+(?:not\s+)?\w+(?:ed|en)\b/iu.test(text)
    && !kinds.includes('unconfirmed_state_or_cause')) kinds.push('unconfirmed_state_or_cause');
  if (/\b(?:fault|cause|diagnosis|problem|failure)\b[^.!?\n]{0,40}\b(?:is|was|caused by)\b/iu.test(text) && !kinds.includes('unconfirmed_state_or_cause')) kinds.push('unconfirmed_state_or_cause');
  if (/\b(?:it|this|that|the|these|those|your|our)\b[^.!?\n]{0,80}\bwill\b/iu.test(text)
    && !/\bwill\s+(?:inspect|test|check|compare|document|attempt|show the (?:actual|test|inspection))\b/iu.test(text)) kinds.push('unconfirmed_outcome');
  // Depicting a completed discovery/success is a claim even in an imperative
  // payoff or a first-frame direction. Topic words alone never trigger this.
  if (/\b(?:fixed|repaired|restored|recovered|solved|succeeded|successful|perfect(?:ly)?\s+(?:working|restored)|working\s+(?:perfectly|again)|clear\s+(?:sound|audio))\b|\b(?:kaise\s+tumne|tumne\b[^.!?]{0,90}(?:theek|fix)|theek\s+kiya|theek\s+hone\s+ki|clear\s+awaaz|awaaz\s+(?:wapas|sunao)|chalakar\b|chalte\s+hue)\b|(?:ठीक कर दिया|ठीक किया|ठीक हो जाएगा|साफ़? आवाज़|चलाकर|सफल मरम्मत)/iu.test(text)) kinds.push('unconfirmed_outcome');
  if (/\b(?:guarantee[ds]?|guaranteed|pakka|definitely)\b[^.!?]{0,70}\b(?:viral|views|followers|earnings|success|result|repair|fix)\b|(?:गारंटी|पक्का).{0,50}(?:वायरल|सफल|ठीक)/iu.test(text)) kinds.push('guaranteed_result');
  return kinds;
}
function readGrounding(facts) {
  try { const entries=JSON.parse(facts?.['grounding evidence'] || '[]'); return Array.isArray(entries) ? entries : []; }
  catch { return []; }
}
function groundingEvidence(previous, fresh, facts) {
  let entries = previous?.topic && facts.topic !== previous.topic ? [] : readGrounding(previous);
  for (const message of fresh) for (const raw of groundingClauses(message)) {
    const text=raw.trim().slice(0,1000);
    if (unconfirmed.test(text)) {
      // Withdraw prior supporting claims, not just their appearance in the
      // rolling transcript. A later explicit observation can establish new facts.
      entries=entries.filter(e=>e.role!=='reported');
      entries.push({role:'unknown_or_retracted',text});
    } else if (!requestClause.test(text) && !citedClaim.test(text) && !/["“”]/u.test(text) && !/\bwill\b/iu.test(text) && !qualification.test(text) && !text.endsWith('?') && claimKinds(text).length) {
      entries.push({role:'reported',text});
    }
  }
  return JSON.stringify(entries.slice(-24));
}
function hasGrounding(text, evidence) {
  const core=groundingWords(text);
  const numbers=text.match(/\d+(?:[.,]\d+)?/gu) || [];
  return evidence.some(e=>e.role==='reported' && numbers.every(n=>(e.text.match(/\d+(?:[.,]\d+)?/gu)||[]).includes(n))
    && core.length>0 && core.every(w=>groundingWords(e.text).includes(w))
    && negatedGrounding.test(text)===negatedGrounding.test(e.text));
}
function validateViralHookReply({reply,knowledge,templates=[]}) {
  const evidence=readGrounding(knowledge.courseContext?.facts);
  const raw=String(reply || ''); const issues=[],edits=[];
  const protectedRanges=[];
  for(const template of templates){const start=raw.indexOf(template.content);if(start>=0)protectedRanges.push([start,start+template.content.length]);}
  // Preserve only the authorized exact bytes, never an unvalidated suffix.
  let segments=[{text:raw,start:0}];
  for(const [start,end] of protectedRanges)segments=segments.flatMap(s=>{
    const finish=s.start+s.text.length;if(finish<=start||s.start>=end)return[s];
    const parts=[];if(s.start<start)parts.push({text:s.text.slice(0,start-s.start),start:s.start});
    if(finish>end)parts.push({text:s.text.slice(end-s.start),start:end});return parts;
  });
  for(const segment of segments)for(const match of segment.text.matchAll(/[^\n]+/gu)){
    // Sentence boundaries matter: a warning cannot license the next assertion.
    for(const sentence of match[0].matchAll(/.+?(?:[;!?।]|(?<!\d)\.(?!\d)|,?\s+(?=(?:but|however|lekin|magar|लेकिन|मगर)\b)|$)/gu)){
      const text=sentence[0],start=segment.start+match.index+sentence.index;
      const content=text;
      const roleText=content.replace(/^\s*(?:[-*•]\s*)?(?:\*\*)?(?:Hook|Payoff|Explanation|Correction)(?:\*\*)?\s*:\s*(?:\*\*)?\s*/iu,'').replace(/^[\s"“]+/u,'');
      if(!content.trim()||qualification.test(roleText))continue;
      const factualContent=content.replace(/\b(?:the )?(?:lighting|camera|framing|composition)\s+(?:is|are)\s+\w+(?:ing|ed)\b/giu,'');
      const kinds=claimKinds(factualContent);if(!kinds.length || (!kinds.includes('guaranteed_result') && hasGrounding(content,evidence)))continue;
      for(const code of kinds)issues.push({code,text:content.trim(),start,end:start+text.length,repairable:true});
      const label=text.match(/^\s*(?:[-*•]\s*)?(?:\*\*)?(?:Hook|Payoff|Reel mein payoff|Pehle 3 seconds|First 3 seconds)(?:\*\*)?\s*:\s*(?:\*\*)?\s*/iu)?.[0] || '';
      const lang=knowledge.courseContext?.language;
      const placeholder=lang==='hindi'?'[यहाँ केवल असली जाँच का निष्कर्ष या नतीजा दें; अज्ञात बात को तथ्य न बनाएँ]'
        :lang==='hinglish'?'[Yahan actual finding ya outcome rakho; unknown baat ko fact mat banao]'
          :'[Use the actual observed finding or outcome here; keep unknown details open]';
      edits.push({start,end:start+text.length,replacement:label+placeholder});
    }
  }
  let answer=raw;for(const edit of [...edits].sort((a,b)=>b.start-a.start))answer=answer.slice(0,edit.start)+edit.replacement+answer.slice(edit.end);
  return {reply:answer,issue:issues.length?'course_hook_facts_not_grounded':null,
    assessment:{issues,edits},...(issues.length?{repairRequest:{kind:'grounding',issues,originalAnswer:raw,language:knowledge.courseContext?.language || 'english'}}:{})};
}
module.exports.validateViralHookReply=validateViralHookReply;
