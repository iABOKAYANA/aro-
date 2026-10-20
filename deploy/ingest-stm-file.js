// One-off: ingest an already-downloaded HTML file (curl -k, invalid-cert
// site: stm.com.eg) into AIKnowledge. Reads /tmp/stm.html.
const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const p = new PrismaClient()

function stripHtml(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ').trim()
}

async function main() {
  const html = fs.readFileSync('/tmp/stm.html', 'utf8')
  const text = stripHtml(html).slice(0, 20000)
  const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = tm ? stripHtml(tm[1]).slice(0, 100) : 'STM Investment Group'
  const chunks = []
  const CHUNK = 1800, OVER = 150
  for (let i = 0; i < text.length; i += CHUNK - OVER) {
    chunks.push(text.slice(i, i + CHUNK))
    if (chunks.length >= 6) break
  }
  let added = 0
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].length < 200) continue
    const url = 'https://stm.com.eg/' + (i ? '#c' + i : '')
    const ex = await p.aIKnowledge.findUnique({ where: { url } })
    if (!ex) { await p.aIKnowledge.create({ data: { source: 'developer-site', url, title, content: chunks[i], chunkIdx: i, wordCount: chunks[i].split(/\s+/).length } }); added++ }
  }
  console.log('stm chunks added:', added, 'total:', await p.aIKnowledge.count())
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
