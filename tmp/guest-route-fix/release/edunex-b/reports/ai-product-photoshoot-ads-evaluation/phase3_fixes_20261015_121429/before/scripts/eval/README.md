# Product-course evaluation

Use `grade_product_photoshoot_ads_results_v2.py` for current offline grading. The
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
