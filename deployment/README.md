# Skillomate production deployment

Production is deployed manually from GitHub `main`. Application source is not
copied from a developer machine.

- EC2 repository: `/home/ubuntu/skillomate_repo`
- Backend directory: `/home/ubuntu/skillomate_repo/edunex-b`
- Stable PM2 path: `/home/ubuntu/skillomate_backend`
- EC2 deployment command: `/home/ubuntu/bin/deploy-skillomate.sh`
- Local command: `/Users/kratik/deploy-skillomate-production.sh`.
- Repository orchestrator: `deployment/deploy-skillomate-production.sh`.
  It deploys EC2 #1, then #2, then #3, and stops immediately on failure.
- Production fleet (all `m7g.large`, ARM64):
  - EC2 #1: `13.235.104.167`
  - EC2 #2: `3.108.8.89`
  - EC2 #3: `13.201.21.124`
- Override the SSH key with
  `SKILLOMATE_SSH_KEY=/absolute/path/to/key.pem` when needed.

The orchestrator uses a local atomic lock to prevent overlapping rolling
deployments and pins one full `origin/main` SHA for the complete run. Each EC2
script also uses `flock` to prevent per-host overlap. The EC2 script refuses
dirty worktrees, requires an ignored and untracked `.env`, fetches GitHub,
deploys the pinned commit only while it still equals `origin/main`, installs and
builds the web frontend, runs backend `npm ci --omit=dev`, restarts and saves
PM2, then verifies `/api/health`, `/api/ready`, `/api/courses`, PM2 status, port
3000, and the deployed commit. A post-switch failure automatically resets only
that EC2 to its previous commit, reinstalls dependencies, restarts PM2, and
repeats the health, readiness, courses, and runtime checks. The orchestrator
does not continue to later instances after any failure.

Per-instance logs are retained both locally under
`/Users/kratik/skillomate-deployment-logs` and remotely under
`/home/ubuntu/skillomate_deployments`. The application `.env` is never copied
from the Mac.

The old rsync production directories remain available for manual emergency
recovery from the first migration. They must not be deleted as part of normal
deployments.
