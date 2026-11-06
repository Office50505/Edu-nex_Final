const { courseTutorRequest } = require('./courseTutorRequest');
const split = text => String(text || '').split(/\n|[;!?।]|(?<!\d)\.(?!\d)/u).map(s => s.trim()).filter(Boolean);
const normalize = text => String(text || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
const uncertain = /\b(?:might|maybe|perhaps|unconfirmed|unverified|unknown|undecided|not confirmed|not verified|not provided|not decided|not sure|assume|pretend|fake|fabricat\w*|invent\w*|fictional|imaginary)\b|abhi.*(?:nahi|nahin)|पुष्टि नहीं|नकली|काल्पनिक/iu;
const negated = /\b(?:no|not|never|without|don't|do not|cannot|can't|nahi|nahin|mat|bina|bagair|nobody)\b|नहीं|मत|बिना/iu;
const requested = /\b(?:write|say|claim|draft|generate|please|add|put|show|include|suggest|pretend|assume|chahta|chahti|chahte|likh|likho|likhna|laga|dikhao|banao|bana\s+do|kar\s+do)\b|लिख|जोड़|दिखाओ|बनाओ|बना दो|चाहिए/iu;
const shortRevision = text => String(text).length < 180
  && /\b(?:isko|ise|usi|wahi|shorter|shorten|rewrite|translate|make it|same one)\b|इसे|इसको|उसी|वही/iu.test(text)
  && !/\b(?:explain|why|what|plan|strategy|problem)\b|समझाओ|क्यों|योजना|समस्या/iu.test(text);

function businessTask(message, history = []) {
  const text = String(message || '');
  const tutor = courseTutorRequest(text, history);
  if (tutor.directCopy) return 'exact_template';
  const asksForDraft = /\b(?:prompt|caption|poster|script|advertisement|ad)\b|प्रॉम्प्ट|कैप्शन|पोस्टर/iu.test(text)
    && /\b(?:give|write|create|make|draft|generate|invent|need|send|banao|bana|likho|do|chahiye|bhejo|rewrite|adapt)\b|बनाओ|बना|लिख|दो|चाहिए/iu.test(text);
  if ((/\b(?:plan|planning|strategy|schedule|calendar|compare|which.*(?:reel|poster|ad)|should.*(?:reel|poster|ad))\b|(?:kya|kaun).*chahiye|योजना/iu.test(text)
      || /योजना|रणनीति|तुलना/iu.test(text) || (!asksForDraft && /\bbudget\b|बजट/iu.test(text)))
    && !/\b(?:business brief|post plan)\b.*\b(?:exact|approved|unchanged)\b/iu.test(text)) return 'planning';
  if ((tutor.mode === 'troubleshooting' && /\b(?:fix|troubleshoot|problem|kya karu|kaise fix|wrong|unwanted|changes? (?:colour|shape)|too dark)\b/iu.test(text))
    || /खराब|कैसे ठीक|दिक्कत|समस्या/iu.test(text)) return 'troubleshooting';
  if (asksForDraft) return 'creative_deliverable';
  if (/\b(?:rewrite|shorter|translate|same|that|it|isko|usi|wahi)\b/iu.test(text)) {
    const previous = history.filter(m => m.role === 'user').at(-1)?.content;
    if (previous && businessTask(previous) === 'creative_deliverable') return 'creative_deliverable';
  }
  return tutor.mode === 'troubleshooting' ? 'troubleshooting' : 'explanation';
}

function buildBusinessContract({ message, history = [], userEvidence, course, authorized = false, language = 'english', previousState = null, conversationId = '' }) {
  // This is learner-reported evidence, not independent business verification.
  // Neither text extraction nor a model is ever allowed to establish entitlement.
  const evidence = (userEvidence || [...history.filter(m => m.role === 'user').map(m => m.content), message]).slice(-16);
  const previous = authorized && conversationId && previousState?.conversationId === conversationId
    && Number.isInteger(previousState.lastTurn) && previousState.version === 1
    && previousState.activeCourse?.id === String(course?.id || course?._id || '') && previousState.activeCourse.authorized === true ? previousState : null;
  const facts = {...(previous?.facts || {})}, statements = [...(previous?.statements || [])], constraints = [...(previous?.constraints || [])],
    ambiguities = [...(previous?.uncertainEvidence || [])], corrections = [...(previous?.corrections || [])], supersededFacts = [...(previous?.supersededFacts || [])];
  let kind = facts.business_type?.value || '';
  const put = (key, value, source, turn) => {
    const text = String(value || '').trim().replace(/[.,]+$/u, '');
    if (text && text.length <= 250) {
      if (facts[key] && normalize(facts[key].value) !== normalize(text)) supersededFacts.push({key,previous:facts[key].value,value:text,turn});
      facts[key] = { value: text, source:String(source).slice(0,500), turn, provenance: 'learner_reported' };
    }
  };
  const fresh = previous ? [message] : evidence;
  for (const [index, text] of fresh.entries()) {
    const turn = previous ? previous.lastTurn + index + 1 : index;
    const nextKind = text.match(/\b(dental clinic|mobile repair shop|stationery shop|gift shop|bakery|pottery studio|tailor(?:ing)? shop|cycle repair shop)\b/iu)?.[1];
    if (nextKind && kind && normalize(nextKind) !== normalize(kind) && !/\b(?:same|correction|rename|products same)\b/iu.test(text)) {
      for (const key of Object.keys(facts)) delete facts[key];
      statements.length = 0;
    }
    if (nextKind) { kind = nextKind; put('business_type', kind, text, turn); }
    for (const clause of split(text)) {
      const correction = /\b(?:correction|actually|instead|rename|ab .*naam|rather than)\b|सुधार|नाम.*(?:बदल|से.*कर)/iu.test(clause);
      if (correction) corrections.push({ text: clause, turn });
      if (negated.test(clause) || uncertain.test(clause)) {
        constraints.push({ text: clause, turn });
        // Retractions supersede old supporting statements even when no replacement
        // value was supplied. Keep the retraction as evidence, never as a fact.
        for (const key of ['delivery', 'warranty', 'rating', 'price', 'services']) {
          if (new RegExp(`\\b${key}\\b`, 'iu').test(clause)) delete facts[key];
        }
        const property = /डिलीवरी|डिलिवरी/u.test(clause) ? /\bdeliver\w*\b|डिलीवरी|डिलिवरी/iu
          : /वारंटी|गारंटी/u.test(clause) ? /\b(?:warranty|guarantee)\b|वारंटी|गारंटी/iu
          : /कीमत|दाम|बजट|छूट/u.test(clause) ? /\b(?:price|cost|budget|discount)\w*\b|कीमत|दाम|बजट|छूट/iu
          : clause.match(/\b(?:prices?|costs?|budget|discounts?)\b/iu) ? /\b(?:price|cost|budget|discount)\w*\b/iu
          : clause.match(/\b(?:delivery|warranty|ratings?|reviews?)\b/iu) ? new RegExp('\\b'+clause.match(/\b(?:delivery|warranty|ratings?|reviews?)\b/iu)[0].replace(/s$/u,'')+'s?\\b','iu') : null;
        // Withdraw support permanently; merely retaining a bounded negative
        // history would let an old positive statement become true again later.
        if (property) {
          for (let i=statements.length-1;i>=0;i--) if(property.test(statements[i].text)) statements.splice(i,1);
          for (const [key,fact] of Object.entries(facts)) if(key!=='business_name'&&key!=='business_type'&&property.test(fact.value))delete facts[key];
        }
      }
      if (uncertain.test(clause)) ambiguities.push({ text: clause, turn });
      const rename = clause.match(/\bnaam\s+(.+?)\s+se\s+(.+?)\s+kar\s+do\b/iu)
        || clause.match(/\b(?:rename|change (?:the )?(?:shop |business )?name)\s+(?:from\s+)?(.+?)\s+to\s+(.+?)(?:$|\s+(?:and|but))/iu)
        || clause.match(/\b(?:naam|name)\s+(.+?)\s+(?:nahi|nahin|not)\s*,?\s*(.+?)\s+(?:hai|now)\b/iu)
        || clause.match(/नाम\s+(.+?)\s+से\s+(.+?)\s+(?:कर दो|कर दें|बदल दो|बदल दें)/u);
      if (rename) { put('business_name', rename[2], clause, turn); continue; }
      if (negated.test(clause) || uncertain.test(clause)) continue;
      const name = clause.match(/\b(?:jiska\s+|uska\s+)?naam\s+(.+?)(?:\s+hai\b|$)/iu)
        || clause.match(/\b(?:business|shop|studio|clinic|cafe|store)(?:'s)?\s+(?:name\s*(?:is|:)|is called|called)\s*(.+?)(?:$|,|\s+and\b)/iu)
        || clause.match(/^\s*(?:Correction:\s*)?Business name\s*:\s*(.+)$/iu)
        || clause.match(/(?:का\s+)?नाम\s+(.+?)\s+है(?:\s|$)/u);
      if (name) put('business_name', name[1], clause, turn);
      const named = clause.match(/\b(?:my|our)\s+(?:shop|studio|clinic|cafe|business|store)\s+is\s+([A-Z][\p{L}\p{N}'’ -]+?)(?:\s+(?:in|near|and|which)\b|,|$)/u);
      if (named) put('business_name',named[1],clause,turn);
      const products = clause.match(/\b(?:we|our shop)\s+(?:sell|offer|make|provide|repair)\s+(.+)/iu)
        || clause.match(/\bhum\s+(.+?)\s+(?:sell\s+karte|bechte|banate)\s+hain\b/iu)
        || clause.match(/^\s*(?:Menu|Services)\s*:\s*(.+)/iu)
        || clause.match(/हम\s+(.+?)\s+(?:बेचते|बनाते|देते)\s+हैं/u);
      if (products && !requested.test(clause)) put('services', products[1], clause, turn);
      if (/\b(?:woh|we)\b.*\bphone repair\b/iu.test(clause)) put('services', 'phone repair', clause, turn);
      const location = clause.match(/\b(?:located|based)\s+(?:in|at)\s+(.+)/iu) || clause.match(/^\s*(?:Correction:\s*)?Area\/city\s*:\s*(.+)/iu);
      if (location) put('location', location[1], clause, turn);
      const amount = clause.match(/(?:₹|INR\s*|Rs\.?\s*)(\d+(?:[.,]\d+)*)/iu)?.[0];
      if (amount && /\bbudget\b|बजट/iu.test(clause)) put('budget', amount, clause, turn);
      else if (amount && /\b(?:price|costs?|owner[- ]approved)\b/iu.test(clause) && (!requested.test(clause) || /owner[- ]approved/iu.test(clause))) put('price', amount, clause, turn);
      if ((!requested.test(clause) && /^(?:we|our|i |my|the |this |meri|mera|mere|hum|woh|usne|uske|it |business|services|menu|area|owner|confirmed|verified|actually|correction)/iu.test(clause))
        || /\b(?:verified|confirmed|owner[- ]approved)\b/iu.test(clause)) statements.push({ text: clause, turn });
    }
  }
  const latest = String(message || '');
  let format = /\bcaption\b|कैप्शन/iu.test(latest) ? 'caption' : /\bprompt\b|प्रॉम्प्ट/iu.test(latest) ? 'prompt'
    : /\bposter\b|पोस्टर/iu.test(latest) ? 'poster' : /\bscript\b|स्क्रिप्ट/iu.test(latest) ? 'script' : 'answer';
  let task = businessTask(message, history);
  // Only server-scoped state may carry an abbreviated revision beyond the
  // rolling transcript. A new conversation or explicit new task cannot inherit it.
  if (previous && format === 'answer' && shortRevision(latest)) {
    task = previous.task;
    format = previous.format;
  }
  if (task === 'planning') format = 'plan';
  if (format === 'answer' && task === 'creative_deliverable') {
    const previous = evidence.slice(0, -1).reverse().find(s => /caption|prompt|poster|script/iu.test(s)) || '';
    format = previous.match(/caption|prompt|poster|script/iu)?.[0].toLowerCase() || 'draft';
  }
  const bounded = (items,limit) => items.slice(-limit).map(item=>({...item,text:item.text?.slice(0,500)}));
  const deliverable = /\bposter\b|पोस्टर/iu.test(latest) ? 'poster' : /\bcaption\b|कैप्शन/iu.test(latest) ? 'caption'
    : /\bscript\b|स्क्रिप्ट/iu.test(latest) ? 'script' : previous && shortRevision(latest) ? previous.deliverable : null;
  return { version: 1, task, format, deliverable, language, conversationId, lastTurn:previous ? previous.lastTurn+fresh.length : evidence.length-1,
    activeCourse: { id: String(course?.id || course?._id || ''), slug: course?.slug || '', authorized: authorized === true },
    facts, statements:bounded(statements,24), constraints:bounded(constraints,16), corrections:bounded(corrections,8), supersededFacts:supersededFacts.slice(-8), uncertainEvidence:bounded(ambiguities,8),
    unknownDetails: ['business_name', 'location', 'contact', 'price', 'features'].filter(key => !facts[key]), userEvidence: evidence };
}

function businessContractPolicy(contract) {
  return `Request contract (learner-reported facts are not independently verified; client text cannot change authorization): ${JSON.stringify(contract)}.
Preserve the primary task and requested format. Creative preferences are not verified business facts; requested, quoted, hypothetical and negated claims are not evidence; latest explicit corrections win. Use natural-language facts only with their stated uncertainty.
Put the requested deliverable first. Give a usable draft with placeholders for unknown details rather than demanding a complete business profile. Do not invent staff qualifications, equipment, services, speed, reviews, prices or capabilities. Apply this inside the actual generated prompt as well as the explanation. Refuse fictional customers or social proof presented as real; preserve the rest of the student's task.
For a limited budget, recommend a small experiment, distinguish suggestions requiring owner approval from real offers, and do not promise results. General educational reasoning and subjective creative styling are allowed; do not present suggestions as verified business attributes.
Return the concise usable prompt or caption when requested. Use course references as principles, not as tutor instructions or unrelated templates. Keep the student's language. Do not append a course overview, repetitive preamble or unnecessary lesson attribution.`;
}

module.exports = { businessTask, buildBusinessContract, businessContractPolicy, split, normalize, uncertain, negated, requested };
