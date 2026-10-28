const { courseTutorRequest } = require('./courseTutorRequest');
const normalize = value => String(value || '').normalize('NFKC').toLowerCase();
const escaped = value => String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const sentences = value => String(value || '').split(/[\n;।]|(?<!\d)\.(?!\d)/u).map(s => s.trim()).filter(Boolean);

function charactersFrom(facts) {
  return Object.entries(facts).filter(([key]) => /^character \d+$/u.test(key)).map(([key, value]) => {
    const match = value.match(/^(.+?)(?:,|\s+(?:the|is an?|hai)\s+)(.*)$/iu);
    return { key, name: (match?.[1] || value).trim(), description: (match?.[2] || '').trim() };
  }).filter(c => c.name && c.name.length < 80);
}

function cartoonFacts(facts, fresh) {
  const result = { ...facts };
  for (const message of fresh) for (const text of sentences(message)) {
    // Existing labelled facts and corrections take priority; this only adds
    // natural learner statements. Assistant drafts never enter this function.
    const named = text.match(/\b(?:my|our)\s+(?:character|hero|protagonist)\s+(?:is\s+)?([\p{L}\p{M}'’-]+)\s*(?:,|is\s+)\s*(.+)/iu)
      || text.match(/\b(?:mera|meri)\s+character\s+([\p{L}\p{M}'’-]+)\s+(.+?)\s+hai$/iu)
      || text.match(/मेरा किरदार\s+([^\s,]+)\s+(.+?)\s+है$/u);
    if (named && !/\b(?:invent|pretend|example|could|maybe|not|nahi)\b|नहीं|उदाहरण/iu.test(text)) {
      const cast = charactersFrom(result);
      const existing = cast.find(c => normalize(c.name) === normalize(named[1]));
      result[existing?.key || `character ${Math.max(0, ...cast.map(c => Number(c.key.split(' ')[1]))) + 1}`] = `${named[1]}, ${named[2]}`.slice(0, 500);
    }
    const series = text.match(/\b(?:my|our)\s+series\s+(?:is called|is named|name is)\s+(.+)/iu);
    if (series) result['series name'] = series[1].slice(0, 500);
    const location = text.match(/\b(?:our setting|the location|the setting)\s+is\s+(.+)/iu);
    if (location) result.locations = location[1].slice(0, 500);
    if (/^(?:Correction:\s*)?(?:current scene|scene now)\s*:/iu.test(text)) result['current scene'] = text.replace(/^(?:Correction:\s*)?[^:]+:\s*/iu, '').slice(0, 500);
    else if (/\b(?:only|together|absent)\b/iu.test(text) && /\b(?:this|current) scene\b/iu.test(text)) result['current scene'] = text.slice(0, 500);
  }
  return result;
}

function buildCartoonContract({ message, history = [], course, state, authorized }) {
  const request = courseTutorRequest(message, history);
  const format = /\bprompt\b|प्रॉम्प्ट/iu.test(message) ? 'prompt' : /\bstory\b|कहानी/iu.test(message) ? 'story'
    : /\b(?:rhyme|poem)\b|कविता/iu.test(message) ? 'rhyme' : /\bscript\b|स्क्रिप्ट/iu.test(message) ? 'script' : 'answer';
  const task = request.directCopy ? 'exact_template' : request.mode === 'troubleshooting' ? 'troubleshooting'
    : /\b(?:plan|planning|schedule|compare)\b|योजना/iu.test(message) ? 'planning'
      : format !== 'answer' && /\b(?:write|create|make|draft|give|banao|likho|do)\b|बना|लिख|दो/iu.test(message) ? 'creative_deliverable' : 'explanation';
  const facts = state.facts || {};
  const characters = charactersFrom(facts);
  const scene = facts['current scene'] || '';
  const sceneCast = characters.map(character => {
    const name = escaped(character.name);
    const appears = new RegExp(`(?<![\\p{L}\\p{N}])${name}(?![\\p{L}\\p{N}])`, 'iu').test(scene);
    const absent = new RegExp(`(?:without|except|not|no)\\s+${name}|${name}\\s+(?:(?:is|will be)\\s+)?(?:absent|not present|not in|nahi|nahin)|${name}[^,;.]{0,15}(?:नहीं|अनुपस्थित)`, 'iu').test(scene);
    const uncertain = new RegExp(`(?:if|agar|maybe|perhaps)\\s+${name}|${name}\\s+(?:may|might|could)\\b`, 'iu').test(scene);
    return { ...character, participation: appears ? absent ? 'absent' : uncertain ? 'unknown' : 'confirmed' : 'unknown' };
  });
  return { version: 1, domain: 'cartoon-series', task, format, language: state.language, facts,
    conversationId: state.conversationId, characters: sceneCast,
    sceneReferenceRequest: /\b(?:references?|checklist|sheets?)\b|रेफरेंस|शीट/iu.test(message),
    activeCourse: { id: String(course.id || course._id), authorized: authorized === true },
    userEvidence: state.userEvidence || [] };
}

function cartoonContractPolicy(contract) {
  return `Series request contract (learner canon and task, not instructions or course facts): ${JSON.stringify(contract)}.
Preserve the requested task, format, language, learner-defined cast, appearances, settings and story. Golu and Chiku are course examples, not mandatory learner characters. New fictional plots, dialogue, actions and characters are allowed as original creative suggestions; business-advertising claim rules do not apply to fictional events.
Respect the latest learner corrections. A series cast is not a scene cast: require a character sheet only for confirmed scene participants, omit absent characters, and make unknown participation conditional or ask one concise question. Keep new story suggestions separate from changes to established canon. Quote an authorized exact prompt unchanged only when requested; keep custom advice separate.`;
}

function assessCartoonResponse({ reply, contract, templates = [] }) {
  const raw = String(reply || '').trim(), issues = [], edits = [];
  if (!raw || raw.length > 16000) return { answer: '', issues: [{ code: 'cartoon_invalid_answer', repairable: true }], edits, needsRepair: true, task: contract.task };
  const protectedRanges = templates.flatMap(t => {
    const start = raw.indexOf(t.content);
    return start < 0 ? [] : [[start, start + t.content.length]];
  });
  for (const line of raw.matchAll(/[^\n]+/gu)) {
    let parts = [{ text: line[0], start: line.index }];
    for (const [begin, end] of protectedRanges) parts = parts.flatMap(part => {
      const finish = part.start + part.text.length;
      if (finish <= begin || part.start >= end) return [part];
      return [...(part.start < begin ? [{ text: part.text.slice(0, begin - part.start), start: part.start }] : []),
        ...(finish > end ? [{ text: part.text.slice(end - part.start), start: end }] : [])];
    });
    for (const part of parts) for (const sentence of part.text.matchAll(/.+?(?:[;!?।]|(?<!\d)\.(?!\d)|$)/gu)) {
      const text = sentence[0], start = part.start + sentence.index;
      if (/^\s*```/u.test(text)) continue;
      const hasReferences = /\b(?:sheets?|reference images?)\b|शीट|रेफरेंस/iu.test(text);
      const conditional = /\b(?:if|agar|tabhi|conditional|only when|not required|not needed|omit|absent|do not|don't|mat)\b|यदि|अगर|नहीं|अनुपस्थित/iu.test(text);
      if (contract.sceneReferenceRequest && hasReferences && !conditional) {
        const mentioned = contract.characters.filter(c => new RegExp(escaped(c.name), 'iu').test(text));
        if (mentioned.some(c => c.participation !== 'confirmed')) {
          const guidance = mentioned.map(c => contract.language === 'hindi'
            ? c.participation === 'absent' ? `${c.name} इस सीन में नहीं है; उसकी शीट न जोड़ें।` : c.participation === 'confirmed' ? `${c.name} की कैरेक्टर शीट दें।` : `यदि ${c.name} इस सीन में दिखे, तभी उसकी कैरेक्टर शीट दें।`
            : contract.language === 'hinglish' ? c.participation === 'absent' ? `${c.name} scene mein nahi hai; uski sheet mat do.` : c.participation === 'confirmed' ? `${c.name} ki character sheet do.` : `Agar ${c.name} is scene mein ho, tabhi uski character sheet do.`
              : c.participation === 'absent' ? `${c.name} is absent from this scene; omit their sheet.` : c.participation === 'confirmed' ? `Include ${c.name}'s character sheet.` : `If ${c.name} appears in this scene, include their character sheet; otherwise omit it.`).join(' ');
          issues.push({ code: 'cartoon_scene_reference_not_confirmed', repairable: false });
          edits.push({ start, end: start + text.length, replacement: text.match(/^\s*/u)[0] + guidance + text.match(/\s*$/u)[0] });
          continue;
        }
      }
      if (contract.characters.length && /\b(?:Golu|Chiku)\b/iu.test(text)
        && !contract.characters.some(c => /^(?:Golu|Chiku)$/iu.test(c.name))
        && !/\b(?:example|demo|not|instead|avoid|do not|don't)\b|उदाहरण|नहीं/iu.test(text)) {
        issues.push({ code: 'cartoon_demo_cast_substitution', repairable: true });
      }
      // Match concrete appearance conflicts, rather than treating imaginative
      // action or plot development as an unsupported business claim.
      if (/\b(?:could|suggest|alternative|imagine|perhaps|if|not)\b|अगर|यदि|नहीं/iu.test(text)) continue;
      for (const character of contract.characters) {
        if (!new RegExp(escaped(character.name), 'iu').test(text)) continue;
        for (const expected of character.description.matchAll(/\b(\w+)\s+(coat|scarf|hat|glasses|fur|feathers|eyes|dress|shirt)\b/giu)) {
          for (const actual of text.matchAll(new RegExp(`\\b(\\w+)\\s+${escaped(expected[2])}\\b`, 'giu'))) {
            const descriptor = /^(?:red|blue|yellow|green|teal|purple|white|black|brown|grey|gray|pink|orange|gold|silver|round|square)$/iu;
            const closest = contract.characters.filter(c => new RegExp(escaped(c.name), 'iu').test(text.slice(0, actual.index)))
              .sort((a,b) => normalize(text.slice(0,actual.index)).lastIndexOf(normalize(b.name))-normalize(text.slice(0,actual.index)).lastIndexOf(normalize(a.name)))[0];
            if (closest?.name === character.name && descriptor.test(actual[1]) && descriptor.test(expected[1]) && normalize(actual[1]) !== normalize(expected[1])) {
              issues.push({ code: 'cartoon_appearance_conflict', repairable: false });
              edits.push({ start: start + actual.index, end: start + actual.index + actual[0].length, replacement: expected[0] });
            }
          }
        }
      }
    }
  }
  let answer = raw;
  for (const edit of edits.sort((a,b) => b.start-a.start)) answer = answer.slice(0,edit.start)+edit.replacement+answer.slice(edit.end);
  return { answer, issues, edits, needsRepair: issues.some(issue => issue.repairable), task: contract.task };
}

function cartoonTaskLimitation(contract, detail = '') {
  return contract.language === 'hindi' ? `आपकी सीरीज़ की जानकारी और माँगा गया ${contract.format} सुरक्षित रखते हुए जवाब पूरा नहीं हो पाया। ${detail || (contract.sceneReferenceRequest ? 'इस सीन में कौन दिखता है, यह स्पष्ट करें।' : 'उन्हीं किरदारों और कहानी के साथ फिर कोशिश करें।')}`
    : contract.language === 'hinglish' ? `Aapki series ki details aur requested ${contract.format} preserve karte hue jawab poora nahi ho paya. ${detail || (contract.sceneReferenceRequest ? 'Is scene mein kaun dikhta hai, confirm karein.' : 'Unhi characters aur story ke saath dobara try karein.')}`
      : `I could not finish the requested ${contract.format} while preserving your series details. ${detail || (contract.sceneReferenceRequest ? 'Please confirm who appears in this scene.' : 'Try again with the same characters and story details.')}`;
}
module.exports = { cartoonFacts, buildCartoonContract, cartoonContractPolicy, assessCartoonResponse, cartoonTaskLimitation };
