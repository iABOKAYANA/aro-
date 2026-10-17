import { getAppMode } from './lib/app-type'

export async function register() {
  // Server-side automation for lead protection (Section 24).
  // Runs once per Node.js server boot — independent of any browser session.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Single-owner gating for the two-deployment split: the public
    // deployment (APP_MODE=public) must never fire periodic jobs, otherwise
    // both deployments write duplicate notifications. The console deployment
    // (APP_MODE=console/all) owns them.
    if (getAppMode() === 'public') {
      console.log('[instrumentation] periodic jobs skipped: APP_MODE=public (console owns them)')
      return
    }
    const { startLeadJobs } = await import('./lib/jobs/lead-sweeper')
    startLeadJobs()
  }
}
