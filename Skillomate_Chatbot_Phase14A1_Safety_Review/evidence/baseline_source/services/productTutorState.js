// Product-course state primitives. Only learner declarations establish product facts.
// No product-name dictionary and no model/assistant text is promoted to factual evidence.
// Keep user names in their original Unicode form; normalize keys, not identity text.
const compact=value=>String(value||'').replace(/\s+/g,' ').trim();
function entity(value){
 const name=compact(value).replace(/^(?:(?:of\s+)?(?:a|an|the|my|our)\s+)+/i,'');
 if(!name||name.length>100||/[\[\]{}<>]/.test(name)||/\b(?:not|unknown|unset|unavailable|same|that|this|provided|previous|earlier|course|prompt|template|ignore|system|customer|benefits?)\b|अज्ञात|नहीं/u.test(name.toLowerCase()))return '';
 if(/^(?:product|item|actor|presenter|man|woman|one|ad|video|details|features?)(?:\s|$)/i.test(name))return '';
 return name;
}
function extractEntity(text){
 const q=String(text||'');
 const replacements=productOperations(q).filter(op=>op.type==='replace');
 if(replacements.length){const op=replacements.filter(op=>!op.negated&&op.product).at(-1);return op?{product:op.product,evidence:compact(q.slice(...op.span)),span:op.span}:null;}
 const stop='(?=\\s+(?:on|through|via|at|with|using|priced|sold|in\\s+(?:a|an|the|Lesson|English|Hindi|Hinglish)|and\\s+(?:I|we|write|give)|for\\s+[₹$0-9])\\b|[,;.!?।\\n]|$)';
 const noun="([\\p{L}\\p{N}][\\p{L}\\p{N}\\p{M} '&/\\-]{0,100}?)";
 const patterns=[
  new RegExp('\\b(?:the (?:object|subject)(?: (?:I am photographing|of (?:these|the) (?:photos|photographs)))?|(?:my|our) object) is\\s+'+noun+stop,'iu'),
  new RegExp('\\b(?:I call (?:my|our|the) (?:item|product)|(?:my|our) (?:item|product) is|the (?:item|product)(?: in (?:this|the) (?:exercise|example))? is|the name of (?:my|our|the) (?:item|product) is)\\s+(?:(?:called|named)\\s+)?'+noun+stop,'iu'),
  new RegExp('\\bI (?:only |just )?know (?:only |just )?the name of (?:my|our)\\s+'+noun+stop,'iu'),
  /(?:मेरे|मेरी|मेरा|हमारे|हमारी|हमारा)\s+(?:प्रोडक्ट|उत्पाद|सामान|आइटम|वस्तु|चीज़|चीज)\s+का\s+नाम\s+([^।.!?;\n]+?)\s+है/u,
  /(?:मेरा|मेरी|हमारा|हमारी)\s+(?:प्रोडक्ट|उत्पाद|सामान|आइटम|वस्तु|चीज़|चीज)\s+([^।.!?;\n]+?)\s+है/u,
  /\b(?:mere|meri|mera|hamare|hamari|hamara)\s+(?:product|item|samaan|vastu|cheez)\s+ka\s+naam\s+(.+?)\s+hai\b/iu,
  /\b(?:mera|meri|hamara|hamari)\s+(?:product|item|samaan)\s+(.+?)\s+hai\b/iu,
  /\b(?:main|mai|hum)\s+(.+?)\s+becht[aei]\s+(?:hoon|hun|hain)\b/iu,
  new RegExp('\\b(?:for|about)\\s+my\\s+'+noun+stop,'iu'),
  new RegExp('\\b(?:AI|synthetic|virtual)\\s+(?:presenter|actor|woman|man)\\s+has never (?:bought|used|tested)\\s+'+noun+stop,'iu'),
  /\bmere\s+(.+?)\s+ke liye\b/iu,
 ];
 for(const pattern of patterns){const m=q.match(pattern);if(m){const p=entity(m[1]);if(p)return {product:p,evidence:compact(m[0]).slice(0,240),span:[m.index,m.index+m[0].length]};}}
 return null;
}

