const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default {
  async fetch(req, env) {
    const path = new URL(req.url).pathname

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS })
    }

    // GET /run — manual trigger
    if (path === '/run') {
      const result = await runImport(env)
      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    // POST /lookup-style — look up style/ABV for a batch of beers on Untappd
    if (path === '/lookup-style' && req.method === 'POST') {
      const { beers } = await req.json()
      const results = []
      for (const b of beers) {
        try {
          results.push(await lookupStyle(b))
        } catch (e) {
          results.push({ id: b.id, found: false, error: e.message })
        }
      }
      return new Response(JSON.stringify(results), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    return new Response('rounds-untappd-sync ok', { headers: CORS })
  },

  async scheduled(_event, env) {
    await runImport(env)
  },
}

async function runImport(env) {
  const profiles = await sbGet(env,
    '/rest/v1/profiles?untappd_username=not.is.null&select=id,untappd_username,last_untappd_import')

  const results = []
  for (const profile of profiles ?? []) {
    try {
      const r = await importForUser(env, profile)
      results.push({ user: profile.untappd_username, ...r })
    } catch (e) {
      console.error(`[${profile.untappd_username}]`, e.message)
      results.push({ user: profile.untappd_username, error: e.message })
    }
  }
  return results
}

async function importForUser(env, { id: user_id, untappd_username, last_untappd_import }) {
  const checkins = await scrapeUntappd(untappd_username)

  const cutoff = last_untappd_import ? new Date(last_untappd_import) : null
  const fresh = checkins.filter(c =>
    !cutoff || (c.drank_at && new Date(c.drank_at) > cutoff)
  )

  if (fresh.length === 0) {
    console.log(`[${untappd_username}] nothing new (${checkins.length} seen)`)
    return { imported: 0, skipped: checkins.length }
  }

  const rpcResult = await sbPost(env, '/rest/v1/rpc/import_untappd_checkins', {
    p_user_id: user_id,
    p_checkins: fresh,
  })

  await sbPatch(env, `/rest/v1/profiles?id=eq.${user_id}`, {
    last_untappd_import: new Date().toISOString(),
  })

  console.log(`[${untappd_username}] imported ${fresh.length} checkins`)
  return { imported: fresh.length, rpc: rpcResult }
}

async function fetchUntappdHtml(username) {
  const res = await fetch(`https://untappd.com/user/${username}/beers`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.5',
    },
  })
  if (!res.ok) throw new Error(`Untappd ${res.status} for ${username}`)
  return res.text()
}

async function scrapeUntappd(username) {
  const html = await fetchUntappdHtml(username)
  return parseCheckins(html)
}

function parseCheckins(html) {
  const checkins = []
  // Split on each beer-item div — actual structure confirmed from live HTML
  const blocks = html.split('<div class="beer-item"').slice(1)

  for (const b of blocks) {
    // Beer name: <p class="name"><a ...>Name</a></p>
    const beer_name = b.match(/class="name"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/)?.[1]?.trim() ?? null
    // Brewery: <p class="brewery"><a ...>Brewery</a></p>
    const brewery   = b.match(/class="brewery"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/)?.[1]?.trim() ?? null
    // Style: <p class="style">Style text</p>
    const style     = b.match(/class="style"[^>]*>([^<]+)<\/p>/)?.[1]?.trim() ?? null
    // ABV: <p class="abv">4.2% ABV</p>
    const abv_raw   = b.match(/class="abv"[^>]*>\s*([\d.]+)%/)?.[1]
    // Their rating — first data-rating value in the block (second is global rating)
    const rating_raw = b.match(/data-rating="([\d.]+)"/)?.[1]
    // Dates — two <abbr class="date-time"> elements: First then Recent
    const dates     = [...b.matchAll(/class="date-time">([^<]+)<\/abbr>/g)].map(m => m[1])
    const drank_at  = dates[1] ?? dates[0] ?? null   // prefer Recent over First
    // Checkin ID from the checkin URL
    const checkin_id = b.match(/\/checkin\/(\d+)\//)?.[1] ?? null

    if (!beer_name || !brewery) continue

    checkins.push({
      untappd_checkin_id: checkin_id,
      beer_name,
      brewery,
      style,
      abv:            abv_raw ? parseFloat(abv_raw) : null,
      style_category: mapStyleCategory(style),
      score:          rating_raw ? Math.round(parseFloat(rating_raw) * 2 * 10) / 10 : null,
      note:           null,
      drank_at:       drank_at ? new Date(drank_at).toISOString() : null,
      venue_name:     null,
    })
  }
  return checkins
}

async function lookupStyle({ id, name, brewery }) {
  const q = encodeURIComponent(`${name} ${brewery}`)
  const res = await fetch(`https://untappd.com/search?q=${q}&type=beer`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.5',
    },
  })
  if (!res.ok) throw new Error(`Untappd ${res.status}`)
  const html = await res.text()
  return parseSearchResult(id, html)
}

function parseSearchResult(id, html) {
  const block = html.split('<div class="beer-item"')[1]
  if (!block) return { id, found: false }

  const style   = block.match(/class="style"[^>]*>([^<]+)<\/p>/)?.[1]?.trim() ?? null
  const abv_raw = block.match(/class="abv"[^>]*>\s*([\d.]+)%/)?.[1]
  const abv     = abv_raw ? parseFloat(abv_raw) : null
  const style_category = mapStyleCategory(style)

  return { id, found: true, style, abv, style_category }
}

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
  if (s.includes('amber') || s.includes('red ale')) return 'amber_red'
  if (s.includes('winter')) return 'winter_warmer'
  if (s.includes('dark ale')) return 'dark_ale'
  if (s.includes('strong ale') && s.includes('english')) return 'barleywine'
  if (s.includes('barleywine') || s.includes('barley wine')) return 'barleywine'
  return null
}

function sbHeaders(env) {
  return {
    'apikey':        env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type':  'application/json',
  }
}

async function sbGet(env, path) {
  const r = await fetch(`${env.SUPABASE_URL}${path}`, { headers: sbHeaders(env) })
  return r.json()
}

async function sbPost(env, path, body) {
  const r = await fetch(`${env.SUPABASE_URL}${path}`, {
    method: 'POST',
    headers: { ...sbHeaders(env), 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  })
  return r.json()
}

async function sbPatch(env, path, body) {
  await fetch(`${env.SUPABASE_URL}${path}`, {
    method: 'PATCH',
    headers: sbHeaders(env),
    body: JSON.stringify(body),
  })
}
