# Failed Test Analysis - AI Product Photoshoot & Ads

## Live Failures

No live-provider failures were recorded because zero cases executed against the live provider.

## Skipped Tests

All 55 test cases were skipped for live scoring due to the provider/network approval blocker. These skipped tests must not be interpreted as passing or failing model behavior.

## Critical Blocker

Live provider evaluation was blocked. Direct provider probe failed in sandbox with DNS error: getaddrinfo ENOTFOUND fal.run. Network escalation to run the provider evaluation was rejected because it would send course material/evaluation prompts to fal.run without fresh explicit approval for that specific third-party payload.

## Observed Non-Live Issues From Fallback Attempt

- The route fell back to `built-in-course-guide` for most cases after provider `TypeError`; these answers were not scored.
- `ppads_conv_002` was routed to `skillomate-plan-facts` because the user message contained pricing language: "Price is 899. Plan an ad." This is a diagnostic observation from the attempted run and should be reviewed before the next live evaluation, but it was not counted as a live model failure.

## Required Next Step

Run the same 55-case pack from an environment with approved access to `fal.run`, or obtain explicit approval to send the course/evaluation prompts to that provider from this environment.
