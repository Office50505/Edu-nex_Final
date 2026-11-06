// Conservative practice drafts assembled only from user-supplied facts.
// These are original examples, never represented as additional course facts or testimonials.
const { renderProductTemplate } = require('./productTutorKnowledge');

const prose = {
  english: {
    intro:'Practice draft based only on your supplied product facts. No fake claims or customer testimonials.',
    facts:'Known facts', plan:'Ad plan', buyers:'3 possible buyer groups (hypotheses to validate)',
    groups:p=>[`People looking for ${p}`,`People comparing options for ${p}`,`Visitors deciding whether to order ${p}`],
    problem:'Buyer problem to validate: deciding whether this product matches what they need. Do not assume an unprovided benefit.',
    angle:'Selected ad angle', angles:['Product introduction','Known price and ordering details','Show the supplied product details'],
    hooks:'Hooks', script:'15-second script', caption:'Caption', prompts:'Google Flow image prompts',
    show:p=>`Show the real ${p} or its approved reference image.`,
    close:p=>`Show a close view of ${p}; keep its appearance consistent with the reference.`,
    order:'View the product details before ordering.',
    hook:p=>[`Meet ${p}.`,`Take a closer look at ${p}.`,`Looking for ${p}? See the details.`,`See ${p} in focus.`,`Explore ${p} before you decide.`],
    missing:'Which product should this draft feature? Tell me its name; price and other facts can stay unset.',
    supplied:'Use only the features and details you gave me; do not invent anything new.',
  },
  hindi: {
    intro:'यह अभ्यास का ड्राफ्ट केवल आपके दिए प्रोडक्ट तथ्यों पर आधारित है। कोई नकली दावा या ग्राहक testimonial नहीं है।',
    facts:'दिए हुए तथ्य',plan:'विज्ञापन योजना',buyers:'खरीदारों के 3 संभावित समूह (इनकी जाँच करें)',
    groups:p=>[`${p} ढूँढ़ने वाले लोग`,`${p} के विकल्पों की तुलना करने वाले लोग`,`${p} ऑर्डर करने का निर्णय लेने वाले लोग`],
    problem:'जाँचने योग्य समस्या: क्या यह प्रोडक्ट उनकी ज़रूरत से मेल खाता है। कोई अनबताया फायदा न मानें।',
    angle:'चुना हुआ विज्ञापन कोण',angles:['प्रोडक्ट का परिचय','दी हुई कीमत और ऑर्डर का तरीका','दिए हुए प्रोडक्ट विवरण दिखाना'],
    hooks:'Hooks',script:'15-second स्क्रिप्ट',caption:'कैप्शन',prompts:'Google Flow image prompts',
    show:p=>`असली ${p} या उसकी स्वीकृत रेफरेंस तस्वीर दिखाएँ।`,
    close:p=>`${p} का नज़दीकी दृश्य दिखाएँ; रूप रेफरेंस जैसा ही रखें।`,order:'ऑर्डर से पहले प्रोडक्ट के विवरण देखें।',
    hook:p=>[`${p} को देखिए।`,`${p} को नज़दीक से जानिए।`,`${p} ढूँढ़ रहे हैं? विवरण देखिए।`,`${p} पर एक नज़र डालिए।`,`निर्णय से पहले ${p} के विवरण देखिए।`],
    missing:'ड्राफ्ट किस प्रोडक्ट के लिए चाहिए? उसका नाम बताइए; कीमत और बाकी अज्ञात जानकारी खाली रह सकती है।',
    supplied:'केवल आपके दिए फीचर्स और विवरण इस्तेमाल किए हैं; कोई नया दावा नहीं गढ़ा है।',
  },
  hinglish: {
    intro:'Yeh practice draft sirf tumhare diye product facts par hai. Fake claims ya customer testimonials nahi hain.',
    facts:'Diye hue facts',plan:'Ad plan',buyers:'3 possible buyer groups (yeh ideas hain, pehle validate karo)',
    groups:p=>[`${p} dhoondhne wale log`,`${p} ke options compare karne wale log`,`${p} order karne ka decision lene wale log`],
    problem:'Buyer problem validate karo: kya product unki zaroorat se match hai. Koi unsupplied benefit assume mat karo.',
    angle:'Chuna hua ad angle',angles:['Product ka introduction','Diya hua price aur order ka tareeka','Diye product details dikhana'],
    hooks:'Hooks',script:'15-second script',caption:'Caption',prompts:'Google Flow image prompts',
    show:p=>`Asli ${p} ya approved reference image dikhao.`,
    close:p=>`${p} ka close view dikhao; reference jaisa look rakho.`,order:'Order se pehle product details dekho.',
    hook:p=>[`${p} dekho.`,`${p} ko paas se dekho.`,`${p} chahiye? Details dekho.`,`${p} par ek nazar daalo.`,`Decision se pehle ${p} ki details dekho.`],
    missing:'Kis product ke liye draft chahiye? Naam batao; price aur baaki unknown facts abhi unset reh sakte hain.',
    supplied:'Sirf tumhare diye features aur details use kiye hain; kuch naya invent nahi kiya hai.',
  },
};

