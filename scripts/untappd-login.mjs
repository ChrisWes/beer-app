/**
 * One-off: log in to Untappd in a real browser window and save the session
 * cookies so untappd-sync.mjs can page back through full check-in history.
 *
 * Usage:
 *   cd scripts && node untappd-login.mjs
 *   gh secret set UNTAPPD_SESSION < untappd-session.json
 *
 * Re-run both steps whenever the sync reports the session has expired.
 * untappd-session.json is a credential — it is gitignored, never commit it.
 */

import { chromium } from 'playwright'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outPath = join(__dirname, 'untappd-session.json')

// Prefer installed Chrome — Untappd's login captcha is less likely to trip on it
const browser = await chromium.launch({ headless: false, channel: 'chrome' })
  .catch(() => chromium.launch({ headless: false }))
const context = await browser.newContext()
const page = await context.newPage()
await page.goto('https://untappd.com/login', { waitUntil: 'domcontentloaded' })

console.log('Log in to Untappd in the browser window (waiting up to 5 minutes)...')

const deadline = Date.now() + 5 * 60_000
let loggedIn = false
while (Date.now() < deadline) {
  await page.waitForTimeout(2000)
  const html = await page.content().catch(() => '')
  if (!page.url().includes('/login') && html.includes('/logout')) { loggedIn = true; break }
}

if (!loggedIn) {
  console.error('Timed out waiting for login.')
  await browser.close()
  process.exit(1)
}

// Cloudflare clearance cookies are bound to this machine's IP — drop them,
// CI gets its own when it loads the homepage.
const cookies = (await context.cookies())
  .filter(c => c.domain.includes('untappd.com'))
  .filter(c => !c.name.startsWith('cf_') && !c.name.startsWith('__cf'))

writeFileSync(outPath, JSON.stringify({ cookies, origins: [] }))
await browser.close()

console.log(`Saved ${cookies.length} cookies to ${outPath}`)
console.log('Now run:  gh secret set UNTAPPD_SESSION < untappd-session.json')
