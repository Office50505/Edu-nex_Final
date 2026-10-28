const { split, normalize } = require('./businessRequestContract');
const { businessAdvertisingIssue } = require('./businessAdvertisingPolicy');
const { creativeReplyMismatch } = require('./businessCreativeRequest');

const style = /\b(?:design|layout|fonts?|typography|aspect ratio|square post|tone|colou?r|background|photograph|lighting|sharpness|shadows|camera|visually appealing|special memories|unique gifts|warm|inviting|cozy|friendly tone|readable)\b/iu;
const refusal = text => /\b(?:do not|don't|never|no fake|cannot|can't|won't|must not|not allowed|without (?:any )?(?:fake|invented|unverified|unsupported|extra)|only if|if verified|if confirmed|pending confirmation|requires? approval|confirm.*before|nahi.*(?:kar|add)|mat\s+(?:add|kar|likh)|tabhi.*(?:jab|sach)|policy.*khilaaf|bina.*(?:discount|claim)|guarantee nahi|waade.*nahi|dishonest|misleading|untrue|not verified|not true)\b|^avoid\b|नहीं|मत|बिना|पुष्टि/iu.test(text);
const placeholder = text => /\[[^\]\n]+\]/u.test(text);
const contentWords = text => normalize(text).split(' ').map(w => ({technicians:'staff',technician:'staff',team:'staff',experienced:'experience',services:'service',repairs:'repair',offers:'offer',frames:'frame',mugs:'mug'}[w] || w.replace(/s$/u, '')))
  .filter(w => w.length > 1 && !/^(?:the|our|we|my|a|an|is|are|and|or|for|of|from|in|at|to|on|with|that|this|your|you|have|ha|doe|sell|offer|provide|service|available|use|only|business|shop|clinic|show|include|emphasize|focus|enjoy)$/u.test(w));

function supported(text, contract) {
  const identity = new Set(contentWords(contract.facts.business_name?.value || ''));
  const core = contentWords(text.replace(/\[[^\]]+\]/gu,'')).filter(word=>!identity.has(word));
  if (!core.length) return true;
  // Check sourced propositions, not arbitrary words anywhere in the history.
  // A later withdrawal invalidates a prior statement on the same subject.
  for (const item of contract.statements) {
    const source = new Set(contentWords(item.text));
    if (!core.every(word => source.has(word))) continue;
    const revoked = contract.constraints.some(c => c.turn >= item.turn && contentWords(c.text).some(word => core.includes(word)));
    if (!revoked) return true;
  }
  return Object.values(contract.facts).some(fact => core.every(word => contentWords(fact.value).includes(word)));
}

