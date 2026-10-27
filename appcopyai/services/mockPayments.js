// Never enable simulated billing in a release binary, even if the flag is set.
function isMockPaymentEnabled(development, flag, platform) {
  return development === true && flag === "true" && platform === "android";
}

function mockPaymentResult(outcome) {
  if (outcome === "success") return { error: "", notice: "Test payment successful. No money was charged. Premium access is unchanged." };
  if (outcome === "failure") return { error: "Test payment declined. No money was charged. Try again to test another outcome.", notice: "" };
  return { error: "", notice: "Test payment cancelled. No money was charged." };
}

module.exports = { isMockPaymentEnabled, mockPaymentResult };
