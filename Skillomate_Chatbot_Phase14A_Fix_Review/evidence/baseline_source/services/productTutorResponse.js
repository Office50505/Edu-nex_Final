const { unsupportedAdClaims } = require('./productTutorGrounding');
const { PRODUCT_SLUGS, findProductTemplate, wantsProductPrompt, productSlots, renderProductTemplate, productFacts, productRequestContext } = require('./productTutorKnowledge');
const { draftProductAd, missingProductDeliverables } = require('./productTutorTasks');

const { productResponseSelection, productResponseLanguage:tutorLanguage } = require('./productTutorIntent');

function explanationLanguageMatches(reply, language, knownProduct = '') {
  let prose = String(reply).replace(/```[\s\S]*?```/g, '').replace(/[“"][^”"\n]+[”"]/g, '');
  // A supplied proper name can keep its original script across language switches.
  // It cannot by itself establish the requested explanation language.
  if (knownProduct) prose = prose.split(knownProduct).join('');
  const hindi = /[\u0900-\u097f]/.test(prose);
  const hinglish = /\b(?:use karo|kar do|likh do)\b/i.test(prose) || (prose.match(/\b(?:aap|hai|hain|mein|karo|rakho|nahi|yeh|mujhe|karna|sakta|daalo|likho|chuno|banao|rahe|sirf|dheema|tumhare|diye)\b/gi) || []).length >= 2;
  if (language === 'hindi') return hindi;
  if (language === 'hinglish') return !hindi && hinglish;
  return !hindi && !hinglish;
}

function advertisingRisk(reply) {
  const text = String(reply);
  // Check affirmative clauses independently: a disclaimer does not excuse a later invented endorsement.
  for (const sentence of text.split(/(?<=[.!?।;\n])\s+|\bbut\b|\blekin\b|लेकिन/iu)) {
    const clause = sentence.replace(/\b(?:no background music|no morphing|no warping)\b/gi, '');
    const negates = index => /(?:na\s+ki|न कि)(?:\s+yeh)?\s*$/iu.test(clause.slice(0,index).trim()) || /\b(?:do not|don't|cannot|can't|should not|shouldn't|never|without|not|no|nahi|mat)\s+(?:(?:a|an|the|on|say|claim|write|present|show|promise|guarantee|use|state)\s+){0,4}$|(?:नहीं|मत)\s*(?:(?:कहो|बोलो|दिखाओ)\s*)?$/iu.test(clause.slice(0,index).replace(/[\s"'“‘]+$/u,'')+' ');
    for (const match of clause.matchAll(/\b(?:I (?:personally )?(?:used|tried|bought|loved)|just got my hands|better than I expected|maine .{0,50}(?:use|try|pasand)|you will earn|guaranteed (?:income|earnings|returns))\b|मैंने.{0,50}(?:इस्तेमाल|पसंद)|गारंटी.{0,20}कमाई/giu)) if(!negates(match.index)) return 'unsupported_endorsement_or_earnings';
    for (const match of clause.matchAll(/\b(?:pretend|present|show|claim|say)\b.{0,70}(?:real customer|genuine customer|fake review|fake testimonial)\b/giu)) if(!negates(match.index)) return 'deceptive_testimonial';
    for (const match of clause.matchAll(/\b(?:AI|synthetic|virtual|generated)\s+(?:actor|presenter|person|woman|man)\s+(?:is|are)\s+(?:an?\s+)?(?:real|genuine|actual)\s+(?:(?:reviewing|satisfied)\s+)?customer\b/giu)) {
      if(!negates(match.index))return 'deceptive_testimonial';
    }
    for (const match of clause.matchAll(/\b(?:AI|synthetic|virtual|generated).{0,45}(?:asli customer|असली ग्राहक|वास्तविक ग्राहक)/giu)) {
      const after=clause.slice(match.index+match[0].length);
      if(!negates(match.index) && !/(?:nahi|नहीं|मत)/iu.test(match[0])
        && !/^\s*(?:(?:review|testimonial|की\s+समीक्षा(?:\s+की\s+तरह)?|समीक्षा(?:\s+की\s+तरह)?)\s+)?(?:nahi\b|mat\b|na\b|नहीं|मत|न\s)/iu.test(after))return 'deceptive_testimonial';
    }
  }
  return null;
}

