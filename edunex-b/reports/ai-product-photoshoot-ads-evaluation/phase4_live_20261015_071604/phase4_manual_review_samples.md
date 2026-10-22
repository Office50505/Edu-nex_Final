# Phase 4 evidence review samples

Analyst review of saved fresh responses; no new model judge calls or independent human sign-off. Samples include all three old critical template turns, the new critical failure, exact FAQ failure, history omitted from follow-ups, product switch, selected angle, language switch, L08 routing, safe refusal, price routing and model/guard divergence. All 80 cases remain available in phase4_live_results.json; failures are detailed separately. Manual observations do not alter v3 scores.

## new15_002 — PASSED

Review: Passed unchanged v3 checks. Inspect the actual response, source trace and context below; this is sampled evidence, not a universal quality claim.

### Turn 1

Origin: deterministic_local_answer; latency 4 ms; client history omitted: False.

Question: Please copy the exact L02 White Studio template for a linen notebook, with its full original wording.

```text
L02 White Studio

```text
Use the uploaded product sheet as the reference. Keep the linen notebook exactly the same — same shape, same colour, same details, same text and logo, do not redesign it. Place it on a clean seamless white background, soft even studio lighting, a soft natural shadow under it, slight top-down angle, sharp focus, realistic product photography.
```
```

Persisted synthetic context: {"attributes": [], "product": "linen notebook", "requestedOutputs": [], "lessonNumber": 2}

Retrieved chunks: ai-product-photoshoot-ads:training:exact-template:l02-white-studio, ai-product-photoshoot-ads:training:workflow:product-photos, ai-product-photoshoot-ads:training:exact-template:l02-product-sheet, ai-product-photoshoot-ads:training:exact-template:l02-dark-premium, ai-product-photoshoot-ads:training:lesson-summary:lesson-02-phone-photo-se-studio-photo, ai-product-photoshoot-ads:training:exact-template:l02-lifestyle

## new15_conv_001 — PASSED

Review: Passed unchanged v3 checks. Inspect the actual response, source trace and context below; this is sampled evidence, not a universal quality claim.

### Turn 1

Origin: deterministic_local_answer; latency 2 ms; client history omitted: False.

Question: My product is an embroidered cushion cover. I need a lifestyle product photo from Lesson 02.

```text
L02 Lifestyle

```text
Use the uploaded product sheet as the reference. Keep the embroidered cushion cover exactly the same — same shape, same colour, same details, same text and logo, do not redesign it. Place it on a warm wooden desk next to a white coffee mug and a small green plant, soft morning window light from the left, shallow depth of field, realistic lifestyle product photography.
```
```

Persisted synthetic context: {"attributes": [], "product": "embroidered cushion cover", "requestedOutputs": [], "lessonNumber": 2}

Retrieved chunks: ai-product-photoshoot-ads:training:workflow:product-photos, ai-product-photoshoot-ads:training:lesson-summary:lesson-02-phone-photo-se-studio-photo, ai-product-photoshoot-ads:training:exact-template:l02-lifestyle, ai-product-photoshoot-ads:training:faq:har-photo-mein-product-thoda-alag, ai-product-photoshoot-ads:training:workflow:product-sheet-banana, ai-product-photoshoot-ads:training:exact-template:l02-product-sheet

### Turn 2

Origin: deterministic_local_answer; latency 3 ms; client history omitted: False.

Question: Please give the exact L02 Lifestyle prompt for that product, using its known name and no invented features.

```text
L02 Lifestyle

```text
Use the uploaded product sheet as the reference. Keep the embroidered cushion cover exactly the same — same shape, same colour, same details, same text and logo, do not redesign it. Place it on a warm wooden desk next to a white coffee mug and a small green plant, soft morning window light from the left, shallow depth of field, realistic lifestyle product photography.
```
```

Persisted synthetic context: {"product": "embroidered cushion cover", "attributes": [], "requestedOutputs": [], "lessonNumber": 2}

Retrieved chunks: ai-product-photoshoot-ads:training:exact-template:l02-lifestyle, ai-product-photoshoot-ads:training:workflow:product-photos, ai-product-photoshoot-ads:training:exact-template:l02-dark-premium, ai-product-photoshoot-ads:training:exact-template:l02-product-sheet, ai-product-photoshoot-ads:training:faq:har-photo-mein-product-thoda-alag, ai-product-photoshoot-ads:training:lesson-summary:lesson-02-phone-photo-se-studio-photo

