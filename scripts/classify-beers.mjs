/**
 * Usage:
 *   cd scripts && npm install && npx playwright install chromium
 *   node classify-beers.mjs ../unclassified-beers.json results.json
 *
 * Reads a JSON array of { id, name, brewery } objects, searches Untappd for
 * each one using a real visible browser (avoids bot detection), and writes a
 * results JSON that can be imported back through the Admin page.
 */

import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'

const [,, inputFile, outputFile] = process.argv
if (!inputFile || !outputFile) {
  console.error('Usage: node classify-beers.mjs <input.json> <output.json>')
  process.exit(1)
}

const beers = JSON.parse(readFileSync(inputFile, 'utf8'))
console.log(`Loaded ${beers.length} beers to classify\n`)

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage()

await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-GB,en;q=0.9' })

// Visit homepage first to get cookies / establish a session
console.log('Loading Untappd homepage...')
await page.goto('https://untappd.com', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)

const results = []
let found = 0

for (let i = 0; i < beers.length; i++) {
  const beer = beers[i]
  const progress = `[${i + 1}/${beers.length}]`

  try {
    const q = encodeURIComponent(`${beer.name} ${beer.brewery}`)
    await page.goto(`https://untappd.com/search?q=${q}&type=beer`, { waitUntil: 'domcontentloaded' })

    // Random jitter 0.8–1.6s between requests
    await page.waitForTimeout(800 + Math.random() * 800)

    const item = await page.$('.beer-item')
    if (!item) {
      console.log(`${progress} ✗ ${beer.name} — no result`)
      results.push({ ...beer, found: false })
      continue
    }

    const style   = await item.$eval('.style', el => el.textContent.trim()).catch(() => null)
    const abvText = await item.$eval('.abv',   el => el.textContent.trim()).catch(() => null)
    const abv     = abvText ? parseFloat(abvText) : null
    const style_category = mapStyleCategory(style)

    results.push({ id: beer.id, name: beer.name, brewery: beer.brewery, style, abv, style_category, found: true })
    found++
    console.log(`${progress} ✓ ${beer.name} → ${style ?? '(no style)'} [${style_category ?? 'no match'}]`)
  } catch (e) {
    console.error(`${progress} ✗ ${beer.name}: ${e.message}`)
    results.push({ ...beer, found: false, error: e.message })
  }
}

await browser.close()
writeFileSync(outputFile, JSON.stringify(results, null, 2))
console.log(`\nDone — ${found} / ${beers.length} matched`)
console.log(`Results written to ${outputFile}`)

// ─── style mapping (mirrors Admin.jsx mapStyleCategory) ──────────────────────

function mapStyleCategory(style, beerName = '') {
  const s = `${style || ''} ${beerName || ''}`.toLowerCase()
  if (!s.trim()) return null
  if (s.includes('imperial stout') || s.includes('imperial porter') || s.includes('russian imperial')) return 'imperial_stout'
  if (s.includes('stout') || s.includes('porter')) return 'stout_porter'
  if (s.includes('milkshake ipa') || s.includes('pastry ipa')) return 'milkshake_ipa'
  if (s.includes('session ipa')) return 'session_ipa'
  if (s.includes('west coast ipa') || s.includes('wc ipa')) return 'west_coast_ipa'
  if (s.includes('double ipa') || s.includes('dipa') || s.includes('double india pale')) return 'dipa'
  if (s.includes('neipa') || s.includes('new england ipa')) return 'neipa'
  if (s.includes('hazy ipa') || s.includes('hazy india')) return 'hazy_ipa'
  if (s.includes('ipa') || s.includes('india pale') || s.includes('india ipa')) return 'ipa'
  if (s.includes('mild')) return 'mild'
  if (s.includes('bitter') || s.includes('best bitter') || s.includes('epa')) return 'bitter'
  if (s.includes('pale ale') || s.includes('pale')) return 'pale_ale'
  if (s.includes('cider') || s.includes('cyder')) return 'cider'
  if (s.includes('dunkel') || s.includes('dark lager')) return 'dunkel'
  if (s.includes('lager') || s.includes('pilsner') || s.includes('pilsener') || s.includes('helles') || s.includes('kolsch') || s.includes('kölsch') || s.includes('pils')) return 'lager'
  if (s.includes('saison') || s.includes('farmhouse')) return 'saison'
  if (s.includes('sour') || s.includes('lambic') || s.includes('gueuze') || s.includes('gose') || s.includes('berliner') || s.includes('wild ale') || s.includes('kriek')) return 'sour_wild'
  if (s.includes('wheat') || s.includes('hefeweizen') || s.includes('witbier') || s.includes('weizen') || s.includes('wit')) return 'wheat'
  if (s.includes('belgian') || s.includes('tripel') || s.includes('dubbel') || s.includes('quadrupel') || s.includes(' quad')) return 'belgian'
  if (s.includes('amber') || s.includes('red ale') || s.includes('red ipa')) return 'amber_red'
  if (s.includes('barleywine') || s.includes('barley wine')) return 'barleywine'
  return null
}
