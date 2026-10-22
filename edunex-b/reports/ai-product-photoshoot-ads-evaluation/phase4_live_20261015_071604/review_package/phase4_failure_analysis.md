# Phase 4 detailed failure analysis

The unchanged v3 evaluator reports 13 failed cases. All questions and actual answers below are preserved verbatim. Proposed corrections are recommendations only: no application/evaluator fix was made. Eight likely evaluator false failures are flagged separately from five real/incomplete chatbot failures; the 67/80 official score remains unchanged.

## ppads_017 — likely_evaluator_false_failure

Origin: Bounded semantic matching.

The answer attaches the character sheet and says keep the same face. The rubric misses this equivalent wording; the longer approved sentence is not explicitly requested verbatim.

Proposed future correction: Review equivalence without relaxing explicit exact-output requirements.

### Turn 1 — FAILED

Question:

The model's face changes between product shots. How do I keep it the same?

Expected behavior (frozen definition):

```json
{
  "id": "ppads_017",
  "category": "troubleshooting",
  "query": "The model's face changes between product shots. How do I keep it the same?",
  "expected_language": "english",
  "required_groups": [
    [
      "Lesson 03",
      "L03"
    ],
    [
      "character sheet"
    ],
    [
      "keep her face exactly the same"
    ],
    [
      "reference"
    ]
  ],
  "forbidden_any": [
    "use fake customer review"
  ]
}
```

Actual user-facing response:

```text
Lesson 03

Attach both the character sheet and product sheet. Match the model’s clothes and look to the character sheet, keep the same face, and include “natural hands with five fingers”. Generate 2–3 versions and check the result.
```

Origin: deterministic_local_answer; latency: 6 ms.

Retrieved sources: Model shots, Model ka chehra badal gaya, Model ke haath kisi aur ke lag rahe, Model ki ungliyan judi / extra, L03 Showing to camera, L03 Desk

Grading failures: {"correctness": ["missing required concept: keep her face exactly the same"]}

## ppads_018 — chatbot_incomplete_answer

Origin: Retrieval and local guidance selection.

The general festive workflow omits Diwali/wedding-specific examples and the explicit product-sharp instruction. Product in front partly covers foreground.

Proposed future correction: Retrieve both requested festive assets and explain their shared product-preservation constraints.

### Turn 1 — FAILED

Question:

How does Lesson 04 handle Diwali and wedding product photos?

Expected behavior (frozen definition):

```json
{
  "id": "ppads_018",
  "category": "lesson_4",
  "query": "How does Lesson 04 handle Diwali and wedding product photos?",
  "expected_language": "english",
  "required_groups": [
    [
      "Lesson 04",
      "L04"
    ],
    [
      "Diwali"
    ],
    [
      "wedding"
    ],
    [
      "product sheet"
    ],
    [
      "product sharp",
      "hero"
    ],
    [
      "foreground"
    ]
  ],
  "forbidden_any": [
    "change the product design"
  ]
}
```

Actual user-facing response:

```text
Lesson 04

Use only the product sheet as reference. Start the prompt by keeping the product unchanged, then describe the place, 2–3 objects, lighting and angle. Keep decoration behind and the product in front.
```

Origin: deterministic_local_answer; latency: 5 ms.

Retrieved sources: Product photos, Colour variants, Lesson 04 — Festive Shoot + Colour Variants, L04 Wedding Gift, L04 Diwali, L04 Colour Variant Sheet

Grading failures: {"correctness": ["missing required concept: Diwali", "missing required concept: wedding", "missing required concept: product sharp | hero", "missing required concept: foreground"]}

## ppads_022 — chatbot_failure

Origin: Intent routing / retrieval.

Colour-plus-shape troubleshooting returns Lesson 01 prerequisites rather than the Lesson 04 colour-preservation instruction.

Proposed future correction: Prioritize explicit colour-variant troubleshooting intent and validate its lesson and complete repair constraint.

### Turn 1 — FAILED

Question:

When I change colour, the product shape also changes. What is the course fix?

Expected behavior (frozen definition):

```json
{
  "id": "ppads_022",
  "category": "troubleshooting",
  "query": "When I change colour, the product shape also changes. What is the course fix?",
  "expected_language": "english",
  "required_groups": [
    [
      "Lesson 04",
      "L04"
    ],
    [
      "Only change the colour"
    ],
    [
      "keep everything else exactly the same"
    ]
  ],
  "forbidden_any": [
    "redesign"
  ]
}
```

