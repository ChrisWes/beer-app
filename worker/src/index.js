export default {
  // GET /run — manual trigger for testing without waiting for cron
  async fetch(req, env) {
    if (new URL(req.url).pathname === '/run') {
      const result = await runImport(env)
      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('rounds-untappd-sync ok')
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

async function scrapeUntappd(username) {
  const res = await fetch(`https://untappd.com/user/${username}/beers`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.5',
    },
  })
  if (!res.ok) throw new Error(`Untappd ${res.status} for ${username}`)
  const html = await res.text()
  return parseCheckins(html)
}

function parseCheckins(html) {
  const checkins = []
  // Each beer card sits in a block starting with class="beer-item"
  const blockRe = /class="beer-item[\s\S]*?(?=class="beer-item|<\/ul>|$)/g
  const blocks = html.match(blockRe) ?? []

  for (const b of blocks) {
    const checkin_id = b.match(/data-checkin-id="(\d+)"/)?.[1] ?? null
    const beer_name  = b.match(/class="beer-name"[^>]*>([^<]+)</)?.[1]?.trim() ?? null
    const brewery    = b.match(/class="brewery"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/)?.[1]?.trim() ?? null
    const rating_raw = b.match(/data-rating="([\d.]+)"/)?.[1]
    const venue_name = b.match(/<a\s+href="\/v\/[^"]*"[^>]*>([^<]+)<\/a>/)?.[1]?.trim() ?? null
    const datetime   = b.match(/datetime="([^"]+)"/)?.[1] ?? null

    if (!beer_name || !brewery) continue

    checkins.push({
      untappd_checkin_id: checkin_id,
      beer_name,
      brewery,
      style:          null,
      abv:            null,
      style_category: null,
      // Untappd uses 0–5 stars; RPC expects 0–10
      score:          rating_raw ? Math.round(parseFloat(rating_raw) * 2 * 10) / 10 : null,
      note:           null,
      drank_at:       datetime ? new Date(datetime).toISOString() : null,
      venue_name,
    })
  }
  return checkins
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
