# Course Routing Report - AI Product Photoshoot & Ads

Generated: 2026-10-14 18:46 IST

## Product-Price Routing

Local regression verified that product/ad pricing prompts stay in the active AI Product Photoshoot & Ads course flow instead of routing to Skillomate subscription facts.

Covered examples include:

- "I sell a copper water bottle on Instagram. Price is 899. Plan an ad."
- "My product price is 899, write hooks and a caption"
- Follow-up: "Now write the hooks without fake claims."

## Subscription Routing

Explicit Skillomate subscription questions still route to deterministic Skillomate plan facts.

## Live Evaluation Routing

Merged live results recorded 53/55 cases with fal-openrouter model responses. Two conversation cases timed out and fell back before a live answer was returned.

## Course Isolation

Automated live grader marked course isolation as FAIL (0/1). See live_merged_graded_results.json and failed_test_analysis.md for details.