Actual user-facing response:

```text
Lesson 01

AI Product Photoshoot & Ads has 8 lessons on product photos, model shots, festive shoots, ad planning, product videos and UGC-style ads. You need a phone, laptop and any product. The course tools are Google Flow, ChatGPT and CapCut; a full CapCut editing tutorial is not taught. The saved course workflows guide you from reference sheets to a final ad.
```

Origin: deterministic_local_answer; latency: 6 ms.

Retrieved sources: Course overview and prerequisites, Colour variants, Rang badla toh shape bhi badal gaya, L04 Colour Variant Sheet, Brand ka exact colour nahi aa raha, Label ke akshar / keys ke letters

Grading failures: {"correctness": ["missing required concept: Only change the colour", "missing required concept: keep everything else exactly the same"], "lesson_references": ["missing required concept: Lesson 04 | L04"]}

## new15_006 — likely_evaluator_false_failure

Origin: Bounded semantic matching.

Three possible buyer groups are explicitly listed, but the rubric does not recognize buyer groups as buyers or buyer types. Price and product routing are correct.

Proposed future correction: Recognize buyer groups as a semantic equivalent; separately assess the usefulness of generic hypotheses.

### Turn 1 — FAILED

Question:

I sell a fabric plant grow bag on Instagram for 749 rupees. Please use that product price in a simple Lesson 05 ad plan, and do not discuss a Skillomate subscription. I have supplied no performance claims.

Expected behavior (frozen definition):

```json
{
  "id": "new15_006",
  "category": "product_price_routing",
  "query": "I sell a fabric plant grow bag on Instagram for 749 rupees. Please use that product price in a simple Lesson 05 ad plan, and do not discuss a Skillomate subscription. I have supplied no performance claims.",
  "expected_language": "english",
  "required_groups": [
    [
      "749"
    ],
    [
      "grow bag"
    ],
    [
      "Lesson 05"
    ],
    [
      "ad angle",
      "angle"
    ],
    [
      "buyers",
      "buyer types"
    ]
  ],
  "forbidden_any": [
    "PhonePe",
    "Premium access",
    "subscription costs",
    "antibacterial"
  ]
}
```

Actual user-facing response:

```text
Lesson 05

Practice draft based only on your supplied product facts. No fake claims or customer testimonials.

Known facts: fabric plant grow bag · ₹749 · Instagram

Ad plan
3 possible buyer groups (hypotheses to validate)
1. People looking for fabric plant grow bag
2. People comparing options for fabric plant grow bag
3. Visitors deciding whether to order fabric plant grow bag
Buyer problem to validate: deciding whether this product matches what they need. Do not assume an unprovided benefit.
1. Ad angle: Product introduction
2. Ad angle: Known price and ordering details
3. Ad angle: Show the supplied product details

Selected ad angle: Product introduction
Show the real fabric plant grow bag or its approved reference image.
fabric plant grow bag · ₹749 · Instagram
View the product details before ordering.

Hooks
1. Meet fabric plant grow bag.
2. Take a closer look at fabric plant grow bag.
3. Looking for fabric plant grow bag? See the details.
4. fabric plant grow bag · ₹749.
5. Explore fabric plant grow bag before you decide.

15-second script
0–3 sec: Visual: Show the real fabric plant grow bag or its approved reference image. | Voiceover: Meet fabric plant grow bag.
3–10 sec: Visual: Show a close view of fabric plant grow bag; keep its appearance consistent with the reference. | Voiceover: fabric plant grow bag · ₹749 · Instagram
10–15 sec: Visual: fabric plant grow bag · ₹749 · Instagram | Voiceover: View the product details before ordering.

Caption: fabric plant grow bag · ₹749 · Instagram. View the product details before ordering.

Use only the features and details you gave me; do not invent anything new.
```

Origin: deterministic_local_answer; latency: 3 ms.

Retrieved sources: Ad plan, chat G.P.T ka ad bahut generic, chat G.P.T ne aisa feature likha jo, L05 Step 1 Brief, L05 Step 2 Hooks + Script, Lesson 05 — chat G.P.T Se Ad Plan

Grading failures: {"correctness": ["missing required concept: buyers | buyer types"]}

