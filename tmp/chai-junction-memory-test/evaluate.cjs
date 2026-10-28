function evaluate(turns, providerEvents) {
  const liveTurns = [1, 2].map(number => turns.find(turn => turn.number === number));
  const allTurnsReachedProvider = liveTurns.every(turn => turn?.httpStatus === 200
    && turn.response?.provider === 'fal-openrouter' && turn.response?.outcome?.liveModelAnswer === true
    && providerEvents.some(event => event.type === 'provider_invoked' && event.turn === turn.number));
  if (!allTurnsReachedProvider) return { allTurnsReachedProvider: false, memoryEvaluated: false, manualReviewRequired: true };
  const first = liveTurns[0], second = liveTurns[1];
  const answer = second.response.answer;
  const productText = answer.replace(/chai\s+(?:corner|junction)/gi, '');
  const history = second.request.history;
  const checks = {
    sameConversationId: first.request.conversationId === second.request.conversationId,
    firstExchangeIncludedExactly: history.length === 2 && history[0].role === 'user' && history[0].content === first.request.message
      && history[1].role === 'assistant' && history[1].content === first.response.answer,
    usesChaiCorner: /\bchai\s+corner\b/i.test(answer),
    omitsOldShopName: !/\bchai\s+junction\b/i.test(answer),
    remembersVijayNagar: /\bvijay\s+nagar\b/i.test(answer),
    remembersIndore: /\bindore\b/i.test(answer),
    remembersChai: /\b(?:chai|tea)\b/i.test(productText),
    remembersMaggi: /\bmaggi\b/i.test(productText),
    remembersSandwiches: /\bsandwich(?:es)?\b/i.test(productText),
    hasRomanHinglishSignal: /\b(?:aao|aaiye|yahan|yahaan|apni|apna|apne|garam|garma|swad|swaad|maza|maze|karo|hai|hain|aap|hum|milte|milenge|piyo|khao|chalo|wali|wala|walon|bhi|aur|mein)\b/i.test(answer) && !/[\u0900-\u097f]/.test(answer),
    omitsDiscountsAndPrices: !/₹|\b(?:Rs\.?|INR)\s*\d|\d\s*%|\b(?:discounts?|sale|free|offers?|bogo)\b/i.test(answer),
    omitsPlatformBilling: !/\b(?:phonepe|razorpay|skillomate subscription)\b|₹\s*499/i.test(answer),
  };
  return { allTurnsReachedProvider: true, memoryEvaluated: true, checks,
    automatedContentChecksPass: Object.values(checks).every(Boolean), captionWordCount: answer.trim().split(/\s+/).length,
    manualReviewRequired: true,
    note: 'Content flags assist review; inspect the actual answer for natural Hinglish, shortness, and correct use of remembered facts. No model-based grading is run.' };
}
module.exports = { evaluate };
