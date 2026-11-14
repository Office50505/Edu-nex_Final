// Learner evidence only. Course examples, assistant drafts and fictional actors
// cannot establish real product properties, offers, available assets or results.
const {normalize:norm,denied,fictional,interpretation,supportsFact}=require('./tutorSemantics');
const clauses = s => String(s).split(/[.!;।\n]+|(?<=\?)/u).map(s => s.trim()).filter(Boolean);
const requestedClaim = s => /\b(?:please\s+)?(?:claim|say|write|pretend|invent|assume)\b|^(?:दावा|लिखो)/iu.test(s);
const literal = s => String(s).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

// These are equivalent propositions, not permission to infer a process from
// "handmade" or an environmental benefit from "reusable".
function propertyPattern(phrase) {
  if (/hand[- ]applied (?:finish|glaze)|(?:finish|glaze).{0,15}hand[- ]applied/iu.test(phrase)) {
    const noun = /finish/iu.test(phrase) ? 'finish' : 'glaze';
    return new RegExp(`hand[- ]applied\\s+${noun}|${noun}\\s+(?:(?:is|was|has been)\\s+)?(?:not\\s+)?hand[- ]applied`, 'iu');
  }
  if (/durab|long[- ]lasting|lasts for years/iu.test(phrase)) return /durab\w*|long[- ]lasting|lasts for years/iu;
  return new RegExp(literal(phrase).replace(/[- ]/gu,'[- ]'), 'iu');
}