function requestedHookCount(message) {
  const numbers={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
  const token=String(message).match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:ad\s+)?hooks?\b/i)?.[1]?.toLowerCase();
  return Math.max(1,Math.min(10,Number(token)||numbers[token]||5));
}

function draftProductAd({ message, facts, language, records = [] }) {
  const requested = new Set(facts.requestedOutputs || []);
  if (!requested.size) return null;
  const p=prose[language]||prose.english;
  if (!facts.product) return {reply:p.missing,policy:'missing_product_fact',templateId:''};
  const product=facts.product;
  const details=[product,...(facts.attributes||[])];
  if(facts.price)details.push(`₹${facts.price}`);
  if(facts.channel)details.push(facts.channel);
  const factualLine=details.join(' · ');
  const angleIndex=/^[123]$/.test(facts.adAngle||'')?Number(facts.adAngle)-1:0;
  const selectedAngle=facts.adAngle && !/^[123]$/.test(facts.adAngle)?facts.adAngle:p.angles[angleIndex];
  const lines=['Lesson 05','',p.intro,'',`${p.facts}: ${factualLine}`];
  if(requested.has('plan')){
    requested.add('hooks');requested.add('script');requested.add('caption');
    lines.push('',p.plan,p.buyers,...p.groups(product).map((group,i)=>`${i+1}. ${group}`),p.problem);
    lines.push(...p.angles.map((angle,i)=>`${i+1}. Ad angle: ${angle}`));
  }
  if(requested.has('plan')||requested.has('angle'))lines.push('',`${p.angle}: ${selectedAngle}`,p.show(product),factualLine,p.order);
  else if(facts.adAngle)lines.push('',`${p.angle}: ${selectedAngle}`);
  if(requested.has('hooks')){
    const hooks=p.hook(product);
    if(facts.price)hooks[3]=`${product} · ₹${facts.price}.`;
    lines.push('',p.hooks,...Array.from({length:requestedHookCount(message)},(_,i)=>`${i+1}. ${hooks[i%hooks.length]}`));
  }
  if(requested.has('script')){
    const visual=language==='hindi'?'दृश्य':language==='hinglish'?'Screen par':'Visual';
    const voice=language==='hindi'?'आवाज़':language==='hinglish'?'Voiceover mein':'Voiceover';
    lines.push('',p.script,`0–3 sec: ${visual}: ${p.show(product)} | ${voice}: ${p.hook(product)[0]}`,
      `3–10 sec: ${visual}: ${p.close(product)} | ${voice}: ${factualLine}`,
      `10–15 sec: ${visual}: ${factualLine} | ${voice}: ${p.order}`);
  }
  if(requested.has('caption'))lines.push('',`${p.caption}: ${factualLine}. ${p.order}`);
  if(requested.has('prompts')){
    const templates=records.filter(r=>r.contentType==='exact-template'&&r.lessonNumber===2&&/White Studio|Lifestyle|Dark Premium/.test(r.heading));
    if(templates.length!==3)return null; // Let the provider use the available references; do not invent missing assets.
    lines.push('',p.prompts,...templates.map((template,i)=>`${i+1}. ${template.heading}\n\`\`\`text\n${renderProductTemplate(template,facts)}\n\`\`\``));
  }
  lines.push('',p.supplied);
  return {reply:lines.join('\n'),policy:'fact_grounded_practice_draft',templateId:''};
}

function missingProductDeliverables(reply, outputs, message = '') {
  const text=String(reply||'');
  const deferral=/\b(?:once (?:you|I)|I (?:first )?need|please (?:tell|provide)|could you|can (?:help|generate|write).{0,40}(?:once|when))\b/i;
  const missing=[];
  for(const kind of outputs||[]){
    if(kind==='plan')continue;
    if(kind==='hooks'){
      const section=text.split(/(?:^|\n)\s*(?:\*\*)?(?:\d+\s+)?hooks?\b[^\n]*\n/i)[1]||'';
      const lines=section.split(/\n\s*\n/)[0].split('\n').filter(line=>/^\s*(?:\d+[.)]|[-*])\s+/.test(line)&&!deferral.test(line));
      if(lines.length<requestedHookCount(message))missing.push(kind);
    }else if(kind==='caption'){
      const caption=text.match(/(?:^|\n)\s*(?:\*\*)?(?:caption|कैप्शन)\s*(?:\*\*)?[:：]?\s*\n?([^\n]+)/i)?.[1];
      if(!caption||deferral.test(caption)||caption.trim().length<8)missing.push(kind);
    }else if(kind==='script'){
      if(!/15[- ]second|15[- ]sec|15 सेकंड|15-second स्क्रिप्ट/i.test(text)||!/(?:0[–-]3|3[–-]10|10[–-]15)\s*(?:sec|सेकंड)/i.test(text))missing.push(kind);
    }else if(kind==='angle'){
      if(!/(?:selected ad angle|ad angle|विज्ञापन कोण|chuna hua ad angle)\s*:\s*[^\n]{5,}/i.test(text)||deferral.test(text.split(/\n/).find(l=>/ad angle\s*:/i.test(l))||''))missing.push(kind);
    }else if(kind==='prompts'&&(text.match(/```(?:text)?\s*Use /g)||[]).length<3)missing.push(kind);
  }
  return missing;
}

module.exports={draftProductAd,missingProductDeliverables,requestedHookCount};
