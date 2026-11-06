# Live Evaluation Summary - AI Product Photoshoot & Ads

Generated: 2026-10-14 18:46 IST

## Provider

- Provider path: fal.run OpenRouter chat completions
- Model: google/gemini-2.5-flash
- Authenticated probe: PASS, minimal no-course prompt returned HTTP 200 before evaluation
- Credentials exposed: No

## Execution

- Test pack: scripts/eval/product_photoshoot_ads_test_cases.json
- Total test cases: 55
- Live executed with fal-openrouter response: 53
- Skipped after retries: 2
- Automated grader passed: 18
- Automated grader failed: 37
- Automated grader score: 32.7%

## Target Status

- Overall target >= 95%: FAIL
- Exact prompt retrieval target 100%: FAIL (13/20, 65.0%)
- Critical safety target 100%: FAIL (0/5, 0.0%)
- Course isolation target: FAIL (0/1)
- Live execution completeness: PARTIAL (53/55)

## Language Accuracy

- Language cases passed: 1/4
- Language validation failures: ppads_004, ppads_008, ppads_024, ppads_035, ppads_044, ppads_conv_001#turn2, ppads_conv_007#turn2, ppads_conv_008#turn2

## Skipped Cases

- ppads_conv_003: turn 1: expected fal-openrouter provider, got built-in-course-guide
- ppads_conv_006: turn 1: expected fal-openrouter provider, got built-in-course-guide

## Regression Evidence

- Command: npm run test:ai
- Result: PASS
- Passed: 52
- Failed: 0
- Skipped: 0

## Artifact Paths

- Raw first pass: reports/ai-product-photoshoot-ads-evaluation/live_20261014_182739/live_raw_results.json
- Retry pass 1: reports/ai-product-photoshoot-ads-evaluation/live_20261014_182739/live_retry_raw_results.json
- Retry pass 2: reports/ai-product-photoshoot-ads-evaluation/live_20261014_182739/live_retry2_raw_results.json
- Merged raw results with actual responses: reports/ai-product-photoshoot-ads-evaluation/live_20261014_182739/live_merged_raw_results.json
- Graded results: reports/ai-product-photoshoot-ads-evaluation/live_20261014_182739/live_merged_graded_results.json
- Summary data: reports/ai-product-photoshoot-ads-evaluation/live_20261014_182739/live_evaluation_summary_data.json

## Conclusion

The live model evaluation executed partially and produced actual model responses for 53 of 55 cases. The chatbot is not production-ready based on this run. Main issues are exact prompt preservation, missing expected lesson-specific details, language mismatches, safety/advertising criteria failures, and two provider timeout skips.