function learnerEvidence(message, history = []) {
  const turns = [...history.filter(t => t.role === 'user').map(t => t.content), message];
  const text = turns.join('\n');
  const statements = turns.flatMap(clauses);
  const supports = pattern => {
    const latest = statements.filter(s => { pattern.lastIndex = 0; return pattern.test(s); }).at(-1);
    return Boolean(latest && !denied(latest) && !requestedClaim(latest) && !/[“”"]/u.test(latest) && !latest.endsWith('?') && interpretation(latest).kind==='assertion');
  };
  const fictionalStory = fictional(text) && !/\b(?:real product|I sell|my business)\b/iu.test(text);
  const commercial = !fictionalStory && /\b(?:product|planter|gift wrap|shoe|workshop|service|customer|I sell|business|pottery)\b|सेवा|उत्पाद/iu.test(text);
  const limitedPhotos = /\b(?:only (?:one|two|[12]) (?:still )?photos?|one approved (?:front )?photo)\b|sirf[^.!?]{0,30}(?:ek|do)[^.!?]{0,15}photo/iu.test(text);
  const handsAndBench = /workbench/iu.test(text) && /hands|haathon|हाथ/iu.test(text);
  return { turns, statements, supports, commercial, fictionalStory, limitedPhotos, handsAndBench,
    explainer: !fictionalStory && /explains? how|block.print|demonstrat/iu.test(text),
    facts: statements.filter(s => !denied(s) && !requestedClaim(s) && !s.endsWith('?') && !/[“”"]/u.test(s)),
    unknowns: statements.filter(denied),
    assets: statements.filter(s => /\b(?:have|available|only|photo|clip|reference)\b|पास|available/iu.test(s)),
    creative: fictionalStory ? 'Original fictional events may be invented; existing cast and corrections remain binding.' : 'Camera, timing and fictional presenter staging are suggestions, never evidence of real performance.' };
}

function claimQualified(line,start,end) {
  const status=interpretation(line,start,end);
  if(status.kind==='conditional'){
    const target=norm(line.slice(start,end)),condition=norm(status.condition || '');
    const conditionEnd=line.toLowerCase().indexOf((status.condition || '').toLowerCase())+(status.condition || '').length;
    return start<conditionEnd || Boolean(target && condition.includes(target));
  }
  return ['rejected','example'].includes(status.kind);
}

// A qualification must apply to the proposition itself, not merely occur in a
// previous sentence. Suggestions to assert real benefits still need evidence.
function inspectLearnerClaims(reply, ledger, language = 'english', {rewrite=true}={}) {
  let answer = String(reply);
  const issues = [], edits = [];
  const neutral = ledger.commercial
    ? language === 'hindi' ? 'यहाँ केवल दी गई फोटो में दिखा रूप देखें।' : language === 'hinglish' ? 'Yahan sirf di hui photo mein dikh raha roop dekhein.' : 'Here is the appearance shown in the supplied photos.'
    : language === 'hindi' ? 'यह काल्पनिक प्रदर्शन है; तकनीक का वास्तविक परिणाम अभी सत्यापित नहीं है।' : language === 'hinglish' ? 'Yeh kalpanik demonstration hai; technique ka actual result abhi verify nahi hai.' : 'This is a fictional demonstration; the actual technique and result remain unverified.';
  const change = (before, after, code, repaired = true, detail = '') => {
    if (before === after || !before || !answer.includes(before)) return;
    if(rewrite){answer = answer.replace(before, after); edits.push({code, before, after});}
    issues.push({code, detail:detail || 'Adjusted only the unsupported span; retained the surrounding task.', span:before, replacement:after, repaired:rewrite&&repaired});
  };
  if (ledger.handsAndBench) {
    const asset = /(?:an?\s+)?(?:adhoora\s+ya\s+)?(?:naya\s+bana\s+hua|newly[- ]made|finished|final)\s+(?:pottery\s+)?(?:piece|item|pottery)(?:\s+(?:piece|item))?/giu;
    for (const line of answer.split('\n')) {
      if (/optional|if available|otherwise|केवल.*उपलब्ध/iu.test(line)) continue;
      for (const m of line.matchAll(asset)) if (!ledger.supports(/(?:newly[- ]made|finished|naya bana hua)\s+pottery|finished[- ]pot/iu)) {
        change(m[0], language === 'hindi' ? 'दिए हुए हाथों और मिट्टी के क्लिप का क्रॉप' : 'a crop of the supplied hands-and-clay footage', 'unconfirmed_extra_asset');
      }
    }
  }
  if (ledger.commercial) {
    for (const line of answer.split('\n')) {
      const m = line.match(/\b(?:one|a|ek)\s+(\d+[- ]second)\s+process clip/iu);
      if (m && !ledger.supports(new RegExp(m[1].replace('-', '[- ]')+'\\s+process clip','iu'))) change(m[1]+' ', '', 'unconfirmed_asset_duration');
    }
  }
  const families = [
    {code:'unsupported_statistic', scope:!ledger.fictionalStory, pattern:/\b\d+(?:[.,]\d+)?\s*(?:%|percent\b|per cent\b)\s+(?:of\s+)?(?:creators|customers|people|users|learners|viewers|products)\b[^.!?;\n]*/giu},
    {code:'unsupported_product_property', scope:ledger.commercial, pattern:/\b(?:hand[- ]applied (?:glaze|finish)|every (?:single )?one is (?:a little |slightly )?different|one[- ]of[- ]a[- ]kind(?: designs?)?|perfectly smooth(?: rim)?|eco[- ]friendly|environmentally friendly|leak[- ]?proof|waterproof|BPA[- ]?free|antibacterial|durable|long[- ]lasting|lasts for years|improves? plant growth|excellent drainage)\b/giu},
    {code:'unsupported_offer', scope:ledger.commercial, pattern:/\b(?:free|muft)\s+(?:estimate|quote|consultation)|(?:मुफ्त|निःशुल्क)\s*(?:अनुमान|परामर्श)/giu},
    {code:'unsupported_service_outcome', scope:ledger.commercial, pattern:/\b(?:naya jaisa|life badhana|quality repair|attention to detail|repairing the unrepairable|new[- ]like|restored to new|extend\w*[^.!?]{0,20}(?:life|lifespan))\b/giu},
    {code:'unsupported_explanation', scope:ledger.explainer, pattern:/\b(?:even pressure|perfect (?:and evenly )?pressure(?: control)?|flawless|prints? transform|transform(?:s)? (?:your |the )?prints?|hidden technique|crucial secret|secret (?:step hai|hai)|woh raaz hai|overlooked detail that makes all the difference)\b/giu},
  ];
  for (const family of families.filter(f => f.scope)) for (const line of answer.split('\n')) {
    for (const m of [...line.matchAll(family.pattern)]) {
      if (claimQualified(line,m.index,m.index+m[0].length)) continue;
      // Match the same property/offer, never a broader adjective such as handmade.
      const property = propertyPattern(m[0]);
      if (ledger.supports(property)) continue;
      const quote = [...line.matchAll(/[“"]([^”"\n]+)[”"]/gu)].find(q => q.index < m.index && q.index+q[0].length > m.index);
      if (family.code === 'unsupported_offer') {
        change(m[0], language === 'hinglish' ? 'estimate ki fees pehle confirm karein' : language === 'hindi' ? 'अनुमान की फीस पहले पूछें' : 'an estimate; confirm any fee first', family.code, false, 'The learner did not authorize this offer. Ask about terms without inventing a free service.');
      } else if (quote) {
        change(quote[1], neutral, family.code, false, 'A real factual claim in spoken copy lacks learner evidence. Replace it with a grounded payoff, preserving the script and timing.');
      } else {
        // Preserve the rest of a long visual/prompt line. In particular, never
        // replace an entire code block because it contains one unsupported phrase.
        change(m[0], family.code === 'unsupported_explanation' ? 'an unverified technique/result' : 'an unverified property', family.code, false, 'This factual proposition needs evidence or a grounded alternative.');
      }
    }
  }
  if(ledger.commercial)for(const line of answer.split('\n'))for(const m of line.matchAll(/\b(?:this|our|your|my|the)\s+product\s+(?:is|has|features)\s+([^.!?;\n]+)/giu)){
    if(claimQualified(line,m.index+m[0].lastIndexOf(m[1]),m.index+m[0].length) || /(?:unverified|unknown|same as|unchanged|actually visible|as (?:in|shown))/iu.test(m[0]) || supportsFact(m[1],ledger.statements))continue;
    if(issues.some(i=>i.span && m[0].includes(i.span)))continue;
    change(m[0],'The product properties not reported by the learner remain unverified','unsupported_product_property',false,'This real-product assertion lacks learner evidence; keep the requested creative task without asserting the property.');
  }
  if (ledger.commercial) {
    for (const line of answer.split('\n')) for (const sentence of line.match(/.+?(?:[!?।]|(?<!\d)\.(?!\d)|$)/gu) || []) {
      if (!/AI[- ]generated after|after[^.!?]{0,70}AI image/iu.test(sentence) || /do not|don't|never|not evidence|unverified/iu.test(sentence)) continue;
      change(sentence, ' Show only the supplied before/process assets; the final service result remains unconfirmed.',
        'unverified_service_visual', false, 'Generated after imagery cannot establish a real repair result. Preserve the supplied-photo plan and enquiry ending.');
    }
  }
  if (ledger.commercial && ledger.limitedPhotos) {
    for (const line of answer.split('\n')) {
      if (/only if verified|if (?:the )?(?:view|angle).*verified|do not (?:rotate|show)|illustrative reconstruction/iu.test(line)) continue;
      for (const m of line.matchAll(/(?:gently |slowly )?rotat(?:e[sd]?|ing)(?: (?:the )?(?:planter|product|wrap)| around (?:the )?rim)?|from different angles/giu)) {
        change(m[0], 'keep the established camera plan within the supplied photo coverage', 'unverified_product_view', true, 'Use supplied views; a generated rotation cannot verify unseen geometry. Camera and audio instructions are retained.');
      }
      for (const sentence of line.match(/.+?(?:[!?।]|(?<!\d)\.(?!\d)|$)/gu) || []) {
        if (!/\b(?:wrap(?:s|ping)? (?:a |the |it around)|unwrapp?ing|unfold(?:s|ing)?|folding it|fabric drapes|wrapped gift)\b/iu.test(sentence)
            || /only if verified|do not|don't|never|not evidence/iu.test(sentence)) continue;
        change(sentence, ' Keep the established camera plan and the unchanged supplied photo; its behaviour beyond that still remains unverified.',
          'unverified_demonstration', false, 'A photo does not establish wrapping behaviour. The supplied-still alternative preserves the visual task, but the demonstration payoff still needs review.');
      }
    }
  }
  return {answer, issues, edits};
}

module.exports = {learnerEvidence, inspectLearnerClaims, claimQualified, norm};
