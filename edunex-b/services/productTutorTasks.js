// Conservative practice drafts assembled only from user-supplied facts.
// These are original examples, never represented as additional course facts or testimonials.
const {requestedOutputCount,productRequestPlan}=require('./productTutorIntent');
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

function requestedHookCount(message) { return requestedOutputCount(message,'hooks',5); }

function draftProductAd({ message, facts, language, records = [] }) {
  const requested = new Set(facts.requestedOutputs || []);
  if(requested.has('hooks')&&requestedHookCount(message)>10)return null;
  if (!requested.size) return null;
  const plan=productRequestPlan(message,{facts});
  const section=kind=>prose[plan.outputs.find(o=>o.kind===kind)?.language]||prose[language]||prose.english;
  const p=prose[language]||prose.english;
  if(requested.has('composition')){
    const sources=records.filter(r=>r.contentType==='exact-template'&&r.lessonNumber===2&&/White Studio|Lifestyle/.test(r.heading));
    if(sources.length!==2)return null;
    const subject=facts.product || {english:'the product',hindi:'प्रोडक्ट',hinglish:'product'}[language];
    const text={
      english:`Lesson 02\n\nPractice comparison using the approved White Studio and Lifestyle references:\nEmpty setting: show ${subject} on a clean seamless white background. This keeps attention on the product without competing objects.\nFurnished setting: show ${subject} in the Lifestyle scene with a wooden desk, coffee mug and small plant. This adds scene context; keep the product unchanged and in front, with decoration behind.\nBoth options preserve the reference appearance; neither establishes new product features.`,
      hindi:`Lesson 02\n\nस्वीकृत White Studio और Lifestyle रेफरेंस पर आधारित अभ्यास तुलना:\nखाली दृश्य: ${subject} को साफ़ सफेद पृष्ठभूमि पर दिखाएँ। इससे ध्यान प्रोडक्ट पर रहता है।\nसजे हुए दृश्य: ${subject} के साथ लकड़ी की मेज़, कॉफी मग और छोटा पौधा रखें। इससे दृश्य का संदर्भ मिलता है; प्रोडक्ट समान और आगे रहे, सजावट पीछे हो।\nदोनों में रेफरेंस जैसा रूप रखें; कोई नया फायदा न गढ़ें।`,
      hinglish:`Lesson 02\n\nApproved White Studio aur Lifestyle references se practice comparison:\nEmpty setting: ${subject} ko clean white background par dikhao. Isse attention product par rehta hai.\nFurnished setting: ${subject} ke saath wooden desk, coffee mug aur small plant rakho. Isse scene context milta hai; product same aur aage rakho, decoration peeche ho.\nDono mein reference jaisa look rakho; naya product benefit invent mat karo.`,
    }[language];
    return {reply:text,policy:'reference_grounded_composition',templateId:''};
  }
  if (!facts.product) return {reply:p.missing,policy:'missing_product_fact',templateId:''};
  const product=facts.product;
  const details=[product,...(facts.attributes||[]).filter(a=>! /^(?:Template field |No\b|Do not\b|without\b)|\b(?:nahi|mat)\b|नहीं|मत/iu.test(a))];
  if(facts.price)details.push(`₹${facts.price}`);
  if(facts.channel)details.push(facts.channel);
  const factualLine=details.join(' · ');
  const angleIndex=/^[123]$/.test(facts.adAngle||'')?Number(facts.adAngle)-1:0;
  const selectedAngle=facts.adAngle && !/^[123]$/.test(facts.adAngle)?facts.adAngle:p.angles[angleIndex];
  if(requested.has('demo')&&!records.some(r=>r.lessonNumber===7&&(r.contentType==='workflow'||r.contentType==='exact-template')))return null;
  const lines=[requested.has('demo')?'Lesson 07':'Lesson 05','',p.intro,'',`${p.facts}: ${factualLine}`];
  if(requested.has('cards')){
    const count=requestedOutputCount(message,'cards',3);if(count>10)return null;
    const label={english:'AI product-showcase card',hindi:'AI प्रोडक्ट प्रदर्शन कार्ड',hinglish:'AI product-showcase card'}[language];
    for(let i=0;i<count;i++)lines.push('',`${label} ${i+1}`,p.show(product),factualLine);
  }
  if(requested.has('demo')){
    const demo={
      english:[`Honest demonstration example (an original practice draft, not a saved template):`,`1. Show the reference image or real ${product} in a normal home setting.`,`2. Move to a close view of ${product}; keep the same shape, text and logo.`,`3. Have the presenter point to the visible product, without pretending to have bought or used it.`,`Example line: "Here is ${product}. View its supplied details before ordering."`,`An AI presenter is not a real customer. Do not add benefits or genuine-customer testimonials.`],
      hindi:[`ईमानदार डेमो का उदाहरण (अभ्यास ड्राफ्ट, सहेजा हुआ टेम्पलेट नहीं):`,`1. सामान्य घरेलू जगह में असली ${product} या उसकी रेफरेंस तस्वीर दिखाएँ।`,`2. ${product} का पास से दृश्य दिखाएँ; आकार, टेक्स्ट और लोगो समान रखें।`,`3. प्रस्तुतकर्ता दिखाई दे रहे प्रोडक्ट की ओर इशारा करे; खरीदी या इस्तेमाल का निजी अनुभव न गढ़े।`,`उदाहरण संवाद: "यह ${product} है। ऑर्डर से पहले दिए हुए विवरण देखें।"`,`AI प्रस्तुतकर्ता असली ग्राहक नहीं है। कोई अनबताया फायदा या ग्राहक testimonial न जोड़ें।`],
      hinglish:[`Honest product demo ka example (practice draft hai, saved template nahi):`,`1. Normal home setting mein asli ${product} ya uski reference image dikhao.`,`2. ${product} ka close view dikhao; shape, text aur logo same rakho.`,`3. Presenter visible product ki taraf ishara kare; kharidne ya use karne ka personal experience claim mat karo.`,`Example line: "Yeh ${product} hai. Order se pehle diye hue details dekho."`,`AI presenter asli customer nahi hai. Naye benefits ya genuine customer testimonials mat banao.`],
    }[language];
    if(facts.currentTask?.actorFree){
      demo[3]={english:`3. Show the same ${product} alone from another angle; no actor or hands are needed.`,hindi:`3. उसी ${product} को दूसरे कोण से अकेला दिखाएँ; कलाकार या हाथ न दिखाएँ।`,hinglish:`3. Usi ${product} ko doosre angle se akela dikhao; actor ya hands mat dikhao.`}[language];
    }
    const dialogueLanguage=plan.outputs.find(o=>o.kind==='dialogue')?.language||language;
    if(dialogueLanguage!==language)demo[4]={english:`Example line: \"Here is ${product}. View its supplied details before ordering.\"`,hindi:`उदाहरण संवाद: \"यह ${product} है। दिए हुए विवरण देखें।\"`,hinglish:`Example line: \"Yeh ${product} hai. Diye hue details dekho.\"`}[dialogueLanguage];
    const mute=/\b(?:no (?:voice|dialogue|spoken lines?)|silent|without (?:voice|dialogue))\b/i.test(message);
    const spoken=[demo[4],{english:`Example line: \"See ${product} up close.\"`,hindi:`उदाहरण संवाद: \"${product} को पास से देखिए।\"`,hinglish:`Example line: \"${product} ko paas se dekho.\"`}[dialogueLanguage],demo[4]];
    lines.push('',demo[0]);
    for(let i=1;i<=3;i++){lines.push(demo[i]);if(!mute)lines.push(spoken[i-1]);}
    lines.push(demo[5]);
  }
  if(requested.has('plan')){
    if(!/buyer|खरीदार/i.test(message)){requested.add('hooks');requested.add('script');requested.add('caption');}
    lines.push('',p.plan,p.buyers,...p.groups(product).map((group,i)=>`${i+1}. ${group}`),p.problem);
    lines.push(...p.angles.map((angle,i)=>`${i+1}. Ad angle: ${angle}`));
  }
  if(requested.has('plan')||requested.has('angle'))lines.push('',`${p.angle}: ${selectedAngle}`,p.show(product),factualLine,p.order);
  else if(facts.adAngle)lines.push('',`${p.angle}: ${selectedAngle}`);
  if(requested.has('hooks')){
    const hp=section('hooks'),hooks=hp.hook(product);
    if(facts.price)hooks[3]=`${product} · ₹${facts.price}.`;
    lines.push('',hp.hooks,...Array.from({length:requestedHookCount(message)},(_,i)=>`${i+1}. ${hooks[i%hooks.length]}`));
  }
  if(requested.has('script')){
    const visual=language==='hindi'?'दृश्य':language==='hinglish'?'Screen par':'Visual';
    const voice=language==='hindi'?'आवाज़':language==='hinglish'?'Voiceover mein':'Voiceover';
    lines.push('',p.script,`0–3 sec: ${visual}: ${p.show(product)} | ${voice}: ${p.hook(product)[0]}`,
      `3–10 sec: ${visual}: ${p.close(product)} | ${voice}: ${factualLine}`,
      `10–15 sec: ${visual}: ${factualLine} | ${voice}: ${p.order}`);
  }
  if(requested.has('caption')){const cp=section('caption');lines.push('',`${cp.caption}: ${factualLine}. ${cp.order}`);}
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
    if(kind==='cards'){if((text.match(/(?:AI product-showcase card|AI प्रोडक्ट प्रदर्शन कार्ड)/g)||[]).length!==requestedOutputCount(message,'cards',3))missing.push(kind);continue;}
    if(['scene','dialogue','brief'].includes(kind)){missing.push(kind);continue;}
    if(kind==='plan')continue;
    if(kind==='hooks'){
      const section=text.split(/(?:^|\n)\s*(?:\*\*)?(?:\d+\s+)?hooks?\b[^\n]*\n/i)[1]||'';
      const lines=section.split(/\n\s*\n/)[0].split('\n').filter(line=>/^\s*(?:\d+[.)]|[-*])\s+/.test(line)&&!deferral.test(line));
      if(lines.length!==requestedHookCount(message))missing.push(kind);
    }else if(kind==='caption'){
      const caption=text.match(/(?:^|\n)\s*(?:\*\*)?(?:caption|कैप्शन)\s*(?:\*\*)?[:：]?\s*\n?([^\n]+)/i)?.[1];
      if(!caption||deferral.test(caption)||caption.trim().length<8)missing.push(kind);
    }else if(kind==='script'){
      if(!/15[- ]second|15[- ]sec|15 सेकंड|15-second स्क्रिप्ट/i.test(text)||!/(?:0[–-]3|3[–-]10|10[–-]15)\s*(?:sec|सेकंड)/i.test(text))missing.push(kind);
    }else if(kind==='angle'){
      if(!/(?:selected ad angle|ad angle|विज्ञापन कोण|chuna hua ad angle)\s*:\s*[^\n]{5,}/i.test(text)||deferral.test(text.split(/\n/).find(l=>/ad angle\s*:/i.test(l))||''))missing.push(kind);
    }else if(kind==='prompts'&&(text.match(/```(?:text)?\s*Use /g)||[]).length<3)missing.push(kind);
    else if(kind==='demo' && ((!/\b(?:no (?:voice|dialogue|spoken lines?)|silent|without (?:voice|dialogue))\b/i.test(message)&&!/(?:example line|उदाहरण संवाद|example.*yeh)/i.test(text))||!/^\s*\d+[.)]\s+.+/m.test(text)))missing.push(kind);
  }
  return missing;
}

module.exports={draftProductAd,missingProductDeliverables,requestedHookCount};
