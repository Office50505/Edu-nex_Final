// Product-course state primitives. Only learner declarations establish product facts.
// No product-name dictionary and no model/assistant text is promoted to factual evidence.
// Keep user names in their original Unicode form; normalize keys, not identity text.
const compact=value=>String(value||'').replace(/\s+/g,' ').trim();

function productNameSecurityText(value){
 // This view is for validation only. Never use it as the displayed product name.
 const normalized=String(value||'').normalize('NFKC');
 if(/\p{Bidi_Control}/u.test(normalized))return '';
 const checked=compact(normalized.replace(/\p{Default_Ignorable_Code_Point}/gu,''));
 // NFKC does not resolve Cyrillic/Greek lookalikes. Reject script mixing within
 // a word, while allowing legitimate separate Hindi/English words in a name.
 const words=checked.match(/[\p{L}\p{M}]+/gu)||[];
 if(words.some(word=>/\p{Script=Latin}/u.test(word)
   && /\p{Script=Cyrillic}|\p{Script=Greek}/u.test(word)))return '';
 return checked;
}

function entity(value){
 const name=compact(value).replace(/^["“‘]([\s\S]*)["”’]$/u,'$1').replace(/^(?:(?:of\s+)?(?:a|an|the|my|our)\s+)+/i,'');
 const checked=productNameSecurityText(name).replace(/^(?:(?:of\s+)?(?:a|an|the|my|our)\s+)+/i,'');
 if(!name||!checked||/^(?:current|existing|present)\s+(?:item|product|object)$/iu.test(checked)||/^(?:इस|उस|वही|यह|इसका|उसका)(?:\s|$)/u.test(checked)||name.length>100||checked.length>100||/[\[\]{}<>]/.test(checked)
  || /\b(?:it|them|me|changing|creating|making|not|no|given|unknown|unset|unavailable|same|that|this|provided|previous|earlier|course|prompt|template|ignore|system|developer|instead|mentioned|above|discussed|customer|benefits?|features?|details|angle)\b|अज्ञात|नहीं/iu.test(checked))return '';
 if(/\b(?:changed?|recolou?red|replace|switch)\b.{0,50}\b(?:to|with)\b/iu.test(checked))return '';
 if(/^(?:(?:clearly )?adult |young Indian )?(?:product|item|actor|presenter|man|woman|one|ad|video|photo|hooks?|scripts?|captions?)(?:\s|$)/i.test(checked))return '';
 return name;
}