## phase4_new_007 — chatbot_exact_instruction_failure

Origin: Paraphrase retrieval / exact FAQ selection.

Handset wording selects the general UGC workflow rather than the exact phone-visibility FAQ. Meaning overlaps but the requested approved sentence is absent.

Proposed future correction: Resolve handset/phone synonyms and prioritize the requested complete FAQ instruction.

### Turn 1 — FAILED

Question:

A handset keeps appearing on screen in my Lesson 07 UGC clip. What exact camera clarification from the course should I add to remove that handset?

Expected behavior (frozen definition):

```json
{
  "id": "phase4_new_007",
  "category": "troubleshooting",
  "query": "A handset keeps appearing on screen in my Lesson 07 UGC clip. What exact camera clarification from the course should I add to remove that handset?",
  "expected_language": "english",
  "required_groups": [
    [
      "Lesson 07"
    ],
    [
      "camera itself is her phone"
    ],
    [
      "NO phone visible anywhere in the frame"
    ]
  ],
  "exact_required": [
    "The camera itself is her phone. NO phone visible anywhere in the frame."
  ]
}
```

Actual user-facing response:

```text
Lesson 07

In Flow choose Video → Ingredients and attach the face, character sheet and product sheet. Recorded settings: 9:16, 720p, 8 sec. The camera itself is the phone: no phone should appear in the frame. Use a normal home room and short dialogue written in Hindi Devanagari, based on the L05 hook. Do not present an AI actor as a real reviewing customer.
```

Origin: deterministic_local_answer; latency: 2 ms.

Retrieved sources: UGC video, UGC video mein phone dikh raha, L07 UGC 2, Kya AI model ko customer review, L07 UGC 1, Lesson 07 — UGC-Style Video

Grading failures: {"correctness": ["missing required concept: camera itself is her phone", "missing required concept: NO phone visible anywhere in the frame"], "prompt_accuracy": ["missing exact instruction: The camera itself is her phone. NO phone visible anywhere in the frame."]}

## ppads_conv_001 — likely_evaluator_false_failure

Origin: Product-name repetition requirement.

Turn 1 gives the correct product-sheet workflow without echoing perfume bottle; turn 2 correctly instantiates its full template, demonstrating retained identity.

Proposed future correction: Judge retained identity using the conversation evidence rather than requiring an unnecessary name echo on every guidance turn.

### Turn 1 — FAILED

Question:

I am making a product sheet for a perfume bottle.

Expected behavior (frozen definition):

```json
{
  "user": "I am making a product sheet for a perfume bottle.",
  "expected_language": "english",
  "required_groups": [
    [
      "product sheet"
    ],
    [
      "Lesson 02",
      "L02"
    ],
    [
      "perfume bottle"
    ]
  ]
}
```

Actual user-facing response:

```text
Lesson 02

Take 5–7 clear phone photos from different angles in daylight, with flash off. In Google Flow choose New project → Image → Nano Banana Pro. Upload all photos as references and run the Product Sheet template. Review, regenerate if needed, and save the best sheet for later shots.
```

Origin: deterministic_local_answer; latency: 2 ms.

Retrieved sources: Product sheet banana, Har photo mein product thoda alag, Product photos, L02 Product Sheet, Label ke akshar / keys ke letters, L02 White Studio

Grading failures: {"correctness": ["missing required concept: perfume bottle"]}

### Turn 2 — PASSED

Question:

Now give me the exact prompt for that.

Expected behavior (frozen definition):

```json
{
  "user": "Now give me the exact prompt for that.",
  "expected_language": "english",
  "required_groups": [
    [
      "perfume bottle"
    ],
    [
      "front view"
    ],
    [
      "top-down view"
    ],
    [
      "side view"
    ],
    [
      "three-quarter angle view"
    ]
  ],
  "exact_required": [
    "Create a clean product reference sheet on a plain white background",
    "same shape, same colour, same details, same text and logo, do not redesign it"
  ],
  "forbidden_any": [
    "[PRODUCT]"
  ]
}
```

Actual user-facing response:

```text
L02 Product Sheet

```text
Use all the uploaded photos of this perfume bottle. Create a clean product reference sheet on a plain white background showing the exact same perfume bottle in four views arranged in a neat grid: front view, top-down view, side view and three-quarter angle view. Keep the perfume bottle exactly the same in every view — same shape, same colour, same details, same text and logo, do not redesign it. Even soft studio lighting, no extra objects, no text labels, realistic product photography.
```
```

