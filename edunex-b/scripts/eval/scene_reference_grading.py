"""Opt-in scene-reference checks for versioned evaluation cases, not bot policy.

These phrase checks supplement required concepts and operator semantic review.
Character and location names come from the case, never from a hardcoded answer.
"""
import re

REFERENCE_NOUN = r'(?:character\s+)?(?:reference\s+)?(?:sheets?|references?)(?:\s+images?)?'
SERIES_TITLE = re.compile(
    r'\b(?:series(?:\s+(?:name|title))?|series\s+ka\s+naam|title)\s*[:=]?\s*'
    r'(?:\x27[^\x27\n]+\x27|"[^"\n]+"|“[^”\n]+”|‘[^’\n]+’)', re.I)
IMAGE = re.compile(r'\b(?:images?|photos?|references?|tasveer)\b', re.I)
CONDITIONAL = re.compile(
    r'\b(?:if|unless|agar|whether)\b|\b(?:kya|does|will|should)\b[^.!?]*\?'
    r'|\bjab\b[^.!?]*\b(?:ho|hoga|dikhe|aaye|appear)\b'
    r'|\b(?:scene|frame)\b[^.!?]*\bho\b[^.!?]*\b(?:toh|to)\b', re.I)
UNCONDITIONAL = re.compile(r'\b(?:always|hamesha|compulsory|mandatory)\b|\beven\s+if\b', re.I)
NOT_NEEDED = re.compile(
    r'\b(?:not\s+(?:needed|required|necessary|mandatory)|no\s+need|(?:do\s+not|don\x27t)\s+(?:upload|use|add))\b'
    r'|\b(?:sheet|reference)\s+(?:is\s+)?(?:nahi|nahin)\s+chahiye\b'
    r'|\b(?:zaroori|zaruri)\s+(?:nahi|nahin)\b'
    r'|\bmat\s+(?:lagao|daalo|upload|use)\b', re.I)


def character_reference_associations(clause, names):
    """Bind reference nouns to named characters, not to nearby series titles.

    Recognizes possessives, Hinglish ka/ki/ke, reference-for/of wording and
    coordinated character lists. Unrecognized prose remains for semantic review.
    """
    if not names:
        return set()
    text = SERIES_TITLE.sub('[series title]', re.sub(r'[*`]', '', clause))
    atom = r'(?<!\w)(?:' + '|'.join(re.escape(n) for n in sorted(names, key=len, reverse=True)) + r')(?!\w)'
    group = atom + r'(?:(?:\s*,\s*(?:(?:and|aur|&)\s+)?|\s+(?:and|aur|&)\s+)' + atom + r')*'
    owner = r'(?:[\x27’]s|ka|ki|ke(?:\s+liye)?)'
    forward = group + r'\s*(?:[-:]\s*)?(?:' + owner + r'\s+)?(?:(?:a|the|one|ek)\s+)?' + REFERENCE_NOUN + r'\b'
    inverse = r'\b' + REFERENCE_NOUN + r'\s+(?:for|of)\s+' + group
    associated = set()
    for match in re.finditer(forward + '|' + inverse, text, re.I):
        for name in names:
            if re.search(r'(?<!\w)' + re.escape(name) + r'(?!\w)', match[0], re.I):
                associated.add(name)
    return associated


def scene_reference_errors(answer, rule):
    if not rule:
        return []
    clauses = [s.strip() for s in re.split(r'(?<=[.!?])\s+|[\n;]+', answer) if s.strip()]

    def mentions(clause, name):
        return re.search(r'(?<!\w)' + re.escape(name) + r'(?!\w)', clause, re.I) is not None

    characters = list(dict.fromkeys(rule.get('required_characters', [])
                                   + rule.get('unspecified_characters', [])
                                   + rule.get('excluded_characters', [])))
    associated = [(c, character_reference_associations(c, characters)) for c in clauses]
    errors = []
    for name in rule.get('required_characters', []):
        if not any(name in names and not NOT_NEEDED.search(c) for c, names in associated):
            errors.append(f'Missing character-sheet/reference guidance for scene character: {name}')
    location = rule.get('location')
    if location and not any(mentions(c, location) and IMAGE.search(c) and not NOT_NEEDED.search(c) for c in clauses):
        errors.append(f'Missing location-image/reference guidance: {location}')
    for name in rule.get('unspecified_characters', []) + rule.get('excluded_characters', []):
        references = [c for c, names in associated if name in names]
        if any(not NOT_NEEDED.search(c) and (UNCONDITIONAL.search(c) or not CONDITIONAL.search(c)) for c in references):
            errors.append(f'Unconditional reference sheet required for character not confirmed in scene: {name}')
    return errors
