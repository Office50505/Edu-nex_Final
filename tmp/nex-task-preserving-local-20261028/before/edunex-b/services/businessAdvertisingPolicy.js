// A conservative backstop for clear advertising violations, not a semantic
// fact checker. The shared tutor instructions govern claims beyond these cases.
const clauses = text => String(text || '').split(/\n|[;!?]|(?<!\d)\.(?!\d)/u).map(s => s.trim()).filter(Boolean);
const uncertain = /\b(?:unverified|unconfirmed|undecided|unknown|not confirmed|not verified|not decided|nobody|no one|without evidence|might|maybe|perhaps|assume|pretend|invent\w*|fake|fabricat\w*|fictional|imaginary)\b|पुष्टि नहीं|नकली|काल्पनिक/iu;
const request = /\b(?:write|say|claim|create|make|draft|generate|add|include|put|show|suggest|could|should|can\s+(?:i|we))\b|लिखो|जोड़ो|दिखाओ/iu;
const negative = /\b(?:no|not|never|without|avoid|omit|exclude|cannot|can't|don't|do not|nahi|nahin|mat)\b|नहीं|मत|बिना/iu;

function lastSupport(evidence, category, claim) {
  // Last mention wins, including retractions. A request to add a claim is not
  // evidence that it is true. Assistant messages are never passed as evidence.
  for (const turn of [...evidence].reverse()) {
    for (const clause of clauses(turn).reverse()) {
      if (category.test(clause)) {
        const explicitFact = /\b(?:verified|confirmed|owner[- ]approved|owner approves?|our actual)\b/iu.test(clause);
        return claim.test(clause) && !uncertain.test(clause) && (!request.test(clause) || explicitFact) && !negative.test(clause);
      }
    }
  }
  return false;
}