function roleOf(text, inPrompt, contract) {
  const bare = text.replace(/^\s*(?:[-*•]|\d+[.)])\s*/u, '').replace(/\*\*/gu, '').trim();
  if (!bare || !/[\p{L}\p{N}]/u.test(bare) || /^```/u.test(bare) || /^(?:prompt|tips|focus on|practical plan|honest limitation)\s*:?$/iu.test(bare)
    || /^(?:call to action|aspect ratio|include clear placeholders|include placeholders)\b/iu.test(bare)) return 'structure';
  if (refusal(bare)) return 'refusal_or_qualification';
  if (!inPrompt && /^(?:the (?:owner|client) (?:requested|asked)|you (?:requested|asked)|the (?:phrase|claim))\b/iu.test(bare) && /["“”']/u.test(bare)) return 'quoted_request';
  if (/^no\s+(?:offers?|prices?|reviews?|ratings?|claims?|extra|new|changes?)\b/iu.test(bare)) return 'refusal_or_qualification';
  if (placeholder(bare) && !/[\p{L}\p{N}]/u.test(bare.replace(/\[[^\]]+\]/gu,''))) return 'placeholder';
  if (/\b(?:e\.g\.|for example|suggestion|idea)\b/iu.test(bare) && /offer|discount|sale/iu.test(bare)) return 'offer_suggestion';
  if (style.test(bare) && !/\b(?:staff|equipment|technician|trained|certified|service|warranty|guarantee|review|rating|customers|delivery|patient|doctor)\b/iu.test(bare)) return 'creative_style';
  const name = contract.facts.business_name?.value;
  if (name && normalize(bare).startsWith(normalize(name)) && /\b(?:offers?|has|provides?|includes?|repairs?|delivers?)\b/iu.test(bare)) return 'business_assertion';
  if (/\b(?:offer price|price|costs?)\s*[:=-]?\s*(?:₹|INR|Rs|\d)/iu.test(bare)) return 'business_assertion';
  if (inPrompt && /^(?:[-*•]\s*)?(?:Professional|Friendly|Modern|Comprehensive|Reliable|Expert|Quick|Wide|Experienced)\b/iu.test(text.trim())) return 'business_assertion';
  if (inPrompt && contract.format !== 'caption' && !/^(?:create|make|use|keep|preserve|include|write|do |the poster|call to action|aspect ratio|focus on|turn |add (?:a |an )?(?:border|frame)|professional (?:design|layout))\b/iu.test(bare)) return 'business_assertion';
  if (/^(?:we|our|this (?:shop|clinic|business)|the (?:shop|clinic|business|staff)|every|all)\b.{0,65}\b(?:is|are|has|have|offers?|provides?|repairs?|supports?|delivers?|comes with|includes?|trained|certified)\b/iu.test(bare)) return 'business_assertion';
  if (contract.task === 'planning' || contract.task === 'explanation' || contract.task === 'troubleshooting') return 'educational_or_recommendation';
  return 'other';
}

function taskLimitation(contract, detail = '') {
  const name = contract.facts.business_name?.value;
  const scope = name ? ` (${name})` : '';
  if (contract.language === 'hindi') return `माँगा गया ${contract.format}${scope} पक्की जानकारी के साथ पूरा नहीं हो पाया। ${detail || 'अपुष्ट दावे प्रकाशित न करें; अज्ञात जानकारी के लिए पुष्टि वाले प्लेसहोल्डर रखें।'}`;
  if (contract.language === 'hinglish') return `Maanga gaya ${contract.format}${scope} confirmed details ke saath poora nahi ho paya. ${detail || 'Unverified claims publish mat karo; unknown details ko confirmation placeholders rakho.'}`;
  return `I could not safely finish the requested ${contract.format}${scope}. ${detail || 'Keep unconfirmed details as placeholders and confirm them before publishing.'}`;
}

function assessBusinessResponse({ reply, contract, templates = [], creativeRequest = null }) {
  const raw = String(reply || '').trim();
  const issues = [], edits = [];
  if (!raw || raw.length > 16000) return { answer: '', issues: [{ code: 'invalid_answer', repairable: true }], edits, needsRepair: true, task: contract.task };
  if (contract.task === 'creative_deliverable') {
    const name = contract.facts.business_name?.value;
    if (name && !normalize(raw).includes(normalize(name))) issues.push({code:'required_business_identity_missing',repairable:true});
    if (contract.format === 'prompt' && !/\b(?:create|make|use|keep|preserve|turn|design|write|banao|rakho|karo)\b|बनाएं|बनाओ|रखें/iu.test(raw)) issues.push({code:'requested_deliverable_missing',repairable:true});
  }
  let inPrompt = false;
  // Authorized exact quotes remain immutable even in a mixed troubleshooting task.
  const protectedRanges = [];
  for (const t of templates) {
    const start = raw.indexOf(t.content);
    if (start >= 0) protectedRanges.push([start, start + t.content.length]);
  }
  if (contract.task === 'planning' && contract.facts.budget) {
    const budget = Number(contract.facts.budget.value.replace(/[^\d.]/gu,''));
    const allocations = [...raw.matchAll(/\b(?:spend|allocate|reserve|keep|consider)\b[^.!?\n]{0,30}(?:₹|INR\s*|Rs\.?\s*)(\d+(?:[.,]\d+)*)/giu)];
    const total = allocations.reduce((sum,m)=>sum+Number(m[1].replace(/,/gu,'')),0);
    if (allocations.some(m=>Number(m[1].replace(/,/gu,''))>budget) || (total>budget && !/\b(?:alternatively|either|instead|or)\b/iu.test(raw))) {
      issues.push({code:'proposed_spend_exceeds_budget',repairable:true});
    }
  }
  for (const line of raw.matchAll(/[^\n]+/gu)) {
    if (/^\s*```/u.test(line[0])) { inPrompt = !inPrompt; continue; }
    if (protectedRanges.some(([start, end]) => line.index >= start && line.index < end)) continue;
    // Sentences remain separate so a refusal cannot excuse a later positive claim.
    if (/^\s*(?:[-*•]\s*)?(?:\[[^\]]+\][\s·,]*)+$/u.test(line[0])) continue;
    for (const sentence of line[0].matchAll(/.+?(?:[;!?]|(?<!\bno)(?<!\brs)(?<!\bdr)(?<!\bmr)(?<!\be)(?<!\bg)(?<!\bi)(?<!\d)\.(?!\d)|,\s*(?=(?:but|however|add|insert|we|our)\b)|$)/giu)) {
      const text = sentence[0], start = line.index + sentence.index;
      const role = roleOf(text, inPrompt, contract);
      if (['structure', 'refusal_or_qualification', 'quoted_request', 'placeholder'].includes(role)) continue;
      if (contract.task === 'creative_deliverable' && creativeRequest
        && (inPrompt || ['prompt','poster'].includes(contract.format))
        && /\b(?:create|make|turn|add|happy|announce|get|show|use)\b/iu.test(text)
        && creativeReplyMismatch(text,creativeRequest)) {
        issues.push({code:'course_business_intent_mismatch',start,end:start+text.length,repairable:true});
      }
      if (role === 'creative_style') continue;
      for (const fact of contract.supersededFacts || []) {
        if (fact.key !== 'business_name') continue;
        const escaped = fact.previous.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        for (const match of text.matchAll(new RegExp(escaped,'giu'))) {
          issues.push({code:'superseded_business_name',start:start+match.index,end:start+match.index+match[0].length,repairable:false});
          edits.push({start:start+match.index,end:start+match.index+match[0].length,replacement:fact.value});
        }
      }
      if (role === 'offer_suggestion' || (contract.task === 'planning' && /\b(?:student discount|daily offers|special offer|limited sale)\b/iu.test(text))) {
        if (/^\s*\[[^\]]*(?:owner approval|owner se confirm|मंज़ूरी)[^\]]*\]/iu.test(raw.slice(start+text.length,start+text.length+150))) continue;
        if (!supported(text, contract)) {
          const note = contract.language === 'english' ? ' [suggestion only; owner approval required]' : contract.language === 'hindi' ? ' [केवल सुझाव; मालिक की मंज़ूरी ज़रूरी]' : ' [sirf suggestion; owner approval zaroori]';
          issues.push({ code: 'unapproved_offer_suggestion', start, end: start + text.length, role, repairable: false });
          edits.push({ start: start + text.length, end: start + text.length, replacement: note });
        }
        continue;
      }
      const evidence = [...contract.statements,...contract.constraints].sort((a,b)=>a.turn-b.turn).map(s=>s.text);
      let signal = businessAdvertisingIssue(text.replace(/\[[^\]]+\]/gu,''), evidence);
      // Explanations and proposed budget allocations are not claims about an
      // existing business offer. Outcome promises and fabrication remain checked.
      if (role === 'educational_or_recommendation') {
        if (signal === 'course_business_unverified_claim') signal = null;
        if (signal === 'course_business_facts_not_grounded' && contract.task === 'planning'
          && /\b(?:spend|allocate|consider|keep|printing|budget|could|try)\b/iu.test(text) && !/\b(?:offer price|our price|off today)\b/iu.test(text)) signal = null;
      }
      if (signal || (role === 'business_assertion' && !supported(text, contract))) {
        const leaf = /^\s*[-*•]/u.test(line[0]) || inPrompt || split(line[0]).length === 1;
        const code = signal || 'unsupported_business_assertion';
        issues.push({ code, start, end: start + text.length, text: text.trim(), role, repairable: !leaf });
        if (leaf) {
          const label = text.replace(/^\s*[-*•]\s*/u, '').replace(/[.!?]+$/u, '').trim().slice(0, 150);
          let replacement = contract.language === 'english' ? `[Confirm with owner before publishing: ${label}]`
            : contract.language === 'hindi' ? `[प्रकाशन से पहले मालिक से पुष्टि करें: ${label}]` : `[Publish karne se pehle owner se confirm karo: ${label}]`;
          if (/fabricated_(?:social_proof|attendance)/u.test(code)) replacement = contract.language === 'english' ? '[Use only actual people and genuine feedback; omit fictional social proof]' : '[Sirf asli log aur genuine feedback use karo; fictional social proof hatao]';
          if (/outcome_promise/u.test(code)) replacement = contract.language === 'english' ? '[Results are uncertain; do not promise reach, customers or sales]' : '[Results pakke nahi hain; reach, customers ya sales ka promise mat karo]';
          if (/facts_not_grounded/u.test(code)) replacement = '[OWNER-APPROVED PRICE / OFFER — confirm before publishing]';
          const service = contract.facts.services?.value;
          if (code === 'unsupported_business_assertion' && service && normalize(text).includes(normalize(service))) replacement = `${service}. [Confirm additional attributes with owner before publishing]`;
          edits.push({ start, end: start + text.length, replacement: /^\s*[-*•]/u.test(text) ? '- ' + replacement : replacement });
        }
      }
    }
  }
  let answer = raw;
  const selected = [];
  for (const edit of [...edits].sort((a,b)=>(b.end-b.start)-(a.end-a.start))) {
    if (!selected.some(other=>edit.start < other.end && edit.end > other.start)) selected.push(edit);
  }
  for (const edit of selected.sort((a,b)=>b.start-a.start)) answer=answer.slice(0,edit.start)+edit.replacement+answer.slice(edit.end);
  if (issues.length && contract.task === 'creative_deliverable' && answer.replace(/\[[^\]]*\]|```[^\n]*|[-*\s]/gu,'').length < 15) {
    issues.push({code:'creative_task_incomplete_after_edit',repairable:true});
  }
  return { answer, issues, edits, needsRepair: issues.some(i => i.repairable), task: contract.task };
}

module.exports = { assessBusinessResponse, taskLimitation, supported, roleOf };