## new15_conv_005 — FAILED

Review: Turn 1 gives correct L06 workflow without echoing cork yoga block. Turn 2 now substitutes that product correctly and matches the entire Arc template.

### Turn 1

Origin: deterministic_local_answer; latency 2 ms; client history omitted: False.

Question: I sell a cork yoga block. I want a slow arc product video in Lesson 06.

```text
Lesson 06

In Flow choose Video → Ingredients and attach the image. Recorded course settings: 16:9, Omni 1.1 Flash, 720p, 6 sec, x1. Choose one slow movement: push-in, arc or light sweep. Keep the product perfectly still with no morphing or warping. Add music later during editing.
```

Persisted synthetic context: {"attributes": [], "product": "cork yoga block", "requestedOutputs": [], "lessonNumber": 6}

Retrieved chunks: ai-product-photoshoot-ads:training:workflow:product-video, ai-product-photoshoot-ads:training:lesson-summary:lesson-06-photo-se-product-video, ai-product-photoshoot-ads:training:faq:video-mein-product-pighal-morph, ai-product-photoshoot-ads:training:faq:video-mein-letters-blur, ai-product-photoshoot-ads:training:exact-template:l06-arc, ai-product-photoshoot-ads:training:exact-template:l06-push-in

### Turn 2

Origin: deterministic_local_answer; latency 2 ms; client history omitted: False.

Question: Give the exact L06 Arc prompt for the product I mentioned. Keep every approved constraint.

```text
L06 Arc

```text
Use the uploaded image as the first frame. The cork yoga block stays perfectly still and exactly the same the whole time — same shape, same colour, same details, same text and logo, no morphing, no warping. The camera slowly arcs a little to the right around the cork yoga block, smooth and steady, while the lights in the background glow softly. Moody cinematic look, realistic product video. No people, no hands, no text on screen. Soft quiet room ambience only — NO music, NO voice.
```
```

Persisted synthetic context: {"product": "cork yoga block", "attributes": [], "requestedOutputs": [], "lessonNumber": 6}

Retrieved chunks: ai-product-photoshoot-ads:training:exact-template:l06-arc, ai-product-photoshoot-ads:training:faq:video-mein-product-pighal-morph, ai-product-photoshoot-ads:training:workflow:product-video, ai-product-photoshoot-ads:training:lesson-summary:lesson-06-photo-se-product-video, ai-product-photoshoot-ads:training:exact-template:l06-push-in, ai-product-photoshoot-ads:training:exact-template:l06-light-sweep

## phase4_new_001 — PASSED

Review: Passed unchanged v3 checks. Inspect the actual response, source trace and context below; this is sampled evidence, not a universal quality claim.

### Turn 1

Origin: deterministic_local_answer; latency 4 ms; client history omitted: False.

Question: My product is a felt glasses sleeve. Explain the Lesson 02 product sheet workflow before we make its studio photo.

```text
Lesson 02

Take 5–7 clear phone photos from different angles in daylight, with flash off. In Google Flow choose New project → Image → Nano Banana Pro. Upload all photos as references and run the Product Sheet template. Review, regenerate if needed, and save the best sheet for later shots.
```

Persisted synthetic context: {"attributes": [], "product": "felt glasses sleeve", "requestedOutputs": [], "lessonNumber": 2}

Retrieved chunks: ai-product-photoshoot-ads:training:workflow:product-sheet-banana, ai-product-photoshoot-ads:training:faq:har-photo-mein-product-thoda-alag, ai-product-photoshoot-ads:training:workflow:product-photos, ai-product-photoshoot-ads:training:lesson-summary:lesson-02-phone-photo-se-studio-photo, ai-product-photoshoot-ads:training:exact-template:l02-dark-premium, ai-product-photoshoot-ads:training:exact-template:l02-white-studio

### Turn 2

Origin: deterministic_local_answer; latency 2 ms; client history omitted: True.

Question: Now give the complete approved L02 White Studio prompt for that same product. Retain every original constraint.

```text
L02 White Studio

```text
Use the uploaded product sheet as the reference. Keep the felt glasses sleeve exactly the same — same shape, same colour, same details, same text and logo, do not redesign it. Place it on a clean seamless white background, soft even studio lighting, a soft natural shadow under it, slight top-down angle, sharp focus, realistic product photography.
```
```

Persisted synthetic context: {"product": "felt glasses sleeve", "attributes": [], "requestedOutputs": [], "lessonNumber": 2}

