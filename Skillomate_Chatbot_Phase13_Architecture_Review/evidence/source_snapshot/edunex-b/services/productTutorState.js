// Product-course state primitives. Only learner declarations establish product facts.
// No product-name dictionary and no model/assistant text is promoted to factual evidence.
const compact=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
function entity(value){
 const name=compact(value).replace(/^(?:(?:of\s+)?(?:a|an|the|my|our)\s+)+/i,'');
 if(!name||name.length>100||/[\[\]{}<>]/.test(name)||/\b(?:not|unknown|unset|unavailable|same|that|this|provided|previous|earlier|course|prompt|template|ignore|system|customer|benefits?)\b|अज्ञात|नहीं/u.test(name.toLowerCase()))return '';
 if(/^(?:product|item|actor|presenter|man|woman|one|ad|video|details|features?)(?:\s|$)/i.test(name))return '';
 return name;
}
function extractEntity(text){
 const q=String(text||'');
 const stop='(?=\\s+(?:on|through|via|at|with|using|priced|sold|and\\s+(?:I|we|write|give)|for\\s+[₹$0-9])\\b|[,;.!?।\\n]|$)';
 const noun="([\\p{L}\\p{N}][\\p{L}\\p{N}\\p{M} '&/\\-]{0,100}?)";
 const patterns=[
  new RegExp('\\b(?:replace|switch|change)\\s+(?:the |my |our )?(?:product|item)\\s+(?:with|to)\\s+'+noun+stop,'iu'),
  new RegExp('\\b(?:I call (?:my|our|the) (?:item|product)|(?:my|our) (?:item|product) is|the (?:item|product)(?: in (?:this|the) (?:exercise|example))? is|the name of (?:my|our|the) (?:item|product) is)\\s+(?:(?:called|named)\\s+)?'+noun+stop,'iu'),
  new RegExp('\\bI (?:only |just )?know (?:only |just )?the name of (?:my|our)\\s+'+noun+stop,'iu'),
  /(?:मेरे|हमारे)\s+(?:प्रोडक्ट|उत्पाद|सामान|आइटम)\s+का\s+नाम\s+(.+?)\s+है/u,
  /(?:मेरा|मेरी|हमारा|हमारी)\s+(?:प्रोडक्ट|उत्पाद|सामान|आइटम)\s+(.+?)\s+है/u,
  /\b(?:mera|meri|hamara|hamari)\s+(?:product|item|samaan)\s+(.+?)\s+hai\b/iu,
  /\b(?:main|mai|hum)\s+(.+?)\s+becht[aei]\s+(?:hoon|hun|hain)\b/iu,
  new RegExp('\\b(?:for|about)\\s+my\\s+'+noun+stop,'iu'),
  new RegExp('\\b(?:AI|synthetic|virtual)\\s+(?:presenter|actor|woman|man)\\s+has never (?:bought|used|tested)\\s+'+noun+stop,'iu'),
  /\bmere\s+(.+?)\s+ke liye\b/iu,
 ];
 for(const pattern of patterns){const m=q.match(pattern);if(m){const p=entity(m[1]);if(p)return {product:p,evidence:compact(m[0]).slice(0,240)};}}
 return null;
}
function extraSlots(text){
 const q=String(text||'').replace(/[०-९]/g,c=>String(c.charCodeAt(0)-0x0966));const result={};
 const price=q.match(/(?:\b(?:price|costs?|mrp)(?:\s+is)?\s*[:=]?\s*(?:₹|rs\.?\s*)?|(?:कीमत|मूल्य|दाम)\s*[:=]?\s*|₹\s*)(\d[\d,]*(?:\.\d{1,2})?)/i);if(price)result.price=price[1];
 if(/(?:price|कीमत|दाम).{0,12}(?:unknown|unset|अज्ञात|नहीं पता)/iu.test(q))result.price=null;
 const channel=q.match(/\b(Instagram|website|marketplace|Amazon|Etsy|WhatsApp)\b.{0,20}(?:par|पर|bik|बिक्री)|(?:बिक्री|sales|sell\w*).{0,40}\b(Instagram|website|marketplace|Amazon|Etsy|WhatsApp)\b/i);if(channel)result.channel=channel[1]||channel[2];
 const variant=q.match(/(?:sirf\s+)?([\p{L}\p{N}][\p{L}\p{N}\p{M} '\-/]{0,79}?)\s+ka\s+(?:rang|colou?r)\s+([\p{L}\p{N}][\p{L}\p{N}\p{M} '\-/]{0,59}?)\s+(?:karna|kar\s+do|karo|badal)/iu)
 ||q.match(/(?:केवल|सिर्फ)\s+(.{1,80}?)\s+का\s+रंग\s+(.{1,60}?)\s+(?:करें|करना|कर दीजिए)/u);
 if(variant&&!/\b(?:nahi|mat)\b|नहीं|मत/u.test(variant[0])){result.part=compact(variant[1]).replace(/^.*?\b(?:mein|sirf)\s+/i,'').replace(/^(?:sirf|only)\s+/i,'');result.colour=compact(variant[2]);}
 return result;
}
function scopeProductState(previous={},scope={}){
 if((scope.courseId&&previous.courseId&&scope.courseId!==previous.courseId)||(scope.conversationId&&previous.conversationId&&scope.conversationId!==previous.conversationId))return {};
 return previous;
}
function captureProductOptions(reply){
 // Option labels are conversational choices, never product facts.
 const lines=String(reply||'').split('\n');const options=[];let inAngles=false;
 for(const line of lines){if(/(?:ad angles?|विज्ञापन कोण|ad angle options)/i.test(line))inAngles=true;
  const m=line.match(/^\s*(?:\*\*)?(\d+)[.)]\s*(?:\*\*)?(?:Ad angle\s*:\s*)?(.{3,160})/i);
  if(inAngles&&m)options.push({id:m[1],text:compact(m[2].replace(/\*\*/g,''))});
  else if(inAngles&&options.length&&/^\s*(?:Hooks|Caption|15[- ]second)/i.test(line))break;
 }
 return options.slice(0,5);
}
function taskConstraints(message,previous={}){
 const q=String(message||'');const actorFree=/\b(?:no actors?|actor[- ]free|without (?:an? )?(?:actor|presenter))\b|बिना.{0,8}(?:अभिनेता|कलाकार)/i.test(q)?true:/\b(?:add|use|with) (?:an? )?(?:actor|presenter)\b/i.test(q)?false:Boolean(previous.actorFree);
 return {actorFree};
}
module.exports={extractEntity,extraSlots,scopeProductState,captureProductOptions,taskConstraints};