const safeAd = {
  english: 'Do not invent product benefits, customer experiences or earnings guarantees. An AI actor is not a real customer: do not use it as a genuine review or testimonial. Use an honest product demonstration or a clearly described UGC-style showcase, based only on the product facts you supplied.',
  hindi: 'प्रोडक्ट के फायदे, ग्राहक-अनुभव या कमाई की गारंटी न गढ़ें। AI कलाकार असली ग्राहक नहीं है; उसे वास्तविक समीक्षा या testimonial की तरह न दिखाएँ। केवल दिए हुए असली तथ्यों पर आधारित ईमानदार प्रोडक्ट प्रदर्शन या स्पष्ट UGC-style वीडियो बनाएँ।',
  hinglish: 'Product benefits, customer experience ya kamai ki guarantee mat banao. AI actor asli customer nahi hai; use genuine review ya testimonial mat batao. Sirf diye hue asli facts se honest product demo ya clearly described UGC-style showcase banao.',
};

function isProductKnowledge(knowledge) {
  if (knowledge?.activeCourse) return PRODUCT_SLUGS.has(knowledge.activeCourse.slug);
  return knowledge?.courseSlugs?.length===1 && PRODUCT_SLUGS.has(knowledge.courseSlugs[0]);
}

function productSafetyRequest(message) {
  return /\b(?:fake (?:review|testimonial)|(?:AI|synthetic|virtual|generated).{0,80}(?:(?:real|genuine|actual)\s+(?:customer|buyer)|personally|loved|review|testimonial)|earnings? guarantee|guaranteed (?:income|earnings)|(?:promise|guarantee).{0,30}(?:earn|income|money)|kamai)\b|नकली.{0,15}समीक्षा|असली ग्राहक|कमाई/iu.test(message);
}

function selectProductGuidance({ message, knowledge, history = [] }) {
  const context = knowledge.requestContext || productRequestContext(message,history,knowledge.productContext);
  const language = tutorLanguage(message,history,knowledge.productContext);
  const candidates = knowledge.materialsAvailable ? (knowledge.records || []).filter(r => r.translations?.[language]) : [];
  const scoped = context.lessonNumber ? candidates.filter(r=>r.lessonNumber===context.lessonNumber || r.lessonNumbers?.includes(context.lessonNumber)) : candidates;
  const topicMatches=scoped.filter(r=>r.intentTags?.includes(context.topic));
  const pool=topicMatches.length?topicMatches:scoped;
  if(context.troubleshooting && topicMatches.length){const faq=pool.find(r=>r.contentType==='faq');if(faq)return faq;}
  // Only procedural material for this topic/lesson may outrank the best source.
  return (context.procedural && pool.find(r=>r.contentType==='workflow')) || pool[0] || null;
}

function localizedGuidance({ message, knowledge, history = [] }) {
  const language = tutorLanguage(message,history,knowledge.productContext);
  if (!isProductKnowledge(knowledge)) return null;
  const context=knowledge.requestContext || productRequestContext(message,history,knowledge.productContext);
  if (knowledge.materialsAvailable && context.topic==='festive') {
    const scenes=(knowledge.records || []).filter(r=>r.lessonNumber===4 && r.contentType==='exact-template'
      && /Diwali|Wedding Gift/.test(r.heading) && r.translations?.[language]);
    const explicit=/diwali|wedding|दिवाली|शादी/i.test(message);
    const selected=scenes.filter(r=>!explicit || (/Diwali/.test(r.heading)
      ? /diwali|दिवाली/i.test(message) : /wedding|शादी/i.test(message)));
    if (selected.length) return `Lesson 04\n\n${selected.map(r=>r.translations[language]).join('\n\n')}`;
  }
  const record = selectProductGuidance({message,knowledge,history});
  if(record && context.topic==='overview')return record.translations[language];
  const requestedLesson = knowledge.requestContext?.lessonNumber || productRequestContext(message,history,knowledge.productContext).lessonNumber;
  const lesson = record?.lessonNumbers?.includes(requestedLesson) ? requestedLesson : record?.lessonNumber;
  if(record && context.topic==='product_consistency' && context.procedural){
    const workflow=(knowledge.records||[]).find(r=>r.contentType==='workflow'&&r.intentTags?.includes('product_sheet')&&r.translations?.[language]);
    if(workflow)return `Lesson 02\n\n${workflow.translations[language]}\n\n${record.translations[language]}`;
  }
  if(record && context.topic==='natural_ugc'){
    const asset=(knowledge.records||[]).find(r=>r.lessonNumber===7&&r.contentType==='exact-template'&&r.content.includes('natural window light'));
    if(asset)return `Lesson 07\n\n${record.translations[language]}\n\n${{english:'Use natural window light and a real lived-in room.',hindi:'प्राकृतिक खिड़की की रोशनी और सामान्य घरेलू कमरा रखें।',hinglish:'Natural window light aur normal home room rakho.'}[language]}`;
  }
  if (record) return `${lesson ? `Lesson ${String(lesson).padStart(2, '0')}\n\n` : ''}${record.translations[language]}`;
  return {
    english: 'I can help with AI Product Photoshoot & Ads course guidance. Which lesson or product task do you want help with? Detailed course materials require active lesson access.',
    hindi: 'मैं AI Product Photoshoot & Ads कोर्स में मदद कर सकता हूँ। किस पाठ या प्रोडक्ट कार्य में मदद चाहिए? विस्तृत सामग्री के लिए सक्रिय पाठ-एक्सेस चाहिए।',
    hinglish: 'Main AI Product Photoshoot & Ads course mein help kar sakta hoon. Kis lesson ya product task mein madad chahiye? Detailed material ke liye active lesson access chahiye.',
  }[language];
}

