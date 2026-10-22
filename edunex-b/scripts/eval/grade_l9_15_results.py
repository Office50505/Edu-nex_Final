#!/usr/bin/env python3
import json, argparse, re, sys
from pathlib import Path

def norm(s):
    s = (s or "").lower()
    s = s.replace("–","-").replace("—","-").replace("’","'").replace("“",'"').replace("”",'"')
    return re.sub(r"\s+"," ",s).strip()

def has_term(answer, term):
    return norm(term) in norm(answer)

HINGLISH_MARKERS = [
    r"\baap\b", r"\bapko\b", r"\baapko\b", r"\bkaise\b", r"\bkya\b", r"\bmein\b",
    r"\bme\b", r"\bhai\b", r"\bhain\b", r"\bkaro\b", r"\bkarein\b", r"\bmat\b",
    r"\bnahi\b", r"\bye\b", r"\byeh\b", r"\btoh\b", r"\bke liye\b", r"\blag",
    r"\bsakta\b", r"\bsakti\b", r"\bchahiye\b", r"\bsikhaya\b", r"\brakho\b",
    r"\blikho\b", r"\bdaalo\b", r"\bbatao\b", r"\bagar\b", r"\bkarna\b",
    r"\bkaunsi\b", r"\bkaunsa\b", r"\bkaunse\b", r"\bbhai\b", r"\brha\b",
]

def strip_examples_for_language(answer):
    value = answer or ""
    value = re.sub(r'"[^"]*[\u0900-\u097f][^"]*"', ' ', value)
    value = re.sub(r"'[^']*[\u0900-\u097f][^']*'", ' ', value)
    value = re.sub(r"\([^)]*[\u0900-\u097f][^)]*\)", " ", value)
    value = re.sub(r"[\u0900-\u097f]+", " ", value)
    return value

def looks_hinglish(answer):
    text = norm(strip_examples_for_language(answer))
    hits = sum(1 for pattern in HINGLISH_MARKERS if re.search(pattern, text))
    return hits >= 2

def expected_language_from_query(query):
    q = norm(query)
    if re.search(r"\b(?:hinglish|roman hindi|hindi mein|in hindi)\b", q):
        return "hinglish"
    if re.search(r"\b(?:kya|kaise|kaunsi|kaunsa|kaunse|mein|hai|hain|batao|chahiye|nahi|agar|karo|karu|lag|bhai|rha|ya)\b", q):
        return "hinglish"
    if re.search(r"\bke\s+liye\b", q):
        return "hinglish"
    return "en"

def grade_language(answer, expected_language):
    if expected_language in ("english", "en") and looks_hinglish(answer):
        return ["language mismatch: expected English, got Hinglish/Hindi"]
    if expected_language == "hinglish" and not looks_hinglish(answer):
        return ["language mismatch: expected Hinglish, got English"]
    return []

def group_satisfied(answer, group):
    a=norm(answer)
    if any(norm(t) in a for t in group):
        return True
    group_norm=[norm(t) for t in group]
    if any(t in group_norm for t in ("under","below","neeche")):
        return "sfx" in a and "above" in a and "music" in a
    if "silence" in group_norm:
        return "silent" in a
    if "settings" in group_norm:
        return ("stability" in a or "similarity" in a or "eleven v4" in a) and ("50" in a or "generation" in a)
    if "spoken-price" in group_norm or "spoken price" in group_norm:
        return ("do not speak" in a or "don't speak" in a or "avoid speaking" in a) and "price" in a
    if "drag" in group_norm:
        return "simple" in a and "clips" in a and ("sequence" in a or "arrange" in a or "placing" in a)
    if "timeline" in group_norm:
        return "editing" in a and "clips" in a and ("sequence" in a or "sound" in a)
    return False

def grade_answer(answer, required_groups=None, forbidden_any=None, exact_required=None, expected_language=None):
    required_groups = required_groups or []
    forbidden_any = forbidden_any or []
    exact_required = exact_required or []
    failures=[]
    a=norm(answer)
    for group in required_groups:
        if not group_satisfied(answer, group):
            failures.append("missing semantic group: " + " | ".join(group))
    for t in forbidden_any:
        if norm(t) in a:
            failures.append("contains forbidden: " + t)
    for t in exact_required:
        if t not in (answer or ""):
            failures.append("missing exact text: " + t)
    failures.extend(grade_language(answer, expected_language))
    return failures

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--tests", default="l9_15_test_cases.json")
    ap.add_argument("--results", required=True,
                    help="JSON array/object containing id + answer, and conversation turns where applicable")
    ap.add_argument("--out", default="l9_15_graded_results.json")
    args=ap.parse_args()

    tests=json.loads(Path(args.tests).read_text(encoding="utf-8"))
    raw=json.loads(Path(args.results).read_text(encoding="utf-8"))
    if isinstance(raw, dict) and "results" in raw:
        raw_results=raw["results"]
    elif isinstance(raw, list):
        raw_results=raw
    else:
        raise SystemExit("Unsupported results format. Expected list or {'results': [...]}.")

    by_id={r.get("id"):r for r in raw_results}
    graded=[]
    total=passed=0
    language_failures=[]

    for t in tests["single_turn_tests"]:
        total += 1
        r=by_id.get(t["id"],{})
        ans=r.get("answer","")
        expected_language=t.get("expected_language") or expected_language_from_query(t.get("query",""))
        fails=grade_answer(ans,t.get("required_groups"),t.get("forbidden_any"),t.get("exact_required"),expected_language)
        if any("language mismatch" in f for f in fails):
            language_failures.append(t["id"])
        ok=not fails
        passed += int(ok)
        graded.append({"id":t["id"],"category":t["category"],"query":t["query"],"answer":ans,"pass":ok,"reasons":fails})

    for c in tests.get("conversation_tests",[]):
        total += 1
        r=by_id.get(c["id"],{})
        turns=r.get("turns",[])
        cfails=[]
        gout=[]
        for i, exp in enumerate(c["turns"]):
            ans = turns[i].get("answer","") if i < len(turns) else ""
            expected_language=exp.get("expected_language") or expected_language_from_query(exp.get("user",""))
            fails=grade_answer(ans,exp.get("required_groups"),exp.get("forbidden_any"),exp.get("exact_required"),expected_language)
            if any("language mismatch" in f for f in fails):
                language_failures.append(f'{c["id"]}#turn{i+1}')
            if fails:
                cfails.append(f"turn {i+1}: " + "; ".join(fails))
            gout.append({"user":exp["user"],"answer":ans,"pass":not fails,"reasons":fails})
        ok=not cfails
        passed += int(ok)
        graded.append({"id":c["id"],"category":c["category"],"pass":ok,"turns":gout,"reasons":cfails})

    out={"suite":tests["suite"],"summary":{"total":total,"passed":passed,"failed":total-passed,
         "score_pct":round(100*passed/total,1) if total else 0,
         "failedIds":[g["id"] for g in graded if not g["pass"]],
         "languageValidationFailures":language_failures},"results":graded}
    Path(args.out).write_text(json.dumps(out,indent=2,ensure_ascii=False),encoding="utf-8")
    print(json.dumps(out["summary"],indent=2))
    print(f"Wrote {args.out}")

if __name__=="__main__":
    main()
