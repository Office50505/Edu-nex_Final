// Public failure responses must never masquerade as a course answer.
function tutorUnavailable(status = 'not_configured', message = '') {
  const hindi = /[\u0900-\u097f]/u.test(message);
  const hinglish = /\b(meri|mujhe|hai|nahi|kaise|karo|batao|mat|naam)\b/i.test(message);
  let error = hindi
    ? 'Nex AI अभी उपलब्ध नहीं है। कृपया थोड़ी देर बाद अपना सवाल फिर भेजें।'
    : hinglish ? 'Nex AI abhi available nahi hai. Thodi der baad apna sawaal dobara bhejein.'
      : 'Nex AI is temporarily unavailable. Please try your question again shortly.';
  // These statuses are emitted only by the separate local QA launcher. Normal
  // production inference has no dependency on a development approval file.
  const qaMessages = {
    manual_qa_awaiting_approval: ['Manual QA is awaiting session approval. Authorize the prepared session before testing.', 'Manual QA session abhi approved nahi hai. Session approve hone ke baad sawaal bhejein.', 'मैन्युअल QA सत्र की अनुमति अभी नहीं मिली है। अनुमति के बाद सवाल भेजें।'],
    manual_qa_expired: ['The 60-minute manual QA session has expired. A new authorized session is required.', 'Manual QA ka 60-minute session expire ho gaya hai. Naya authorized session chahiye.', 'मैन्युअल QA का 60 मिनट का सत्र समाप्त हो गया है। नया अधिकृत सत्र चाहिए।'],
    manual_qa_budget_exhausted: ['The manual QA provider-attempt budget is exhausted. No additional provider call was made.', 'Manual QA ke provider attempts khatam ho gaye hain. Koi additional provider call nahi hua.', 'मैन्युअल QA की प्रदाता प्रयास सीमा पूरी हो गई है। कोई अतिरिक्त कॉल नहीं किया गया।'],
    manual_qa_closed: ['This manual QA session is closed. A new authorized session is required.', 'Manual QA session band hai. Naya authorized session chahiye.', 'यह मैन्युअल QA सत्र बंद है। नया अधिकृत सत्र चाहिए।'],
    manual_qa_scope_denied: ['Manual QA is limited to the configured synthetic account and course.', 'Manual QA sirf configured synthetic account aur course ke liye hai.', 'मैन्युअल QA केवल निर्धारित परीक्षण खाते और कोर्स के लिए है।'],
  };
  if (qaMessages[status]) error = qaMessages[status][hindi ? 2 : hinglish ? 1 : 0];
  else if (status.startsWith('manual_qa_')) error = 'Manual QA configuration or accounting could not be verified. No provider call was authorized.';
  const qaFailure = status.startsWith('manual_qa_')
    ? /scope_denied/.test(status) ? 'authorization' : /environment_mismatch|model_mismatch/.test(status) ? 'configuration'
      : /ledger_invalid|accounting_busy|invalid_payload|invalid_session/.test(status) ? 'infrastructure' : 'approval'
    : null;
  return {
    error, code: 'TUTOR_UNAVAILABLE',
    outcome: { type: 'unavailable', liveModelAnswer: false, providerStatus: status,
      failureClass: qaFailure || (['empty_response', 'invalid_response'].includes(status) ? 'model_response'
        : status === 'context_error' || status === 'COURSE_KNOWLEDGE_SCOPE_VIOLATION' ? 'context' : 'infrastructure') },
  };
}

module.exports = { tutorUnavailable };
