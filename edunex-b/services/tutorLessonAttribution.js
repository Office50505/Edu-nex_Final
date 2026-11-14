const norm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
const stop = new Set('the and for with from this that same course lesson mein ki ka ke hai ko aur aap har use karo kar se to in of ai'.split(' '));
const words = s => norm(s).split(' ').filter(w => !stop.has(w) && (w.length > 2 || /^\d+$/u.test(w)));
const pairs = s => { const w=words(s); return new Set(w.slice(1).map((x,i)=>w[i]+' '+x)); };

function verifiedLessons(course, records = []) {
  const lessons=(course.videos || []).map((v,i) => {
    const number = Number(v.order || i+1), id=String(v._id || v.id);
    const own = records.filter(r => String(r.lessonId || '') === id || Number(r.lessonNumber) === number);
    return {number,id,title:v.title,aliases:[v.title,...own.map(r=>r.heading).filter(Boolean)],
      // Keep supporting text local to validation; it is not a new knowledge pack.
      evidence:own.filter(r=>r.contentType !== 'exact-template').map(r=>r.content).join('\n')};
  });
  return lessons.filter(v=>Number.isInteger(v.number) && v.number>0 && v.id!=='undefined' && v.title
    && lessons.filter(x=>x.number===v.number).length===1);
}

