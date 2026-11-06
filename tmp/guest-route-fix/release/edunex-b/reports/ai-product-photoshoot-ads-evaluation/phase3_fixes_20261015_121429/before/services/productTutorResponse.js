const { PRODUCT_SLUGS, findProductTemplate, wantsProductPrompt, productSlots, renderProductTemplate } = require('./productTutorKnowledge');

function tutorLanguage(message) {
  const q = String(message || '');
  if (/\b(?:in English|English mein|answer English|reply English)\b/i.test(q)) return 'english';
  if (/\b(?:Hinglish|Roman Hindi)\b/i.test(q)) return 'hinglish';
  if (/\b(?:in Hindi|Hindi mein)\b|हिंदी|[\u0900-\u097f]/i.test(q)) return 'hindi';
  return /\b(?:mera|meri|mujhe|kya|kaise|kaunsi|mein|hai|hain|batao|likhu|chahiye|nahi|agar|karu|karo|rha|yeh|iska|bhi|toh)\b/i.test(q) ? 'hinglish' : 'english';
}

function explanationLanguageMatches(reply, language) {
  const prose = String(reply).replace(/```[\s\S]*?```/g, '').replace(/[“"][^”"\n]+[”"]/g, '');
  const hindi = /[\u0900-\u097f]/.test(prose);
  const hinglish = (prose.match(/\b(?:aap|hai|hain|mein|karo|rakho|nahi|yeh|mujhe|karna|sakta|daalo|likho|chuno|banao|rahe)\b/gi) || []).length >= 2;
  if (language === 'hindi') return hindi;
  if (language === 'hinglish') return !hindi && hinglish;
  return !hindi && !hinglish;
}

function advertisingRisk(reply) {
  const text = String(reply);
  // Check affirmative clauses independently: a disclaimer does not excuse a later invented endorsement.
  for (const sentence of text.split(/(?<=[.!?।\n])\s+|\bbut\b|\blekin\b|लेकिन/iu)) {
    const clause = sentence.replace(/\b(?:no background music|no morphing|no warping)\b/gi, '');
    const negated = /\b(?:do not|don't|cannot|can't|should not|shouldn't|never|without|not on|not a|no guarantee|no promise|not guaranteed|nahi|mat)\b|नहीं|मत|बिना/iu.test(clause);
    if (!negated && /\b(?:I (?:personally )?(?:used|tried|bought|loved)|just got my hands|better than I expected|maine .{0,50}(?:use|try|pasand)|you will earn|guaranteed (?:income|earnings|returns))\b|मैंने.{0,50}(?:इस्तेमाल|पसंद)|गारंटी.{0,20}कमाई/iu.test(clause)) return 'unsupported_endorsement_or_earnings';
    if (!negated && /\b(?:pretend|present|show|claim|say).{0,70}(?:real customer|genuine customer|fake review|fake testimonial)\b/iu.test(clause)) return 'deceptive_testimonial';
  }
  return null;
}

const safeAd = {
  english: 'Do not invent product benefits, customer experiences or earnings guarantees. An AI actor is not a real customer: do not use it as a genuine review or testimonial. Use an honest product demonstration or a clearly described UGC-style showcase, based only on the product facts you supplied.',
  hindi: 'प्रोडक्ट के फायदे, ग्राहक-अनुभव या कमाई की गारंटी न गढ़ें। AI कलाकार असली ग्राहक नहीं है; उसे वास्तविक समीक्षा या testimonial की तरह न दिखाएँ। केवल दिए हुए असली तथ्यों पर आधारित ईमानदार प्रोडक्ट प्रदर्शन या स्पष्ट UGC-style वीडियो बनाएँ।',
  hinglish: 'Product benefits, customer experience ya kamai ki guarantee mat banao. AI actor asli customer nahi hai; use genuine review ya testimonial mat batao. Sirf diye hue asli facts se honest product demo ya clearly described UGC-style showcase banao.',
};

function isProductKnowledge(knowledge) {
  return PRODUCT_SLUGS.has(knowledge?.activeCourse?.slug) || knowledge?.courseSlugs?.some(s => PRODUCT_SLUGS.has(s));
}

function productSafetyRequest(message) {
  return /\b(?:fake (?:review|testimonial)|(?:AI|synthetic).{0,60}(?:real customer|personally|loved|review|testimonial)|earnings? guarantee|guaranteed (?:income|earnings)|(?:promise|guarantee).{0,30}(?:earn|income|money)|kamai)\b|नकली.{0,15}समीक्षा|असली ग्राहक|कमाई/iu.test(message);
}

function localizedGuidance({ message, knowledge, history = [] }) {
  const language = tutorLanguage(message);
  if (!isProductKnowledge(knowledge)) return null;
  const candidates = knowledge.materialsAvailable ? (knowledge.records || []).filter(r => r.translations?.[language]) : [];
  // Retrieval already ranks independently identified source records; prefer a workflow for procedural requests.
  const procedural = /workflow|steps|settings|references|तरीका|सेटिंग|kaise|tareeka/i.test(message);
  const record = (procedural && candidates.find(r => r.contentType === 'workflow')) || candidates[0];
  const requestedLesson = Number(message.match(/\b(?:lesson\s*|l)0?(\d+)\b/i)?.[1]);
  const lesson = record?.lessonNumbers?.includes(requestedLesson) ? requestedLesson : record?.lessonNumber;
  if (record) return `${lesson ? `Lesson ${String(lesson).padStart(2, '0')}\n\n` : ''}${record.translations[language]}`;
  return {
    english: 'I can help with AI Product Photoshoot & Ads course guidance. Which lesson or product task do you want help with? Detailed course materials require active lesson access.',
    hindi: 'मैं AI Product Photoshoot & Ads कोर्स में मदद कर सकता हूँ। किस पाठ या प्रोडक्ट कार्य में मदद चाहिए? विस्तृत सामग्री के लिए सक्रिय पाठ-एक्सेस चाहिए।',
    hinglish: 'Main AI Product Photoshoot & Ads course mein help kar sakta hoon. Kis lesson ya product task mein madad chahiye? Detailed material ke liye active lesson access chahiye.',
  }[language];
}

function productTutorReply({ message, history = [], knowledge }) {
  if (!isProductKnowledge(knowledge)) return null;
  const language = tutorLanguage(message);
  if (/\b(?:earn|earnings|income|money|kamai)\b|कमाई/iu.test(message) && productSafetyRequest(message)) {
    return { reply: {
      english: 'The course teaches product photos, videos and ad-making skills. It does not guarantee earnings; income depends on your work, clients and effort.',
      hindi: 'यह कोर्स प्रोडक्ट की तस्वीरें, वीडियो और विज्ञापन बनाना सिखाता है। कमाई की गारंटी नहीं है; आमदनी आपके काम, ग्राहकों और मेहनत पर निर्भर है।',
      hinglish: 'Course product photos, videos aur ads banana sikhata hai. Kamai ki guarantee nahi hai; income tumhare kaam, clients aur mehnat par depend karti hai.',
    }[language], policy: 'earnings_boundary', templateId: '' };
  }
  if (productSafetyRequest(message)) return { reply: safeAd[language], policy: 'advertising_safety', templateId: '' };
  if (!knowledge.materialsAvailable) return null;
  if (!wantsProductPrompt(message)) {
    const creative = /\b(?:write|draft|plan|create|generate|make)\b.*\b(?:hooks?|captions?|scripts?|ads?|reviews?|testimonials?)\b/i.test(message);
    const procedural = /workflow|steps|settings|references|तरीका|सेटिंग|kaise|tareeka/i.test(message);
    const first = knowledge.records?.[0];
    if (!creative && (first?.contentType === 'faq' && first.translations || procedural && first?.contentType === 'workflow')) {
      return { reply: localizedGuidance({message,history,knowledge}), templateId: '', policy: 'grounded_course_guidance' };
    }
    return null;
  }
  // Limit the lookup to authorized retrieved template assets; no entitlement bypass via a global template registry.
  const templates = (knowledge.records || []).filter(r => r.contentType === 'exact-template');
  const template = findProductTemplate(message, history, templates);
  if (!template) return null;
  const values = productSlots(message, history);
  const body = renderProductTemplate(template, values);
  const unresolved = /\[[^\]]+\]/.test(body);
  const note = unresolved ? {
    english: 'Fields still in brackets need your details; I have not invented them.',
    hindi: 'बचे हुए कोष्ठकों में अपनी जानकारी भरें; कोई विवरण गढ़ा नहीं गया है।',
    hinglish: 'Bache hue brackets mein apni details bharo; maine koi details invent nahi ki hain.',
  }[language] : '';
  return { reply: `${template.heading}\n\n\`\`\`text\n${body}\n\`\`\`${note ? `\n\n${note}` : ''}`, templateId: template.chunkId, policy: 'exact_template' };
}

function validateProductReply({ reply, message, history = [], knowledge }) {
  if (!isProductKnowledge(knowledge)) return { reply, issue: null };
  const risk = advertisingRisk(reply);
  if (risk) return { reply: safeAd[tutorLanguage(message)], issue: risk };
  const supplied = [...history.filter(t => t.role === 'user').map(t => t.content), message]
    .flatMap(text => String(text).split(/(?<=[.!?।\n])\s+|\bbut\b/iu))
    .filter(text => !/[?]/.test(text) && !/\b(?:not|no|never|don't|isn't|is not|nahi|mat)\b|नहीं|मत/iu.test(text)).join(' ').toLowerCase();
  // Known factual-benefit forms require user evidence, unlike purely creative scene descriptions.
  const affirmative = String(reply).split(/(?<=[.!?।\n])\s+|\bbut\b/iu).filter(s => !/\b(?:not|no|never|don't|cannot|nahi|mat)\b|नहीं|मत/iu.test(s)).join(' ');
  const claims = affirmative.match(/\b(?:leak[- ]?proof|waterproof|BPA[- ]?free|antibacterial|cures?\s+\w+|Ayurvedic benefits|keeps?\s+(?:water|drinks?)\s+(?:cool|hot))\b/gi) || [];
  if (claims.some(claim => !supplied.includes(claim.toLowerCase()))) {
    return { reply: safeAd[tutorLanguage(message)], issue: 'unsupported_product_claim' };
  }
  if (!explanationLanguageMatches(reply, tutorLanguage(message))) {
    return { reply: localizedGuidance({ message, history, knowledge }), issue: 'response_language_mismatch' };
  }
  return { reply, issue: null };
}

function productFallbackNotice(message) {
  return { english: 'Showing saved course guidance; a live model answer is unavailable.',
    hindi: 'अभी लाइव मॉडल का उत्तर उपलब्ध नहीं है; सहेजी हुई कोर्स सामग्री दिखाई जा रही है।',
    hinglish: 'Abhi live model ka jawab available nahi hai; saved course guidance dikh rahi hai.' }[tutorLanguage(message)];
}

module.exports = { tutorLanguage, explanationLanguageMatches, advertisingRisk, productSafetyRequest,
  productTutorReply, localizedGuidance, validateProductReply, isProductKnowledge, productFallbackNotice };