Origin: deterministic_local_answer; latency: 2 ms.

Retrieved sources: L02 Product Sheet, Product photos, Product sheet banana, Har photo mein product thoda alag, Label ke akshar / keys ke letters, L02 White Studio

Grading failures: {}

## ppads_conv_002 — likely_evaluator_false_failure

Origin: Bounded semantic matching.

The ad plan contains three buyer groups and a buyer problem to validate. The rubric misses buyer-group and singular-problem wording; generic quality remains a separate limitation.

Proposed future correction: Review singular/plural and buyer-group equivalents without accepting missing deliverables or invented claims.

### Turn 1 — FAILED

Question:

I sell a copper water bottle on Instagram. Price is 899. Plan an ad.

Expected behavior (frozen definition):

```json
{
  "user": "I sell a copper water bottle on Instagram. Price is 899. Plan an ad.",
  "expected_language": "english",
  "required_groups": [
    [
      "buyers"
    ],
    [
      "problems"
    ],
    [
      "ad angle"
    ],
    [
      "Lesson 05",
      "L05"
    ]
  ]
}
```

Actual user-facing response:

```text
Lesson 05

Practice draft based only on your supplied product facts. No fake claims or customer testimonials.

Known facts: copper water bottle · ₹899 · Instagram

Ad plan
3 possible buyer groups (hypotheses to validate)
1. People looking for copper water bottle
2. People comparing options for copper water bottle
3. Visitors deciding whether to order copper water bottle
Buyer problem to validate: deciding whether this product matches what they need. Do not assume an unprovided benefit.
1. Ad angle: Product introduction
2. Ad angle: Known price and ordering details
3. Ad angle: Show the supplied product details

Selected ad angle: Product introduction
Show the real copper water bottle or its approved reference image.
copper water bottle · ₹899 · Instagram
View the product details before ordering.

Hooks
1. Meet copper water bottle.
2. Take a closer look at copper water bottle.
3. Looking for copper water bottle? See the details.
4. copper water bottle · ₹899.
5. Explore copper water bottle before you decide.

15-second script
0–3 sec: Visual: Show the real copper water bottle or its approved reference image. | Voiceover: Meet copper water bottle.
3–10 sec: Visual: Show a close view of copper water bottle; keep its appearance consistent with the reference. | Voiceover: copper water bottle · ₹899 · Instagram
10–15 sec: Visual: copper water bottle · ₹899 · Instagram | Voiceover: View the product details before ordering.

Caption: copper water bottle · ₹899 · Instagram. View the product details before ordering.

Use only the features and details you gave me; do not invent anything new.
```

Origin: deterministic_local_answer; latency: 4 ms.

Retrieved sources: Ad plan, chat G.P.T ka ad bahut generic, L05 Step 1 Brief, Lesson 05 — chat G.P.T Se Ad Plan, L05 Step 2 Hooks + Script, chat G.P.T ne aisa feature likha jo

Grading failures: {"correctness": ["missing required concept: buyers", "missing required concept: problems"]}

### Turn 2 — PASSED

Question:

Write hooks, but do not invent benefits I didn't tell you.

Expected behavior (frozen definition):

```json
{
  "user": "Write hooks, but do not invent benefits I didn't tell you.",
  "expected_language": "english",
  "required_groups": [
    [
      "5 hooks",
      "hooks"
    ],
    [
      "15-second"
    ],
    [
      "caption"
    ],
    [
      "use only the features I gave you"
    ],
    [
      "no fake claims"
    ]
  ]
}
```

Actual user-facing response:

```text
Lesson 05

Practice draft based only on your supplied product facts. No fake claims or customer testimonials.

Known facts: copper water bottle · ₹899 · Instagram

Hooks
1. Meet copper water bottle.
2. Take a closer look at copper water bottle.
3. Looking for copper water bottle? See the details.
4. copper water bottle · ₹899.
5. Explore copper water bottle before you decide.

15-second script
0–3 sec: Visual: Show the real copper water bottle or its approved reference image. | Voiceover: Meet copper water bottle.
3–10 sec: Visual: Show a close view of copper water bottle; keep its appearance consistent with the reference. | Voiceover: copper water bottle · ₹899 · Instagram
10–15 sec: Visual: copper water bottle · ₹899 · Instagram | Voiceover: View the product details before ordering.

Caption: copper water bottle · ₹899 · Instagram. View the product details before ordering.

Use only the features and details you gave me; do not invent anything new.
```

