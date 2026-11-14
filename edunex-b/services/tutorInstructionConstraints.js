const {interpretation,cameraEvidence}=require('./tutorSemantics');
// Constraints come from learner turns, never from course examples or drafts.
const literal = s => String(s).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const {negatedAt,motionPattern,affirmativeUseAt,moveNames}=require('./tutorNegation');
const {cameraPlan,enforceCamera,inspectCamera}=require('./tutorCameraConstraints');
const {visualEvidence,inspectVisualEvidence}=require('./tutorVisualEvidence');

function instructionConstraints(message, history = []) {
  const turns = [...history.filter(t => t.role === 'user').map(t => t.content), message];
  const text = turns.join('\n');
  const onlyEdits = turns.filter(t => /(?:only|sirf|bas|केवल|सिर्फ)[^.!?\n]{0,120}(?:exposure|lighting|white balance|crop|composition)/iu.test(t)).at(-1) || '';
  const colourOnly = /exposure/iu.test(onlyEdits) && /white balance/iu.test(onlyEdits);
  const noCleanup = Boolean(onlyEdits) || /(?:cleanup|clean-up)[^.!?]{0,40}(?:hatao|remove|nahi)|(?:stains|wires)[^.!?]{0,50}(?:nahi|not|unchanged)/iu.test(text);
  const excludedWording = [];
  const wordingCorrections = [...message.matchAll(/replace\s+["“']([^"”']+)["”']\s+with\s+["“']([^"”']+)["”']/giu)].map(m=>({old:m[1],value:m[2]}));
  // Quoted replace/remove requests and ordinary Hinglish "X ki jagah Y" edits.
  for (const m of message.matchAll(/(?:replace|remove|drop|hatao)\s+["“]([^"”]+)["”]/giu)) if(!wordingCorrections.some(c=>c.old===m[1]))excludedWording.push(m[1]);
  const replacement = message.match(/(?:lekin|but)\s+([^.!?]+?)\s+(?:ki jagah|instead of)/iu);
  if (replacement) {
    const old = replacement[1].split(/\s+(?:aur|and)\s+/iu)[0].trim();
    const prior = history.filter(t => t.role === 'assistant').at(-1)?.content || '';
    if (old.length > 5 && prior.toLowerCase().includes(old.toLowerCase())) excludedWording.push(old);
  }
  const exactText = /exact|verbatim|bilkul|ज्यों|अक्षरशः/iu.test(message)
    ? [...message.matchAll(/["“]([^"”\n]+)["”]/gu)].map(m => m[1]).filter(s=>!wordingCorrections.some(c=>c.old===s)) : [];
  const forbiddenMoves=[];
  for(const move of moveNames) {
    let excluded=false;
    for(const turn of turns)for(const mention of turn.matchAll(motionPattern(move))){
      const clause=turn.slice(0,mention.index).split(/[.!?;।\n]/u).at(-1);
      if(/(?:scene|shot|clip|सीन|शॉट|क्लिप)\s*[0-9०-९]+/iu.test(clause))continue;
      if(interpretation(turn,mention.index,mention.index+mention[0].length).kind==='rejected')excluded=true;
      else if(affirmativeUseAt(turn,mention.index,mention.index+mention[0].length))excluded=false;
    }
    if(excluded)forbiddenMoves.push(move);
  }
  const visual=visualEvidence(message,history);
  const resolvedCamera=cameraPlan(message,history,forbiddenMoves,{usesSource:visual.hasRealAsset});
  if(forbiddenMoves.includes(resolvedCamera.requiredMove))resolvedCamera.requiredMove=null;
  return { onlyEdits, colourOnly, noCleanup, excludedWording, wordingCorrections, exactText, forbiddenMoves,
    visualEvidence:visual,cameraPlan:resolvedCamera };

}

function inspectInstructions(reply, constraints, {rewrite=true,protectedAssets=[],sourceRecords=[]}={}) {
  let answer = String(reply);
  const issues = [], edits = [];
  const change = (before, after, code) => {
    if (!before || before === after || !answer.includes(before)) return;
    if(rewrite){answer = answer.replace(before, after);edits.push({code, before, after});}
    issues.push({code, span:before, replacement:after, repaired:rewrite});
  };
  for(const {old,value} of constraints.wordingCorrections)for(const m of answer.matchAll(new RegExp(literal(old),'giu')))change(m[0],value,'wording_correction_applied');
  for(const word of constraints.excludedWording)for(const m of answer.matchAll(new RegExp(literal(word),'giu')))change(m[0],'','superseded_wording');
  const operations = [];
  if (constraints.noCleanup) operations.push(/\b(?:clean(?:ed|ing)?\s+(?:walls?|floors?|surfaces?)|(?:walls?|floors?|tables?)\s+(?:wiped\s+)?clean|chairs?[^,.;\n]{0,20}pushed\s+in(?: \(if any\))?|(?:remove|erase|hide|clear|retouch)[^.;\n]{0,45}(?:clutter|wires?|stains?|tools?|dirt)|(?:move|reposition|push)[^,.;\n]{0,20}(?:chairs?|tools?|furniture))\b/giu);
  if (constraints.colourOnly) operations.push(/\b(?:replace|change|add|simulate)[^.;\n]{0,45}(?:soft|warm|natural)\s+light(?:ing)?\b|\b(?:natural|add|create)\s+(?:shine|reflections?)(?:\s+on\s+surfaces)?\b|\b(?:fix the |(?:and )?the )?(?:stretched )?wide-angle(?: look| distortion)?|\bframe it at (?:normal )?eye level/giu);
  for (const line of answer.split('\n')) {
    for (const pattern of operations) for (const m of line.matchAll(pattern)) {
      if (!negatedAt(line,m.index,m.index+m[0].length)) change(m[0], '', 'prohibited_edit_removed');
    }
  }
  const plan=constraints.cameraPlan || {goal:null,requiredMove:null,scenes:{},sceneExclusions:{},excluded:constraints.forbiddenMoves || [],sourceOnly:false};
  const view=cameraEvidence(answer);
  const camera=rewrite?enforceCamera(view.text,plan):{answer:view.text,issues:inspectCamera(view.text,plan).issues,edits:[]};
  answer=view.restore(camera.answer);issues.push(...camera.issues);edits.push(...camera.edits);
  const visual=inspectVisualEvidence(answer,constraints.visualEvidence || {hasRealAsset:false},{rewrite,protectedAssets,sourceRecords});
  answer=visual.answer;issues.push(...visual.issues);edits.push(...visual.edits);
  if(rewrite){
    const remaining=inspectInstructions(answer,constraints,{rewrite:false,protectedAssets,sourceRecords}).issues;
    for(const issue of issues)if(!remaining.some(i=>i.code===issue.code && (!i.span || i.span===issue.span)))issue.repaired=true;
    issues.push(...remaining.filter(i=>!issues.some(x=>x.code===i.code&&x.span===i.span&&!x.repaired)));
  }
  for (const text of constraints.exactText) if (!answer.includes(text)) issues.push({code:'required_verbatim_text_missing',span:text,repaired:false,detail:'Restore this exact learner-supplied text in the requested deliverable.'});
  if(rewrite && edits.some(e=>e.code==='prohibited_edit_removed')) answer = answer.replace(/(?:,\s*){2,}/gu, ', ').replace(/,\s*\./gu, '.')
    .replace(/^\s*[-*]\s*\*\*(?:Clean-up|Cleanup|Quality):\*\*\s*[,.;\s]*(?:\(if any\))?[,.;\s]*$/gmu,'');
  if(rewrite && constraints.excludedWording.length)answer=answer.replace(/,\s*[–—]/gu,' —');
  return {answer,issues,edits};
}

module.exports = {instructionConstraints, inspectInstructions};