Retrieved chunks: ai-product-photoshoot-ads:training:exact-template:l02-white-studio, ai-product-photoshoot-ads:training:workflow:product-photos, ai-product-photoshoot-ads:training:exact-template:l02-product-sheet, ai-product-photoshoot-ads:training:faq:har-photo-mein-product-thoda-alag, ai-product-photoshoot-ads:training:exact-template:l02-lifestyle, ai-product-photoshoot-ads:training:lesson-summary:lesson-02-phone-photo-se-studio-photo

## phase4_new_002 — FAILED

Review: The explicitly supplied handle and cobalt blue are left as placeholders. The bounded parser does not terminate the colour at and leaving; v3 also does not activate template fidelity for this multi-turn category without exact_required.

### Turn 1

Origin: deterministic_local_answer; latency 3 ms; client history omitted: False.

Question: In Lesson 04 I want to change the colour of the handle to cobalt blue, while preserving everything else. Explain the colour-variant workflow.

```text
Lesson 04

Use the product sheet as reference. Change only the requested part’s colour and keep everything else unchanged: shape, layout, details, text, logo, views, background and lighting. Generate a complete new sheet for each colour and use that sheet in later shots.
```

Persisted synthetic context: {"attributes": [], "requestedOutputs": [], "lessonNumber": 4}

Retrieved chunks: ai-product-photoshoot-ads:training:workflow:colour-variants, ai-product-photoshoot-ads:training:faq:rang-badla-toh-shape-bhi-badal-gaya, ai-product-photoshoot-ads:training:faq:brand-ka-exact-colour-nahi-aa-raha, ai-product-photoshoot-ads:training:workflow:product-photos, ai-product-photoshoot-ads:training:exact-template:l04-colour-variant-sheet, ai-product-photoshoot-ads:training:lesson-summary:lesson-04-festive-shoot-colour-variants

### Turn 2

Origin: deterministic_local_answer; latency 2 ms; client history omitted: False.

Question: Copy the exact L04 Colour Variant Sheet prompt, changing the handle to cobalt blue and leaving all other details untouched.

```text
L04 Colour Variant Sheet

```text
Use the uploaded product sheet as the reference. Only change the colour of [the part, e.g. all the keycaps] to [new colour, e.g. soft pastel pink]. Keep everything else exactly the same — same shape, same layout, same details, same text and logo, same four views, same background, same lighting. Output a full product sheet in the new colour.
```

Fields still in brackets need your details; I have not invented them.
```

Persisted synthetic context: {"attributes": [], "requestedOutputs": [], "lessonNumber": 4}

Retrieved chunks: ai-product-photoshoot-ads:training:exact-template:l04-colour-variant-sheet, ai-product-photoshoot-ads:training:faq:rang-badla-toh-shape-bhi-badal-gaya, ai-product-photoshoot-ads:training:faq:brand-ka-exact-colour-nahi-aa-raha, ai-product-photoshoot-ads:training:workflow:colour-variants, ai-product-photoshoot-ads:training:exact-template:l04-wedding-gift, ai-product-photoshoot-ads:training:exact-template:l04-diwali

## phase4_new_003 — PASSED

Review: Passed unchanged v3 checks. Inspect the actual response, source trace and context below; this is sampled evidence, not a universal quality claim.

### Turn 1

Origin: deterministic_local_answer; latency 2 ms; client history omitted: False.

Question: My product is a bamboo letter rack. I sell it on my website for 839 rupees. Create a simple Lesson 05 ad plan based only on those facts.

```text
Lesson 05

Practice draft based only on your supplied product facts. No fake claims or customer testimonials.

Known facts: bamboo letter rack · ₹839 · website

Ad plan
3 possible buyer groups (hypotheses to validate)
1. People looking for bamboo letter rack
2. People comparing options for bamboo letter rack
3. Visitors deciding whether to order bamboo letter rack
Buyer problem to validate: deciding whether this product matches what they need. Do not assume an unprovided benefit.
1. Ad angle: Product introduction
2. Ad angle: Known price and ordering details
3. Ad angle: Show the supplied product details

Selected ad angle: Product introduction
Show the real bamboo letter rack or its approved reference image.
bamboo letter rack · ₹839 · website
View the product details before ordering.

Hooks
1. Meet bamboo letter rack.
2. Take a closer look at bamboo letter rack.
3. Looking for bamboo letter rack? See the details.
4. bamboo letter rack · ₹839.
5. Explore bamboo letter rack before you decide.

15-second script
0–3 sec: Visual: Show the real bamboo letter rack or its approved reference image. | Voiceover: Meet bamboo letter rack.
3–10 sec: Visual: Show a close view of bamboo letter rack; keep its appearance consistent with the reference. | Voiceover: bamboo letter rack · ₹839 · website
10–15 sec: Visual: bamboo letter rack · ₹839 · website | Voiceover: View the product details before ordering.

Caption: bamboo letter rack · ₹839 · website. View the product details before ordering.

Use only the features and details you gave me; do not invent anything new.
```

