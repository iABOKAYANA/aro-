# GHAYA Estate — VPS go-live checklist (Ubuntu 22.04)

## 0. Provision
- [ ] Fresh Ubuntu 22.04 VPS (2 vCPU / 4 GB RAM minimum; 40 GB disk).
- [ ] `bash deploy/vps-setup.sh` as root (Node 20, PM2, nginx, certbot, sqlite3/openssl).

## 1. DNS
- [ ] A record `@` → server IP (ghayaestate.com).
- [ ] A record `console` → server IP (console.ghayaestate.com).
- [ ] Verify: `dig +short ghayaestate.com` and `dig +short console.ghayaestate.com`
      both return the server IP. Wait for propagation (up to a few hours) before certbot.

## 2. TLS
- [ ] `certbot --nginx -d ghayaestate.com -d console.ghayaestate.com`
- [ ] `curl -sI https://ghayaestate.com | head -3` → 200/307 with HSTS header (app-set).

## 3. Env
- [ ] `cp deploy/ENV.PRODUCTION.TEMPLATE /opt/ghaya/.env` and fill every REQUIRED var.
- [ ] Secrets generated (`openssl rand -base64 32` for AUTH_SECRET, `-hex 32` for WHATSAPP_INGEST_SECRET).
- [ ] `CONSOLE_HOST=console.ghayaestate.com`, `AUTH_URL=https://ghayaestate.com`.
- [ ] Confirm `.env` is NOT in git (`git status --ignored` / `.gitignore` covers `.env*`).
- [ ] Never print secret VALUES (names only) in chat, tickets, or logs.

## 4. Database — `db push` (NOT `migrate deploy`)
- [ ] Why push: the repo has NO `prisma/migrations/` directory (verified), so
      `prisma migrate deploy` has nothing to apply and fails. `prisma db push`
      syncs the SQLite schema directly — correct for a single-VPS deploy.
- [ ] `npx prisma generate && npx prisma db push`
- [ ] (Future: when the team adopts `prisma migrate dev` locally and commits
      `prisma/migrations/`, switch this step to `prisma migrate deploy`.)

## 5. Seed CEO
- [ ] `npx tsx prisma/create-ceo.ts` — creates `ceo@estateai.eg / password123`
      ONLY if no CEO exists (idempotent; prints the email, no secrets beyond the
      well-known dev password).
- [ ] Log in at https://console.ghayaestate.com/auth/login and CHANGE the password immediately.

## 6. Build + start
- [ ] `npm ci && npm run build`
- [ ] `pm2 start deploy/ecosystem.config.js && pm2 save`
- [ ] `pm2 status` → web-public (3000) + web-console (3001) both `online`. wa-bot stays
      `stopped` until its `.env` (API_BASE, WHATSAPP_INGEST_SECRET, MONITORED_GROUPS) is set.

## 7. Smoke probes (exact URLs)
- [ ] `curl -s -o /dev/null -w '%{http_code}\n' https://ghayaestate.com/` → 200
- [ ] `curl -s -o /dev/null -w '%{http_code}\n' https://console.ghayaestate.com/` → 200
- [ ] `curl -sI https://ghayaestate.com/ | grep -i content-security-policy` → present (app-set)
- [ ] `curl -s https://ghayaestate.com/api/health 2>/dev/null || curl -s http://127.0.0.1:3000/api/health` → ok
- [ ] Staff gate: `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://ghayaestate.com/ceo` → 307 to console host
- [ ] Console login page loads: `curl -s -o /dev/null -w '%{http_code}\n' https://console.ghayaestate.com/auth/login` → 200

## 8. Backup verify
- [ ] `GHAYA_APP_DIR=/opt/ghaya bash deploy/backup-cron.sh` → `OK ...` line in `~/GHAYA_backups/backup.log`.
- [ ] Install cron line from `deploy/CRON.txt` (`crontab -e`).
- [ ] Restore drill (staging or temp dir): SQLite → `sqlite3 <backup> "PRAGMA integrity_check;"` = ok;
      Postgres → `gunzip -c <backup> | psql <empty-test-db>` succeeds.

## 9. Rollback
- [ ] Note the good git hash BEFORE each deploy: `git rev-parse --short HEAD`.
- [ ] Rollback: `git fetch && git checkout <good-hash> && npm ci && npm run build && pm2 restart all && pm2 save`.
- [ ] DB rollback: restore the matching `~/GHAYA_backups/` file from before the deploy
      (stop PM2 first for SQLite: `pm2 stop all`, copy back, `pm2 start all`).
- [ ] Verify smoke probes (§7) again after rollback.