function groundLessonAttributions(reply, knowledge) {
  let answer=String(reply); const edits=[],issues=[];
  const assets=[];
  for(const r of [...(knowledge.records||[]),...require('./courseTutorRequest').exactTemplates(knowledge)])if(r.contentType==='exact-template'&&r.content&&answer.includes(r.content)){
    const marker='\uE300EXACT_'+assets.length+'\uE301';assets.push([marker,r.content]);answer=answer.split(r.content).join(marker);
  }
  const courses=knowledge.unifiedAccess.courses;
  const owners = text => courses.filter(c=>norm(text).includes(norm(c.title.replace(/\s+course$/iu,''))))
    .sort((a,b)=>norm(text).lastIndexOf(norm(a.title.replace(/\s+course$/iu,'')))-norm(text).lastIndexOf(norm(b.title.replace(/\s+course$/iu,''))));
  // Bind the grammatical owner on either side of the citation. In particular,
  // "Lesson 4 of **Course Name**" names its owner after the lesson number.
  // Do not borrow a course from a later sentence or an unrelated citation.
  const followingOwner = end => {
    const tail=answer.slice(end).replace(/\*\*/gu,'');
    const direct=tail.match(/^\s+(?:of|from|in)\s+([^\n;()]+)/iu);
    // Grounding inserts a verified title between the number and owner. The
    // next validation pass must still recognize that same grammatical owner.
    const titled=tail.match(/^\s*:\s*([^\n;().]+?)\s+(?:of|from|in)\s+([^\n;()]+)/iu);
    const relation=direct || (titled && [titled[0],titled[2]]);
    if(!relation)return null;
    const candidates=courses.filter(c=>{
      const name=norm(c.title.replace(/\s+course$/iu,'')),text=norm(relation[1]);
      if(!(text===name || text.startsWith(name+' ')))return false;
      if(direct)return true;
      const lessons=knowledge.lessonAttributions?.[String(c._id)] || verifiedLessons(c,
        (knowledge.records||[]).filter(r=>r.courseId===String(c._id)));
      return lessons.some(v=>v.aliases.some(a=>norm(a).replace(/^lesson \d+ /u,'')===norm(titled[1])));
    });
    return candidates.length===1?candidates[0]:null;
  };
  // Recover this validator's old lossy substitution only when the current
  // retrieved transcripts establish one unambiguous lesson for that owner.
  answer=answer.replace(/precise lesson attribution unverified/gu,(match,index)=>{
    const owner=followingOwner(index+match.length) || owners(answer.slice(answer.lastIndexOf('\n',index)+1,index)).at(-1);
    const records=(knowledge.records||[]).filter(r=>r.sourceType==='transcript'&&r.courseId===String(owner?._id));
    const lessons=[...new Map(records.map(r=>[r.lessonId,r])).values()];
    if(lessons.length!==1)return match;
    const r=lessons[0];edits.push({code:'verified_transcript_lesson_restored',before:match,after:`Lesson ${r.lessonNumber}: ${r.lessonName}`});
    return `Lesson ${r.lessonNumber}: ${r.lessonName}`;
  });
  const attributions = [...answer.matchAll(/(?:Lesson|पाठ)\s*0?(\d+)/giu)];
  // Work backwards so positions remain valid after a replacement.
  for (const m of attributions.reverse()) {
    const lineStart=answer.lastIndexOf('\n',m.index)+1;
    const prefix=answer.slice(lineStart,m.index).replace(/\*\*/gu,'');
    let owner=followingOwner(m.index+m[0].length) || owners(prefix).at(-1);
    if (!owner) {
      const section=answer.slice(Math.max(0,m.index-650),m.index);
      const headings=[...section.matchAll(/(?:^|\n)[^\n]*(?:\*\*|#{1,4})[^\n]*/gu)];
      const candidates=owners(headings.at(-1)?.[0] || '');
      if(candidates.length===1)owner=candidates[0];
    }
    const replace = (value,code) => {if(value===m[0])return;answer=answer.slice(0,m.index)+value+answer.slice(m.index+m[0].length);edits.push({code,before:m[0],after:value});};
    if (!owner) {
      replace('precise lesson attribution unverified','unverified_lesson_attribution_removed');
      issues.push({code:'unverified_lesson_attribution',repaired:true}); continue;
    }
    const lessons=knowledge.lessonAttributions?.[String(owner._id)] || verifiedLessons(owner,
      (knowledge.records || []).filter(r=>r.courseId===String(owner._id)));
    let lesson=lessons.find(v=>v.number===Number(m[1]));
    const suffix=answer.slice(m.index+m[0].length);
    const round=suffix.match(/^\s*\(([^()\n]+)\)/u);
    const colon=suffix.match(/^\s*:\s*([^\n;()&*]+?)(?=\s+mein\b|[.\n;()&*]|$)/iu);
    let titleText=round?.[1] || colon?.[1] || '';
    const literal=s=>s.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
    const titlePrefix=colon && lessons.flatMap(v=>v.aliases).map(a=>norm(a).replace(/^lesson \d+ /u,''))
      .filter(a=>a.length>8).sort((a,b)=>b.length-a.length)
      .map(a=>titleText.match(new RegExp('^'+a.split(' ').map(literal).join('[\\s\\p{P}]+')+'(?=$|[\\s\\p{P}])','iu'))).find(Boolean);
    if(titlePrefix)titleText=titlePrefix[0];
    const suppliedTitle=norm(titleText);
    // Consume only the attribution title, never the rest of a learner answer
    // or the next course's citation in a compound parenthesis.
    if(round)m[0]+=round[0];
    else if(titlePrefix)m[0]+=colon[0].slice(0,colon[0].indexOf(colon[1]))+titleText;
    // A title is independent evidence of identity; an existing number alone
    // must not override an unambiguous title belonging to another lesson.
    const named=lessons.filter(v=>v.aliases.some(a=>{
      const title=norm(a).replace(/^lesson \d+ /u,'');
      return title.length>8 && (suppliedTitle===title || suppliedTitle.startsWith(title+' '));
    }));
    if(named.length===1)lesson=named[0];
    const context=answer.slice(Math.max(lineStart,m.index-270),m.index);
    const topic=lessons.filter(v=>norm(v.title).length>8 && norm(v.title)!==norm(owner.title) && norm(context).includes(norm(v.title)));
    if(!suppliedTitle && topic.length===1)lesson=topic[0];
    // Detect a valid title attached to the wrong procedure. Require multiple
    // distinctive phrases from one verified lesson, never a single keyword.
    const observed=pairs(context), signatures=lessons.map(v=>pairs(v.evidence));
    const numericPairs=signatures.map(sig=>[...sig].filter(p=>observed.has(p) && /\d/u.test(p) && signatures.filter(s=>s.has(p)).length===1).length);
    const numericWinner=numericPairs.findIndex(n=>n>=2 && numericPairs.filter(x=>x>=2).length===1);
    if(numericWinner>=0)lesson=lessons[numericWinner];
    if (!lesson || (!suppliedTitle && !topic.length && numericWinner<0 && !lesson.evidence)) {
      replace('precise lesson attribution unverified','unverified_lesson_attribution_removed');
      issues.push({code:'unverified_lesson_attribution',repaired:true}); continue;
    }
    // If the supplied title conflicts and cannot be resolved uniquely, remove
    // the assertion rather than decorating the wrong number with a true title.
    if(suppliedTitle && !named.length && !lesson.aliases.some(a=>words(a).filter(w=>words(suppliedTitle).includes(w)).length>=2)) {
      replace('precise lesson attribution unverified','unverified_lesson_attribution_removed');
      issues.push({code:'unverified_lesson_attribution',repaired:true}); continue;
    }
    replace(`Lesson ${lesson.number}: ${lesson.title}`,'lesson_identity_grounded');
  }
  for(const [marker,content]of assets)answer=answer.split(marker).join(content);
  return {answer,issues,edits};
}

module.exports={verifiedLessons,groundLessonAttributions};