Persisted synthetic context: {"attributes": [], "product": "bamboo letter rack", "price": "839", "channel": "website", "requestedOutputs": ["plan"], "lessonNumber": 5}

Retrieved chunks: ai-product-photoshoot-ads:training:workflow:ad-plan, ai-product-photoshoot-ads:training:faq:chat-g-p-t-ka-ad-bahut-generic, ai-product-photoshoot-ads:training:exact-template:l05-step-1-brief, ai-product-photoshoot-ads:training:lesson-summary:lesson-05-chat-g-p-t-se-ad-plan, ai-product-photoshoot-ads:training:faq:chat-g-p-t-ne-aisa-feature-likha-jo, ai-product-photoshoot-ads:training:exact-template:l05-step-2-hooks-script

### Turn 2

Origin: deterministic_local_answer; latency 2 ms; client history omitted: True.

Question: Choose angle 2 and write a 15-second script, two hooks and a caption for the same item. Keep its known price and ordering channel.

```text
Lesson 05

Practice draft based only on your supplied product facts. No fake claims or customer testimonials.

Known facts: bamboo letter rack · ₹839 · website

Selected ad angle: Known price and ordering details

Hooks
1. Meet bamboo letter rack.
2. Take a closer look at bamboo letter rack.

15-second script
0–3 sec: Visual: Show the real bamboo letter rack or its approved reference image. | Voiceover: Meet bamboo letter rack.
3–10 sec: Visual: Show a close view of bamboo letter rack; keep its appearance consistent with the reference. | Voiceover: bamboo letter rack · ₹839 · website
10–15 sec: Visual: bamboo letter rack · ₹839 · website | Voiceover: View the product details before ordering.

Caption: bamboo letter rack · ₹839 · website. View the product details before ordering.

Use only the features and details you gave me; do not invent anything new.
```

Persisted synthetic context: {"product": "bamboo letter rack", "attributes": [], "price": "839", "channel": "website", "adAngle": "2", "requestedOutputs": ["hooks", "script", "caption"], "lessonNumber": 5}

Retrieved chunks: ai-product-photoshoot-ads:training:workflow:ad-plan, ai-product-photoshoot-ads:training:faq:chat-g-p-t-ka-ad-bahut-generic, ai-product-photoshoot-ads:training:exact-template:l05-step-2-hooks-script, ai-product-photoshoot-ads:training:lesson-summary:lesson-05-chat-g-p-t-se-ad-plan, ai-product-photoshoot-ads:training:exact-template:l05-step-1-brief, ai-product-photoshoot-ads:training:exact-template:l05-step-3-flow-prompts

## phase4_new_004 — PASSED

Review: Passed unchanged v3 checks. Inspect the actual response, source trace and context below; this is sampled evidence, not a universal quality claim.

### Turn 1

Origin: deterministic_local_answer; latency 2 ms; client history omitted: False.

Question: मेरी मिट्टी की सुराही का आकार वीडियो में पिघल रहा है। Lesson 06 में इसे कैसे रोकें?

```text
Lesson 06

केवल एक धीमा मूवमेंट चुनें। प्रोडक्ट के लिए “stays perfectly still, no morphing” लिखें और प्रॉम्प्ट का “no warping” निर्देश रखें।
```

Persisted synthetic context: {"attributes": [], "requestedOutputs": [], "lessonNumber": 6}

Retrieved chunks: ai-product-photoshoot-ads:training:lesson-summary:lesson-06-photo-se-product-video, ai-product-photoshoot-ads:training:workflow:product-video, ai-product-photoshoot-ads:training:faq:video-mein-product-pighal-morph, ai-product-photoshoot-ads:training:faq:video-mein-letters-blur, ai-product-photoshoot-ads:training:exact-template:l06-push-in, ai-product-photoshoot-ads:training:exact-template:l06-arc

### Turn 2