// One declaration parser for state, rendering and language masking. Evidence spans
// refer to the original input; displayed names never pass through NFKC.
function declaration(text){
 const q=String(text||'');
 const quoted='["“‘]([^"”’\\n]{1,160})["”’]';
 const end='(?=\\s+(?:on|through|via|at|with|using|priced|sold|called|named|in\\s+(?:a|an|the|Lesson|English|Hindi|Hinglish)|and\\s+(?:I|we|write|give|include|preserve|keep|tell|show|use|suggest)|for\\s+[₹$]?\\d+)\\b|[,:;.!?।\\n]|$)';
 const noun="([\\p{L}\\p{N}][\\p{L}\\p{N}\\p{M} '&/\\-]{0,110}?)";
 const patterns=[
  new RegExp('\\b(?:called|named)\\s*'+quoted,'iu'),
  /^([\p{L}\p{N}][\p{L}\p{N}\p{M} '&/\-]{1,100}?)\s+ka\s+(?=[^;.!?।\n]{0,50}\b(?:video|photo|prompt|caption)\b)/iu,
  /^([^।;!?\n]{1,100}?)\s+के\s+विज्ञापन\s+के\s+लिए/u,
  new RegExp('\\[PRODUCT\\]\\s*(?:को|की जगह)\\s*'+quoted,'iu'),
  new RegExp('\\b(?:the )?label(?: on (?:my|our|the) [^.!?;\\n]{1,50}?)? says\\s*'+quoted,'iu'),
  new RegExp('\\b(?:my|our)\\s+'+quoted+'\\s+[\\p{L}]','iu'),
  new RegExp('\\b(?:I|we)\\s+(?:sell|use|have|am selling)\\s+'+quoted,'iu'),
  new RegExp('^\\s*'+quoted+'\\s+(?:is\\s+(?:a|an|my|our)\\b|means my\\b|(?:mera|meri|my)\\b|नाम\\s+की|[^;.!?।\\n]{1,100}?(?:है|hai)\\b)','iu'),
  new RegExp('^\\s*'+quoted+'\\s+[^;.!?।\\n]{1,100}?(?:है|hai)(?=[।;.!?\\n]|$)','iu'),
  new RegExp('\\b(?:called|named)\\s+'+noun+end,'iu'),
  new RegExp('\\b(?:my|our)\\s+'+noun+'\\s+(?:costs?|is (?:called|named))\\b','iu'),
  new RegExp('\\bchoose\\s+(?:the|a|an)\\s+'+noun+end,'iu'),
  new RegExp('\\[PRODUCT\\]\\s*[:=]\\s*(?:'+quoted+'|'+noun+end+')','iu'),
  new RegExp('\\b(?:product\\s+name|item\\s+name|name\\s+of\\s+(?:my|our|the)\\s+(?:product|item))\\s*[:=]\\s*(?:'+quoted+'|'+noun+end+')','iu'),
  new RegExp('\\b(?:my name for this (?:item|product) is|(?:my|our) (?:product|item) is(?: called| named)?|I call (?:my|our|the) (?:product|item)|its name is)\\s*'+quoted,'iu'),
  new RegExp('\\b(?:called|named|the label says|name\\s*:)\\s*'+quoted,'iu'),
  new RegExp(quoted+'\\s+(?:is my|is our)\\b','iu'),
  new RegExp('\\b(?:mera|meri|hamara|hamari)\\s+(?:product|item)\\s+(?:ka\\s+)?(?:naam\\s+)?'+quoted+'\\s+hai\\b','iu'),
  /(?:मेरे|मेरी|मेरा|हमारे|हमारी|हमारा)\s+(?:प्रोडक्ट|उत्पाद|सामान|आइटम|वस्तु|चीज़|चीज)\s+का\s+नाम\s+([^।.!?;\n]+?)\s+है/u,
  /(?:मेरा|मेरी|हमारा|हमारी)\s+(?:प्रोडक्ट|उत्पाद|सामान|आइटम|वस्तु|चीज़|चीज)\s+(?!\s*का\s+नाम\s+)([^।.!?;\n]+?)\s+है/u,
  /\b(?:mere|meri|mera|hamare|hamari|hamara)\s+(?:product|item|samaan|vastu|cheez)\s+ka\s+naam\s+(.+?)\s+hai\b/iu,
  /\b(?:mera|meri|hamara|hamari)\s+(?:product|item|samaan)\s+(?!\s*ka\s+naam\s+)(.+?)\s+hai\b/iu,
  /\b(?:main|mai|hum)\s+(.+?)\s+becht[aei]\s+(?:hoon|hun|hain)\b/iu,
  /(?:मुझे|हमें)\s+(?:केवल|सिर्फ|बस)?\s*(?:(?:प्रोडक्ट|उत्पाद)\s+का\s+)?नाम\s+([^।.!?;\n]+?)\s+(?:पता|मालूम)\s+है/u,
  /\b(?:mujhe|humein)\s+(?:sirf\s+)?(?:product\s+ka\s+)?naam\s+(.+?)\s+(?:pata\s+hai|maloom\s+hai)\b/iu,
  new RegExp('\\b(?:the (?:object|subject)(?: (?:I am photographing|of (?:these|the) (?:photos|photographs)))?|(?:my|our) object) is\\s+'+noun+end,'iu'),
  new RegExp('\\b(?:I call (?:my|our|the) (?:item|product)|(?:my|our) (?:item|product) is|the (?:item|product)(?: in (?:this|the) (?:exercise|example))? is|the name of (?:my|our|the) (?:item|product) is)\\s+(?:(?:called|named)\\s+)?'+noun+end,'iu'),
  new RegExp('\\bI (?:only |just )?know (?:only |just )?the (?:product )?name(?: of (?:my|our)| is)?\\s+'+noun+end,'iu'),
  new RegExp('\\b(?:I|we)\\s+(?:sell|have|use)\\s+(?!given\\b|no\\b|not\\b|(?:product photos?|reference(?: images?)?|photos?|images?)\\b|active access\\b|only (?:a |an )?(?:AI|synthetic|virtual))'+noun+end,'iu'),
  new RegExp('\\b(?:AI|synthetic|virtual)\\s+(?:presenter|actor|woman|man)\\s+has never (?:bought|used|tested)\\s+'+noun+end,'iu'),
 ];
 for(const pattern of patterns){const m=q.match(pattern);if(!m)continue;const raw=m.slice(1).find(Boolean);const product=entity(raw);
  // A rejected explicit declaration must not be retried as a weaker preposition.
  if(!product)return null;
  const at=m.index+m[0].indexOf(raw);return {product,evidence:compact(m[0]).slice(0,240),span:[at,at+raw.length]};
 }
 // Bounded referring phrases are accepted only as a supplied subject of a task,
 // never an arbitrary "of" phrase or a request for archival/source manipulation.
 const fallback=new RegExp('\\b(?:for|around|about)\\s+(?:a|an|the|my|our)\\s+'+noun+end,'giu');
 for(const m of q.matchAll(fallback)){
  const before=q.slice(0,m.index).split(/[.;!?।\n]/u).at(-1),after=q.slice(m.index+m[0].length).split(/[.;!?।\n]/u)[0];
  if(!/\b(?:prompts?|templates?|scripts?|captions?|hooks?|ad|demo|demonstration|scene|showcase|carousel|testimonial|review|compare|contrast|photos?|product)\b/iu.test(before+' '+after)&&!/^for my\b/i.test(m[0]))continue;
  if(/\b(?:I|we)\s+(?:need|want)|\b(?:exercise|comparison|archive|analysis|reference|same|this|that|example)\b/i.test(m[1]))continue;
  const product=entity(m[1]);if(product){const at=m.index+m[0].indexOf(m[1]);return {product,evidence:compact(m[0]),span:[at,at+m[1].length]};}
 }
 const hindi=q.match(/(?:मेरे|मेरी)\s+([^।;!?\n]{1,100}?)\s+के\s+लिए/u)||q.match(/\bmere\s+(.+?)\s+ke liye\b/iu);
 if(hindi){const product=entity(hindi[1]);if(product)return {product,evidence:compact(hindi[0]),span:[hindi.index,hindi.index+hindi[0].length]};}
 return null;
}
function extractEntity(text){
 const replacements=productOperations(text).filter(op=>op.type==='replace'||op.type==='rename');
 if(replacements.length){const op=replacements.filter(op=>!op.negated&&op.product).at(-1);return op?{product:op.product,evidence:compact(String(text).slice(...op.span)),span:op.span}:null;}
 return declaration(maskProductOperations(text));
}

// Typed mutations are parsed before declarations. Only supplied values are used.
function productOperations(text){
 const q=String(text||''),operations=[];
 const end='(?=\\s+(?:and|while|but)\\s+(?:keep|preserv\\w*|leav\\w*|retain|do not|don.t)|[,:;.!?।\\n]|$)';
 const noun="([\\p{L}\\p{N}][\\p{L}\\p{M}\\p{N} '&/\\-]{0,100}?)";
 const replacementEnd='(?=\\s+(?:with|using|priced|on|at|and\\s+(?:give|write|return|price))\\b|[,:;.!?।\\n]|$)';
 const add=(type,m,values)=>{
  const prefix=q.slice(0,m.index).split(/[.;!?।\n]/u).at(-1);
  const negated=/\b(?:do not|don't|never|not|nahi|mat)\s*$|(?:^|\s)(?:नहीं|मत)\s*$/iu.test(prefix)||/\b(?:not|nahi|mat)\b|(?:^|\s)(?:नहीं|मत)(?=\s|$)/u.test(m[0]);
  operations.push({type,...values,negated,span:[m.index,m.index+m[0].length]});
 };
 const replacements=[
  /\b(?:switch|change)\s+to\s+(?!(?:a|an|the)\s+(?:(?:new|next|previous|different)\s+)?(?:product|item|object|lesson|course|topic|English|Hindi|Hinglish|explanation|language|prompt|template|caption|script|workflow|account)\b)((?:a|an|the)\s+[^;.!?।\n]+|["“‘][^"”’]+["”’])/giu,
  /\b(?:replace|switch|change)\s+(?:it|the product)(?:\s+completely)?\s*:\s*["“‘]([^"”’]+)["”’]/giu,
  /\b(?:new|naya|nayi)\s+(?:product|item)\s+["“‘]([^"”’]+)["”’](?=\s*[:;,]|\s+hai)/giu,
  /\b(?:replace|switch|change)\s+(?:(?:the|my|our)\s+(?:product|item|object)|it)(?:\s+completely)?\s+(?:with|to)\s+([^;.!?।\n]+)/giu,
  new RegExp('\\b(?:new product|new item|naya product|nayi item)\\s*[:=]\\s*([^;.!?।\\n]+)','giu'),
  /\b(?:naya|nayi)\s+(?:product|item)\s+["“‘]?(.+?)["”’]?\s+hai\b/giu,
  /(?:नया|नयी|नई)\s+(?:प्रोडक्ट|उत्पाद|वस्तु|सामान)\s+["“‘]?([^।;.!?\n]+?)["”’]?\s+है/gu,
  /\b(?:product|item|samaan|vastu)\s+ko\s+([^;.!?।\n]{1,160}?)\s+se\s+(?:replace\s+(?:mat\s+)?karo|(?:mat\s+)?badal\s+(?:do|karo))\b/giu,
  /(?:प्रोडक्ट|उत्पाद|वस्तु|सामान|आइटम)\s+को\s+([^;.!?।\n]{1,160}?)\s+से\s+(?:मत\s+)?(?:बदलें|बदल दीजिए|बदल दो|बदलो|replace\s+करें)/gu,
 ];
 for(const pattern of replacements)for(const m of q.matchAll(pattern)){
  const raw=compact(m[1]).split(/\s+(?:with|using|priced|on|at|and\s+(?:give|write|return|price))\b/i)[0].split(',')[0];
  const named=raw.match(/\b(?:called|named)\s+["“‘]([^"”’]+)["”’]|["“‘]([^"”’]+)["”’]/iu);
  const product=entity(named?(named[1]||named[2]):raw);
  add('replace',m,{product,unsafe:!product&&Boolean(raw)&&! /^(?:unknown|unset|unavailable)$/i.test(raw)});
 }
 for(const pattern of [/\b(?:product|item)\s+ka\s+naam\s+["“‘]?(.+?)["”’]?\s+(?:rakho|kar\s+do)\b/giu,/(?:प्रोडक्ट|उत्पाद|वस्तु)\s+का\s+नाम\s+["“‘]?([^।;.!?\n]+?)["”’]?\s+(?:रखें|करें)/gu,/\brename\s+(?:(?:the|my|our)\s+)?(?:product|item|it)\s+to\s+([^;.!?।\n]+)/giu,/(?:नाम बदलकर|नया नाम)\s+["“‘]?([^।;.!?\n]+?)["”’]?\s+(?:करें|रखें|कर दिया है)/gu])for(const m of q.matchAll(pattern))add('rename',m,{product:entity(m[1])});
 for(const m of q.matchAll(/\b(?:reset|clear|forget)\s+(?:(?:all|the|my|our)\s+)*(?:product facts|product context|conversation|everything)\b|\bforget\s+(?:the\s+)?(?:previous|old)\s+product\b|(?:सारा|पूरा)\s+(?:संदर्भ|प्रोडक्ट).{0,15}(?:हटाएँ|भूल)/giu))add('reset',m,{});
 if(!operations.some(o=>o.type==='replace')&&/\b(?:switch|change)\s+to\s+(?:a\s+)?new\s+product\b/iu.test(q))operations.push({type:'replace',product:'',negated:false,span:[0,q.length]});
 const recolours=[
  /(?:केवल|सिर्फ)\s+([^।;.!?\n]{1,80}?)\s+को\s+([^।;.!?\n]{1,60}?)\s+रंग\s+में/gu,
  new RegExp('\\b(?:change|changing|recolou?r(?:ing)?)\\s+(?:(?:the\\s+)?colou?r\\s+of\\s+)?'+noun+'\\s+to\\s+'+noun+end,'giu'),
  new RegExp('\\bcolou?r\\s+of\\s+'+noun+'\\s+(?:(?:should|must|will)\\s+(?:not\\s+)?be\\s+|is\\s+to\\s+(?:be\\s+)?|)(?:changed|recolou?red|become)\\s+(?:to\\s+)?'+noun+end,'giu'),
  /(?:sirf\s+)?([\p{L}\p{N}][\p{L}\p{N}\p{M} '\-/]{0,79}?)\s+ka\s+(?:rang|colou?r)\s+([\p{L}\p{N}][\p{L}\p{N}\p{M} '\-/]{0,59}?)\s+(?:mat\s+)?(?:karna|kar\s+do|karo|badal)/giu,
  /(?:केवल|सिर्फ)\s+([^।;.!?\n]{1,80}?)\s+का\s+रंग\s+([^।;.!?\n]{1,60}?)\s+(?:मत\s+)?(?:करें|करना|कर दीजिए)/gu,
 ];
 for(const pattern of recolours)for(const m of q.matchAll(pattern)){
  const part=compact(m[1]).replace(/^.*?\b(?:mein|sirf)\s+/i,'').replace(/^(?:sirf|only)\s+/i,''),colour=compact(m[2]);
  if(part.length<=100&&colour.length<=100&&!/^(?:product|item|object|it)$/i.test(part))add('recolour',m,{part,colour});
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
 const price=q.match(/(?:\b(?:price|costs?|mrp)(?:\s+is)?\s*[:=]?\s*(?:₹|rs\.?\s*)?|(?:कीमत|मूल्य|दाम)\s*[:=]?\s*|₹\s*)(\d[\d,]*(?:\.\d{1,2})?)/i);if(price)result.price=price[1].replace(/,+$/,'');
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
module.exports={entity,declaration,extractEntity,extraSlots,scopeProductState,captureProductOptions,taskConstraints,productOperations,maskProductOperations,productNameSecurityText};