// Typed user mutations. Values are opaque supplied strings, never colour/product dictionaries.
function productOperations(text){
 const q=String(text||'');const operations=[];
 const end='(?=\\s+(?:and|while|but)\\s+(?:keep|preserv\\w*|leav\\w*|retain|do not|don.t)|[,;.!?।\\n]|$)';
 const noun="([\\p{L}\\p{N}][\\p{L}\\p{M}\\p{N} '&/\\-]{0,100}?)";
 const replacementEnd='(?=\\s+(?:with|using|priced|on|at|and\\s+(?:give|write|return|price))\\b|[,;.!?।\\n]|$)';
 const replacements=[
  new RegExp('\\b(?:replace|switch|change)\\s+(?:the |my |our )?(?:product|item|object)\\s+(?:with|to)\\s+'+noun+replacementEnd,'giu'),
  /\b(?:product|item|samaan|vastu)\s+ko\s+([^;.!?।\n]{1,100}?)\s+se\s+(?:replace\s+(?:mat\s+)?karo|(?:mat\s+)?badal\s+(?:do|karo))\b/giu,
  /(?:प्रोडक्ट|उत्पाद|वस्तु|सामान|आइटम)\s+को\s+([^;.!?।\n]{1,100}?)\s+से\s+(?:मत\s+)?(?:बदलें|बदल दीजिए|बदल दो|बदलो|replace\s+करें)/gu,
 ];
 const add=(type,m,values)=>{
  const prefix=q.slice(0,m.index).split(/[.;!?।\n]/u).at(-1);
  const negated=/\b(?:do not|don't|never|not|nahi|mat)\s*$|(?:^|\s)(?:नहीं|मत)\s*$/iu.test(prefix)
    || /\b(?:not|nahi|mat)\b|(?:^|\s)(?:नहीं|मत)(?=\s|$)/u.test(m[0]);
  operations.push({type,...values,negated,span:[m.index,m.index+m[0].length]});
 };
 for(const pattern of replacements)for(const m of q.matchAll(pattern))add('replace',m,{product:entity(m[1])});
 const recolours=[
  new RegExp('\\b(?:change|changing|recolou?r(?:ing)?)\\s+(?:(?:the\\s+)?colou?r\\s+of\\s+)?'+noun+'\\s+to\\s+'+noun+end,'giu'),
  new RegExp('\\bcolou?r\\s+of\\s+'+noun+'\\s+(?:(?:should|must|will)\\s+(?:not\\s+)?be\\s+|is\\s+to\\s+(?:be\\s+)?|)(?:changed|recolou?red|become)\\s+(?:to\\s+)?'+noun+end,'giu'),
  /(?:sirf\s+)?([\p{L}\p{N}][\p{L}\p{N}\p{M} '\-/]{0,79}?)\s+ka\s+(?:rang|colou?r)\s+([\p{L}\p{N}][\p{L}\p{N}\p{M} '\-/]{0,59}?)\s+(?:mat\s+)?(?:karna|kar\s+do|karo|badal)/giu,
  /(?:केवल|सिर्फ)\s+([^।;.!?\n]{1,80}?)\s+का\s+रंग\s+([^।;.!?\n]{1,60}?)\s+(?:मत\s+)?(?:करें|करना|कर दीजिए)/gu,
 ];
 for(const pattern of recolours)for(const m of q.matchAll(pattern)){
  const part=compact(m[1]).replace(/^.*?\b(?:mein|sirf)\s+/i,'').replace(/^(?:sirf|only)\s+/i,'');
  const colour=compact(m[2]);
  if(part.length<=100&&colour.length<=100)add('recolour',m,{part,colour});
 }
 return operations.sort((a,b)=>a.span[0]-b.span[0]);
}

function maskProductOperations(text){
 let q=String(text||'');
 for(const op of productOperations(q).sort((a,b)=>b.span[0]-a.span[0]))q=q.slice(0,op.span[0])+' '.repeat(op.span[1]-op.span[0])+q.slice(op.span[1]);
 return q;
}
function extraSlots(text){
 const q=String(text||'').replace(/[०-९]/g,c=>String(c.charCodeAt(0)-0x0966));const result={};
 const price=q.match(/(?:\b(?:price|costs?|mrp)(?:\s+is)?\s*[:=]?\s*(?:₹|rs\.?\s*)?|(?:कीमत|मूल्य|दाम)\s*[:=]?\s*|₹\s*)(\d[\d,]*(?:\.\d{1,2})?)/i);if(price)result.price=price[1];
 if(/(?:price|कीमत|दाम).{0,12}(?:unknown|unset|अज्ञात|नहीं पता)/iu.test(q))result.price=null;
 const channel=q.match(/\b(Instagram|website|marketplace|Amazon|Etsy|WhatsApp)\b.{0,20}(?:par|पर|bik|बिक्री)|(?:बिक्री|sales|sell\w*).{0,40}\b(Instagram|website|marketplace|Amazon|Etsy|WhatsApp)\b/i);if(channel)result.channel=channel[1]||channel[2];
 for(const op of productOperations(text))if(op.type==='recolour'&&!op.negated){result.part=op.part;result.colour=op.colour;}
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
module.exports={extractEntity,extraSlots,scopeProductState,captureProductOptions,taskConstraints,productOperations,maskProductOperations};