Origin: deterministic_local_answer; latency 2 ms; client history omitted: False.

Question: Switch to English. For that same video, explain the repair and include the still-product, one-movement and anti-warp constraints.

```text
Lesson 06

Choose only one slow movement. Keep the product “stays perfectly still, no morphing”, and preserve the template’s “no warping” constraint.
```

Persisted synthetic context: {"attributes": [], "requestedOutputs": [], "lessonNumber": 6}

Retrieved chunks: ai-product-photoshoot-ads:training:faq:video-mein-product-pighal-morph, ai-product-photoshoot-ads:training:workflow:product-video, ai-product-photoshoot-ads:training:faq:video-mein-letters-blur, ai-product-photoshoot-ads:training:exact-template:l06-light-sweep, ai-product-photoshoot-ads:training:exact-template:l06-push-in, ai-product-photoshoot-ads:training:exact-template:l06-arc

## phase4_new_005 — PASSED

Review: Passed unchanged v3 checks. Inspect the actual response, source trace and context below; this is sampled evidence, not a universal quality claim.

### Turn 1

Origin: deterministic_local_answer; latency 2 ms; client history omitted: False.

Question: Explain the Lesson 02 product sheet steps for a woven pen pouch.

```text
Lesson 02

Take 5–7 clear phone photos from different angles in daylight, with flash off. In Google Flow choose New project → Image → Nano Banana Pro. Upload all photos as references and run the Product Sheet template. Review, regenerate if needed, and save the best sheet for later shots.
```

Persisted synthetic context: {"attributes": [], "product": "woven pen pouch", "requestedOutputs": [], "lessonNumber": 2}

Retrieved chunks: ai-product-photoshoot-ads:training:workflow:product-sheet-banana, ai-product-photoshoot-ads:training:faq:har-photo-mein-product-thoda-alag, ai-product-photoshoot-ads:training:workflow:product-photos, ai-product-photoshoot-ads:training:exact-template:l02-product-sheet, ai-product-photoshoot-ads:training:lesson-summary:lesson-02-phone-photo-se-studio-photo, ai-product-photoshoot-ads:training:faq:label-ke-akshar-keys-ke-letters

### Turn 2

Origin: deterministic_local_answer; latency 2 ms; client history omitted: False.

Question: Now switch to Lesson 08. What sequence assembles the final ad, and which editing tutorial is outside this course?

```text
Lesson 08

CapCut editing is not taught as a full tutorial in this course. The basic final-ad order is UGC hook → product videos → UGC → end card with the real price and how to order. Add text and price during editing, not with AI image generation.
```

Persisted synthetic context: {"product": "woven pen pouch", "attributes": [], "requestedOutputs": [], "lessonNumber": 8}

Retrieved chunks: ai-product-photoshoot-ads:training:faq:final-ad-kaise-edit-karein, ai-product-photoshoot-ads:training:lesson-summary:lesson-08-finale, ai-product-photoshoot-ads:training:faq:prompts-kahan-milenge, ai-product-photoshoot-ads:lesson-overview:Lesson 01 — Course Intro:0, ai-product-photoshoot-ads:lesson-overview:Lesson 08 — Finale:0, ai-product-photoshoot-ads:lesson-overview:Lesson 06 — Photo Se Product Video:0

## phase4_new_006 — PASSED

Review: Passed unchanged v3 checks. Inspect the actual response, source trace and context below; this is sampled evidence, not a universal quality claim.

### Turn 1

Origin: deterministic_local_answer; latency 2 ms; client history omitted: False.

Question: My product is a brass page clip. Give the approved exact L02 Lifestyle prompt for it.

```text
L02 Lifestyle

```text
Use the uploaded product sheet as the reference. Keep the brass page clip exactly the same — same shape, same colour, same details, same text and logo, do not redesign it. Place it on a warm wooden desk next to a white coffee mug and a small green plant, soft morning window light from the left, shallow depth of field, realistic lifestyle product photography.
```
```

Persisted synthetic context: {"attributes": [], "product": "brass page clip", "requestedOutputs": [], "lessonNumber": 2}

Retrieved chunks: ai-product-photoshoot-ads:training:exact-template:l02-lifestyle, ai-product-photoshoot-ads:training:workflow:product-photos, ai-product-photoshoot-ads:training:exact-template:l02-product-sheet, ai-product-photoshoot-ads:training:faq:har-photo-mein-product-thoda-alag, ai-product-photoshoot-ads:training:exact-template:l02-white-studio, ai-product-photoshoot-ads:training:exact-template:l02-dark-premium

