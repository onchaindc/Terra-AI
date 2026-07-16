# Terra AI A2A Railway Deployment

This deploys the OKX A2A responder as a second Railway service. It does not
replace or modify the existing Terra AI HTTP/x402 service.

## Repository files

- `Dockerfile.a2a`: Linux image for the A2A worker.
- `railway.a2a.toml`: Railway build and start configuration.
- `scripts/start-a2a-railway.sh`: waits for one-time authentication, then starts
  the foreground responder.
- `cloud-a2a/AGENTS.md`: Terra AI instructions loaded only by the cloud Codex
  process.
- `.agents/skills/okx-ai`: OKX agent communication instructions used by Codex.

## 1. Push the deployment files

The GitHub-connected Railway build can only see committed files. Commit and push:

```powershell
git add cloud-a2a/AGENTS.md Dockerfile.a2a railway.a2a.toml scripts/start-a2a-railway.sh docs/RAILWAY_A2A_DEPLOY.md .agents/skills/okx-ai
git commit -m "Add Railway A2A worker"
git push origin main
```

## 2. Create the Railway worker

In the existing Railway project:

1. Create a new service from the `onchaindc/Terra-AI` GitHub repository.
2. Name it `Terra-A2A-Worker`.
3. Set its config file path to `/railway.a2a.toml`.
4. Do not generate a public domain. This is a background worker.
5. Add a persistent volume mounted at `/data`.

The service's exact start command is:

```text
bash /app/scripts/start-a2a-railway.sh
```

The first deployment intentionally stays alive without starting the responder
until the cloud wallet and Codex CLI have been authenticated.

## 3. Open a Railway SSH session

Install and connect the Railway CLI from PowerShell:

```powershell
npm.cmd install -g @railway/cli
railway login
cd "C:\Users\hp\Documents\TERRA AI AGENT"
railway link
railway ssh -s Terra-A2A-Worker
```

## 4. Authenticate inside Railway

Run these commands inside the Railway Linux shell:

```bash
onchainos wallet login
codex login --device-auth
okx-a2a doctor --fix --json
```

For the wallet login, use the same email account that owns Terra AI #5105 and
complete its email OTP. For Codex, open the displayed device-auth URL on any
browser and approve the displayed code.

Do not continue until the final JSON includes:

```json
{
  "ready": true,
  "blockingFailures": 0
}
```

The `/data` volume preserves:

```text
/data/home/.onchainos
/data/home/.codex
/data/okx-agent-task
```

## 5. Start the permanent responder

Exit the Railway shell and restart `Terra-A2A-Worker` from the Railway dashboard.
The service will now execute:

```text
okx-a2a run --provider codex
```

The deployment log must contain:

```text
[terra-a2a] Starting the Terra AI A2A responder.
```

## 6. Verify before stopping the laptop responder

From another OKX.ai user session, send:

```text
I would like to use the services of agent ID 5105
```

After Terra AI responds successfully through the Railway worker, stop the local
Windows responder:

```powershell
okx-a2a.exe daemon stop
```

Then repeat the OKX.ai test with the laptop responder stopped. Terra AI must
still respond before the migration is considered complete.
