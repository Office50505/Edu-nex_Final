const express = require('express');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Course = require('../models/Course');
const AiTutorSession = require('../models/AiTutorSession');
const AiResponseReport = require('../models/AiResponseReport');
const { tutorUnavailable } = require('../services/tutorAvailability');
const { requireCompatibleAuth } = require('../middleware/compatAuth');
const {
  FAL_API_KEY,
  compactText,
  sanitizeHistory,
  buildContext,
  loadLearnerContext,
  learnerContextDirectReply,
  callFalOpenRouter,
  builtInCourseGuide,
  selectedLessonSummary,
  cleanLearnerReply,
  aiFilmmakingDirectReply,
  resolveRequestedCourseScope,
  resolveConversationState,
  aiFilmmakingTemplateIdForReply,
  skillomatePlanDirectReply,
  skillomatePlatformDirectReply,
  classifyBillingIntent,
  OUT_OF_SCOPE_REPLY,
  productTutorReply,
  productCourseDomain,
  productAccessReply,
  validateProductReply,
  isProductKnowledge,
  productFallbackNotice,
  packFor, packDirectReply, validatePackReply, unifiedDirectReply, providerCourseScope,
  assessTaskResponse, taskLimitation,
  assessUnifiedAnswer, finalizeUnifiedAnswer, acceptUnifiedRepair, prepareUnifiedRepair,
} = require('../services/aiTutorService');
const {
  checkAiInput,
  responseHash,
  sanitizeAiOutput,
} = require('../services/aiCompliance');
const router = express.Router();
const AI_USER_PROJECTION = '+activeSessionId +activeSessions fullName email mobileNumber isMobileVerified isEmailVerified age gender avatar subscriptionStatus subscriptionExpiry isOnTrial purchasedCourses courseEntitlements wishlist courseProgress createdAt lastActiveAt lastLoginAt loginCount';
const aiRateState = new Map();
const { readConsent, requireAiConsent, saveConsent } = require('../services/aiConsent');

function consentFailure(res, error) {
  return res.status(error.statusCode || 503).json({
    error: error.statusCode ? error.message : 'AI privacy settings are unavailable. Please try again.',
    code: error.code || 'AI_CONSENT_UNAVAILABLE',
  });
}
function callConsentedProvider(req, options) {
  return callFalOpenRouter({ ...options, beforeRequest: () => requireAiConsent(req.compatAuth?.userId) });
}

function aiMessageRecord(role, content, privateAccount = false) {
  return {
    role,
    content: privateAccount ? 'Account details were shown privately in Skillomate.' : String(content || '').trim().slice(0, 60000),
    ...(privateAccount ? { privateAccount: true } : {}),
    createdAt: Date.now(),
  };
}

async function loadTutorState(req, courseId) {
  const userId = req.compatAuth?.userId;
  if (!userId) return null;
  if (typeof AiTutorSession.findOne !== 'function') return null;
  const course = mongoose.Types.ObjectId.isValid(courseId) ? courseId : null;
  const projection='activeCourseId currentTopic currentIntent lastWorkflow lastTemplateId productContext courseContext unifiedContext conversationId messages';
  const read = value => AiTutorSession.findOne({user:userId,course:value}).select(projection).lean().catch(()=>null);
  const incoming=compactText(req.body?.conversationId || req.body?.conversation_id,120);
  let saved=await read(null);
  if ((!saved || (incoming && saved.conversationId && incoming!==saved.conversationId)) && course) saved=await read(course);
  return incoming && saved?.conversationId && incoming!==saved.conversationId ? null : saved;
}

