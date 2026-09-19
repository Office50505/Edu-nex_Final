# Skillomate production deployment

Production is deployed manually from GitHub `main`. Application source is not
copied from a developer machine.

- EC2 repository: `/home/ubuntu/skillomate_repo`
- Backend directory: `/home/ubuntu/skillomate_repo/edunex-b`
- Stable PM2 path: `/home/ubuntu/skillomate_backend`
- EC2 deployment command: `/home/ubuntu/bin/deploy-skillomate.sh`
- Repository helper: `deployment/deploy-skillomate-production.sh`. It uses
  `../Skillomate_Key.pem` relative to the repository by default; override with
  `SKILLOMATE_SSH_KEY=/absolute/path/to/key.pem` when needed.

The EC2 script refuses dirty worktrees, requires an ignored and untracked
`.env`, uses `flock` to prevent concurrent deployments, deploys the exact
`origin/main` commit, installs and builds the web frontend, installs the backend,
verifies PM2 and both API endpoints, and
automatically resets to the previous commit if a post-switch step fails.

The old rsync production directories remain available for manual emergency
recovery from the first migration. They must not be deleted as part of normal
deployments.