function qualified(text, index, length) {
  // Qualify the occurrence itself. A disclaimer in another sentence or outside
  // a fenced prompt must never excuse an assertion inside the deliverable.
  const before = text.slice(0, index).split(/[\n;.!?]|,\s*(?:but|and then|then)\b|,\s*(?=(?:add|write|create|show|include|generate|fill|pack|make)\b)/iu).at(-1);
  const after = text.slice(index + length).split(/[\n;.!?]/u)[0];
  return /\b(?:do not|don't|never|no|not|without|avoid|omit|exclude|cannot|can't|mat)\b.{0,95}$/iu.test(before)
    || /(?:नहीं|मत|बिना)[^,]{0,95}$/u.test(before)
    || /^\s*(?:(?:add|include|likhna|likho|jodo|jodna|karna|bhi|bilkul)\s+){0,3}(?:nahi|nahin|mat)\b/iu.test(after)
    || /^\s*(?:नहीं|मत)/u.test(after)
    || /\b(?:only if|if verified|if confirmed|after verification|after confirmation|pending confirmation|confirm before|example of a false claim|falsely claim)\b[^,]{0,100}$/iu.test(before)
    || /^\s*\(?\s*(?:only if verified|only if confirmed|if confirmed|if verified|pending confirmation|requires? (?:owner )?(?:approval|confirmation))\b/iu.test(after)
    || /^\s*(?:rating\s+)?(?:means|is the maximum|is an example of|mislead\w*)\b/iu.test(after);
}

function firstAssertion(text, pattern) {
  return [...text.matchAll(new RegExp(pattern.source, 'giu'))].find(m => !qualified(text, m.index, m[0].length));
}

const featureClaims = [
  { category: /\bdeliver\w*\b/iu, claim: /\bfree delivery\b/iu },
  { category: /\bwi[ -]?fi\b/iu, claim: /\bfree wi[ -]?fi\b/iu },
  { category: /\b(?:organic|certif\w*)\b/iu, claim: /\b(?:certified organic|organic certified|certified|organic)\b/iu },
  { category: /\b(?:award\w*|rank\w*|no\.?\s*1|number one)\b/iu, claim: /\b(?:award[- ]winning|no\.?\s*1|number one|top[- ]rated)\b/iu },
  { category: /\b(?:warranty|guarantee)\b/iu, claim: /\b(?:lifetime|money[- ]back|100\s*%)[ -]*(?:warranty|guarantee)\b/iu },
  { category: /\bfresh\w*\b/iu, claim: /\bfresh(?:ly made)?\s+(?:food|sandwiches|bread|ingredients|cakes|juice)\b/iu },
];

function businessAdvertisingIssue(reply, evidence = []) {
  const text = String(reply || '');
  const crowd = /\b(?:add|insert|generate|fill|pack|show)\b[^.!?;\n]{0,85}\b(?:customers?|crowds?|queue|buyers?)\b|\b(?:fake|fictional|fabricated|imaginary|AI[- ]generated)\s+(?:happy\s+)?(?:customers?|crowds?|attendance)\b|(?:नकली|काल्पनिक)\s*(?:ग्राहक|भीड़)|\bnakli\s+(?:customers?|bheed)\b/giu;
  for (const m of text.matchAll(crowd)) {
    const clause = text.slice(0, m.index).split(/[\n;.!?]/u).at(-1) + text.slice(m.index).split(/[\n;.!?]/u)[0];
    if (qualified(text, m.index, m[0].length) || /\b(?:existing|already present|consenting|actually photographed)\b/iu.test(m[0])) continue;
    // Fiction is permissible in an explicitly disclosed teaching mockup, never
    // as a claim of real business attendance. Disclosure must be in this clause.
    if (/clearly label(?:led|ed)|स्पष्ट.*काल्पनिक/iu.test(clause) && /fictional.*(?:practice|mockup)|(?:practice|mockup).*fictional/iu.test(clause)
      && !/\b(?:popular|demand|real attendance|genuine popularity)\b/iu.test(clause)) continue;
    return 'course_business_fabricated_attendance';
  }
  if (firstAssertion(text, /\b(?:write|create|generate|add|invent|use)\b[^.!?;\n]{0,45}\b(?:fake|fabricated|fictional|invented)\b[^.!?;\n]{0,35}\b(?:reviews?|testimonials?|ratings?)\b|\b(?:fake|fabricated|invented)\s+(?:customer\s+)?(?:reviews?|testimonials?)\b|(?:नकली|झूठे)\s*(?:रिव्यू|समीक्षा)/iu)) return 'course_business_fabricated_social_proof';
  const socialProof = /\b\d[\d,.]*\s*(?:[- ]?stars?|\/\s*5|out of\s*5|reviews?|ratings?|(?:happy\s+)?(?:customers?|clients?|learners?))\b|\b(?:hundreds|thousands)\s+of\s+(?:happy\s+)?(?:customers?|reviews?|clients?)\b/giu;
  for (const m of text.matchAll(socialProof)) {
    if (qualified(text, m.index, m[0].length)) continue;
    const category = /star|\/\s*5|out of/iu.test(m[0]) ? /\b(?:rating|rated|stars?)\b/iu
      : /review|rating/iu.test(m[0]) ? /\b(?:reviews?|ratings?)\b/iu : /\b(?:customers?|clients?|learners?)\b/iu;
    const exact = new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu');
    if (!lastSupport(evidence, category, exact)) return 'course_business_unverified_social_proof';
  }
  for (const { category, claim } of featureClaims) {
    const m = firstAssertion(text, claim);
    if (m && !lastSupport(evidence, category, new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu'))) return 'course_business_unverified_claim';
  }
  if (firstAssertion(text, /\b(?:guarantee(?:d)?|will|definitely|certainly|pakka)\b[^.!?;\n]{0,65}\b(?:reach|customers?|sales|followers|income|earnings?|bikri|kamai)\b|\b(?:sales|bikri)\b[^.!?;\n]{0,25}\b(?:double|dugni)\s+(?:hogi|guaranteed)\b|(?:पक्का|गारंटी)[^।\n]{0,40}(?:बिक्री|ग्राहक|कमाई)/iu)) return 'course_business_outcome_promise';
  for (const m of text.matchAll(/(?:₹\s*|\b(?:Rs\.?|INR)\s*)\d+(?:[.,]\d+)*|\b\d+\s*(?:rupees|rupaye)|\b\d+\s*%/giu)) {
    if (qualified(text, m.index, m[0].length)) continue;
    const exact = new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu');
    const category = /%/.test(m[0]) ? /%|discount|छूट/iu : /₹|\b(?:Rs\.?|INR|rupees|rupaye|price|budget)\b/iu;
    if (!lastSupport(evidence, category, exact)) return 'course_business_facts_not_grounded';
  }
  return null;
}


module.exports = { businessAdvertisingIssue };