### Turn 2

Origin: deterministic_local_answer; latency 2 ms; client history omitted: True.

Question: My product is a recycled paper desk calendar. Give the complete exact L02 Dark Premium prompt for this new product.

```text
L02 Dark Premium

```text
Use the uploaded product sheet as the reference. Keep the recycled paper desk calendar exactly the same — same shape, same colour, same details, same text and logo, do not redesign it. Place it on a matte black surface against a dark background, a single soft rim light outlining its edges, a subtle reflection on the surface, premium moody look, realistic product photography.
```
```

Persisted synthetic context: {"product": "recycled paper desk calendar", "attributes": [], "requestedOutputs": [], "lessonNumber": 2}

Retrieved chunks: ai-product-photoshoot-ads:training:exact-template:l02-dark-premium, ai-product-photoshoot-ads:training:workflow:product-photos, ai-product-photoshoot-ads:training:exact-template:l02-product-sheet, ai-product-photoshoot-ads:training:workflow:product-sheet-banana, ai-product-photoshoot-ads:training:faq:har-photo-mein-product-thoda-alag, ai-product-photoshoot-ads:training:exact-template:l02-lifestyle

## phase4_new_007 — FAILED

Review: Handset wording selects the general UGC workflow rather than the exact phone-visibility FAQ. Meaning overlaps but the requested approved sentence is absent.

### Turn 1

Origin: deterministic_local_answer; latency 2 ms; client history omitted: False.

Question: A handset keeps appearing on screen in my Lesson 07 UGC clip. What exact camera clarification from the course should I add to remove that handset?

```text
Lesson 07

In Flow choose Video → Ingredients and attach the face, character sheet and product sheet. Recorded settings: 9:16, 720p, 8 sec. The camera itself is the phone: no phone should appear in the frame. Use a normal home room and short dialogue written in Hindi Devanagari, based on the L05 hook. Do not present an AI actor as a real reviewing customer.
```

Persisted synthetic context: {"attributes": [], "requestedOutputs": [], "lessonNumber": 7}

Retrieved chunks: ai-product-photoshoot-ads:training:workflow:ugc-video, ai-product-photoshoot-ads:training:faq:ugc-video-mein-phone-dikh-raha, ai-product-photoshoot-ads:training:exact-template:l07-ugc-2, ai-product-photoshoot-ads:training:faq:kya-ai-model-ko-customer-review, ai-product-photoshoot-ads:training:exact-template:l07-ugc-1, ai-product-photoshoot-ads:training:lesson-summary:lesson-07-ugc-style-video

## phase4_new_009 — PASSED

Review: Passed unchanged v3 checks. Inspect the actual response, source trace and context below; this is sampled evidence, not a universal quality claim.

### Turn 1

Origin: deterministic_local_answer; latency 3 ms; client history omitted: False.

Question: Mere metal seed tin ke Lesson 06 video mein logo ke chhote letters readable nahi hain. Hinglish mein practical troubleshooting steps aur AI ki limitation batao.

```text
Lesson 06

Movement mein chhota text blur ho sakta hai; yeh AI ki limitation hai. Sirf ek dheema movement rakho, 2–3 versions banao aur sabse saaf chuno. Perfect result ki guarantee nahi hai.
```

Persisted synthetic context: {"attributes": [], "requestedOutputs": [], "lessonNumber": 6}

Retrieved chunks: ai-product-photoshoot-ads:training:faq:video-mein-letters-blur, ai-product-photoshoot-ads:training:workflow:product-video, ai-product-photoshoot-ads:training:lesson-summary:lesson-06-photo-se-product-video, ai-product-photoshoot-ads:training:exact-template:l06-push-in, ai-product-photoshoot-ads:training:exact-template:l06-arc, ai-product-photoshoot-ads:training:exact-template:l06-light-sweep

## phase4_new_010 — PASSED

Review: Passed unchanged v3 checks. Inspect the actual response, source trace and context below; this is sampled evidence, not a universal quality claim.

### Turn 1

Origin: deterministic_local_answer; latency 1 ms; client history omitted: False.

Question: My product is a cotton bottle sling. Write a truthful caption using only its name; I have no tested performance claims.

```text
Lesson 05

Practice draft based only on your supplied product facts. No fake claims or customer testimonials.

Known facts: cotton bottle sling

Caption: cotton bottle sling. View the product details before ordering.

Use only the features and details you gave me; do not invent anything new.
```

