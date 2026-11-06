// Product-course request structure. No source facts, saved questions or answer text.
function productIntentSignals(message) {
 const text=String(message||'');
 const workflow=/\b(?:workflow|steps|order|process)\b|वर्कफ़्लो|क्रम|कदम/i.test(text);
 const location=/\b(?:where|available|notes)\b.{0,55}\bprompts?\b|\bprompts?\b.{0,55}\b(?:where|available|notes)\b|प्रॉम्प्ट.*(?:कहाँ|नोट्स)/i.test(text);
 const final=/\b(?:final|finale)\b|अंतिम|फाइनल/i.test(text);
 const wholeJourney=final&&workflow&&/\b(?:from|through|pehle|photos?|sheet)\b|शुरू|फोटो/i.test(text);
 const compound=workflow&&location || /\b(?:explain|give|describe)\b.{0,100}\band\s+(?:then\s+)?(?:compare|contrast|tell me where|explain why)\b/i.test(text);
 const reasoning=/\b(?:distinguish|trade[- ]off|reason(?:ing)?|which (?:reference|image|photo).{0,80}(?:keep|choose|select|prefer)|why.{0,60}(?:visible|hiding|background|scenery)|difference.{0,40}(?:experience|image))\b|कारण|फर्क|फ़र्क|farq|reason ke saath/i.test(text);
 const colourAction=/\b(?:recolou?r\w*|chang\w*.{0,35}(?:colou?r|shade)|colou?r.{0,35}(?:chang|badal)|variants?)\b|रंग.{0,25}बदल|rang.{0,25}badal/i.test(text);
 return {workflow,location,final,wholeJourney,compound,reasoning,colourAction};
}
function productResponseSelection({message,history=[],context={},hasTemplate=false,hasGuidance=false}) {
 const short=/^(?:again|continue|same again|do that|repeat|next)[.!?\s]*$/i.test(String(message).trim());
 const task=short ? history.filter(t=>t.role==='user').at(-1)?.content || message : message;
 const s=productIntentSignals(task);
 if(hasTemplate)return {mode:'exact_template',reason:'complete_authorized_asset'};
 if(s.compound||s.wholeJourney)return {mode:'model',reason:'compound_or_complete_journey'};
 if(s.reasoning&&!context.troubleshooting&&!context.requestedOutputs?.includes('composition'))return {mode:'model',reason:'open_reasoning'};
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
 return /\b(?:mera|meri|mujhe|kya|kaise|kaunsi|mein|hai|hain|batao|likhu|chahiye|nahi|agar|karu|karo|rha|yeh|iska|bhi|toh)\b/i.test(q)?'hinglish':'english';
}
module.exports={productIntentSignals,productResponseSelection,productResponseLanguage};

