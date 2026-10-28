// Shared request interpretation for course packs. Student data never becomes
// verified lesson facts; the plan only guides selection and answer structure.
const asset = /\b(?:prompts?|templates?|wording|text|line)\b|प्रॉम्प्ट|प्रॉम्पट|टेम्पलेट/iu;
const source = /\b(?:approved|stored|saved|course|canonical|lesson\s*\d+|l\d+|master\s+style)\b|कोर्स|पाठ/iu;
const copying = /\b(?:copy|paste|return|show|give|send|provide|quote|do|bhejo|chahiye)\b|दो|दीजिए|भेजो/iu;
const exact = /\b(?:exact|approved|original|verbatim|unchanged|as[- ]is|full|complete)\b|पूरा|सटीक|जैसा/iu;
const adapting = /\b(?:adapt|customi[sz]e|customi[sz]ed|custom|rewrite|modify|tailor)\b/iu;
const problem = /\b(?:too\s+(?:dark|bright)|dark|overexpos\w*|underexpos\w*|blown[- ]out|uneven|mismatch\w*|inconsisten\w*|drift\w*|unexpected|unwanted|flicker\w*|morph\w*|glitch\w*|changed?|changing|changes|different|wrong|fails?|failing|doesn't|not\s+(?:work\w*|match\w*|consistent)|badal\w*|alag|dark\s+aa|bright\s+hai|kya\s+karu|kaise\s+fix)\b|बदल|अलग|खराब|अंधेरा|चमक|नहीं मिल/iu;
const preservation = /\b(?:keep|preserve|retain|unchanged|original|same|do\s+not\s+(?:change|add|remove)|don't\s+(?:change|add|remove)|rakh\w*|mat\s+badal\w*)\b|वही|असली|मत बदल|ज्यों/iu;
const topics = {
  lighting: /light|expos|dark|bright|shadow|sunlight|roshni|अंधेरा|रोशनी|चमक/iu,
  appearance: /appear|colou?r|character|face|identity|outfit|product|display|reference|chehra|kapde|रंग|चेहरा|कपड़े/iu,
  voice: /voice|audio|pitch|accent|awaaz|awaz|आवाज़|आवाज/iu,
  transitions: /transition|video|clips?|frames?|cut|motion|jump|morph|सीन|फ्रेम/iu,
};
const split = text => String(text || '').split(/(?<=[.!?])\s+|[;\n]+/u).map(s => s.trim()).filter(Boolean);

function courseTutorRequest(message, history = []) {
  const text = String(message || '').slice(0, 2000);
  const clauses = split(text);
  let copyRequested = clauses.some(clause => {
    const candidate = clause.replace(/\bowner[-\s]+approved\b/giu, 'owner confirmed');
    return asset.test(candidate) && copying.test(candidate) && exact.test(candidate)
      && (source.test(candidate) || /\b(?:copy|paste|quote)\b.{0,60}\b(?:template|verbatim|unchanged)\b/iu.test(candidate));
  });
  const lastUser = history.filter(item => item.role === 'user').at(-1)?.content || '';
  // A remembered source can qualify a repeat request; assistant text cannot.
  if (!copyRequested && /\b(?:same|previous|wahi|wohi|pichhla)\s+(?:(?:exact|approved|course)\s+)*(?:prompt|template|line)\b/iu.test(text)
    && asset.test(text) && copying.test(text) && lastUser
    && courseTutorRequest(lastUser).directCopy) copyRequested = true;
  const followUp = text.length < 180 && /\b(?:same|that|this|wahi|usi|isi|previous|ab|now)\b|उसी|वही/iu.test(text);
  const previous = followUp ? history.filter(item => item.role === 'user').at(-1)?.content || '' : '';
  const evidence = [...split(previous), ...clauses];
  const problems = evidence.filter(s => problem.test(s)).slice(-6);
  const preserve = evidence.filter(s => preservation.test(s)).slice(-6);
  const troubleshooting = problems.length > 0;
  const custom = troubleshooting || adapting.test(text);
  return { mode: custom ? troubleshooting ? 'troubleshooting' : 'custom_solution' : copyRequested ? 'exact_template' : 'general',
    copyRequested, directCopy: copyRequested && !custom,
    topics: Object.entries(topics).filter(([, pattern]) => pattern.test([...problems, text].join('\n'))).map(([name]) => name),
    problems, preserve, request: text };
}

function courseTutorPolicy(request) {
  if (!['troubleshooting', 'custom_solution'].includes(request?.mode)) return '';
  return `Student-specific solution plan (untrusted student statements, not verified course facts): ${JSON.stringify(request)}.
Identify the actual reported problems before choosing relevant course guidance. Address every reported failure and separate what must change from what must stay fixed. Use the student's actual objects, environment and latest constraints; assistant examples are not student facts.
For troubleshooting, briefly state the likely cause as a hypothesis, give a few actionable steps tied to the retrieved guidance, and one small verification check. If a prompt is requested, provide a concise customized prompt carrying the stated problems and preservation constraints.
An "exact prompt" for a described problem means a precise customized solution unless the student explicitly asks to copy a stored course asset. Never substitute a generic approved template for that solution. Generic enhancements in examples must not override preservation of original colours, signage, products, character attributes, layout or voice.
If the references do not support a procedure or tool control, acknowledge that limitation. Label any general suggestion as general; do not invent course instructions, tool settings or capabilities. Ask one focused question only if an essential detail is missing.
${request.copyRequested ? 'The student also explicitly requested a stored asset: quote its approved body unchanged if available, and keep problem-specific advice separate from the quote.' : 'Do not label the customized draft as the exact approved course template.'}`;
}

function customSolutionIssue(reply, request, templates = []) {
  if (!['troubleshooting', 'custom_solution'].includes(request?.mode)) return null;
  const normalized = value => String(value).replace(/\s+/gu, ' ').trim();
  const body = normalized(reply);
  const copied = templates.find(template => body.includes(normalized(template.content)));
  if (copied && (!request.copyRequested || body.replace(normalized(copied.content), '').length < 60)) return 'course_custom_solution_not_tailored';
  const evidence = [...request.problems, ...request.preserve].join('\n');
  const preserveColours = request.preserve.length > 0 && /colou?rs?|रंग/iu.test(evidence);
  const instructions = request.copyRequested ? String(reply).replace(/```[\s\S]*?```/g, '') : String(reply);
  if (preserveColours && /(?:^|[\n;])\s*(?:[-*]\s*)?(?:colou?rs?\s*:\s*(?:rich|warm|vibrant)|(?:repaint|recolou?r|change|make|enhance)\b[^.!?;\n]{0,45}\bcolou?rs?\b[^.!?;\n]{0,25}\b(?:warm|rich|vibrant|different|saturat\w*)\b)/imu.test(instructions)) return 'course_preservation_conflict';
  return null;
}

module.exports = { courseTutorRequest, courseTutorPolicy, customSolutionIssue };