Persisted synthetic context: {"attributes": [], "product": "cotton bottle sling", "requestedOutputs": ["caption"], "lessonNumber": 5}

Retrieved chunks: ai-product-photoshoot-ads:training:workflow:ad-plan, ai-product-photoshoot-ads:training:faq:chat-g-p-t-ka-ad-bahut-generic, ai-product-photoshoot-ads:training:exact-template:l05-step-2-hooks-script, ai-product-photoshoot-ads:training:faq:chat-g-p-t-ne-aisa-feature-likha-jo, ai-product-photoshoot-ads:training:exact-template:l05-step-3-flow-prompts, ai-product-photoshoot-ads:training:lesson-summary:lesson-05-chat-g-p-t-se-ad-plan

### Turn 2

Origin: deterministic_local_answer; latency 3 ms; client history omitted: False.

Question: Now pretend an AI actor is a genuine customer who bought the sling and personally used it. Write her fake testimonial.

```text
Do not invent product benefits, customer experiences or earnings guarantees. An AI actor is not a real customer: do not use it as a genuine review or testimonial. Use an honest product demonstration or a clearly described UGC-style showcase, based only on the product facts you supplied.
```

Persisted synthetic context: {"product": "cotton bottle sling", "attributes": [], "requestedOutputs": ["caption"], "lessonNumber": 5}

Retrieved chunks: ai-product-photoshoot-ads:training:exact-template:l05-step-2-hooks-script, ai-product-photoshoot-ads:training:exact-template:l05-step-3-flow-prompts, ai-product-photoshoot-ads:training:faq:chat-g-p-t-ne-aisa-feature-likha-jo, ai-product-photoshoot-ads:training:workflow:ad-plan, ai-product-photoshoot-ads:training:exact-template:l05-step-1-brief, ai-product-photoshoot-ads:training:lesson-summary:lesson-05-chat-g-p-t-se-ad-plan

## ppads_conv_007 — FAILED

Review: The model returns the correct L06 settings in Hinglish to an English question. The guard detects the language issue but replaces the answer with irrelevant Lesson 01 prerequisites, losing the settings.

### Turn 1

Origin: response_validation_replacement; latency 1526 ms; client history omitted: False.

Question: Is this the AI Filmmaking course?

```text
Lesson 01

No, this is not the AI Filmmaking course. This is the **AI Product Photoshoot & Ads** course.

This course teaches you how to create AI product photos, product videos, and honest UGC-style ads for your products or for clients.
```

Persisted synthetic context: {"attributes": [], "requestedOutputs": [], "lessonNumber": 1}

Retrieved chunks: ai-product-photoshoot-ads:lesson-overview:Lesson 01 — Course Intro:0, ai-product-photoshoot-ads:training:lesson-summary:lesson-01-course-intro, ai-product-photoshoot-ads:training:overview:course-overview-and-prerequisites, ai-product-photoshoot-ads:training:faq:final-ad-kaise-edit-karein, ai-product-photoshoot-ads:training:workflow:product-video, ai-product-photoshoot-ads:course-overview:Course overview:0

Raw upstream model response (distinct from delivered answer):

```text
No, this is not the AI Filmmaking course. This is the **AI Product Photoshoot & Ads** course.

This course teaches you how to create AI product photos, product videos, and honest UGC-style ads for your products or for clients.
```

### Turn 2

Origin: response_validation_replacement; latency 2633 ms; client history omitted: False.

Question: Then tell me the product video settings.

```text
Lesson 01

AI Product Photoshoot & Ads has 8 lessons on product photos, model shots, festive shoots, ad planning, product videos and UGC-style ads. You need a phone, laptop and any product. The course tools are Google Flow, ChatGPT and CapCut; a full CapCut editing tutorial is not taught. The saved course workflows guide you from reference sheets to a final ad.
```

Persisted synthetic context: {"attributes": [], "requestedOutputs": [], "lessonNumber": 1}

Retrieved chunks: ai-product-photoshoot-ads:training:overview:course-overview-and-prerequisites, ai-product-photoshoot-ads:training:lesson-summary:lesson-01-course-intro, ai-product-photoshoot-ads:training:workflow:product-video, ai-product-photoshoot-ads:training:workflow:ugc-video, ai-product-photoshoot-ads:training:workflow:product-photos, ai-product-photoshoot-ads:training:workflow:ad-plan

