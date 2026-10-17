/**
 * No-dependency allowlist HTML sanitizer for CEO-authored CMS content
 * (blog posts, press releases), which is rendered with
 * `dangerouslySetInnerHTML` on the public site.
 *
 * Sanitize ON WRITE (API POST/PATCH); render paths are untouched.
 *
 * Rules:
 *  - Allowed tags: p br strong em u a ul ol li h1-h4 blockquote img
 *    (matches what the CEO textarea editor produces — plain text plus
 *    pasted rich-text formatting).
 *  - `script`/`style` and embeds (iframe/object/embed) plus other
 *    active/metadata tags are dropped WITH their content.
 *  - Non-allowlisted formatting tags are unwrapped (inner text kept).
 *  - All event-handler (`on*`) and `style` attributes are stripped; only
 *    `href` (on `a`) and `src`/`alt`/`title`/`loading` (on `img`) survive,
 *    and URLs are restricted to http(s) + site-relative paths —
 *    `javascript:`/`data:`/`vbscript:` URLs are dropped.
 *  - HTML comments are removed; stray text is entity-escaped.
 */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'u', 'a',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4',
  'blockquote', 'img',
])

/** Tags dropped entirely, including inner content. */
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed',
  'link', 'meta', 'base', 'form', 'input', 'button',
  'select', 'textarea', 'frame', 'frameset', 'applet',
  'video', 'audio', 'source', 'track', 'canvas',
  'noscript', 'template', 'slot',
])

const VOID_TAGS = new Set(['br', 'img'])

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** http(s) or site-relative (`/…`, `#…`) only — never javascript:/data:/vbscript:. */
function isSafeUrl(raw: string): boolean {
  const v = raw.trim()
  if (!v) return false
  if (v.startsWith('/') && !v.startsWith('//')) return true
  if (v.startsWith('#')) return true
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v)
      return u.protocol === 'http:' || u.protocol === 'https:'
    } catch {
      return false
    }
  }
  return false
}

function parseAttrs(attrString: string): Array<{ name: string; value: string | null }> {
  const attrs: Array<{ name: string; value: string | null }> = []
  // name="v" | name='v' | name=v | bare name
  const re = /([a-zA-Z-:]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`>]+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrString)) !== null) {
    attrs.push({ name: m[1].toLowerCase(), value: m[2] ?? m[3] ?? m[4] ?? null })
  }
  return attrs
}

export function sanitizeHtml(input: unknown): string {
  if (typeof input !== 'string' || !input) return ''
  // Tag tokenizer tolerates `>` inside quoted attribute values
  // (e.g. `<img src="data:...<svg>...">`) so a stray `<` in an attribute
  // can never be misread as a new tag.
  const tagRe = /<!--[\s\S]*?-->|<\/?[a-zA-Z](?:[^<>"']|"[^"]*"|'[^']*')*?>/g
  let out = ''
  let last = 0
  // Depth of DROP_WITH_CONTENT nesting currently being swallowed.
  let dropDepth = 0
  // Stack of open drop-tags so `<script><div></script>`-style soup still ends.
  const dropStack: string[] = []

  const pushText = (text: string) => {
    if (dropDepth === 0 && text) out += escapeText(text)
  }

  let m: RegExpExecArray | null
  while ((m = tagRe.exec(input)) !== null) {
    pushText(input.slice(last, m.index))
    last = m.index + m[0].length
    const token = m[0]
    if (token.startsWith('<!--')) continue // strip comments

    const isClose = token[1] === '/'
    const nameMatch = /^<\/?([a-zA-Z][a-zA-Z0-9]*)/.exec(token)
    if (!nameMatch) {
      pushText(token)
      continue
    }
    const tag = nameMatch[1].toLowerCase()
    const selfClose = token.endsWith('/>')

    if (dropDepth > 0) {
      if (!isClose && !selfClose && DROP_WITH_CONTENT.has(tag)) {
        dropStack.push(tag)
        dropDepth++
      } else if (isClose && dropStack.length && dropStack[dropStack.length - 1] === tag) {
        dropStack.pop()
        dropDepth--
      } else if (isClose && DROP_WITH_CONTENT.has(tag) && dropStack.length === 0) {
        // Unbalanced close for the tag that opened the drop — end it.
        dropDepth = 0
      }
      continue
    }

    if (DROP_WITH_CONTENT.has(tag)) {
      if (!isClose && !selfClose && !VOID_TAGS.has(tag)) {
        dropStack.push(tag)
        dropDepth = 1
      }
      continue // drop the tag itself either way
    }

    if (!ALLOWED_TAGS.has(tag)) {
      continue // unwrap: drop tag, keep inner text
    }

    if (isClose) {
      if (!VOID_TAGS.has(tag)) out += `</${tag}>`
      continue
    }

    // Open (or self-closing) allowlisted tag — rebuild with safe attrs only.
    const attrString = token
      .replace(/^<[a-zA-Z][a-zA-Z0-9]*/, '')
      .replace(/\/?>$/, '')
    let kept = ''
    for (const { name, value } of parseAttrs(attrString)) {
      if (name.startsWith('on') || name === 'style' || name === 'srcset') continue
      if (tag === 'a' && name === 'href' && value != null && isSafeUrl(value)) {
        kept += ` href="${escapeAttr(value.trim())}"`
      } else if (
        tag === 'img' &&
        (name === 'alt' || name === 'title' || name === 'loading') &&
        value != null
      ) {
        kept += ` ${name}="${escapeAttr(value)}"`
      }
      // `width`/`height` must be plain integers to survive.
      else if (tag === 'img' && (name === 'width' || name === 'height') && value != null && /^\d{1,4}$/.test(value.trim())) {
        kept += ` ${name}="${value.trim()}"`
      }
    }
    if (tag === 'img') {
      const srcMatch = /(?:\s|^)src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`>]+))/i.exec(attrString)
      const src = (srcMatch?.[1] ?? srcMatch?.[2] ?? srcMatch?.[3] ?? '').trim()
      if (!isSafeUrl(src)) continue // drop img with unsafe/missing src
      out += `<img src="${escapeAttr(src)}"${kept}>`
    } else if (tag === 'br') {
      out += '<br>'
    } else {
      out += `<${tag}${kept}>`
    }
  }
  pushText(input.slice(last))
  return out
}