Origin: deterministic_local_answer; latency: 2 ms.

Retrieved sources: Ad plan, chat G.P.T ka ad bahut generic, L05 Step 2 Hooks + Script, chat G.P.T ne aisa feature likha jo, L05 Step 3 Flow prompts, Lesson 05 — chat G.P.T Se Ad Plan

Grading failures: {}

## ppads_conv_004 — likely_evaluator_false_failure

Origin: Multilingual semantic matching.

Sirf bataye hue part ka rang badlo and shape ... same rakho express the required colour-only and same-shape constraints. The v3 aliases do not cover this phrasing.

Proposed future correction: Add reviewed multilingual equivalences in a later evaluator change; preserve this score.

### Turn 1 — FAILED

Question:

Mujhe same product ka pink colour variant banana hai.

Expected behavior (frozen definition):

```json
{
  "user": "Mujhe same product ka pink colour variant banana hai.",
  "expected_language": "hinglish",
  "required_groups": [
    [
      "Lesson 04",
      "L04"
    ],
    [
      "Only change the colour"
    ],
    [
      "same shape"
    ],
    [
      "product sheet"
    ]
  ]
}
```

Actual user-facing response:

```text
Lesson 04

Product sheet reference mein rakho. Sirf bataye hue part ka rang badlo; shape, layout, details, text, logo, views, background aur light same rakho. Har rang ki poori nayi sheet banao aur aage usi ko use karo.
```

Origin: deterministic_local_answer; latency: 2 ms.

Retrieved sources: Colour variants, Rang badla toh shape bhi badal gaya, Brand ka exact colour nahi aa raha, L04 Colour Variant Sheet, L04 Wedding Gift, L04 Diwali

Grading failures: {"correctness": ["missing required concept: Only change the colour", "missing required concept: same shape"]}

### Turn 2 — PASSED

Question:

Shape bhi badal gaya, kya likhu?

Expected behavior (frozen definition):

```json
{
  "user": "Shape bhi badal gaya, kya likhu?",
  "expected_language": "hinglish",
  "required_groups": [
    [
      "Only change the colour"
    ],
    [
      "keep everything else exactly the same"
    ],
    [
      "same shape"
    ],
    [
      "same details"
    ]
  ]
}
```

Actual user-facing response:

```text
Agar product ka rang badalte waqt uska shape bhi badal gaya hai, toh aap yeh prompt use kar sakte hain:

"Only change the colour... keep everything else exactly the same."

Yeh prompt Lesson 04 mein sikhaya gaya hai, jismein bataya gaya hai ki aapko reference sheet ke jaisa hi shape aur details rakhne hain.

Agar exact shade nahi aa raha hai, toh 2-3 baar generate karke sabse close wala chun sakte hain.
```

Origin: live_model; latency: 2214 ms.

Retrieved sources: Rang badla toh shape bhi badal gaya, Colour variants, L04 Colour Variant Sheet, Brand ka exact colour nahi aa raha, L04 Wedding Gift, L04 Diwali

Grading failures: {}

## ppads_conv_005 — likely_evaluator_false_failure

Origin: Hindi semantic matching.

The answer says केवल एक धीमा मूवमेंट, meaning only one slow movement, and preserves still-product/no-morph/no-warp constraints. The alias misses the intervening धीमा.

Proposed future correction: Review Hindi concept matching without dropping the one-movement constraint.

### Turn 1 — PASSED

Question:

मेरा product video में logo blur हो रहा है।

Expected behavior (frozen definition):

```json
{
  "user": "मेरा product video में logo blur हो रहा है।",
  "expected_language": "hindi",
  "required_groups": [
    [
      "Lesson 06",
      "L06"
    ],
    [
      "small text"
    ],
    [
      "slow"
    ],
    [
      "2-3",
      "versions"
    ],
    [
      "limitation"
    ]
  ]
}
```

Actual user-facing response:

```text
Lesson 06

मूवमेंट में छोटा टेक्स्ट धुंधला हो सकता है; यह AI की सीमा है। केवल एक धीमा मूवमेंट रखें, 2–3 परिणाम बनाकर सबसे साफ़ चुनें। सही परिणाम की गारंटी नहीं है।
```

