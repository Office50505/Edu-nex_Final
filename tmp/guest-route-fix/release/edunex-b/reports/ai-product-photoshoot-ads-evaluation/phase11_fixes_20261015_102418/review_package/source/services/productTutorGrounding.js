// Closed factual vocabulary for executable ad copy. Visual staging is not evidence.
// Unrecognized claims are regenerated from supplied facts, not guessed from product names.
const words=text=>String(text||'').normalize('NFKC').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu)||[];
const neutral=new Set(words('a an the this that these those is are here meet see look looking you take closer at in on with and or your our my its it to for of before after view product details supplied real reference image photo picture show close up shot scene visual voiceover voice over caption hook introduction order ordering explore discover focus choose decide same shape text logo do not no without customer genuine fake testimonial only information provided known facts practice draft example line says spoken say name hi hello welcome available rupees price instagram website english hindi hinglish main yeh ye hai hain ka ki ke ko par mein se aur ya apni tumhare diye hue asli dekho dikhao paas ek nazar daalo pehle baad order karne details dekhein rakho mat nahi sirf milo aap namaste यही यह ये है हैं का की के को पर में से और या अपनी आपके दिए हुए असली देखिए दिखाएँ पास एक नज़र डालिए पहले बाद ऑर्डर करने विवरण देखें रखें मत नहीं केवल जानिए स्वागत प्रोडक्ट नाम कीमत परिचय अब अभी'));
function unsupportedAdClaims(reply,facts={}){
 const text=String(reply||'').replace(/```[\s\S]*?```/g,'');
 const evidence=new Set(words([facts.product,...(facts.attributes||[]),facts.price,facts.channel].filter(Boolean).join(' ')));
 const lines=text.replace(/\*\*/g,'').split('\n');const candidates=[];let hooks=false;
 for(const line of lines){
  if(/^\s*(?:Hooks|हुक)\s*$/i.test(line)){hooks=true;continue;}
  if(hooks&&/^\s*\d+[.)]/.test(line)){candidates.push(line.replace(/^\s*\d+[.)]\s*/,''));continue;}
  if(hooks&&line.trim())hooks=false;
  const spoken=line.match(/(?:voiceover(?:\s+mein)?|voice[- ]over|spoken line|example line|example dialogue|caption|आवाज़|वॉइसओवर|उदाहरण संवाद|कैप्शन)\s*:\s*(.+)/iu);if(spoken)candidates.push(spoken[1]);
  for(const quote of line.matchAll(/[“"]([^”"\n]{8,})[”"]/g))if(!/\b(?:prompt|instruction|wording)\b/i.test(line))candidates.push(quote[1]);
 }
 const reasons=[];
 for(const line of candidates){const unknown=words(line).filter(w=>!neutral.has(w)&&!evidence.has(w));if(unknown.length)reasons.push('ad copy contains unprovided content: '+[...new Set(unknown)].slice(0,8).join(', '));}
 // Declarative specifications outside spoken lines cannot evade the copy gate.
 for(const clause of text.split(/[.!?।;\n]/u)){
  if(/\b(?:do not|don't|never|not|without|unknown|no evidence|nahi|mat)\b|नहीं|मत|अज्ञात/iu.test(clause))continue;
  const claim=clause.match(/\b(?:includes?|contains?|comes with|equipped with|offers?|provides?|improves?|enhances?|ensures?|guarantees?|helps? (?:you|to)|keeps? .{0,35}(?:organized|ready|safe|hot|cool))\b(.{1,100})/i);
  if(claim&&!String(facts.attributes||[]).toLowerCase().includes(claim[0].toLowerCase()))reasons.push('unprovided specification or benefit: '+claim[0].trim());
 }
 return [...new Set(reasons)];
}
module.exports={unsupportedAdClaims};
