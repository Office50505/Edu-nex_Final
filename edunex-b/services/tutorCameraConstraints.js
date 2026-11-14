// One learner-owned camera plan, shared by prose, clip prompts and edit notes.
// No course examples or assistant history can select a learner's camera move.
const {moveNames,motionPattern,negatedAt,affirmativeUseAt}=require('./tutorNegation');
const {cameraEvidence}=require('./tutorSemantics');
const viewpointMoves=['arc','orbit','truck-left','truck-right','crane-up','crane-down'];
const digits=s=>s.replace(/[०-९]/gu,d=>'०१२३४५६७८९'.indexOf(d));
const positive=(text,move)=>[...text.matchAll(motionPattern(move))].filter(m=>!negatedAt(text,m.index,m.index+m[0].length));
const detailToWide=s=>/close[- ]up[^.!?\n]{0,100}(?:full|whole|entire|wide|poora|पूरा)/iu.test(s);
const wideToDetail=s=>/\b(?:wide|full|whole)\b[^.!?\n]{0,80}(?:to|se)[^.!?\n]{0,35}close[- ]up/iu.test(s);

function cameraPlan(message,history=[],forbiddenMoves=[],{usesSource=false}={}) {
  const turns=[...history.filter(t=>t.role==='user').map(t=>t.content),message];
  let goal=null,requiredMove=null;const scenes={},sceneExclusions={};
  for(const turn of turns){
    if(detailToWide(turn))goal='detail-to-wide';else if(wideToDetail(turn))goal='wide-to-detail';
    for(const match of turn.matchAll(/[^.!?;।\n]+[.!?;।]?/gu)){
      const part=match[0];
      const scene=digits(part).match(/(?:scene|shot|clip|सीन|शॉट|क्लिप)\s*(\d+)/iu)?.[1];
      if(scene)for(const move of moveNames)for(const m of part.matchAll(motionPattern(move))){
        if(negatedAt(part,m.index,m.index+m[0].length))sceneExclusions[scene]=[...new Set([...(sceneExclusions[scene] || []),move])];
      }
      for(const move of moveNames.filter(m=>!['new-angle','zoom'].includes(m)))for(const m of positive(part,move)){
        const prefix=part.slice(0,m.index),suffix=part.slice(m.index+m[0].length);
        const selected=affirmativeUseAt(part,m.index,m.index+m[0].length)
          || /\b(?:only|sirf|bas)\b[^.!?;]{0,45}$/iu.test(prefix)
          || /^\s*(?:kare|karo|chahiye)/iu.test(suffix)
          || (scene && /^\s*(?:[:—-]\s*)?$/u.test(prefix.slice(prefix.indexOf(scene)+scene.length)));
        if(selected && !part.includes('?')){if(scene)scenes[scene]=move;else requiredMove=move;}
      }
    }
  }
  return {goal,requiredMove,scenes,sceneExclusions,excluded:expand(forbiddenMoves),sourceOnly:forbiddenMoves.includes('new-angle'),usesSource};
}
function expand(moves){
  const excluded=new Set(moves);
  if(excluded.has('new-angle'))for(const move of viewpointMoves)excluded.add(move);
  if(excluded.has('arc') || excluded.has('orbit')){excluded.add('arc');excluded.add('orbit');}
  if(excluded.has('zoom')){excluded.add('zoom-in');excluded.add('zoom-out');}
  return [...excluded];
}
const exclusions=(plan,scene)=>expand([...plan.excluded,...(plan.sceneExclusions[scene] || [])]);

