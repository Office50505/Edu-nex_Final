#!/usr/bin/env python3
import argparse
import json
import re
from pathlib import Path


def norm(value):
    value = (value or "").lower()
    value = value.replace("–", "-").replace("—", "-").replace("’", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", value).strip()


HINGLISH_MARKERS = [
    r"\baap\b", r"\bapko\b", r"\baapko\b", r"\bkaise\b", r"\bkya\b", r"\bmein\b",
    r"\bme\b", r"\bhai\b", r"\bhain\b", r"\bkaro\b", r"\bkarein\b", r"\bmat\b",
    r"\bnahi\b", r"\bye\b", r"\byeh\b", r"\btoh\b", r"\bke liye\b", r"\blag",
    r"\bsakta\b", r"\bsakti\b", r"\bchahiye\b", r"\bsikhaya\b", r"\brakho\b",
    r"\blikho\b", r"\bdaalo\b", r"\bbatao\b", r"\bagar\b", r"\bkarna\b",
    r"\bkaunsi\b", r"\bkaunsa\b", r"\bkaunse\b", r"\bbhai\b", r"\brha\b",
    r"\bdheema\b", r"\bseedha\b", r"\bgalti\b", r"\brang\b", r"\bhaath\b",
]


def has_devanagari(value):
    return bool(re.search(r"[\u0900-\u097f]", value or ""))


def strip_quoted_devanagari(answer):
    value = answer or ""
    value = re.sub(r'"[^"]*[\u0900-\u097f][^"]*"', " ", value)
    value = re.sub(r"'[^']*[\u0900-\u097f][^']*'", " ", value)
    value = re.sub(r"\([^)]*[\u0900-\u097f][^)]*\)", " ", value)
    return value


def looks_hinglish(answer):
    text = norm(strip_quoted_devanagari(answer))
    hits = sum(1 for pattern in HINGLISH_MARKERS if re.search(pattern, text))
    return hits >= 2


def expected_language_from_query(query):
    q = norm(query)
    if has_devanagari(query) or re.search(r"\b(?:answer|reply|respond|explain|bolo|batao)\s+(?:in\s+)?hindi\b", q) or re.search(r"\bin\s+hindi\b|\bhindi\s+mein\b", q):
        return "hindi"
    if re.search(r"\b(?:hinglish|roman hindi)\b", q):
        return "hinglish"
    if re.search(r"\b(?:kya|kaise|kaunsi|kaunsa|kaunse|mein|hai|hain|batao|chahiye|nahi|agar|karo|karu|lag|bhai|rha|ya)\b", q):
        return "hinglish"
    if re.search(r"\bke\s+liye\b", q):
        return "hinglish"
    return "english"


def grade_language(answer, expected_language):
    expected_language = expected_language or "english"
    if expected_language in ("english", "en"):
        if has_devanagari(answer) or looks_hinglish(answer):
            return ["language mismatch: expected English"]
    if expected_language == "hinglish":
        if has_devanagari(strip_quoted_devanagari(answer)) or not looks_hinglish(answer):
            return ["language mismatch: expected Roman Hinglish"]
    if expected_language == "hindi":
        if not has_devanagari(answer):
            return ["language mismatch: expected Hindi in Devanagari"]
    return []


def group_satisfied(answer, group):
    a = norm(answer)
    return any(norm(term) in a for term in group)


def grade_answer(answer, required_groups=None, forbidden_any=None, exact_required=None, expected_language=None):
    required_groups = required_groups or []
    forbidden_any = forbidden_any or []
    exact_required = exact_required or []
    failures = []
    a = norm(answer)
    for group in required_groups:
        if not group_satisfied(answer, group):
            failures.append("missing semantic group: " + " | ".join(group))
    for term in forbidden_any:
        if norm(term) in a:
            failures.append("contains forbidden: " + term)
    for term in exact_required:
        if term not in (answer or ""):
            failures.append("missing exact text: " + term)
    failures.extend(grade_language(answer, expected_language))
    return failures


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tests", default="scripts/eval/product_photoshoot_ads_test_cases.json")
    parser.add_argument("--results", required=True, help="JSON list or {'results': [...]} with id + answer values")
    parser.add_argument("--out", default="reports/product_photoshoot_ads_graded_results.json")
    args = parser.parse_args()

    tests = json.loads(Path(args.tests).read_text(encoding="utf-8"))
    raw = json.loads(Path(args.results).read_text(encoding="utf-8"))
    if isinstance(raw, dict) and "results" in raw:
        raw_results = raw["results"]
    elif isinstance(raw, list):
        raw_results = raw
    else:
        raise SystemExit("Unsupported results format. Expected list or {'results': [...]}.")

    by_id = {result.get("id"): result for result in raw_results}
    graded = []
    total = 0
    passed = 0
    language_failures = []

    for test in tests["single_turn_tests"]:
        total += 1
        result = by_id.get(test["id"], {})
        answer = result.get("answer", "")
        expected_language = test.get("expected_language") or expected_language_from_query(test.get("query", ""))
        failures = grade_answer(answer, test.get("required_groups"), test.get("forbidden_any"), test.get("exact_required"), expected_language)
        if any("language mismatch" in failure for failure in failures):
            language_failures.append(test["id"])
        ok = not failures
        passed += int(ok)
        graded.append({
            "id": test["id"],
            "category": test["category"],
            "query": test["query"],
            "answer": answer,
            "pass": ok,
            "reasons": failures,
        })

    for convo in tests.get("conversation_tests", []):
        total += 1
        result = by_id.get(convo["id"], {})
        turns = result.get("turns", [])
        conversation_failures = []
        graded_turns = []
        for index, expected in enumerate(convo["turns"]):
            answer = turns[index].get("answer", "") if index < len(turns) else ""
            expected_language = expected.get("expected_language") or expected_language_from_query(expected.get("user", ""))
            failures = grade_answer(answer, expected.get("required_groups"), expected.get("forbidden_any"), expected.get("exact_required"), expected_language)
            if any("language mismatch" in failure for failure in failures):
                language_failures.append(f"{convo['id']}#turn{index + 1}")
            if failures:
                conversation_failures.append(f"turn {index + 1}: " + "; ".join(failures))
            graded_turns.append({
                "user": expected["user"],
                "answer": answer,
                "pass": not failures,
                "reasons": failures,
            })
        ok = not conversation_failures
        passed += int(ok)
        graded.append({
            "id": convo["id"],
            "category": convo["category"],
            "pass": ok,
            "turns": graded_turns,
            "reasons": conversation_failures,
        })

    output = {
        "suite": tests["suite"],
        "summary": {
            "total": total,
            "passed": passed,
            "failed": total - passed,
            "score_pct": round(100 * passed / total, 1) if total else 0,
            "failedIds": [item["id"] for item in graded if not item["pass"]],
            "languageValidationFailures": language_failures,
        },
        "results": graded,
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(output["summary"], indent=2, ensure_ascii=False))
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
