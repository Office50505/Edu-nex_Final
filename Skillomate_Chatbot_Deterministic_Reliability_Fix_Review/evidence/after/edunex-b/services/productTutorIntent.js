// Product-course request structure. No source facts, saved questions or answer text.
const { extractEntity,productOperations } = require('./productTutorState');
function productCopyIntent(message) {
 const text=String(message||'');
 const request=text.split(/[;.!?।\n]+/u).filter(c=>! /\b(?:do not|don't|never)\s+(?:copy|generate|write|repeat|fill)\b|(?:template|prompt)\s+(?:repeat\s+)?mat|(?:बनाना|बनाइए|कॉपी|भरना).{0,12}मत/iu.test(c)).join('. ').replace(/\b(?:not|without)\s+(?:(?:a|an|the|any)\s+)?(?:(?:saved|approved|exact)\s+)?(?:prompts?|templates?)\b/gi,'');
 const sourceCopy=/\b(?:exact(?:ly)?|approved|saved|verbatim|literal(?:ly)?|original|source|copy|reproduce|copy[- ]?paste)\b|स्वीकृत|सटीक|मूल|असली|अक्षरशः|कॉपी/i.test(request);
 const complete=/\b(?:full|complete|entire|whole|every word|all of)\b|पूरा|पूरी|सम्पूर्ण|संपूर्ण|\bpoor[ai]\b/i.test(request);
 const copyAction=/\b(?:copy|paste|print|reproduce|return|send|give|provide|show|prepare)\b|दीजिए|(?:^|\s)दें|चाहिए|कॉपी|daalna|\b(?:prompt|template|text|source|original)\s+do\b/i.test(request)
  || /\b(?:need|want)\b.{0,50}\b(?:full|complete|entire|verbatim|approved)\b/i.test(request);
 const generation=/\b(?:original|new|custom|practice|naya|nayi)\b.{0,70}\b(?:prompts?|scene|caption|dialogue)\b|\b(?:prompts?|scene|dialogue)\b.{0,45}\b(?:original|naya)\b/i.test(request)
  && /\b(?:create|draft|generate|write|make|likho|banao)\b|लिख|बनाओ|बनाइए/i.test(request)
  && !/\b(?:copy|paste|reproduce|verbatim|approved)\b|मूल|असली/i.test(request);
 const educational=/\b(?:explain|why|meaning|useful|difference|compare|what does|samjhao)\b|समझा|क्यों|अर्थ/i.test(request);
 const raw=/\b(?:placeholders? (?:included|unchanged)|leave.{0,35}placeholders?.{0,20}unchanged|(?:all|every|square.bracket|bracketed).{0,35}(?:slots?|placeholders?|brackets?).{0,30}(?:visible|provided|unchanged)|do not fill|retain.{0,20}brackets?|keep.{0,20}brackets?)\b|खाली स्थान सहित|उदाहरण और सभी खाली|कोष्ठक.{0,15}(?:सहित|रखें)/iu.test(text);
 return {request,sourceCopy,complete,copyAction,generation,educational,raw};
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
 const compound=workflow&&decision || workflow&&location || lessons.length>1 || comparison&&decision || comparison&&/\b(?:saath|also|and explain|and tell|distinction|alag)\b|साथ|और.*(?:क्यों|फर्क)/i.test(text);
 const colourAction=/\b(?:recolou?r\w*|chang\w*.{0,35}(?:colou?r|shade)|colou?r.{0,35}(?:chang|badal)|variants?)\b|रंग.{0,25}बदल|rang.{0,25}badal/i.test(text);
 return {comparison,decision,workflow,location,final,wholeJourney,compound,reasoning,colourAction,tasks,lessons};
}
function productResponseSelection({message,history=[],context={},hasTemplate=false,hasGuidance=false}) {
 const short=/^(?:again|continue|same again|do that|repeat|next)[.!?\s]*$/i.test(String(message).trim());
 const task=short ? context.previousTask || history.filter(t=>t.role==='user').at(-1)?.content || message : message;
 const s=productIntentSignals(task);
 const plan=productRequestPlan(task,{context,hasTemplate});
 if(hasTemplate&&!productCopyIntent(task).generation)return {mode:'exact_template',reason:'complete_authorized_asset',plan};
 if(plan.synthesis)return {mode:'model',reason:s.compound||s.wholeJourney?'compound_or_complete_journey':'requires_synthesis',plan};
 if(productCopyIntent(task).generation)return {mode:'model',reason:'original_generation'};
 if(s.compound||s.wholeJourney)return {mode:'model',reason:'compound_or_complete_journey'};
 if(s.reasoning&&!context.troubleshooting&&!context.requestedOutputs?.includes('composition')&&context.topic!=='festive')return {mode:'model',reason:'open_reasoning'};
 if(hasGuidance&&context.topic)return {mode:'local_guidance',reason:'matched_task_and_source'};
 return {mode:'model',reason:'insufficient_local_intent_confidence'};
}

function explicitProductLanguage(message){
 // Per-deliverable language does not override the surrounding explanation language.
 const q=String(message||'').replace(/\b(?:short\s+)?(?:Hindi|English|Hinglish)\s+(?:dialogue|line|caption|hook)\b/gi,'');
 if(/\b(?:in English|English mein|answer English|reply English|English please|language English|English kar do)\b|अंग्रेज़ी में|अंग्रेजी में/iu.test(q))return 'english';
 if(/\b(?:Hinglish|Roman Hindi)\b/i.test(q))return 'hinglish';
 if(/\b(?:in Hindi|Hindi mein|Hindi please)\b|हिंदी में|हिन्दी में/iu.test(q))return 'hindi';
 return '';
}
function productResponseLanguage(message,history=[],previous={}) {
 const explicit=explicitProductLanguage(message);if(explicit)return explicit;
 let q=String(message||'');
 const name=extractEntity(q)?.product||previous.product;
 if(name)q=q.split(name).join('');
 q=q.replace(/["“‘][^"”’\n]+["”’]/gu,'');
 if(/^(?:again|continue|same again|do that|repeat|next)[.!?\s]*$/i.test(q.trim())){
  const last=history.filter(t=>t.role==='user').at(-1);
  if(last)return productResponseLanguage(last.content,[],previous);
  if(['english','hindi','hinglish'].includes(previous.language))return previous.language;
 }
 if(/[\u0900-\u097f]/u.test(q))return 'hindi';
 return /\b(?:mera|meri|main|bechta|mujhe|kya|kaise|kaunsi|mein|hai|hain|batao|likhu|likho|chahiye|nahi|agar|karu|karo|rha|yeh|iska|bhi|toh)\b/i.test(q)?'hinglish':'english';
}
function productCourseDomain(message){
 const q=String(message||'').replace(/["“‘][^"”’\n]+["”’]/gu,'');
 if(/\b(?:my (?:last |successful |recent )?(?:payment|transaction|billing|subscription|account|profile)|my name(?! for)|who am I|(?:mera|meri|mere) (?:payment|transaction|subscription|account|profile))\b/i.test(q))return 'account';
 if(/\b(?:subscription|renewal|autopay|course access|payment failed|restore (?:access|purchase)|inactive|expired|plan price)\b|एक्सेस|सदस्यता/i.test(q))return 'platform';
 if(/\b(?:product|item|prompt|template|caption|hooks?|scene|explain|samjhao|video|clips?|photos?|lesson|workflow|shoot|camera|labels?|ad|sequence|order of)\b|प्रोडक्ट|वस्तु|पाठ|फोटो|वीडियो|विज्ञापन|क्रम/i.test(q))return 'course';
 return '';
}
function requestedOutputCount(message,kind,fallback=1){
 const numbers={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,ek:1,do:2,teen:3,paanch:5,'एक':1,'दो':2,'तीन':3,'चार':4,'पाँच':5,'पांच':5};
 const q=String(message).replace(/[०-९]/g,c=>String(c.charCodeAt(0)-0x0966));
 const label=kind==='hooks'?'(?:hooks?\\b|हुक)':kind;
 const m=q.match(new RegExp('(?:^|\\s)(\\d+|'+Object.keys(numbers).join('|')+')\\s+(?:(?:short|brief|punchy|honest|concise|distinct|factual|name-only|English|Hindi|Hinglish|clearly|labeled|labelled|AI|product-showcase|ad|chhote|छोटे|छोटे से|विज्ञापन|अलग|ईमानदार)\\s+){0,6}'+label,'i'));
 return m?Math.max(1,Number(m[1])||numbers[m[1].toLowerCase()]||fallback):fallback;
}
function productRequestPlan(message,{context={},facts={},hasTemplate=false}={}){
 const copy=productCopyIntent(message),signals=productIntentSignals(message);
 const outputs=(context.requestedOutputs||facts.requestedOutputs||[]).map(kind=>({kind,count:['hooks','cards'].includes(kind)?requestedOutputCount(message,kind,kind==='hooks'?5:3):1,language:productResponseLanguage(message,[],facts)}));
 const spoken=String(message).match(/\b(Hindi|English|Hinglish)\s+(?:dialogue|(?:demo\s+)?line)\b/i);
 if(spoken&&outputs.some(o=>o.kind==='demo'))outputs.push({kind:'dialogue',count:1,language:spoken[1].toLowerCase()});
 for(const output of outputs){const lang=String(message).match(new RegExp('\\b(Hindi|English|Hinglish)\\s+'+(output.kind==='script'?'(?:dialogue|script|line)':output.kind)+'\\b','i'));if(lang)output.language=lang[1].toLowerCase();}
 const mode=hasTemplate&&!copy.generation?'copy':copy.generation?'generate':context.troubleshooting?'troubleshoot':copy.educational||signals.reasoning||signals.workflow?'explain':outputs.length?'generate':'clarify';
 const synthesis=/\b(?:target(?:ing)?|target karke)\b/i.test(message)||/\b(?:image|scene)\s+prompts?\b.{0,80}\b(?:on|in|at)\s+(?:a|an|the|my)\s+/i.test(message)||(signals.comparison&&context.topic!=='festive'&&!outputs.some(o=>o.kind==='composition'))||(signals.decision&&/\b(?:start|first|choose|prefer)\b/i.test(message))||context.topic==='aspect_ratio'||outputs.some(o=>o.count>10)||copy.generation||signals.compound||signals.wholeJourney||signals.reasoning&&!context.troubleshooting&&!outputs.some(x=>x.kind==='composition')&&context.topic!=='festive'
  || (context.topic==='colour'&&productOperations(message).some(o=>o.type==='recolour'&&!o.negated)&&!hasTemplate)|| outputs.some(o=>['scene','brief'].includes(o.kind)||o.kind==='dialogue'&&!outputs.some(x=>x.kind==='demo'));
 return {mode,operations:productOperations(message),copyMode:copy.raw?'raw':'fill',outputs,parts:signals.tasks,explanationLanguage:productResponseLanguage(message,[],facts),synthesis,domain:productCourseDomain(message)};
}
module.exports={productCopyIntent,productIntentSignals,productResponseSelection,productResponseLanguage,explicitProductLanguage,requestedOutputCount,productRequestPlan,productCourseDomain};
