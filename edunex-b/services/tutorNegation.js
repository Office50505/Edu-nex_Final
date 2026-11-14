// Operation-scoped negation. A disclaimer about one operation cannot negate a
// positive instruction in the next clause. Hindi negation can follow the noun.
const motions = {
  arc:'arc|arcing|आर्क', orbit:'orbit|orbiting|ऑर्बिट',
  'push-in':'push[- ]in|पुश[- ]इन', zoom:'zoom|ज़ूम|जूम',
  'light sweep':'light[- ]sweep|लाइट स्वीप',
  'pull-out':'pull[- ](?:out|back)|pulls? back|pulling back|dolly[- ]out|पुल[- ]आउट',
  'zoom-in':'zoom[- ]in|zooms? in|zooming in', 'zoom-out':'zoom[- ]out|zooms? out|zooming out',
  pan:'pan|panning|पैन', tilt:'tilt|tilting|टिल्ट',
  'truck-left':'truck[- ]left|track[- ]left', 'truck-right':'truck[- ]right|track[- ]right',
  'crane-up':'crane[- ]up|crane rising', 'crane-down':'crane[- ]down|crane descending',
  'new-angle':'new(?: camera)?[- ]angles?|different(?: camera)?[- ]angles?|naye?\\s+angles?|alag\\s+angles?|नए\\s+एंगल|नया\\s+एंगल',
  'static hold':'static(?: hold| shot)?|locked[- ]off|स्टैटिक',
};
motions['push-in']='push[- ]in|pushes? in|pushing in|dolly[- ]in|पुश[- ]इन';
const moveNames=Object.keys(motions);
const motionPattern = move => new RegExp(`(?<![\\p{L}\\p{M}])(?:${motions[move]})(?![\\p{L}\\p{M}])`,'giu');

function negatedAt(text, start, end = start) {
  const left=String(text).slice(0,start).split(/[,;.!?।\n]|\b(?:but|however|lekin|magar|instead)\b|लेकिन|मगर/iu).at(-1).replace(/[*_`"“”]/gu,'');
  const right=String(text).slice(end).split(/[,;.!?।\n]|\b(?:but|however|lekin|magar|aur|and|then)\b|लेकिन|मगर|और/iu)[0].replace(/[*_`"“”]/gu,'');
  // "Not only" is emphasis; "don't avoid" is not an exclusion.
  const doubleNegative=/\b(?:do not|don't|never)\s+avoid\s+(?:\S+\s+){0,3}$/iu.test(left);
  const prefix=!doubleNegative && /(?:\b(?:no|not|never|without|avoid|don't|do not|can't|cannot|mat|nahi|nahin|nhi)\s+(?!(?:only|just)\b)(?:\S+\s+){0,4}|(?:मत|नहीं|बिना)\s*(?:\S+\s+){0,4})$/iu.test(left);
  // Roman "bina ... ke/kiye" scopes over a coordinated object list, but
  // stops once its postposition closes. It must not negate the next action.
  const bina=[...left.matchAll(/\bbina\b|बिना/giu)].at(-1);
  const without=bina && !/\b(?:ke|kiye|hue)\b|किए|हुए/u.test(left.slice(bina.index+bina[0].length));
  const suffix=/^\s*(?:(?:ka|ki|ko|ke|use|istemal|movement|camera|generate|perform|add|karna|bilkul|bhi|zarurat|zaroorat|का|की|को|इस्तेमाल|बिलकुल|भी)\s+){0,4}(?:na\s+(?:ho|hon|hona|karo|karna|karne|karein|dikhao|dikhana)|nahi\b|nahin\b|nhi\b|mat\b(?:\s+(?:karo|karna|karein|dikhao|dikhana))?|(?:avoid|skip)\s+(?:karo|karna)|bina\b|(?:is\s+)?(?:excluded|forbidden|not allowed)\b|न\s+(?:हो|करो|करें)|नहीं|मत(?:\s+(?:करो|करें|दिखाओ))?)/iu.test(right);
  const fullRight=String(text).slice(end).split(/[,;.!?।\n]|\b(?:but|however|lekin|magar|instead|then)\b|लेकिन|मगर/iu)[0].replace(/[*_`"“”]/gu,'');
  const coordinated=/^\s*(?:ya|or|aur|and|और)\s+(?:\S+\s+){0,6}(?:nahi|nahin|nhi|mat\s+(?:karo|karna|bolo|kaho|kehna|bolna)|na\s+(?:karne|karna|karo)|नहीं|मत)/iu.test(fullRight);
  return Boolean(prefix || suffix || without || coordinated);
}

function affirmativeUseAt(text,start,end) {
  const after=String(text).slice(end).split(/[;.!?।]/u)[0];
  const before=String(text).slice(0,start).split(/[;.!?।]/u).at(-1);
  if(String(text).slice(start).split(/[.!।]/u)[0].includes('?'))return false;
  return /\b(?:use|add|allow|choose|perform|select|include)\s+(?:\S+\s+){0,3}$/iu.test(before)
    || /^\s*(?:use\s+karo|karo|chahiye|allowed)\b/iu.test(after);
}

module.exports={negatedAt,motionPattern,affirmativeUseAt,moveNames};