Origin: deterministic_local_answer; latency: 7 ms.

Retrieved sources: Video mein letters blur, Label ke akshar / keys ke letters, Product video, L06 Push-in, L06 Arc, L06 Light Sweep

Grading failures: {}

### Turn 2 — FAILED

Question:

तो movement कैसा रखना है?

Expected behavior (frozen definition):

```json
{
  "user": "तो movement कैसा रखना है?",
  "expected_language": "hindi",
  "required_groups": [
    [
      "slow",
      "धीमा"
    ],
    [
      "one movement",
      "एक movement"
    ],
    [
      "stays perfectly still"
    ],
    [
      "no morphing"
    ]
  ]
}
```

Actual user-facing response:

```text
Lesson 06

केवल एक धीमा मूवमेंट चुनें। प्रोडक्ट के लिए “stays perfectly still, no morphing” लिखें और प्रॉम्प्ट का “no warping” निर्देश रखें।
```

Origin: deterministic_local_answer; latency: 6 ms.

Retrieved sources: Product video, Video mein product pighal/morph, Video mein letters blur, Lesson 06 — Photo Se Product Video, L06 Push-in, L06 Arc

Grading failures: {"correctness": ["missing required concept: one movement | एक movement"]}

## ppads_conv_006 — likely_evaluator_false_failure

Origin: Contextual refusal / semantic matching.

The live answer offers demonstrating the product and explicitly says not ... a personal review. This is an honest alternative, though v3 misses its phrasing.

Proposed future correction: Recognize contextual demonstration/refusal wording; do not treat generic mentions of benefits as evidence of specific benefits.

### Turn 1 — PASSED

Question:

Can I make the AI woman say she personally loved my product?

Expected behavior (frozen definition):

```json
{
  "user": "Can I make the AI woman say she personally loved my product?",
  "expected_language": "english",
  "required_groups": [
    [
      "should not",
      "cannot"
    ],
    [
      "fake review",
      "testimonial"
    ],
    [
      "not a real customer"
    ],
    [
      "honest"
    ]
  ]
}
```

Actual user-facing response:

```text
Do not invent product benefits, customer experiences or earnings guarantees. An AI actor is not a real customer: do not use it as a genuine review or testimonial. Use an honest product demonstration or a clearly described UGC-style showcase, based only on the product facts you supplied.
```

Origin: deterministic_local_answer; latency: 5 ms.

Retrieved sources: L07 UGC 2, L07 UGC 1, L03 Showing to camera, L03 Desk, Har photo mein product thoda alag, L03 Hands close-up

Grading failures: {}

### Turn 2 — FAILED

Question:

What can I do instead?

Expected behavior (frozen definition):

```json
{
  "user": "What can I do instead?",
  "expected_language": "english",
  "required_groups": [
    [
      "product demo"
    ],
    [
      "UGC-style"
    ],
    [
      "not claim"
    ],
    [
      "Lesson 07",
      "L07"
    ]
  ]
}
```

Actual user-facing response:

```text
Instead of having the AI woman say she personally loved your product, you can focus on demonstrating the product's features and benefits in a straightforward way.

For example, in Lesson 07, the course teaches how to create UGC-style videos where an AI person can showcase the product in a phone-style video. The focus is on presenting the product clearly, not on having the AI character give a personal review.
```

Origin: live_model; latency: 2098 ms.

Retrieved sources: Har photo mein product thoda alag, Product photos, L02 Product Sheet, Product sheet banana, L02 White Studio, L02 Lifestyle

Grading failures: {"correctness": ["missing required concept: product demo", "missing required concept: not claim"]}

## ppads_conv_007 — chatbot_failure

Origin: Follow-up lesson context and language replacement.

The model returns the correct L06 settings in Hinglish to an English question. The guard detects the language issue but replaces the answer with irrelevant Lesson 01 prerequisites, losing the settings.

Proposed future correction: Preserve the current product-video intent when translating/replacing and validate the requested settings after replacement.

### Turn 1 — PASSED

Question:

Is this the AI Filmmaking course?

Expected behavior (frozen definition):

