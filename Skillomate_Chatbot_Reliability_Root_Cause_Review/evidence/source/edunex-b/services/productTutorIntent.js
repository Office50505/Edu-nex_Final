// Product-course request structure. No source facts, saved questions or answer text.
function productCopyIntent(message) {
 const clauses=String(message||'').split(/[;.!?।\n]+|,(?=\s*(?:do not|don't|not)\b)/iu);
 const request=clauses.filter(clause=>!/\b(?:do not|don't|never)\s+(?:copy|give|send|return|provide|show|generate|write|use)\b.{0,100}\b(?:prompts?|templates?|text|body)\b|\b(?:photo\s+)?(?:prompts?|templates?)\s+(?:mat|nahi)\b|(?:प्रॉम्प्ट|टेम्पलेट|पाठ).{0,20}(?:मत|नहीं)/iu.test(clause)).join('. ')
  .replace(/\b(?:not|without)\s+(?:(?:a|an|the|any)\s+)?(?:(?:saved|approved|exact)\s+)?(?:prompts?|templates?)\b/gi,'');
 const sourceCopy=/\b(?:exact|approved|saved|verbatim|copy|reproduce|copy[- ]?paste)\b|स्वीकृत|सटीक/i.test(request);
 const complete=/\b(?:full|complete|entire)\b|पूरा|पूरी|सम्पूर्ण|संपूर्ण|\bpoor[ai]\b/i.test(request);
 const copyAction=/\b(?:copy|paste|reproduce|return|send|give|provide)\b|दीजिए|(?:^|\s)दें|\bdo\b/i.test(request)
  || /\b(?:need|want)\b.{0,35}\b(?:full|complete|entire|verbatim)\b/i.test(request);
 const generation=!sourceCopy && /\b(?:create|draft|generate|write|make)\b.{0,65}\b(?:original|new|custom|practice)\b.{0,35}\bprompts?\b/i.test(request);
 const educational=/\b(?:explain|why|meaning|useful|difference|compare)\b|समझा|क्यों|अर्थ/i.test(request);
 return {request,sourceCopy,complete,copyAction,generation,educational};
}
function productIntentSignals(message) {
 const text=String(message||'');
 const workflow=/\b(?:workflow|steps|order|process|assembly)\b|वर्कफ़्लो|क्रम|कदम/i.test(text);
 const location=/\b(?:where|available|notes)\b.{0,55}\bprompts?\b|\bprompts?\b.{0,55}\b(?:where|available|notes)\b|प्रॉम्प्ट.*(?:कहाँ|नोट्स)/i.test(text);
 const final=/\b(?:final|finale)\b|अंतिम|फाइनल/i.test(text);
 const wholeJourney=final&&workflow&&/\b(?:from|through|pehle|photos?|sheet)\b|शुरू|फोटो/i.test(text);
 const lessons=[...new Set([...text.matchAll(/\b(?:Lesson\s*|L)0?([1-8])\b/gi)].map(m=>Number(m[1])))];
 const comparison=/\b(?:compare|contrast|versus|difference|distinguish|farq)\b|फर्क|फ़र्क|तुलना/i.test(text) || /\b(?:white|plain|simple)\b.*\bya\b.*\b(?:desk|scene)\b/i.test(text);
 const decision=/\b(?:choose|select|prefer|which|kyun|pehle kya)\b|कौन|चुनूँ|पहली/i.test(text);
 const reasoning=/\b(?:trade[- ]off|reason(?:ing)?|why|kyun|justify)\b|कारण|क्यों|वजह/i.test(text) || comparison;
 const tasks=[...(workflow?['workflow']:[]),...(location?['prompt_location']:[]),...(comparison?['comparison']:[]),...(decision?['decision']:[]),...(reasoning?['rationale']:[])];
 const compound=workflow&&location || lessons.length>1 || comparison&&decision || comparison&&/\b(?:saath|also|and explain|and tell|distinction|alag)\b|साथ|और.*(?:क्यों|फर्क)/i.test(text);
 const colourAction=/\b(?:recolou?r\w*|chang\w*.{0,35}(?:colou?r|shade)|colou?r.{0,35}(?:chang|badal)|variants?)\b|रंग.{0,25}बदल|rang.{0,25}badal/i.test(text);
 return {workflow,location,final,wholeJourney,compound,reasoning,colourAction,tasks,lessons};
}
function productResponseSelection({message,history=[],context={},hasTemplate=false,hasGuidance=false}) {
 const short=/^(?:again|continue|same again|do that|repeat|next)[.!?\s]*$/i.test(String(message).trim());
 const task=short ? context.previousTask || history.filter(t=>t.role==='user').at(-1)?.content || message : message;
 const s=productIntentSignals(task);
 if(hasTemplate)return {mode:'exact_template',reason:'complete_authorized_asset'};
 if(productCopyIntent(task).generation)return {mode:'model',reason:'original_generation'};
 if(s.compound||s.wholeJourney)return {mode:'model',reason:'compound_or_complete_journey'};
 if(s.reasoning&&!context.troubleshooting&&!context.requestedOutputs?.includes('composition')&&context.topic!=='festive')return {mode:'model',reason:'open_reasoning'};
 if(hasGuidance&&context.topic)return {mode:'local_guidance',reason:'matched_task_and_source'};
 return {mode:'model',reason:'insufficient_local_intent_confidence'};
}

function productResponseLanguage(message,history=[],previous={}) {
 const q=String(message||'');
 if(/\b(?:in English|English mein|answer English|reply English)\b/i.test(q))return 'english';
 if(/\b(?:Hinglish|Roman Hindi)\b/i.test(q))return 'hinglish';
 if(/\b(?:in Hindi|Hindi mein)\b|हिंदी|[\u0900-\u097f]/i.test(q))return 'hindi';
 if(/^(?:again|continue|same again|do that|repeat|next)[.!?\s]*$/i.test(q.trim())){
  const last=history.filter(t=>t.role==='user').at(-1);
  if(last)return productResponseLanguage(last.content);
  if(['english','hindi','hinglish'].includes(previous.language))return previous.language;
 }
 return /\b(?:mera|meri|main|bechta|mujhe|kya|kaise|kaunsi|mein|hai|hain|batao|likhu|chahiye|nahi|agar|karu|karo|rha|yeh|iska|bhi|toh)\b/i.test(q)?'hinglish':'english';
}
module.exports={productCopyIntent,productIntentSignals,productResponseSelection,productResponseLanguage};