function productTutorReply({ message, history = [], knowledge }) {
  if (!isProductKnowledge(knowledge)) return null;
  const language = tutorLanguage(message,history,knowledge.productContext);
  const factsForSafety=productFacts(message,history,knowledge.productContext);
  const alternativeRequested=/\b(?:line|alternative|introduction)\b|पंक्ति|वैकल्पिक|लाइन/i.test(message);
  const safeLine=()=>({english:`Example line: "Here is ${factsForSafety.product||'a course exercise in honest product presentation'}. View the supplied details."`,hindi:`उदाहरण संवाद: "यह ${factsForSafety.product||'ईमानदार प्रोडक्ट प्रदर्शन का अभ्यास'} है। दिए हुए विवरण देखें।"`,hinglish:`Example line: "Yeh ${factsForSafety.product||'honest product presentation ki practice'} hai. Diye hue details dekho."`}[language]);
  if (/\b(?:earn|earnings|income|money|kamai)\b|कमाई/iu.test(message) && productSafetyRequest(message)) {
    return { reply: {
      english: 'The course teaches product photos, videos and ad-making skills. It does not guarantee earnings; income depends on your work, clients and effort.',
      hindi: 'यह कोर्स प्रोडक्ट की तस्वीरें, वीडियो और विज्ञापन बनाना सिखाता है। कमाई की गारंटी नहीं है; आमदनी आपके काम, ग्राहकों और मेहनत पर निर्भर है।',
      hinglish: 'Course product photos, videos aur ads banana sikhata hai. Kamai ki guarantee nahi hai; income tumhare kaam, clients aur mehnat par depend karti hai.',
    }[language]+(alternativeRequested?'\n\n'+safeLine():''), policy: 'earnings_boundary', templateId: '' };
  }
  if (productSafetyRequest(message)) {
    const facts=productFacts(message,history,knowledge.productContext);
    const demo=knowledge.materialsAvailable && facts.requestedOutputs.includes('demo')
      && draftProductAd({message,facts:{...facts,requestedOutputs:['demo']},language,records:knowledge.records});
    return { reply: safeAd[language]+(alternativeRequested?'\n\n'+safeLine():demo?`\n\n${demo.reply}`:''), policy: 'advertising_safety', templateId: '' };
  }
  if (!knowledge.materialsAvailable) return null;
  const facts=productFacts(message,history,knowledge.productContext);
  if(knowledge.requestContext?.topic==='course_identity')return {reply:'AI Product Photoshoot & Ads',policy:'active_course_identity',templateId:''};
  const creative=draftProductAd({message,facts,language,records:knowledge.records});
  // A saved template request takes priority over an original practice draft.
  const context=knowledge.requestContext || productRequestContext(message,history,knowledge.productContext);
  const template = wantsProductPrompt(message) || context.topic==='product_photo'
    ? findProductTemplate(message, wantsProductPrompt(message)?history:[], (knowledge.records || []).filter(r=>r.contentType==='exact-template')) : null;
  if (!template && facts.product && /\b(?:which|what|remember)\b.{0,70}\b(?:price|channel|product|details)\b/i.test(message) && /\b(?:I (?:told|gave|mentioned)|did I (?:tell|give)|you (?:remember|recall)|remember|previously supplied)\b/i.test(message)) {
    const known=[facts.product,...facts.attributes,facts.price?`₹${facts.price}`:'',facts.channel||''].filter(Boolean).join(' · ');
    return {reply:language==='hindi'?`आपने बताया: ${known}`:language==='hinglish'?`Tumne yeh facts diye hain: ${known}`:`You supplied: ${known}`,policy:'conversation_product_facts',templateId:''};
  }
  if(wantsProductPrompt(message) && !template && !context.troubleshooting)return {reply:{english:'Which approved template heading should I copy in full?',hindi:'किस स्वीकृत टेम्पलेट का पूरा पाठ चाहिए? उसका शीर्षक बताइए।',hinglish:'Kis approved template ka poora text chahiye? Heading batao.'}[language],templateId:'',policy:'missing_exact_asset'};
  const selection=productResponseSelection({message,history,context,hasTemplate:Boolean(template),hasGuidance:Boolean(creative || selectProductGuidance({message,history,knowledge}))});
  knowledge.responseSelection=selection;
  if (!template && selection.mode==='model') return null;
  if (!template && creative) return advertisingRisk(creative.reply) ? {reply:safeAd[language],policy:'advertising_safety',templateId:''} : creative;
  if (!wantsProductPrompt(message) && !template) {
    const first = selectProductGuidance({message,history,knowledge});
    const context=knowledge.requestContext || productRequestContext(message,history,knowledge.productContext);
    if (!facts.requestedOutputs.length && first && first.intentTags?.includes(context.topic)) {
      return { reply: localizedGuidance({message,history,knowledge}), templateId: '', policy: 'grounded_course_guidance' };
    }
    return null;
  }
  // Limit the lookup to authorized retrieved template assets; no entitlement bypass via a global template registry.
  if (!template) {
    if(context.troubleshooting && context.topic)return {reply:localizedGuidance({message,history,knowledge}),templateId:'',policy:'exact_source_instruction'};
    return {reply:{english:'Which approved template heading should I copy in full?',hindi:'किस स्वीकृत टेम्पलेट का पूरा पाठ चाहिए? उसका शीर्षक बताइए।',hinglish:'Kis approved template ka poora text chahiye? Heading batao.'}[language],templateId:'',policy:'missing_exact_asset'};
  }
  const values = productSlots(message, history,knowledge.productContext);
  const body = renderProductTemplate(template, values);
  for(const [field,pattern]of Object.entries({product:/\[product\]/i,part:/\[the part,/i,colour:/\[new colour,/i,person:/\[man\s*\/\s*woman\]/i})){
    if(values[field]&&pattern.test(body))throw new Error('Known template field unresolved: '+field);
  }
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
  if(wantsProductPrompt(message)){
    const exact=productTutorReply({message,history,knowledge});
    if(exact?.policy==='exact_template' && exact.reply!==reply)return {reply:exact.reply,issue:'exact_template_repair'};
  }
  const language=tutorLanguage(message,history,knowledge.productContext);
  const risk = advertisingRisk(reply);
  if (risk) return { reply: safeAd[language], issue: risk };
  const facts=productFacts(message,history,knowledge.productContext);
  const supplied = [...(facts.attributes || []),...history.filter(t => t.role === 'user').map(t => t.content), message]
    .flatMap(text => String(text).split(/(?<=[.!?।\n])\s+|\bbut\b/iu))
    .filter(text => !/[?]/.test(text) && !/\b(?:not|no|never|don't|isn't|is not|nahi|mat)\b|नहीं|मत/iu.test(text)).join(' ').toLowerCase();
  // Known factual-benefit forms require user evidence, unlike purely creative scene descriptions.
  const claims=[];
  for(const clause of String(reply).split(/(?<=[.!?।;\n])\s+|\bbut\b/iu)){
    for(const match of clause.matchAll(/\b(?:leak[- ]?proof|waterproof|BPA[- ]?free|antibacterial|cures?\s+\w+|Ayurvedic benefits|keeps?\s+(?:water|drinks?)\s+(?:cool|hot))\b/gi)){
      const prefix=clause.slice(0,match.index);
      const negated=/\b(?:not|no|without)\s+(?:a\s+)?$|\b(?:do not|don't|never)\s+(?:call|describe|advertise|claim)\b[^;.!?\n]{0,40}$|नहीं|मत/iu.test(prefix);
      if(!negated)claims.push(match[0]);
    }
  }
  if (claims.some(claim => !supplied.includes(claim.toLowerCase()))) {
    return { reply: safeAd[language], issue: 'unsupported_product_claim' };
  }
  if (facts.product && facts.requestedOutputs.some(k=>['hooks','script','caption','demo','plan'].includes(k))) {
    const violations=unsupportedAdClaims(reply,facts);
    if(violations.length){
      const draft=knowledge.materialsAvailable&&draftProductAd({message,facts,language,records:knowledge.records});
      const compound=knowledge.requestContext?.compound;
      const notice={english:'Some requested reasoning could not be completed safely. Here is a factual draft:',hindi:'माँगी गई कुछ व्याख्या सुरक्षित रूप से पूरी नहीं हो सकी। यह तथ्यों पर आधारित ड्राफ्ट है:',hinglish:'Kuch requested reasoning safely poori nahi ho saki. Yeh factual draft hai:'}[language];
      return {reply:(compound?notice+'\n\n':'')+(draft?.reply||safeAd[language]),issue:'unsupported_product_claim',groundingViolations:violations,...(compound?{repairRequest:{kind:'grounding',language,originalAnswer:String(reply).slice(0,4000)}}:{})};
    }
  }
  if (!explanationLanguageMatches(reply, language, facts.product)) {
    const draft=knowledge.materialsAvailable && draftProductAd({message,facts,language,records:knowledge.records});
    const selection=productResponseSelection({message,history,context:knowledge.requestContext,hasGuidance:Boolean(selectProductGuidance({message,history,knowledge}))});
    if((draft && !knowledge.requestContext?.compound) || selection.mode==='local_guidance')return {reply:draft?.reply||localizedGuidance({message,history,knowledge}),issue:'response_language_mismatch'};
    const note={english:'A translation could not be completed. The earlier answer is retained below for reference, without claiming it is a completed English explanation.',hindi:'अनुवाद पूरा नहीं हो सका। पिछला उत्तर संदर्भ के लिए नीचे रखा है; इसे पूरा हिंदी उत्तर न मानें।',hinglish:'Translation poori nahi ho saki. Purana jawab reference ke liye neeche hai; ise poora Hinglish explanation mat samjho.'}[language];
    return {reply:note+'\n\n```text\n'+String(reply).slice(0,4000)+'\n```',issue:'response_language_mismatch',repairRequest:{kind:'language',language,originalAnswer:String(reply).slice(0,4000)}};
  }
  if (!wantsProductPrompt(message) && facts.product && missingProductDeliverables(reply,facts.requestedOutputs,message).length) {
    const draft=draftProductAd({message,facts,language,records:knowledge.records});
    if(draft)return {reply:draft.reply,issue:'incomplete_requested_output',...(knowledge.requestContext?.compound?{repairRequest:{kind:'completion',language,originalAnswer:String(reply).slice(0,4000)}}:{})};
  }
  // Preserve grounded lesson references even when the provider omits a presentation label.
  const record=selectProductGuidance({message,history,knowledge});
  // A weak top-ranked chunk alone does not establish the answer's lesson.
  const lesson=knowledge.requestContext?.lessonNumber || (knowledge.requestContext?.troubleshooting ? record?.lessonNumber : null);
  if (knowledge.materialsAvailable && record && knowledge.requestContext?.exact && knowledge.requestContext?.troubleshooting && !wantsProductPrompt(message)
    && record.exactInstructions?.some(line=>!String(reply).includes(line))) {
    return {reply:localizedGuidance({message,history,knowledge}),issue:'incomplete_exact_instruction'};
  }
  if (knowledge.materialsAvailable && record && knowledge.requestContext?.explicitLesson
    && /\b(?:lesson\s*|l)0?\d+\b/i.test(reply) && !new RegExp(`\\b(?:lesson\\s*|l)0?${lesson}\\b`,'i').test(reply)) {
    return {reply:localizedGuidance({message,history,knowledge}),issue:'incorrect_lesson_reference'};
  }
  if (knowledge.materialsAvailable && lesson && record && (knowledge.requestContext?.carryLesson || /\b(?:lesson|l\d+|workflow|steps|settings|course|fix|troubleshoot|how)\b/i.test(message))
    && !/\b(?:lesson\s*|l)0?\d+\b/i.test(reply)) {
    return {reply:`Lesson ${String(lesson).padStart(2,'0')}\n\n${reply}`,issue:'missing_lesson_reference'};
  }
  return { reply, issue: null };
}

function productFallbackNotice(message) {
  return { english: 'Showing saved course guidance; a live model answer is unavailable.',
    hindi: 'अभी लाइव मॉडल का उत्तर उपलब्ध नहीं है; सहेजी हुई कोर्स सामग्री दिखाई जा रही है।',
    hinglish: 'Abhi live model ka jawab available nahi hai; saved course guidance dikh rahi hai.' }[tutorLanguage(message)];
}

module.exports = { tutorLanguage, explanationLanguageMatches, advertisingRisk, productSafetyRequest,
  productTutorReply, localizedGuidance, validateProductReply, isProductKnowledge, productFallbackNotice,
  productFacts, productRequestContext, selectProductGuidance };
