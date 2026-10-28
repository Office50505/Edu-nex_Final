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

function businessAdvertisingAlternative(knowledge, issue) {
  const language = knowledge.courseContext?.language;
  const english = language === 'english';
  const hindi = language === 'hindi';
  const review = /social_proof/.test(issue);
  const attendance = /fabricated_attendance/.test(issue);
  const reason = review
    ? english ? 'Reviews and ratings must come from genuine customer feedback.' : hindi ? 'रिव्यू और रेटिंग असली ग्राहकों की प्रतिक्रिया से ही लें।' : 'Reviews aur ratings asli customer feedback se hi lo.'
    : attendance ? english ? 'Adding fictional customers would misrepresent real attendance. Keep the actual scene.' : hindi ? 'नकली ग्राहक जोड़ने से असली भीड़ के बारे में गलत धारणा बनेगी। असली दृश्य रखें।' : 'Nakli customers add karne se asli attendance ki galat image banegi. Actual scene rakho.'
    : english ? 'Keep the ad truthful: use confirmed facts and the real photo, without invented claims or attendance.' : hindi ? 'विज्ञापन सच्चा रखें: पक्की जानकारी और असली फोटो लें; नकली दावे या भीड़ न जोड़ें।' : 'Ad sachcha rakho: confirmed facts aur asli photo use karo; nakli claims ya bheed mat jodo.';
  if (review) return `${english ? 'Feedback request' : hindi ? 'फीडबैक संदेश' : 'Feedback message'}: "${english ? 'How was your experience with [BUSINESS NAME]? Please share your honest feedback.' : hindi ? '[BUSINESS NAME] के साथ आपका अनुभव कैसा था? कृपया अपनी सच्ची प्रतिक्रिया दें।' : '[BUSINESS NAME] ke saath aapka experience kaisa tha? Apna honest feedback share karein.'}"\n\n${reason}`;
  // A correction such as "that feature is unconfirmed; rewrite it" may not
  // itself name the deliverable. Reuse the latest user-specified format only.
  const turns = [...(knowledge.courseContext?.userEvidence || [])].reverse();
  const previousFormat = turns.find(turn => /\b(?:caption|prompt|poster|ad|advertisement|script)\b|कैप्शन|प्रॉम्प्ट|पोस्टर/iu.test(turn)) || '';
  const output = knowledge.businessRequest?.output || (/\bcaption\b|कैप्शन/iu.test(previousFormat) ? 'caption'
    : /\b(?:prompt|poster|ad|advertisement|script)\b|प्रॉम्प्ट|पोस्टर/iu.test(previousFormat) ? 'prompt' : null);
  const offer = knowledge.businessRequest?.genres?.includes('discount_promotion');
  if (!output) return `${english ? 'Start with one small test using a real photo and confirmed business details. Compare actual enquiries before spending more; reach, customers and sales are uncertain.' : hindi ? 'असली फोटो और पक्की जानकारी से छोटा टेस्ट शुरू करें। अधिक खर्च करने से पहले असली पूछताछ की तुलना करें; पहुँच, ग्राहक और बिक्री निश्चित नहीं हैं।' : 'Asli photo aur confirmed details se ek chhota test shuru karo. Zyada kharch se pehle actual enquiries compare karo; reach, customers aur sales pakke nahi hain.'}\n\n${reason}`;
  const draft = output === 'caption'
    ? english ? '[BUSINESS NAME] · [AREA/CITY]. Explore [CONFIRMED PRODUCT/SERVICE].' : hindi ? '[BUSINESS NAME] · [AREA/CITY]। [CONFIRMED PRODUCT/SERVICE] के बारे में जानें।' : '[BUSINESS NAME] · [AREA/CITY]. [CONFIRMED PRODUCT/SERVICE] ke baare mein jaanein.'
    : english ? 'Create the requested ad using the supplied real photo. Preserve the actual shop, signboard, products and people already present. Use the supplied confirmed details; leave missing text as [BUSINESS NAME], [AREA/CITY], [CONFIRMED PRODUCT/SERVICE]. Do not add customers, reviews, ratings, credentials, features or popularity claims.' : hindi ? 'दी गई असली फोटो से माँगा गया विज्ञापन बनाएं। दुकान, साइनबोर्ड, उत्पाद और पहले से मौजूद लोग वही रखें। पक्की जानकारी लें; खाली जगह [BUSINESS NAME], [AREA/CITY], [CONFIRMED PRODUCT/SERVICE] रखें। नए ग्राहक, रिव्यू, रेटिंग या अपुष्ट दावे न जोड़ें।' : 'Di hui asli photo se requested ad banao. Shop, signboard, products aur pehle se maujood log same rakho. Confirmed details use karo; missing text [BUSINESS NAME], [AREA/CITY], [CONFIRMED PRODUCT/SERVICE] rakho. Naye customers, reviews, ratings ya unverified claims mat jodo.';
  const terms = offer ? english ? '\n[OFFER NAME] · [ITEMS] · [price] · [VALID DATES/TIMES] · [ELIGIBILITY/TERMS — confirm with owner before publishing]'
    : hindi ? '\n[ऑफ़र का नाम] · [चीज़ें] · [price] · [तारीख/समय] · [पात्रता/शर्तें — प्रकाशन से पहले मालिक से पुष्टि लें]'
      : '\n[OFFER NAME] · [ITEMS] · [price] · [DATES/TIMES] · [ELIGIBILITY/TERMS — publish karne se pehle owner se confirm karo]' : '';
  const name = knowledge.courseContext?.facts?.['business name'];
  const location = knowledge.courseContext?.facts?.['area/city'];
  const fillLabel = (value, placeholder) => typeof value === 'string' && /^[\p{L}\p{N} &.,'’()-]{1,80}$/u.test(value) ? value : placeholder;
  const completed = (draft + terms).replaceAll('[BUSINESS NAME]', fillLabel(name, '[BUSINESS NAME]')).replaceAll('[AREA/CITY]', fillLabel(location, '[AREA/CITY]'));
  return `${completed}\n\n${reason}`;
}

module.exports = { businessAdvertisingIssue, businessAdvertisingAlternative };