function clipHeading(line){
  const match=digits(line).match(/^\s*(?:#{1,4}\s*)?(?:\d+[.)]\s*)?(?:\*{1,2})?(?:scene|shot|clip|सीन|शॉट|क्लिप)\s*(\d+)\b/iu);
  if(!match)return null;
  const rest=line.slice(match[0].length);
  if(/\b(?:join|jodo|import|rakho)\b/iu.test(rest) && /\b(?:clip|shot)\b/iu.test(rest))return null;
  return match[1];
}
const tableHeader=line=>/^\s*\|[^|]*(?:scene|shot|clip|सीन|शॉट|क्लिप)[^|]*\|/iu.test(line);
const tableRow=(line,active)=>active?digits(line).match(/^\s*\|\s*(?:(?:scene|shot|clip|सीन|शॉट|क्लिप)\s*)?(\d+)\s*\|/iu)?.[1]:null;
const editHeading=line=>/^\s*(?:\*\*|#{1,4})?(?:Editing|Edit Notes|CapCut|एडिटिंग)/iu.test(line);
function scopedMoves(answer,plan){
  const result={},original={};let current=null,table=false;
  for(const line of answer.split('\n')){
    if(tableHeader(line))table=true;else if(line.trim()&&!/^\s*\|/u.test(line))table=false;
    const scene=clipHeading(line)||tableRow(line,table);if(scene){current=scene;original[scene]=line;}
    else if(editHeading(line))current=null;
    if(!current)continue;
    if(plan.scenes[current])result[current]=plan.scenes[current];
    else if(plan.requiredMove)result[current]=plan.requiredMove;
    else if(!result[current] && plan.goal==='detail-to-wide' && (current==='1' || /reveal|रिवील/iu.test(line)))result[current]='pull-out';
    else if(!result[current] && plan.goal==='wide-to-detail' && current==='1')result[current]='push-in';
    if(!result[current] && exclusions(plan,current).some(move=>positive(line,move).length))result[current]='static hold';
  }
  return {resolved:result,original};
}

function lineScope(line,current,editing,scopes){
  const numbered=digits(line).match(/(?:scene|shot|clip|सीन|शॉट|क्लिप)\s*(\d+)/iu)?.[1];
  if(numbered)return numbered;
  if(editing){
    if(/\b(?:first|pehle|pehla)\b|पहले/iu.test(line))return '1';
    if(/\b(?:second|doosr[ai]|dusra)\b|दूसर/iu.test(line))return '2';
    const matches=Object.entries(scopes.original).filter(([,heading])=>moveNames.some(move=>positive(heading,move).length && positive(line,move).length));
    return matches.length===1?matches[0][0]:null;
  }
  return current;
}
const fullReveal=s=>/(?:full|whole|entire|poora|poore|पूरा)[^.!?;\n]{0,60}(?:reveal|dikha)|(?:reveal|dikha)[^.!?;\n]{0,35}(?:full|whole|entire|poora)/iu.test(s);
// Geometry is an invariant of a described transition, not a learner preference
// inferred from the draft. Inspection and correction use the same decision.
function requiredDirection(line,selected,plan){
  if(selected)return selected;
  if((plan.goal==='detail-to-wide' || detailToWide(line)) && fullReveal(line))return 'pull-out';
  if(wideToDetail(line))return 'push-in';
  return null;
}
const timing=s=>s.match(/\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:seconds?|secs?)\b/iu)?.[0];
function directionSentence(move,sentence,sourceOnly,usesSource){
  const duration=timing(sentence),time=duration?` for ${duration}`:'';
  if(move==='static hold')return ` Keep this shot as a static hold${time}${usesSource?' of the supplied image':''}; preserve the established viewpoint, object positions, geometry and text.`;
  if(move==='pull-out' && sourceOnly)return ` Only if a supplied photo covers the required view, use an editorial crop-to-full-frame pull-out${time} inside that photo's original edges; otherwise keep the reveal partial and request the needed reference.`;
  if(move==='pan')return ` Keep the camera fixed in one position and rotate horizontally${time}; stay within the available source view, with NO translation, NO push-in, NO zoom.`;
  return ` Use ${move}${time}; preserve all source details and stay within the available reference coverage.`;
}

const editParts=(line,editing)=>editing?(line.match(/[^.!?;\n]+[.!?;]?/gu) || [line]).flatMap(s=>s.split(/(?=\b(?:then|phir|second|doosra|uske baad)\b)/iu)):[line];

function inspectCamera(answer,plan){
  const view=cameraEvidence(answer);answer=view.text;
  const issues=[];
  const scopes=scopedMoves(answer,plan);let current=null,editing=false,table=false;
  for(const line of answer.split('\n')){
    if(tableHeader(line))table=true;else if(line.trim()&&!/^\s*\|/u.test(line))table=false;
    const scene=clipHeading(line)||tableRow(line,table);if(scene){current=scene;editing=false;}if(editHeading(line)){current=null;editing=true;}
    const pieces=editParts(line,editing);
    for(const line of pieces){
    const scope=lineScope(line,current,editing,scopes),required=requiredDirection(line,scopes.resolved[scope] || plan.requiredMove,plan);
    for(const move of exclusions(plan,scope))if(positive(line,move).length)issues.push({code:'excluded_camera_move',span:line,repaired:false,detail:`${move} is excluded in every applicable heading, prompt and editing note.`});
    if(required){
      const alternatives=required==='pull-out'?['push-in','zoom-in']:required==='push-in'?['pull-out','zoom-out']:required==='pan'?['arc','orbit','push-in','pull-out','zoom-in','zoom-out']:required==='static hold'?moveNames.filter(m=>!['static hold','new-angle'].includes(m)):[];
      for(const move of alternatives)if(positive(line,move).length)issues.push({code:'camera_direction_conflict',span:line,repaired:false,detail:`This reference belongs to ${scope?'clip '+scope:'the task'}; its selected move is ${required}.`});
    }
    }
  }
  return {issues:issues.map(i=>({...i,span:view.restore(i.span)})),scopes};
}

function enforceCamera(reply,plan){
  const original=String(reply),scopes=scopedMoves(original,plan);let current=null,editing=false,table=false;
  const issues=[],edits=[];
  const lines=original.split('\n').map(line=>{
    if(tableHeader(line))table=true;else if(line.trim()&&!/^\s*\|/u.test(line))table=false;
    const scene=clipHeading(line)||tableRow(line,table);if(scene){current=scene;editing=false;}if(editHeading(line)){current=null;editing=true;}
    return editParts(line,editing).map(line=>{
    const scope=lineScope(line,current,editing,scopes);
    const selected=scopes.resolved[scope] || plan.requiredMove;
    let required=requiredDirection(line,selected,plan);
    const geometric=!selected && !plan.goal && required;
    const heading=Boolean(scene);
    const bad=new Set(exclusions(plan,scope));
    if(required==='pull-out'){bad.add('push-in');bad.add('zoom-in');}
    if(required==='push-in'){bad.add('pull-out');bad.add('zoom-out');}
    if(required==='pan')for(const m of ['arc','orbit','push-in','pull-out','zoom-in','zoom-out'])bad.add(m);
    if(required==='static hold')for(const m of moveNames.filter(m=>!['static hold','new-angle'].includes(m)))bad.add(m);
    if(!required && plan.goal==='detail-to-wide' && /close[- ]up|reveal|dikha/iu.test(line)){required='pull-out';bad.add('push-in');}
    let changed=line;
    // Camera prose can explain an incorrect draft; do not preserve an incorrect
    // judgment about the chosen direction as if it were an instruction.
    if(plan.goal==='detail-to-wide')changed=changed.replace(/[^.!?\n]*pull[- ]out[^.!?\n]*(?:effective nahi|not effective|wrong|galat)[^.!?\n]*[.]?/giu,
      ' Pull-out is the correct detail-to-wide direction; use a crop-to-full-frame edit within a supplied full-view photo, otherwise keep the reveal partial.');
    const positiveBad=[...bad].filter(move=>positive(changed,move).length);
    if(positiveBad.length){
      const replacement=required || 'static hold';
      if(heading || editing || geometric || (!plan.sourceOnly && !positiveBad.some(move=>exclusions(plan,scope).includes(move)))){
        for(const move of positiveBad)changed=changed.replace(motionPattern(move),(m,index)=>negatedAt(changed,index,index+m.length)?m:editing&&move==='new-angle'?'original source viewpoint':replacement);
        if(editing && plan.sourceOnly && /alag\s+angle|different\s+angle/iu.test(changed))changed=changed.replace(/jo[^.!?]*alag\s+angle[^.!?]*|(?:from |at )?a?\s*different\s+angle[^.!?]*/giu,'with the original source viewpoint and unchanged object positions');
      }else changed=changed.replace(/[^.!?;\n]+[.!?;]?/gu,sentence=>{
        if(!positiveBad.some(move=>positive(sentence,move).length))return sentence;
        if(/\b(?:sahi|correct|right)\b/iu.test(sentence) && !/\b(?:make|generate|perform)\b/iu.test(sentence)){
          let fixed=sentence;for(const move of positiveBad)fixed=fixed.replace(motionPattern(move),(m,index)=>negatedAt(fixed,index,index+m.length)?m:replacement);return fixed;
        }
        return directionSentence(replacement,sentence,plan.sourceOnly,plan.usesSource);
      });
    }
    // A source-only shot may use either supplied photo, not an assumed second
    // wide/alternate view. Express the selection as a condition, not an asset.
    if(plan.sourceOnly && /Source Photo|Source Image/iu.test(changed) && /poore|poora|full|whole|alag view|different view/iu.test(changed))changed=changed.replace(/\([^()]*\)/gu,"(use only its actual visible coverage; if a full view is absent, retain a partial shot and request the missing reference)");
    if(changed!==line){edits.push({code:'camera_plan_applied',before:line,after:changed});issues.push({code:positiveBad.some(m=>exclusions(plan,scope).includes(m))?'excluded_camera_move':'camera_consistency_corrected',span:line,replacement:changed,repaired:true});}
    return changed;
    }).join('');
  });
  const answer=lines.join('\n'),remaining=inspectCamera(answer,plan).issues;
  return {answer,issues:[...issues,...remaining],edits,plan};
}

module.exports={cameraPlan,enforceCamera,inspectCamera};
