#!/bin/bash
# GHAYA Estate — idempotent Ubuntu 22.04 VPS setup.
# Hostnames baked in (change here if the domain ever moves):
PUBLIC_HOST="ghayaestate.com"           # → Next.js web-public :3000
CONSOLE_HOST="console.ghayaestate.com"  # → Next.js web-console :3001
APP_DIR="/opt/ghaya"                    # git checkout lives here
# Run once as root:  bash deploy/vps-setup.sh
# Re-runnable: every step checks before it acts.
set -euo pipefail

echo "== 1/7 system packages =="
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
# openssl+sqlite3: Prisma client + SQLite backup path. certbot-nginx: TLS.
apt-get install -y -qq curl git sqlite3 openssl ca-certificates nginx certbot python3-certbot-nginx > /dev/null

echo "== 2/7 Node.js 20 LTS =="
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q '^v20\.'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null
  apt-get install -y -qq nodejs > /dev/null
fi
node -v

echo "== 3/7 PM2 =="
command -v pm2 >/dev/null 2>&1 || npm i -g pm2 > /dev/null
pm2 -v
pm2 startup systemd -u root --hp /root > /dev/null || true

echo "== 4/7 Prisma OpenSSL/client deps =="
# Prisma engines need OpenSSL 1.1 or 3 (22.04 ships 3 — fine) + libvips-less sharp works out of box.
ldconfig -p | grep -q libssl || apt-get install -y -qq libssl3 > /dev/null
echo "openssl: $(openssl version)"

echo "== 5/7 app dir + nginx skeleton =="
mkdir -p "$APP_DIR"
[ -f /etc/nginx/sites-available/ghaya ] || cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/ghaya 2>/dev/null || true
[ -L /etc/nginx/sites-enabled/ghaya ] || ln -sf /etc/nginx/sites-available/ghaya /etc/nginx/sites-enabled/ghaya
nginx -t && systemctl reload nginx || true

echo "== 6/7 firewall (ufw, optional) =="
command -v ufw >/dev/null 2>&1 && { ufw allow 'Nginx Full' > /dev/null; ufw allow OpenSSH > /dev/null; } || true

echo "== 7/7 log rotation =="
# PM2 log rotation plugin (install once; settings persist).
pm2 install pm2-logrotate > /dev/null 2>&1 || true
pm2 set pm2-logrotate:max_size 20M > /dev/null 2>&1 || true
pm2 set pm2-logrotate:retain 14 > /dev/null 2>&1 || true

echo ""
echo "NEXT STEPS:"
echo "  1. Point DNS A records (@ and console) at this server IP (see deploy/CHECKLIST.md)."
echo "  2. certbot --nginx -d $PUBLIC_HOST -d $CONSOLE_HOST"
echo "  3. cd $APP_DIR && cp deploy/ENV.PRODUCTION.TEMPLATE .env && fill secrets (never commit)."
echo "  4. npm ci && npx prisma generate && npx prisma db push && npm run build"
echo "  5. pm2 start deploy/ecosystem.config.js && pm2 save"
echo "  6. Install backup cron: crontab -e  (line in deploy/CRON.txt)"