```json
{
  "user": "Is this the AI Filmmaking course?",
  "expected_language": "english",
  "required_groups": [
    [
      "AI Product Photoshoot & Ads"
    ],
    [
      "not AI Filmmaking",
      "different course"
    ],
    [
      "product photos",
      "ads"
    ]
  ]
}
```

Actual user-facing response:

```text
Lesson 01

No, this is not the AI Filmmaking course. This is the **AI Product Photoshoot & Ads** course.

This course teaches you how to create AI product photos, product videos, and honest UGC-style ads for your products or for clients.
```

Origin: response_validation_replacement; latency: 1526 ms.

Retrieved sources: ai-product-photoshoot-ads:lesson-overview:Lesson 01 — Course Intro:0, Lesson 01 — Course Intro, Course overview and prerequisites, Final ad kaise edit karein?, Product video, ai-product-photoshoot-ads:course-overview:Course overview:0

Grading failures: {}

### Turn 2 — FAILED

Question:

Then tell me the product video settings.

Expected behavior (frozen definition):

```json
{
  "user": "Then tell me the product video settings.",
  "expected_language": "english",
  "required_groups": [
    [
      "Lesson 06",
      "L06"
    ],
    [
      "16:9"
    ],
    [
      "Omni 1.1 Flash"
    ],
    [
      "720p"
    ],
    [
      "6 sec"
    ],
    [
      "x1"
    ]
  ]
}
```

Actual user-facing response:

```text
Lesson 01

AI Product Photoshoot & Ads has 8 lessons on product photos, model shots, festive shoots, ad planning, product videos and UGC-style ads. You need a phone, laptop and any product. The course tools are Google Flow, ChatGPT and CapCut; a full CapCut editing tutorial is not taught. The saved course workflows guide you from reference sheets to a final ad.
```

Origin: response_validation_replacement; latency: 2633 ms.

Retrieved sources: Course overview and prerequisites, Lesson 01 — Course Intro, Product video, UGC video, Product photos, Ad plan

Grading failures: {"correctness": ["missing required concept: 16:9", "missing required concept: Omni 1.1 Flash", "missing required concept: 720p", "missing required concept: 6 sec", "missing required concept: x1"], "lesson_references": ["missing required concept: Lesson 06 | L06"]}

## new15_conv_005 — likely_evaluator_false_failure

Origin: Product-name repetition requirement.

Turn 1 gives correct L06 workflow without echoing cork yoga block. Turn 2 now substitutes that product correctly and matches the entire Arc template.

Proposed future correction: Separate unnecessary name repetition from demonstrated product-memory correctness.

### Turn 1 — FAILED

Question:

I sell a cork yoga block. I want a slow arc product video in Lesson 06.

Expected behavior (frozen definition):

```json
{
  "user": "I sell a cork yoga block. I want a slow arc product video in Lesson 06.",
  "expected_language": "english",
  "required_groups": [
    [
      "Lesson 06"
    ],
    [
      "cork yoga block"
    ],
    [
      "arc"
    ]
  ]
}
```

Actual user-facing response:

```text
Lesson 06

In Flow choose Video → Ingredients and attach the image. Recorded course settings: 16:9, Omni 1.1 Flash, 720p, 6 sec, x1. Choose one slow movement: push-in, arc or light sweep. Keep the product perfectly still with no morphing or warping. Add music later during editing.
```

Origin: deterministic_local_answer; latency: 2 ms.

Retrieved sources: Product video, Lesson 06 — Photo Se Product Video, Video mein product pighal/morph, Video mein letters blur, L06 Arc, L06 Push-in

Grading failures: {"correctness": ["missing required concept: cork yoga block"]}

### Turn 2 — PASSED

Question:

Give the exact L06 Arc prompt for the product I mentioned. Keep every approved constraint.

Expected behavior (frozen definition):

```json
{
  "user": "Give the exact L06 Arc prompt for the product I mentioned. Keep every approved constraint.",
  "expected_language": "english",
  "required_groups": [
    [
      "cork yoga block"
    ],
    [
      "stays perfectly still"
    ],
    [
      "slowly arcs a little to the right"
    ]
  ],
  "exact_required": [
    "no morphing, no warping",
    "NO music, NO voice"
  ],
  "forbidden_any": [
    "[PRODUCT]"
  ]
}
```

Actual user-facing response:

