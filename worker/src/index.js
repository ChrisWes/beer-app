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

// Delegate scraping to the existing worker which already handles Untappd HTML parsing
const SCRAPER_URL = 'https://lively-surf-0e39.chris-weston.workers.dev/scrape/untappd'

async function scrapeUntappd(username) {
  const res = await fetch(SCRAPER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  })
  if (!res.ok) throw new Error(`Scraper returned ${res.status} for ${username}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.checkins ?? []
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
