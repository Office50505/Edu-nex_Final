# Skillomate production deployment

Production is deployed manually from GitHub `main`. Application source is not
copied from a developer machine.

- EC2 repository: `/home/ubuntu/skillomate_repo`
- Backend directory: `/home/ubuntu/skillomate_repo/edunex-b`
- Stable PM2 path: `/home/ubuntu/skillomate_backend`
- EC2 deployment command: `/home/ubuntu/bin/deploy-skillomate.sh`
- Local command, from any checkout: `bash deployment/deploy-skillomate-production.sh`.
- Repository orchestrator: `deployment/deploy-skillomate-production.sh`.
  It discovers the current healthy `InService` instances in
  `skillomate-backend-asg` in `ap-south-1`, sorts their instance IDs, and
  deploys them sequentially. The instance count follows the ASG desired
  capacity; no fixed instance IDs or addresses are used.
- The target group is `skillomate-backend-tg`. The script verifies that it is
  attached to the ASG and that every candidate target is healthy.
- The default SSH key is `$HOME/Downloads/Skillomate_Key.pem`; override it with
  `SKILLOMATE_SSH_KEY=/absolute/path/to/key.pem` when needed.

The orchestrator uses a local atomic lock to prevent overlapping rolling
deployments, requires the local SSM bootstrap and SSM-aware remote deployer,
and pins one full `origin/main` SHA for the complete run. It uses read-only
AWS CLI `describe` calls to get ASG membership, EC2 public addresses, and
target health. It refuses a mixed or unstable ASG, missing public IPs,
unreachable SSH, or an untrusted SSH host key before any deployment starts.
Before each instance it rechecks ASG membership, EC2 identity and address, and
target health; after each instance it waits for the target to become healthy.
It stops on any failure. The local machine needs AWS CLI credentials with
read-only Auto Scaling, EC2, and ELBv2 describe permissions, plus Python 3
and a trusted SSH host key for each current instance. Each EC2
script also uses `flock` to prevent per-host overlap. It requires the current
commit to contain the tracked SSM bootstrap so rollback can remain in SSM mode.
The EC2 script refuses
dirty worktrees, requires an ignored and untracked `.env`, fetches GitHub,
deploys the pinned commit only while it still equals `origin/main`, installs and
builds the web frontend, and runs backend `npm ci --omit=dev`. Before changing
PM2 it runs `node ssm-bootstrap.js --check` against the 73 SecureStrings under
`/skillomate/prod/` in `ap-south-1`. A failed SSM check restores the previous
commit and dependencies without restarting that backend; the rolling deployment
stops and later EC2 instances are untouched.

The `skillomate_backend` PM2 process runs `ssm-bootstrap.js` with explicit
`NODE_ENV=production` and `SKILLOMATE_CONFIG_SOURCE=ssm`. If PM2 still points to
`server.js`, the deploy script replaces that process with the SSM entrypoint; if
it already points to the SSM entrypoint, it restarts with `--update-env`. It
then verifies PM2 online status, script path and both environment flags,
`/api/health`, `/api/ready` with MongoDB and Redis both connected,
`/api/courses` as a JSON list, port 3000, and the pinned Git commit. `pm2 save`
runs only after those checks pass. An already-current commit receives the same
SSM and runtime checks and repairs a mismatched PM2 entrypoint.

A post-restart failure resets only that EC2 to its previous commit, reinstalls
dependencies, runs the SSM check again, restarts through `ssm-bootstrap.js`,
and repeats the health, readiness, courses, runtime, and commit checks before
saving PM2. The orchestrator never continues to later instances after a
failure. The ignored `.env` remains in place as an emergency fallback and is
not changed by deployment.
If target-group health alone fails after the remote deployer reports success,
the wrapper stops before the next instance; the operator must investigate that
instance and decide whether to run a separate rollback. The remote automatic
rollback is triggered by failures inside the per-instance deployer.

This SSH workflow changes in-service targets without draining them. For an
ASG whose instances have no public IP or cannot accept SSH, use a versioned
application artifact baked into a new launch template version, then an ASG
Instance Refresh with target-group health checks, a conservative minimum
healthy percentage, and automatic rollback. A reviewed SSM Run Command
workflow can also run the existing per-instance deploy script one instance at
a time, verifying each target before continuing. Either approach needs its own
reviewed deployment procedure; this script intentionally stops rather than
falling back to an unverified access path. An in-place Git deployment alone
does not make replacement ASG instances boot into the deployed commit.

Old fixed-IP servers should only be retired after confirming they are absent
from the ASG and target group, DNS and load-balancer traffic no longer reaches
them, replacement instances reproduce the intended commit and SSM PM2 setup,
and rollback has been tested. Their old addresses are not evidence of any of
those conditions.

Per-instance logs are retained both locally under
`$HOME/skillomate-deployment-logs` and remotely under
`/home/ubuntu/skillomate_deployments`. The application `.env` is never copied
from the Mac.

The old rsync production directories remain available for manual emergency
recovery from the first migration. They must not be deleted as part of normal
deployments.

Local checks that do not contact production:

```bash
bash -n deployment/deploy-skillomate-production.sh deployment/deploy-skillomate.sh
bash deployment/test-ssm-deploy.sh
bash deployment/test-rolling-deploy.sh
bash deployment/test-deploy-skillomate-rollback.sh
bash deployment/test-frontend-s3-deploy.sh
```

## S3 and CloudFront frontend

`skillomate.in` is served from S3 through CloudFront, so frontend cache headers
must be applied as S3 object metadata. The Express static cache policy does not
affect this delivery path. Deploy the built frontend with:

```bash
SKILLOMATE_FRONTEND_BUCKET=your-bucket \
SKILLOMATE_FRONTEND_DISTRIBUTION_ID=your-distribution-id \
bash deployment/deploy-frontend-s3.sh
```

The script gives HTML a revalidation policy, ordinary static files a 30-day
cache, and Vite-hashed or explicitly versioned assets a one-year immutable
cache. It then invalidates the CloudFront distribution so updated route shells
are available immediately. Use `--skip-build` only when `edunex-f/dist` already
contains the exact production build to upload.