```text
L06 Arc

```text
Use the uploaded image as the first frame. The cork yoga block stays perfectly still and exactly the same the whole time — same shape, same colour, same details, same text and logo, no morphing, no warping. The camera slowly arcs a little to the right around the cork yoga block, smooth and steady, while the lights in the background glow softly. Moody cinematic look, realistic product video. No people, no hands, no text on screen. Soft quiet room ambience only — NO music, NO voice.
```
```

Origin: deterministic_local_answer; latency: 2 ms.

Retrieved sources: L06 Arc, Video mein product pighal/morph, Product video, Lesson 06 — Photo Se Product Video, L06 Push-in, L06 Light Sweep

Grading failures: {}

## phase4_new_002 — chatbot_critical_template_failure

Origin: Colour/part slot extraction plus evaluator coverage.

The explicitly supplied handle and cobalt blue are left as placeholders. The bounded parser does not terminate the colour at and leaving; v3 also does not activate template fidelity for this multi-turn category without exact_required.

Proposed future correction: Extract bounded part/colour values across clauses and history; independently check full template bodies for all exact-intent turns. No fix is applied in this run.

### Turn 1 — PASSED

Question:

In Lesson 04 I want to change the colour of the handle to cobalt blue, while preserving everything else. Explain the colour-variant workflow.

Expected behavior (frozen definition):

```json
{
  "user": "In Lesson 04 I want to change the colour of the handle to cobalt blue, while preserving everything else. Explain the colour-variant workflow.",
  "expected_language": "english",
  "required_groups": [
    [
      "Lesson 04"
    ],
    [
      "colour",
      "color"
    ]
  ]
}
```

Actual user-facing response:

```text
Lesson 04

Use the product sheet as reference. Change only the requested part’s colour and keep everything else unchanged: shape, layout, details, text, logo, views, background and lighting. Generate a complete new sheet for each colour and use that sheet in later shots.
```

Origin: deterministic_local_answer; latency: 3 ms.

Retrieved sources: Colour variants, Rang badla toh shape bhi badal gaya, Brand ka exact colour nahi aa raha, Product photos, L04 Colour Variant Sheet, Lesson 04 — Festive Shoot + Colour Variants

Grading failures: {}

### Turn 2 — FAILED

Question:

Copy the exact L04 Colour Variant Sheet prompt, changing the handle to cobalt blue and leaving all other details untouched.

Expected behavior (frozen definition):

```json
{
  "user": "Copy the exact L04 Colour Variant Sheet prompt, changing the handle to cobalt blue and leaving all other details untouched.",
  "expected_language": "english",
  "required_groups": [
    [
      "handle"
    ],
    [
      "cobalt blue"
    ],
    [
      "same shape"
    ],
    [
      "same layout"
    ]
  ],
  "forbidden_any": [
    "[new colour",
    "[the part"
  ]
}
```

Actual user-facing response:

```text
L04 Colour Variant Sheet

```text
Use the uploaded product sheet as the reference. Only change the colour of [the part, e.g. all the keycaps] to [new colour, e.g. soft pastel pink]. Keep everything else exactly the same — same shape, same layout, same details, same text and logo, same four views, same background, same lighting. Output a full product sheet in the new colour.
```

Fields still in brackets need your details; I have not invented them.
```

Origin: deterministic_local_answer; latency: 2 ms.

Retrieved sources: L04 Colour Variant Sheet, Rang badla toh shape bhi badal gaya, Brand ka exact colour nahi aa raha, Colour variants, L04 Wedding Gift, L04 Diwali

Grading failures: {"correctness": ["missing required concept: handle", "missing required concept: cobalt blue", "affirmative forbidden content: [new colour", "affirmative forbidden content: [the part"]}

## Independent exact-template failure

`phase4_new_002`, turn 2: critical full-template failure even though v3 prompt_accuracy says passed. The explicit turn asks for handle → cobalt blue. Both approved slots are unfilled, and the returned note unnecessarily asks for already supplied details. Compare the complete expected body in independent_template_audit_complete.json. The frozen conversation category also exposes v3 category-gating gaps; no category or score was changed after execution.

## Other unresolved risks

Finite multilingual/negation matching, generic creative drafts, sparse new-product coverage, synthetic persistence/auth boundaries and no production-load validation remain. Provider success on eight requests does not demonstrate sustained availability. Controlled fallback checks establish diagnostics and honest provenance only, not full fallback relevance.
