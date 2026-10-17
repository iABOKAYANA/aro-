// GHAYA Estate — PM2 process file (Ubuntu VPS).
// Next.js auto-loads `.env` from `cwd`, so secrets live in /opt/ghaya/.env
// (copied from deploy/ENV.PRODUCTION.TEMPLATE). Only APP_MODE + PORT differ
// per app and are set inline below. Scheduler/jobs run on web-console only:
// src/instrumentation.ts skips periodic jobs when APP_MODE=public.
// Logs: /var/log/ghaya/*.log (pm2-logrotate: 20M max, 14 retained — see vps-setup.sh).
// NOTE: wa-bot stays STOPPED until API_BASE + WHATSAPP_INGEST_SECRET +
// MONITORED_GROUPS are configured in workers/whatsapp-bot/.env — then run
// `pm2 start ecosystem.config.js --only wa-bot`.

const APP_DIR = '/opt/ghaya';

module.exports = {
  apps: [
    {
      name: 'web-public',
      cwd: APP_DIR,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        APP_MODE: 'public', // buyer site; never fires periodic jobs
        PORT: '3000',
        CONSOLE_HOST: 'console.ghayaestate.com',
      },
      out_file: '/var/log/ghaya/web-public-out.log',
      error_file: '/var/log/ghaya/web-public-err.log',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '1G',
    },
    {
      name: 'web-console',
      cwd: APP_DIR,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        APP_MODE: 'console', // staff console; OWNS scheduler + all uploads
        PORT: '3001',
        CONSOLE_HOST: 'console.ghayaestate.com',
      },
      out_file: '/var/log/ghaya/web-console-out.log',
      error_file: '/var/log/ghaya/web-console-err.log',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '1G',
    },
    {
      name: 'wa-bot',
      cwd: `${APP_DIR}/workers/whatsapp-bot`,
      script: 'index.mjs',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true, // Baileys drops need restarts; exits(1) on missing env surfaces fast
      max_memory_restart: '512M',
      // Env comes from workers/whatsapp-bot/.env (API_BASE, WHATSAPP_INGEST_SECRET,
      // MONITORED_GROUPS). DISABLED UNTIL CONFIGURED — see note at top.
      out_file: '/var/log/ghaya/wa-bot-out.log',
      error_file: '/var/log/ghaya/wa-bot-err.log',
      merge_logs: true,
    },
  ],
};
