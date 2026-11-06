# Product-course evaluation

Use `grade_product_photoshoot_ads_results_v6.py` for Phase 9 offline grading. The
v5 evaluator remains unchanged for Phase 7/8 historical results. The
v4 evaluator is preserved unchanged for Phase 5/6 historical scores. The
v3 evaluator is preserved unchanged for Phase 3/4 historical scores. The
v2 evaluator is preserved unchanged with its historical scores. The
original `grade_product_photoshoot_ads_results.py` is retained unchanged to explain
the historical scores. Historical raw responses, test definitions and reports
must remain immutable.

From `edunex-b`, regrade the saved corpus into a **new output filename**:

```sh
python3 -B scripts/eval/grade_product_photoshoot_ads_results_v2.py \
  --results reports/ai-product-photoshoot-ads-evaluation/live_20261014_182739/live_merged_raw_results.json \
  --historical-grade reports/ai-product-photoshoot-ads-evaluation/live_20261014_182739/live_merged_graded_results.json \
  --out /private/tmp/product-course-regrade-new.json
```

The grader makes no model requests. It separates execution from quality, preserves
original answers, checks complete stored templates with permitted slot values,
and reports correctness, language, references, safety and prompt accuracy per
turn. Its semantic rules cover a finite set of course concepts and paraphrases;
human review remains necessary for unfamiliar wording. Template normalization
permits whitespace/quote style and a determiner inside a supplied part name, not
edits to the approved template clauses. Colour-only invariance entails unchanged
shape/details; it does not permit changing the shape. Output creation is exclusive
to prevent accidental replacement of historical results.

Run local tests with real networking disabled:

```sh
NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs node --test \
  tests/ai-chat-history.test.cjs tests/tutor-knowledge.test.cjs \
  tests/product-tutor-quality.test.cjs tests/mobile-course-ai.test.cjs \
  tests/mobile-course-ai-cache.test.cjs
python3 -B -m unittest discover -s tests -p test_product_evaluator.py -v
```

These checks use provider fixtures, not live answers. A regrade of historical
responses cannot establish the quality of newly implemented tutor behavior. A
new live evaluation is a separate action requiring user approval.

The default `--scope live_model` grades only actual provider answers. For a future
authorized integrated-tutor evaluation, `--scope end_to_end` can assess known
local course rules and policy replacements as tutor outputs, while reporting them
separately from live model turns. Provider fallback remains an availability
outcome in both modes. Never compare the two scope percentages without naming
their different denominators and execution sources.

Phase 3 adds an independent expected-product parser, complete known-slot checks,
contextual paraphrases/negation, short Hinglish coverage, and a `task_completion`
dimension. A promise to write a caption, script, hook list or angle is not a
delivered output. Wrong quantities and altered approved clauses still fail.
Non-safety forbidden content, such as platform pricing in a product-ad answer,
is a correctness failure; it is not mislabeled as deceptive advertising.

Run the expanded offline tests:

```sh
NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs node --test \
  tests/ai-chat-history.test.cjs tests/tutor-knowledge.test.cjs \
  tests/product-tutor-quality.test.cjs tests/product-tutor-phase3.test.cjs \
  tests/mobile-course-ai.test.cjs tests/mobile-course-ai-cache.test.cjs
python3 -B -m unittest discover -s tests -p 'test_product_evaluator*.py' -v
```

Finite heuristics still need independent review for unfamiliar wording. A Phase 3
regrade of Phase 2 responses measures rubric changes only; it is never a new
live-model score. Product practice drafts are source-scoped local outputs built
from the learner's explicit facts. Their origin remains a local rule. If a
provider answer is replaced for safety, language, references or missing output,
the application records a validated local replacement, not unchanged live text.

Phase 5 adds v4 independently of the preserved v3. It checks exact intent in
multi-turn categories, parses colour/part clauses independently, recognizes
reviewed Hindi/Hinglish equivalents, and detects declarative synthetic-customer
claims. Omitting an otherwise unnecessary product-name echo is accepted only
when a later complete product-bearing template proves the correct identity;
generic replies and incorrect/unfilled templates provide no such proof.
Full template clauses, exact FAQ sentences, technical settings, requested
deliverables, safety and access boundaries remain required. Regrading saved
Phase 4 responses measures evaluator differences only, never new live quality.

Include `tests/product-tutor-phase5.test.cjs` in the Node command above. The Python
discovery command includes v4-specific tests and the unchanged v3 assertions run
against v4 as compatibility checks, in addition to the historical v2/v3 suites.


Phase 7 v5 independently recognizes explicit Hindi/Hinglish product names,
natural English declarations and anaphoric references without overwriting a
known product. A supplied proper name can retain its original script without
changing the explanation language. A lesson label before a direct course-identity
refusal is presentation only. Demonstrate/showcase synonyms and postposed
review prohibitions are interpreted in their actual clause; unrelated negation
does not excuse an affirmative synthetic-customer claim. Concrete demo requests
require visual actions and an example line; informational demo questions do not.
Requested quantities with descriptive adjectives remain required. Complete
approved template bodies and verbatim FAQ instructions remain strict.

Include `tests/product-tutor-phase7.test.cjs` in the Node command. Python discovery
runs new v5 checks, 16 unchanged v4 assertions against v5, and historical v2–v4
tests. Network denial applies to the Node run; all Python graders are offline.
A new file, for example `phase6_saved_response_regrade_v5_final.json`, records
v5 grading of the unchanged Phase 6 corpus. It must never replace v4 results or
be described as fresh performance. Product tutor runtime code never reads saved
evaluation questions or IDs.


Phase 9 v6 corrects overlapping request prepositions, explicit known-product
substitution, regenerate equivalents, and scoped Hindi/Roman prohibitions. An
explanatory comparison must distinguish both requested concepts; a generic
refusal is not a completed comparison. An explicitly failed translation remains
a task-completion failure even when the earlier answer is retained as a quote.
All complete-template clauses, literal FAQ requirements, quantities, lesson
references, access restrictions and safety requirements remain required. V5 and
historical scores/raw responses are preserved. A historical regrade is never a
new runtime score.

Independent full-template validation uses `audit_product_templates.py`, which
imports neither runtime product parsing nor a grader. Before generating answers,
freeze reviewer-declared known slots and complete expected bodies. The auditor
reconstructs each expected body from the original course source and rejects
changed expectations, unresolved known products, wrong substitutions, truncated
bodies, extra executable instructions and extra executable blocks.

```sh
python3 -B scripts/eval/audit_product_templates.py \
  --expectations path/to/independent_template_expectations_frozen.json \
  --results path/to/saved_results.json \
  --knowledge knowledge/ai-product-photoshoot-ads/training.txt \
  --out path/to/new_independent_audit.json
```

Include `tests/product-tutor-phase9.test.cjs` in the Node regression command.
Python discovery includes the v6 and independent-auditor tests. Route tests use
local provider fixtures for one bounded language repair under the shared
25-second generation budget; they do not execute a live provider evaluation.
