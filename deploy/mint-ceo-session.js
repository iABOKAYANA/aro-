// Mint a valid Auth.js v5 session JWT for the CEO Admin user using the app's
// own AUTH_SECRET, so we can probe every /ceo page server-side like a real
// signed-in session. No data is modified (GET probes only afterwards).
const fs = require('fs')
const { encode } = require('next-auth/jwt')

async function main() {
  const env = fs.readFileSync('/opt/ghaya/.env', 'utf8')
  const m = env.match(/^AUTH_SECRET=(.*)$/m) || env.match(/^NEXTAUTH_SECRET=(.*)$/m)
  if (!m) throw new Error('no AUTH_SECRET in .env')
  const secret = m[1].trim().replace(/^["']|["']$/g, '')

  const token = {
    sub: 'cmv86a0l600002skymmeejoi0',
    id: 'cmv86a0l600002skymmeejoi0',
    email: 'ceo@estateai.eg',
    name: 'CEO Admin',
    role: 'CEO',
    phone: null,
    status: 'ACTIVE',
    exp: Math.floor(Date.now() / 1000) + 2 * 60 * 60,
  }
  for (const salt of ['__Secure-authjs.session-token', 'authjs.session-token']) {
    const jwt = await encode({ token, secret, salt })
    console.log(salt + '=' + jwt)
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1) })