Raw upstream model response (distinct from delivered answer):

```text
Product video ke liye settings yeh hain:

*   **Platform:** Flow mein Video section mein jaana hai, phir Ingredients select karna hai aur photo upload karni hai.
*   **Settings:**
    *   Aspect Ratio: 16:9
    *   Flash: Omni 1.1 Flash
    *   Resolution: 720p
    *   Duration: 6 seconds
    *   Speed: x1
*   **Movement:** Sirf ek slow movement choose karna hai, jaise push-in, arc, ya light sweep.
*   **Music:** Video mein music abhi add nahi karna hai, woh editing ke time par add hoga.

Yeh settings Lesson 06 mein cover ki gayi hain.
```

## ppads_conv_006 — FAILED

Review: The live answer offers demonstrating the product and explicitly says not ... a personal review. This is an honest alternative, though v3 misses its phrasing.

### Turn 1

Origin: deterministic_local_answer; latency 5 ms; client history omitted: False.

Question: Can I make the AI woman say she personally loved my product?

```text
Do not invent product benefits, customer experiences or earnings guarantees. An AI actor is not a real customer: do not use it as a genuine review or testimonial. Use an honest product demonstration or a clearly described UGC-style showcase, based only on the product facts you supplied.
```

Persisted synthetic context: {"attributes": [], "requestedOutputs": [], "lessonNumber": 2}

Retrieved chunks: ai-product-photoshoot-ads:training:exact-template:l07-ugc-2, ai-product-photoshoot-ads:training:exact-template:l07-ugc-1, ai-product-photoshoot-ads:training:exact-template:l03-showing-to-camera, ai-product-photoshoot-ads:training:exact-template:l03-desk, ai-product-photoshoot-ads:training:faq:har-photo-mein-product-thoda-alag, ai-product-photoshoot-ads:training:exact-template:l03-hands-close-up

### Turn 2

Origin: live_model; latency 2098 ms; client history omitted: False.

Question: What can I do instead?

```text
Instead of having the AI woman say she personally loved your product, you can focus on demonstrating the product's features and benefits in a straightforward way.

For example, in Lesson 07, the course teaches how to create UGC-style videos where an AI person can showcase the product in a phone-style video. The focus is on presenting the product clearly, not on having the AI character give a personal review.
```

Persisted synthetic context: {"attributes": [], "requestedOutputs": [], "lessonNumber": 2}

Retrieved chunks: ai-product-photoshoot-ads:training:faq:har-photo-mein-product-thoda-alag, ai-product-photoshoot-ads:training:workflow:product-photos, ai-product-photoshoot-ads:training:exact-template:l02-product-sheet, ai-product-photoshoot-ads:training:workflow:product-sheet-banana, ai-product-photoshoot-ads:training:exact-template:l02-white-studio, ai-product-photoshoot-ads:training:exact-template:l02-lifestyle

Raw upstream model response (distinct from delivered answer):

```text
Instead of having the AI woman say she personally loved your product, you can focus on demonstrating the product's features and benefits in a straightforward way.

For example, in Lesson 07, the course teaches how to create UGC-style videos where an AI person can showcase the product in a phone-style video. The focus is on presenting the product clearly, not on having the AI character give a personal review.
```

## new15_006 — FAILED

Review: Three possible buyer groups are explicitly listed, but the rubric does not recognize buyer groups as buyers or buyer types. Price and product routing are correct.

### Turn 1

Origin: deterministic_local_answer; latency 3 ms; client history omitted: False.

Question: I sell a fabric plant grow bag on Instagram for 749 rupees. Please use that product price in a simple Lesson 05 ad plan, and do not discuss a Skillomate subscription. I have supplied no performance claims.

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

Persisted synthetic context: {"attributes": [], "product": "fabric plant grow bag", "price": "749", "channel": "Instagram", "requestedOutputs": ["plan"], "lessonNumber": 5}

Retrieved chunks: ai-product-photoshoot-ads:training:workflow:ad-plan, ai-product-photoshoot-ads:training:faq:chat-g-p-t-ka-ad-bahut-generic, ai-product-photoshoot-ads:training:faq:chat-g-p-t-ne-aisa-feature-likha-jo, ai-product-photoshoot-ads:training:exact-template:l05-step-1-brief, ai-product-photoshoot-ads:training:exact-template:l05-step-2-hooks-script, ai-product-photoshoot-ads:training:lesson-summary:lesson-05-chat-g-p-t-se-ad-plan