async function persistTutorChat(req, courseId, history, message, reply, state = {}) {
  const userId = req.compatAuth?.userId;
  if (!userId) return;
  const course = state.unifiedContext ? null : mongoose.Types.ObjectId.isValid(courseId) ? courseId : null;
  const conversationId = compactText(req.body?.conversationId || req.body?.conversation_id, 120);
  const messages = [
    ...sanitizeHistory(history).map((item) => aiMessageRecord(item.role, item.content)),
    aiMessageRecord('user', message),
    aiMessageRecord('assistant', reply, state.privateAccount),
  ].filter((item) => item.content).slice(-40);
  await AiTutorSession.findOneAndUpdate(
    { user: userId, course },
    {
      user: userId,
      course,
      conversationId,
      activeCourseId: compactText(state.activeCourseId, 120),
      currentTopic: compactText(state.currentTopic, 80),
      currentIntent: compactText(state.currentIntent, 80),
      lastWorkflow: compactText(state.lastWorkflow, 120),
      lastTemplateId: compactText(state.lastTemplateId, 160),
      ...(state.productContext ? { productContext: state.productContext } : {}),
      ...(state.courseContext ? {courseContext:state.courseContext} : {}),
      ...(state.unifiedContext ? {unifiedContext:state.unifiedContext} : {}),
      messages,
      lastUpdatedAt: new Date(),
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

function aiDebugPayload({ req, requestedCourseId, resolvedCourseId, state, knowledge, selectedTemplateId, provider }) {
  const chunks = Array.isArray(knowledge?.debugChunks) ? knowledge.debugChunks : [];
  return {
    conversation_id: compactText(req.body?.conversationId || req.body?.conversation_id, 120),
    request_active_course_id: requestedCourseId || '',
    resolved_active_course_id: knowledge?.activeCourse?.id || resolvedCourseId || '',
    current_topic: state?.currentTopic || '',
    current_intent: state?.currentIntent || '',
    rewritten_retrieval_query: knowledge?.retrievalQuery || compactText(req.body?.message, 220),
    retrieved_chunk_ids: chunks.map(chunk => chunk.chunkId || `${chunk.courseSlug || chunk.courseId}:${chunk.section}`).slice(0, 8),
    retrieved_chunk_hashes: chunks.map(chunk => chunk.contentHash || ''),
    retrieved_source_hashes: [...new Set(chunks.map(chunk => chunk.sourceHash).filter(Boolean))],
    retrieved_translation_hashes: chunks.map(chunk => chunk.translationHash || ''),
    retrieved_course_ids: [...new Set(chunks.map(chunk => chunk.courseId).filter(Boolean))],
    retrieved_course_names: [...new Set(chunks.map(chunk => chunk.courseName).filter(Boolean))],
    scores_ranks: chunks.map(chunk => ({ rank: chunk.rank, score: Number(chunk.score || 0).toFixed(4), course_id: chunk.courseId, section: chunk.section })).slice(0, 8),
    selected_exact_prompt_template_id: selectedTemplateId || '',
    provider_model_path: provider === 'fal-openrouter' ? 'fal-openrouter' : provider,
  };
}

function logAiDebug(payload) {
  console.info('[nex-ai-debug]', JSON.stringify(payload));
}

function aiRateLimit(req, res, next) {
  const key = String(req.compatAuth?.userId || req.ip);
  const now = Date.now();
  const current = aiRateState.get(key);
  if (!current || current.resetAt <= now) {
    aiRateState.set(key, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  current.count += 1;
  if (current.count > 30) return res.status(429).json({ error: 'Too many AI requests. Wait a minute and try again.' });
  return next();
}

router.get('/consent', requireCompatibleAuth(), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try { res.json(await readConsent(req.compatAuth.userId)); }
  catch (error) { consentFailure(res, error); }
});

router.put('/consent', requireCompatibleAuth(), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try { res.json(await saveConsent(req.compatAuth.userId, req.body)); }
  catch (error) { consentFailure(res, error); }
});

router.delete('/history', requireCompatibleAuth({ userProjection: AI_USER_PROJECTION }), async (req, res) => {
  const result = await AiTutorSession.deleteMany({ user: req.compatAuth.userId });
  res.json({ success: true, deletedCount: result.deletedCount || 0 });
});

router.post('/reports', requireCompatibleAuth({ userProjection: AI_USER_PROJECTION }), async (req, res) => {
  const allowedReasons = new Set(['incorrect', 'harmful_or_unsafe', 'inappropriate', 'privacy_concern', 'other']);
  const messageId = compactText(req.body?.messageId, 120);
  const reason = compactText(req.body?.reason, 40);
  if (!messageId || !allowedReasons.has(reason)) return res.status(400).json({ error: 'Choose a valid report reason.' });
  try {
    await AiResponseReport.create({
      user: req.compatAuth.userId,
      messageId,
      reason,
      responseHash: req.body?.response ? responseHash(String(req.body.response).slice(0, 6000)) : null,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }
  res.status(201).json({ success: true, message: 'Thanks. The response was reported for review.' });
});

router.get('/health', requireCompatibleAuth(), (_req, res) => {
  res.json({
    ok: true,
    service: 'nex-ai',
    knowledgeAccessPolicy: 'nex-ai-all-integrated-v1',
    provider: FAL_API_KEY ? 'fal-openrouter' : 'built-in-course-guide',
  });
});

router.get('/courses', requireCompatibleAuth(), async (_req, res) => {
  try {
    const courses = await Course.find({ status: 'published' })
      .select('title slug videos.title')
      .sort({ publishedAt: -1, createdAt: -1 })
      .lean();

    res.json(courses.map(course => ({
      id: String(course._id),
      name: course.title,
      slug: course.slug,
      modules: (Array.isArray(course.videos) ? course.videos : [])
        .map(video => compactText(video.title, 200))
        .filter(Boolean),
    })));
  } catch (error) {
    res.status(500).json({ error: 'Could not load Nex AI courses' });
  }
});

async function handleTutorChat(req, res) {
  // Shared with the legacy /course-ai/chat route: never trust client consent flags.
  try { await requireAiConsent(req.compatAuth?.userId); }
  catch (error) { return consentFailure(res, error); }
  try {
    const inputCheck = checkAiInput(req.body?.message);
    if (!inputCheck.ok && !inputCheck.blocked) {
      return res.status(inputCheck.statusCode).json({ error: inputCheck.error });
    }
    const message = inputCheck.message || '';
    const pagePath = compactText(req.body.pagePath, 160).split(/[?#]/)[0];
    const assistantName = compactText(req.body.assistantName, 80);
    const requestedCourseId = compactText(
      req.body.courseId
      || req.body.activeCourseId
      || req.body.active_course_id
      || req.body.activeCourse?._id
      || req.body.activeCourse?.id
      || req.body.activeCourse?.slug,
      120
    );
    const lessonId = compactText(req.body.lessonId, 120);
    let history = sanitizeHistory(req.body.history);
    const savedState = await loadTutorState(req, resolveRequestedCourseScope({courseId:requestedCourseId}));
    const courseId = resolveRequestedCourseScope({
      courseId: req.body.courseId,
      activeCourseId: req.body.activeCourseId || req.body.active_course_id,
      activeCourse: req.body.activeCourse,
      message,
      history,
      savedState,
    });

    const incomingHistoryLength=history.length;
    let historyRestored=false;

    if (inputCheck.blocked) {
      return res.json({
        answer: inputCheck.reply,
        reply: inputCheck.reply,
        messageId: crypto.randomUUID(),
        provider: 'safety-filter',
        sources: [],
        outcome: { type: 'local_rule', liveModelAnswer: false, providerStatus: 'not_requested' },
      });
    }

    let provider = 'built-in-course-guide';
    let reply;
    let knowledge;
    let selectedTemplateId = '';
    let state = null;
    let providerDiagnostics = { status: FAL_API_KEY ? 'not_requested' : 'not_configured', attempts: [] };
    let responseIssue = null;
    let validationRepairDiagnostics=null;
    let taskAssessment=null;
    let repairObligations=[];
    let failureStatus = null;
    const learnerContext = await loadLearnerContext(req.compatUser);
    // Resolve server-owned course context before disambiguating overlapping account words.
    const chooseDirectReply = () => {
      const billingOptions = { history: knowledge?.conversationHistory || history };
      const billingIntent = classifyBillingIntent(message, billingOptions);
      const domain=packFor(knowledge?.activeCourse)
        ? (/\bSkillomate\b.*\b(?:plan|subscription|billing|refund|login|account)\b/i.test(message) ? 'platform' : 'course')
        : isProductKnowledge(knowledge)?productCourseDomain(message):'';
      if(!billingIntent&&domain==='platform'&&!knowledge.materialsAvailable&&/inactive|expired|restore|access|भुगतान|एक्सेस/iu.test(message)){reply=productAccessReply(message,knowledge);provider='course-knowledge-rule';return;}
      const language=isProductKnowledge(knowledge)?knowledge.productContext?.language:'';
      const courseRequest = domain === 'course' && !billingIntent;
      const learnerReply=courseRequest?'':learnerContextDirectReply(message,learnerContext,language,billingOptions);
      const planReply=courseRequest?'':skillomatePlanDirectReply(message,language,billingOptions);
      const platformReply=courseRequest?'':skillomatePlatformDirectReply(message,language,billingOptions);
      if(learnerReply){provider='skillomate-learner-facts';reply=learnerReply;}
      else if(platformReply){provider=platformReply===planReply?'skillomate-plan-facts':'skillomate-platform-facts';reply=platformReply;}
    };
    if(!FAL_API_KEY&&!courseId)chooseDirectReply();
    if (FAL_API_KEY || courseId || req.compatUser?._id) {
      try {
        if (!reply) knowledge = await buildContext(req.compatUser, courseId, message, history, { lessonId, learnerContext, savedState, conversationId:compactText(req.body?.conversationId||req.body?.conversation_id,120), unifiedKnowledge:true });
        chooseDirectReply();
        if(Array.isArray(knowledge?.conversationHistory)){
          history=knowledge.conversationHistory;
          historyRestored=!incomingHistoryLength && Boolean(history.length);
        }
        if (!reply && !knowledge.transcriptContext?.requested) {
          reply = selectedLessonSummary({ message, knowledge });
          if (reply) selectedTemplateId = 'selected-lesson-summary';
        }
        const packRule = !reply && (knowledge?.unifiedAccess ? unifiedDirectReply({message,history,knowledge}) : packDirectReply({message,history,knowledge}));
        if (packRule) { reply = packRule.reply; selectedTemplateId = packRule.templateId; }
        const productRule = !reply && productTutorReply({ message, history, knowledge });
        if (productRule) { reply = productRule.reply; selectedTemplateId = productRule.templateId; }
        if (!reply && knowledge?.materialsAvailable && !knowledge.unifiedAccess?.relationship && !(knowledge.unifiedAccess?.referencedCourseIds.length > 1)) reply = aiFilmmakingDirectReply({ message, courseId, knowledge, history });
        if (reply) {
          if (!provider.startsWith('skillomate-')) provider = 'course-knowledge-rule';
          selectedTemplateId ||= aiFilmmakingTemplateIdForReply(reply);
        } else if (FAL_API_KEY) {
          const generationStarted=Date.now();
          const submittedRepairs=new Set();
          reply = await callConsentedProvider(req, { context: knowledge.context+(!knowledge.unifiedAccess && knowledge.requestPlan?'\nTransient learner request plan (not course facts): '+JSON.stringify(knowledge.requestPlan):''), message, pagePath, assistantName, history, language:knowledge?.courseContext?.language || knowledge?.productContext?.language,
            responseContract:knowledge.responseContract || null,
            courseScope:providerCourseScope(knowledge),
            onDiagnostics: value => { providerDiagnostics = value; } });
          provider = 'fal-openrouter';
          if (knowledge.unifiedAccess) {
            const original = assessUnifiedAnswer({reply,message,history,knowledge,providerDiagnostics});
            let final = original;
            let repairAttempted = false;
            let repairDecision = null;
            if (original.needsRepair && !knowledge.transcriptContext?.unresolved.length && providerDiagnostics.complete !== false && Date.now()-generationStarted < 24800) {
              const preflight=prepareUnifiedRepair(original,submittedRepairs);
              if(!preflight.submit){
                final=preflight.assessment || original;
                repairDecision={accepted:false,skipped:true,reason:preflight.reason};
              }else{
                repairAttempted = true;
                try {
                  const repaired = await callConsentedProvider(req, {context:knowledge.context,message,pagePath,assistantName,history,
                    courseScope:providerCourseScope(knowledge), language:knowledge.unifiedAccess.language,
                    totalTimeoutMs:Math.max(1,25000-(Date.now()-generationStarted)),maxAttempts:1,
                    repair:preflight.repair,
                    onDiagnostics:value=>{validationRepairDiagnostics=value;}});
                  const checked = assessUnifiedAnswer({reply:repaired,message,history,knowledge,providerDiagnostics:validationRepairDiagnostics});
                  repairDecision = acceptUnifiedRepair(original, checked);
                  if (repairDecision.accepted) final = checked;
                } catch (error) {
                  if (error.code === 'COURSE_KNOWLEDGE_SCOPE_VIOLATION' || /^AI_CONSENT_/.test(error.code || '')) throw error;
                }
              }
            }
            const incomplete = final.needsRepair;
            repairObligations=final.validationContext.repairObligations;
            reply = final.answer;
            taskAssessment = {task:'shared_learner_task',format:knowledge.responseContract?.format || 'answer',
              rawIssues:original.issues,finalIssues:final.unresolved,requirements:final.finalValidation.requirements,repairAttempted,repairDecision,complete:!incomplete,
              delivery:repairAttempted && repairDecision?.accepted?(incomplete?'repaired_partial':'repaired'):incomplete?'partial':final!==original || original.edits.length?'deterministic_edit':'original'};
            responseIssue = incomplete ? 'shared_task_incomplete' : original.issues.length || original.edits.length ? 'shared_task_corrected' : null;
            if (responseIssue) provider = 'course-response-policy';
          } else if (knowledge.responseContract) {
            const original = assessTaskResponse({reply,knowledge});
            let candidate = original;
            let repairAttempted = false;
            if (candidate.needsRepair && Date.now()-generationStarted < 24800) {
              repairAttempted = true;
              try {
                const repaired = await callConsentedProvider(req, {context:knowledge.context,message,pagePath,assistantName,history,
                  responseContract:knowledge.responseContract, language:knowledge.responseContract.language,
                  courseScope:providerCourseScope(knowledge),
                  totalTimeoutMs:Math.max(1,25000-(Date.now()-generationStarted)),maxAttempts:1,
                  repair:{kind:'task',originalAnswer:reply,issues:original.issues},
                  onDiagnostics:value=>{validationRepairDiagnostics=value;}});
                candidate = assessTaskResponse({reply:repaired,knowledge});
              } catch (error) {
                if (error.code === 'COURSE_KNOWLEDGE_SCOPE_VIOLATION' || /^AI_CONSENT_/.test(error.code || '')) throw error;
                // The adapter preserves approval/budget errors and does not retry
                // this repair. Never present an unsafe initial draft as repaired.
              }
            }
            let final = candidate.needsRepair ? candidate : assessTaskResponse({reply:candidate.answer,knowledge});
            if (!final.needsRepair && final.edits.length) final = assessTaskResponse({reply:final.answer,knowledge});
            const incomplete = final.needsRepair || final.issues.length>0;
            const repairBlocked = /approval|budget_exhausted|scope_denied|expired|closed/iu.test(validationRepairDiagnostics?.status || '');
            const repairDetail = repairBlocked ? knowledge.responseContract.language === 'english'
              ? 'The correction could not run because provider approval or the remaining attempt budget blocked it.'
              : knowledge.responseContract.language === 'hindi' ? 'प्रदाता की अनुमति या बचे हुए प्रयासों की सीमा के कारण सुधार नहीं चल पाया।'
                : 'Provider approval ya bache hue attempts ki limit ki wajah se correction nahi chal paya.' : '';
            reply = incomplete ? taskLimitation(knowledge.responseContract,repairDetail) : final.answer;
            responseIssue = original.issues.length || repairAttempted ? knowledge.responseContract.domain === 'cartoon-series'
              ? 'course_cartoon_task_preserving_correction' : 'course_business_task_preserving_correction' : null;
            if (responseIssue) provider = 'course-response-policy';
            taskAssessment = {task:knowledge.responseContract.task,format:knowledge.responseContract.format,
              rawIssues:original.issues,finalIssues:final.issues,repairAttempted,
              delivery:incomplete?'relevant_limitation':repairAttempted?'repaired':original.edits.length?'deterministic_edit':'original'};
          } else {
          let validation = validateProductReply({ reply, message, history, knowledge });
          // One repair attempt shares the initial 25-second total budget. Failed
          // translation never silently becomes an unrelated FAQ or a live answer.
          if(validation.repairRequest && Date.now()-generationStarted<24800){
            try {
              const repaired=await callConsentedProvider(req, {context:knowledge.context,message,pagePath,assistantName,history,
                courseScope:providerCourseScope(knowledge),
                totalTimeoutMs:Math.max(1,25000-(Date.now()-generationStarted)),maxAttempts:1,repair:validation.repairRequest,language:validation.repairRequest.language,
                onDiagnostics:value=>{validationRepairDiagnostics=value;}});
              const checked=validateProductReply({reply:repaired,message,history,knowledge});
              if(!checked.repairRequest)validation={...checked,issue:checked.issue||('response_'+validation.repairRequest.kind+'_repaired')};
            }catch(error){
              if(error.code==='COURSE_KNOWLEDGE_SCOPE_VIOLATION'||/^AI_CONSENT_/.test(error.code||''))throw error;
              /* Keep the safe content-preserving unavailable-translation response. */
            }
          }
          reply = validation.reply;
          responseIssue = validation.issue;
          let packValidation = validatePackReply({reply,knowledge});
          if (packValidation.repairRequest?.kind === 'grounding') {
            const original = packValidation;
            let repairAttempted = false;
            // Same adapter, deadline, authorization and accounting as the existing
            // correction path; this course may use at most one repair, no retries.
            if (!validationRepairDiagnostics && Date.now()-generationStarted < 24800) {
              repairAttempted = true;
              try {
                const repaired = await callConsentedProvider(req, {context:knowledge.context,message,pagePath,assistantName,history,
                  courseScope:providerCourseScope(knowledge),
                  totalTimeoutMs:Math.max(1,25000-(Date.now()-generationStarted)),maxAttempts:1,
                  repair:original.repairRequest,language:original.repairRequest.language,
                  onDiagnostics:value=>{validationRepairDiagnostics=value;}});
                const checked = validatePackReply({reply:repaired,knowledge});
                const numberedItems = value => [...String(value).matchAll(/^\s*\d+[.)]\s+/gmu)].length;
                const originalCount = numberedItems(original.repairRequest.originalAnswer);
                const preservesCount = !originalCount || numberedItems(repaired) === originalCount;
                if (!checked.issue && preservesCount) packValidation = {...checked,issue:original.issue};
              } catch (error) {
                if (error.code === 'COURSE_KNOWLEDGE_SCOPE_VIOLATION' || /^AI_CONSENT_/.test(error.code || '')) throw error;
              }
            }
            // If repair fails or is unsafe, keep useful sections of the original
            // draft with only its unsupported clauses replaced by placeholders.
            const final = validatePackReply({reply:packValidation.reply,knowledge});
            packValidation = {...final,issue:original.issue};
            taskAssessment = {task:'creative_deliverable',format:original.repairRequest.domain === 'real-estate-videos' ? 'property_deliverable' : 'hooks',rawIssues:original.assessment.issues,
              finalIssues:final.assessment?.issues || [],repairAttempted,
              delivery:packValidation.reply===original.reply?'deterministic_edit':'repaired'};
          }
          reply = packValidation.reply;
          responseIssue ||= packValidation.issue;
          if (responseIssue) provider = 'course-response-policy';
          }
        }
      } catch (error) {
        if(error.code==='COURSE_KNOWLEDGE_SCOPE_VIOLATION'||/^AI_CONSENT_/.test(error.code||''))throw error;
        failureStatus = error.diagnostics?.status || 'context_error';
        providerDiagnostics = error.diagnostics || { status: failureStatus, attempts: [] };
        reply = null;
        console.warn(`Nex AI unavailable (${failureStatus})`);
      }
    }

    if (!reply && !failureStatus) {
      provider = 'built-in-course-guide';
      if (!knowledge && courseId && lessonId) knowledge = await buildContext(req.compatUser, courseId, message, history, { lessonId, learnerContext, savedState, conversationId:compactText(req.body?.conversationId||req.body?.conversation_id,120), unifiedKnowledge:true });
      reply = knowledge?.materialsAvailable ? aiFilmmakingDirectReply({ message, courseId, knowledge, history }) : '';
      if (reply) {
        provider = 'course-knowledge-rule';
        selectedTemplateId = aiFilmmakingTemplateIdForReply(reply);
      } else {
        reply = await builtInCourseGuide({
          user: req.compatUser,
          message,
          courseId,
          knowledge,
          history,
        });
        if (reply) provider = 'course-catalog-rule';
      }
    }
    if (!reply) {
      // Provider availability must not discard learner-supplied product facts.
      // Context has already passed course access checks; an empty reply saves
      // the user turn without recording an assistant answer that never existed.
      if (knowledge?.materialsAvailable && isProductKnowledge(knowledge)) {
        await requireAiConsent(req.compatAuth?.userId);
        state = resolveConversationState({ message, history, knowledge, savedState });
        await persistTutorChat(req, courseId, history, message, '', state).catch(() => {});
      }
      const status = failureStatus || providerDiagnostics.status;
      const debugPayload = aiDebugPayload({ req, requestedCourseId, resolvedCourseId: courseId, knowledge, state, selectedTemplateId, provider: 'unavailable' });
      logAiDebug(debugPayload);
      return res.status(status === 'timeout' ? 504 : 503).json({ ...tutorUnavailable(status, message),
        messageId: crypto.randomUUID(), provider: 'unavailable',
        ...(req.body?.debugAi ? { debug: { ...debugPayload, history_restored: historyRestored, provider: providerDiagnostics } } : {}),
      });
    }
    // The real-estate quote is an authorized byte-preserved asset. Formatting
    // cleanup collapses blank lines and would silently alter its approved body.
    const preserveEstateQuote = packFor(knowledge?.activeCourse)?.domain === 'real-estate-videos'
      && (selectedTemplateId || (knowledge.materialsAvailable && knowledge.tutorRequest?.copyRequested
        && knowledge.records?.some(record => record.contentType === 'exact-template' && String(reply).includes(record.content))));
    const unifiedQuote = knowledge?.unifiedAccess && selectedTemplateId;
    const outputLimit = unifiedQuote ? 20000 : knowledge?.unifiedAccess ? 60000 : 6000;
    // Mixed requests may include both a byte-exact quote and an explanation.
    // Whitespace cleanup must not rewrite that registered quote's blank lines.
    const transform=(value,limit)=>sanitizeAiOutput(preserveEstateQuote || unifiedQuote
      || knowledge?.unifiedAccess && knowledge.records?.some(r=>r.contentType==='exact-template'&&r.content&&value.includes(r.content))
      ? value : cleanLearnerReply(value),limit);
    if(knowledge?.unifiedAccess && !unifiedQuote && !provider.startsWith('skillomate-')){
      const delivered=finalizeUnifiedAnswer({reply,message,history,knowledge,outputLimit,transform,repairObligations,assessment:taskAssessment,
        providerDiagnostics:taskAssessment?.repairAttempted && ['repaired','repaired_partial'].includes(taskAssessment.delivery)
          ? validationRepairDiagnostics || providerDiagnostics : providerDiagnostics});
      reply=delivered.answer;taskAssessment=delivered.assessment;
      if(!taskAssessment.complete){responseIssue='shared_task_incomplete';provider='course-response-policy';}
    }else{
      reply=transform(String(reply || '').trim().slice(0,outputLimit),outputLimit) || OUT_OF_SCOPE_REPLY;
    }
    state = resolveConversationState({ message, history, knowledge, savedState, selectedTemplateId, reply });
    const debugPayload = aiDebugPayload({ req, requestedCourseId, resolvedCourseId: courseId, state, knowledge, selectedTemplateId, provider });
    logAiDebug(debugPayload);
    await persistTutorChat(req, courseId, history, message, reply, { ...state, privateAccount: provider === 'skillomate-learner-facts' }).catch(() => {});
    const sources = knowledge?.unifiedAccess ? knowledge.sources : [];
    res.json({ answer: reply, reply, provider, sources, privateAccount: provider === 'skillomate-learner-facts', messageId: crypto.randomUUID(),
      notice: provider === 'built-in-course-guide' && isProductKnowledge(knowledge) ? productFallbackNotice(message) : null,
      outcome: { type: taskAssessment?.complete === false ? 'partial_answer' : provider === 'fal-openrouter' ? 'live_model' : provider === 'built-in-course-guide' ? 'provider_fallback' : responseIssue ? 'validated_local_replacement' : 'local_rule',
        liveModelAnswer: provider === 'fal-openrouter', providerStatus: providerDiagnostics.status, responseIssue,
        ...(taskAssessment?.complete !== undefined ? {complete:taskAssessment.complete} : {}),
        ...(taskAssessment?.repairAttempted ? {correctionStatus:validationRepairDiagnostics?.status || 'not_completed',correctionDelivered:['repaired','repaired_partial'].includes(taskAssessment.delivery)} : {}) },
      knowledge: knowledge?.materialsAvailable ? 'course-materials' : 'course-overviews',
      ...(req.body?.debugAi ? { debug: { ...debugPayload, response_selection:knowledge?.responseSelection||null, history_restored:historyRestored, provider: providerDiagnostics, validation_repair:validationRepairDiagnostics, task_assessment:taskAssessment } } : {}),
    });
  } catch (error) {
    if (error.code === 'AI_CONSENT_REQUIRED') return consentFailure(res, error);
    res.status(502).json(tutorUnavailable(error.code === 'COURSE_KNOWLEDGE_SCOPE_VIOLATION' ? error.code : 'context_error', req.body?.message));
  }
}

router.post('/chat', requireCompatibleAuth({ userProjection: AI_USER_PROJECTION }), aiRateLimit, handleTutorChat);
module.exports = router;
module.exports.handleTutorChat = handleTutorChat;
