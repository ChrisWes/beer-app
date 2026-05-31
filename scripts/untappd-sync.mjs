/**
 * Untappd auto-sync via Playwright (bypasses Cloudflare JS challenge)
 *
 * Usage (one-off):
 *   cd scripts && node untappd-sync.mjs
 *
 * Windows Task Scheduler (daily at 22:50):
 *   Program: node
 *   Arguments: C:\Users\julie\documents\rounds\scripts\untappd-sync.mjs
 *   Start in: C:\Users\julie\documents\rounds\scripts
 *
 * Requires:
 *   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set as environment variables,
 *   or a .env file in the scripts/ directory (loaded below).
 */

import { chromium } from 'playwright'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createInterface } from 'readline'

function waitForEnter(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(prompt, () => { rl.close(); resolve() }))
}

// ── Minimal .env loader (no extra deps) ──────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)\s*=\s*"?([^"\n]+)"?/)
    if (m) process.env[m[1]] = m[2].trim()
  }
} else {
  console.warn(`No .env found at ${envPath}`)
}

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// ── Supabase helpers ──────────────────────────────────────────
const sbHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}${path}`, { headers: sbHeaders })
  return r.json()
}

async function sbPost(path, body) {
  const r = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  })
  return r.json()
}

async function sbPatch(path, body) {
  await fetch(`${SUPABASE_URL}${path}`, {
    method: 'PATCH',
    headers: sbHeaders,
    body: JSON.stringify(body),
  })
}

// ── Style mapping (mirrors worker/src/index.js) ───────────────
function mapStyleCategory(style) {
  const s = (style || '').toLowerCase()
  if (!s) return null
  if (s.includes('imperial stout') || s.includes('imperial porter') || s.includes('russian imperial')) return 'imperial_stout'
  if (s.includes('stout') || s.includes('porter')) return 'stout_porter'
  if (s.includes('milkshake ipa') || s.includes('pastry ipa')) return 'milkshake_ipa'
  if (s.includes('session ipa')) return 'session_ipa'
  if (s.includes('west coast ipa') || s.includes('wc ipa')) return 'west_coast_ipa'
  if (s.includes('double ipa') || s.includes('dipa') || s.includes('double india pale')) return 'dipa'
  if (s.includes('new england') || s.includes('neipa')) return 'neipa'
  if (s.includes('hazy') || s.includes('juicy')) return 'hazy_ipa'
  if (s.includes('ipa') || s.includes('india pale')) return 'ipa'
  if (s.includes('mild')) return 'mild'
  if (s.includes('bitter') || s.includes('best bitter')) return 'bitter'
  if (s.includes('golden ale') || s.includes('golden') || s.includes('blonde')) return 'golden_ale'
  if (s.includes('pale ale') || s.includes('pale')) return 'pale_ale'
  if (s.includes('cider') || s.includes('cyder')) return 'cider'
  if (s.includes('dunkel') || s.includes('dark lager')) return 'dunkel'
  if (s.includes('lager') || s.includes('pilsner') || s.includes('pilsener') || s.includes('helles') || s.includes('kolsch') || s.includes('kölsch') || s.includes('pils')) return 'lager'
  if (s.includes('saison') || s.includes('farmhouse')) return 'saison'
  if (s.includes('sour') || s.includes('lambic') || s.includes('gueuze') || s.includes('gose') || s.includes('berliner') || s.includes('wild ale') || s.includes('kriek')) return 'sour_wild'
  if (s.includes('wheat') || s.includes('hefeweizen') || s.includes('witbier') || s.includes('weizen') || s.includes('wit')) return 'wheat'
  if (s.includes('belgian') || s.includes('tripel') || s.includes('dubbel') || s.includes('quadrupel') || s.includes(' quad')) return 'belgian'
  if (s.includes('fruit') || s.includes('cherry') || s.includes('raspberry') || s.includes('strawberry') || s.includes('mango') || s.includes('peach') || s.includes('berry')) return 'fruit'
  if (s.includes('amber') || s.includes('red ale')) return 'amber_red'
  if (s.includes('winter')) return 'winter_warmer'
  if (s.includes('dark ale')) return 'dark_ale'
  if (s.includes('barleywine') || s.includes('barley wine')) return 'barleywine'
  return null
}

// ── HTML parser — activity feed format (untappd.com/user/:name) ─
function parseCheckins(html) {
  const checkins = []
  const blocks = html.split('data-checkin-id="').slice(1)

  for (const b of blocks) {
    const checkin_id = b.match(/^(\d+)"/)?.[1] ?? null

    // Beer name and brewery from the activity sentence:
    // is drinking a <a href="/b/...">Beer Name</a> by <a href="/Brewery">Brewery</a>
    const beerBrewery = b.match(/href="\/b\/[^"]+">([^<]+)<\/a>\s+by\s+<a[^>]+>([^<]+)<\/a>/)
    const beer_name   = beerBrewery?.[1]?.trim() ?? null
    const brewery     = beerBrewery?.[2]?.trim() ?? null

    // Rating: <div class="caps" data-rating="4.4">
    const rating_raw  = b.match(/class="caps[^"]*"\s+data-rating="([\d.]+)"/)?.[1]

    // Timestamp: data-gregtime="Sat, 30 May 2026 20:48:05 +0000"
    const gregtime    = b.match(/data-gregtime="([^"]+)"/)?.[1] ?? null

    // Serving type: <p class="serving">...<span>Can</span>
    const serving_type = b.match(/<p class="serving">[^<]*<img[^>]*>[^<]*<span>([^<]+)<\/span>/)?.[1]?.trim() ?? null

    if (!beer_name || !brewery) continue

    checkins.push({
      untappd_checkin_id: checkin_id,
      beer_name,
      brewery,
      style:          null,
      abv:            null,
      style_category: null,
      score:          rating_raw ? Math.round(parseFloat(rating_raw) * 2 * 10) / 10 : null,
      note:           null,
      drank_at:       gregtime ? new Date(gregtime).toISOString() : null,
      venue_name:     null,
      serving_type,
    })
  }
  return checkins
}

// ── Main ──────────────────────────────────────────────────────
const profiles = await sbGet(
  '/rest/v1/profiles?untappd_username=not.is.null&select=id,untappd_username,last_untappd_import'
)

if (!profiles?.length) {
  console.log('No profiles with untappd_username configured.')
  process.exit(0)
}

console.log(`Found ${profiles.length} profile(s) to sync: ${profiles.map(p => p.untappd_username).join(', ')}\n`)

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
})
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  locale: 'en-GB',
  extraHTTPHeaders: { 'Accept-Language': 'en-GB,en;q=0.9' },
})
const page = await context.newPage()

// Warm up with homepage to get cookies
console.log('Establishing Untappd session...')
await page.goto('https://untappd.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(1500)

const results = []

for (const profile of profiles) {
  const { id: user_id, untappd_username, last_untappd_import } = profile
  console.log(`\nSyncing ${untappd_username}...`)

  try {
    await page.goto(`https://untappd.com/user/${untappd_username}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    await page.waitForTimeout(6000)

    const html = await page.content()
    if (html.includes('Something went wrong') || html.includes('cf-error')) {
      throw new Error('Blocked by Cloudflare challenge page')
    }

    const checkins = parseCheckins(html)
    console.log(`  Parsed ${checkins.length} check-ins from page`)

    if (!checkins.length) {
      const diagPath = join(__dirname, `diag-${untappd_username}.html`)
      writeFileSync(diagPath, html)
      console.log(`  No check-ins found — saved raw HTML to ${diagPath}`)
      results.push({ user: untappd_username, imported: 0, note: 'no checkins parsed' })
      continue
    }

    const cutoff = last_untappd_import ? new Date(last_untappd_import) : null
    const fresh = checkins.filter(c => !cutoff || (c.drank_at && new Date(c.drank_at) > cutoff))
    console.log(`  ${fresh.length} new since last import (cutoff: ${cutoff?.toDateString() ?? 'none'})`)

    if (!fresh.length) {
      results.push({ user: untappd_username, imported: 0, note: 'nothing new' })
      continue
    }

    const rpcResult = await sbPost('/rest/v1/rpc/import_untappd_checkins', {
      p_user_id: user_id,
      p_checkins: fresh,
    })

    await sbPatch(`/rest/v1/profiles?id=eq.${user_id}`, {
      last_untappd_import: new Date().toISOString(),
    })

    console.log(`  ✓ Imported ${fresh.length} check-ins`)
    results.push({ user: untappd_username, imported: fresh.length, rpc: rpcResult })

  } catch (e) {
    console.error(`  ✗ Failed: ${e.message}`)
    results.push({ user: untappd_username, error: e.message })
  }

  // Pause between users to avoid triggering rate limits
  if (profiles.indexOf(profile) < profiles.length - 1) {
    await page.waitForTimeout(3000)
  }
}

await browser.close()

console.log('\n── Summary ──────────────────────────────')
for (const r of results) console.log(JSON.stringify(r))
