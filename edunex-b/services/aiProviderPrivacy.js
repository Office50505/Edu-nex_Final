// Account replies are generated inside Skillomate, never model context. Also
// recognize older clients/saved chats which predate the privateAccount marker.
const LOCAL_ACCOUNT_REPLY = /(?:Your|Aapka) Skillomate profile|आपका Skillomate प्रोफाइल|Your plan\/access|Aapka plan\/access|आपका एक्सेस|Last successful payment:|Aakhri successful payment:|अंतिम सफल भुगतान:|For privacy, I can show masked account\/payment|Privacy ke liye main masked account\/payment|गोपनीयता के लिए केवल छिपाए हुए खाते/iu;
function providerHistory(history) {
  return (Array.isArray(history) ? history : []).filter(item => item && !item.privateAccount
    && item.provider !== 'skillomate-learner-facts'
    && !(item.role === 'assistant' && LOCAL_ACCOUNT_REPLY.test(String(item.content || ''))));
}
module.exports = { providerHistory };
