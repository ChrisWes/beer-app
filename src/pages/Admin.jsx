import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const WORKER_URL = import.meta.env.VITE_WORKER_URL

// Map Untappd style strings to our style categories
function mapStyleCategory(style) {
  if (!style) return 'other'
  const s = style.toLowerCase()
  if (s.includes('imperial stout') || s.includes('imperial porter')) return 'imperial_stout'
  if (s.includes('stout') || s.includes('porter')) return 'stout_porter'
  if (s.includes('ipa') || s.includes('india pale')) return 'ipa'
  if (s.includes('pale ale')) return 'pale_ale'
  if (s.includes('lager') || s.includes('pilsner') || s.includes('pilsener') || s.includes('helles') || s.includes('kolsch') || s.includes('kölsch')) return 'lager'
  if (s.includes('sour') || s.includes('lambic') || s.includes('gueuze') || s.includes('gose') || s.includes('berliner') || s.includes('wild') || s.includes('saison')) return 'sour_wild'
  if (s.includes('wheat') || s.includes('hefeweizen') || s.includes('witbier')) return 'wheat'
  if (s.includes('belgian') || s.includes('tripel') || s.includes('dubbel') || s.includes('quad')) return 'belgian'
  if (s.includes('amber') || s.includes('red ale') || s.includes('red ipa')) return 'amber_red'
  if (s.includes('barleywine') || s.includes('barley wine')) return 'barleywine'
  return 'other'
}

export default function Admin() {
  const { profile } = useAuth()
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState('')
  const [untappdUsername, setUntappdUsername] = useState('')
  const [scraping, setScraping] = useState(false)
  const [scraped, setScraped] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [log, setLog] = useState([])

  useEffect(() => {
    supabase.from('profiles').select('id, display_name').then(({ data }) => {
      setUsers(data ?? [])
    })
  }, [])

  function addLog(msg) {
    setLog(l => [...l, `${new Date().toLocaleTimeString()} — ${msg}`])
  }

  async function scrape() {
    if (!untappdUsername.trim()) return
    setScraping(true)
    setScraped(null)
    setImportResult(null)
    setLog([])
    addLog(`Fetching Untappd profile for @${untappdUsername}...`)

    try {
      const res = await fetch(`${WORKER_URL}/scrape/untappd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: untappdUsername.trim() }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      addLog(`Found ${data.checkin_count} check-ins.`)
      setScraped(data)
    } catch (err) {
      addLog(`Error: ${err.message}`)
    }
    setScraping(false)
  }

  function handleJsonUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLog([])
    setImportResult(null)
    setScraped(null)
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result)
        if (!data.checkins || !Array.isArray(data.checkins)) throw new Error('Invalid format')
        addLog(`Loaded ${data.checkin_count} check-ins from file for @${data.username}.`)
        setScraped(data)
      } catch {
        addLog('Could not parse file. Make sure it is the JSON from the console snippet.')
      }
    }
    reader.readAsText(file)
  }

  async function importCheckins() {
    if (!scraped || !selectedUser) return
    setImporting(true)
    setImportResult(null)

    const checkins = scraped.checkins
    let beersCreated = 0
    let ratingsCreated = 0
    let skipped = 0

    addLog(`Starting import of ${checkins.length} check-ins for user ${selectedUser}...`)

    // Step 1: deduplicate beers in the import
    const uniqueBeers = {}
    for (const c of checkins) {
      if (!c.beer_name || !c.brewery) continue
      const key = `${c.beer_name.toLowerCase()}|||${c.brewery.toLowerCase()}`
      if (!uniqueBeers[key]) uniqueBeers[key] = c
    }
    const beerKeys = Object.keys(uniqueBeers)
    const beerMap = new Map()

    // Step 2: fetch only the beers that appear in this import (by name)
    addLog(`Looking up ${beerKeys.length} unique beers...`)
    const importNames = [...new Set(beerKeys.map(k => uniqueBeers[k].beer_name))]
    const FETCH_CHUNK = 100
    for (let i = 0; i < importNames.length; i += FETCH_CHUNK) {
      const { data } = await supabase.from('beers')
        .select('id, name, brewery')
        .in('name', importNames.slice(i, i + FETCH_CHUNK))
      for (const b of data ?? []) {
        beerMap.set(`${b.name.toLowerCase()}|||${b.brewery.toLowerCase()}`, b.id)
      }
    }

    // Step 3: insert beers not already in the DB, in chunks of 50
    const toInsert = beerKeys.filter(k => !beerMap.has(k)).map(k => uniqueBeers[k])
    if (toInsert.length > 0) {
      addLog(`Inserting ${toInsert.length} new beers...`)
      const rows = toInsert.map(c => ({
        name: c.beer_name,
        brewery: c.brewery,
        style: c.style || null,
        abv: c.abv || null,
        style_category: mapStyleCategory(c.style),
        untappd_id: c.untappd_checkin_id ? `checkin_${c.untappd_checkin_id}` : null,
        created_by: selectedUser,
      }))
      const CHUNK = 50
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { data: inserted, error: beerError } = await supabase
          .from('beers').insert(rows.slice(i, i + CHUNK)).select('id, name, brewery')
        if (beerError) {
          addLog(`Beer insert error (chunk ${Math.floor(i / CHUNK) + 1}): ${beerError.message}`)
        } else {
          beersCreated += inserted.length
          for (const b of inserted) {
            beerMap.set(`${b.name.toLowerCase()}|||${b.brewery.toLowerCase()}`, b.id)
          }
        }
      }
    }

    // Step 4: build ratings array
    const ratings = []
    for (const c of checkins) {
      if (!c.beer_name || !c.brewery) { skipped++; continue }
      const key = `${c.beer_name.toLowerCase()}|||${c.brewery.toLowerCase()}`
      const beerId = beerMap.get(key)
      if (!beerId) { skipped++; continue }
      const drankAt = c.drank_at ? new Date(c.drank_at).toISOString() : new Date().toISOString()
      ratings.push({
        user_id: selectedUser,
        beer_id: beerId,
        score: c.score ?? 5,
        note: c.note || null,
        drank_at: drankAt,
        imported_from: 'untappd',
      })
    }

    // Step 5: batch upsert ratings
    addLog(`Upserting ${ratings.length} ratings...`)
    const { error: ratingError } = await supabase.from('ratings').upsert(
      ratings,
      { onConflict: 'user_id,beer_id,drank_at', ignoreDuplicates: true }
    )

    if (ratingError) {
      addLog(`Rating upsert error: ${ratingError.message}`)
    } else {
      ratingsCreated = ratings.length
    }

    const result = { beersCreated, ratingsCreated, skipped }
    setImportResult(result)
    addLog(`Done. ${ratingsCreated} ratings imported, ${beersCreated} new beers added, ${skipped} skipped.`)
    setImporting(false)
  }

  return (
    <div className="container page">
      <div style={{
        background: 'var(--ink)',
        color: 'var(--amber-soft)',
        padding: '6px 12px',
        borderRadius: 'var(--radius-sm)',
        fontSize: '0.75rem',
        fontWeight: 600,
        display: 'inline-block',
        marginBottom: 16,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}>
        Admin
      </div>

      <h1 style={{ marginBottom: 8 }}>Import from Untappd</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 24, fontSize: '0.9rem' }}>
        Fetch a public Untappd profile and import their check-in history into Rounds.
      </p>

      <div className="form-stack">
        {/* Step 1: select user */}
        <div className="form-field">
          <label>Import for which user?</label>
          <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
            <option value="">— select a user —</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.display_name}</option>
            ))}
          </select>
        </div>

        {/* Step 2: Upload JSON from console snippet */}
        <div className="form-field">
          <label>Upload exported JSON</label>
          <input
            type="file"
            accept=".json"
            onChange={handleJsonUpload}
            style={{ padding: '8px 0' }}
          />
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            Use the console snippet (see below) to export from Untappd, then upload the file here.
          </p>
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--fog)' }} />
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>or fetch directly (first page only)</span>
          <div style={{ flex: 1, height: 1, background: 'var(--fog)' }} />
        </div>

        <div className="form-field">
          <label>Untappd username</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={untappdUsername}
              onChange={e => setUntappdUsername(e.target.value)}
              placeholder="their_untappd_username"
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-secondary"
              onClick={scrape}
              disabled={scraping || !untappdUsername.trim()}
              style={{ whiteSpace: 'nowrap' }}
            >
              {scraping ? 'Fetching...' : 'Fetch'}
            </button>
          </div>
        </div>

        {/* Scrape result preview */}
        {scraped && (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              @{scraped.username} — {scraped.checkin_count} check-ins found
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto', fontSize: '0.85rem' }}>
              {scraped.checkins.slice(0, 10).map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, color: 'var(--white)' }}>
                  <span style={{ color: 'var(--muted)', flexShrink: 0 }}>
                    {c.score ? `${c.score}/10` : '—'}
                  </span>
                  <span>{c.beer_name} — {c.brewery}</span>
                </div>
              ))}
              {scraped.checkins.length > 10 && (
                <div style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
                  ...and {scraped.checkins.length - 10} more
                </div>
              )}
            </div>

            <button
              className="btn btn-primary"
              style={{ marginTop: 16, width: '100%' }}
              onClick={importCheckins}
              disabled={importing || !selectedUser}
            >
              {importing
                ? 'Importing...'
                : `Import ${scraped.checkin_count} check-ins for ${users.find(u => u.id === selectedUser)?.display_name ?? '...'}`
              }
            </button>
          </div>
        )}

        {/* Import result */}
        {importResult && (
          <div className="card" style={{ padding: 16, background: 'rgba(212,132,30,0.12)', borderColor: 'var(--amber)' }}>
            <div style={{ fontWeight: 600, color: 'var(--amber-soft)', marginBottom: 4 }}>Import complete</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--amber-soft)' }}>
              {importResult.ratingsCreated} ratings · {importResult.beersCreated} new beers · {importResult.skipped} skipped
            </div>
          </div>
        )}

        {/* Log */}
        {log.length > 0 && (
          <div style={{
            background: 'var(--ink)',
            borderRadius: 'var(--radius-sm)',
            padding: 12,
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            color: 'var(--amber-soft)',
            maxHeight: 200,
            overflowY: 'auto',
          }}>
            {log.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="divider" style={{ margin: '32px 0' }} />

      {/* User management */}
      <h2 style={{ marginBottom: 16 }}>Users</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {users.map(u => (
          <div key={u.id} className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{u.display_name}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontFamily: 'monospace' }}>
              {u.id.slice(0, 8)}...
            </span>
          </div>
        ))}
      </div>

      <p style={{ marginTop: 16, fontSize: '0.85rem', color: 'var(--muted)' }}>
        New users are created when they first sign in via magic link.
        Send them an invite, they sign in, then come back here to import their history.
      </p>

      {/* Divider */}
      <div className="divider" style={{ margin: '32px 0' }} />

      {/* Console snippet instructions */}
      <h2 style={{ marginBottom: 8 }}>Console export snippet</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: 16 }}>
        To get someone's full Untappd history, you need to scroll to the bottom of their profile
        first, then run this snippet in the browser console. It downloads a JSON file you can
        upload above.
      </p>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
          Steps
        </div>
        <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.9rem', color: 'var(--white)' }}>
          <li>Go to their Untappd profile: <code style={{ background: 'var(--fog)', padding: '1px 5px', borderRadius: 3 }}>untappd.com/user/USERNAME</code></li>
          <li>Scroll to the absolute bottom until no more check-ins load</li>
          <li>Open DevTools with <strong>F12</strong>, click the <strong>Console</strong> tab</li>
          <li>Paste the snippet below and press <strong>Enter</strong></li>
          <li>A JSON file downloads automatically — upload it above</li>
        </ol>
      </div>

      <ConsoleSnippet />
    </div>
  )
}

const SNIPPET = `// Rounds Untappd export snippet v3
(function() {
  const checkins = [];
  const items = document.querySelectorAll('[data-checkin-id]');
  items.forEach(item => {
    const beerName  = item.querySelector('.text a[href^="/b/"]')?.textContent?.trim() ?? null;
    const brewery   = item.querySelector('.text a:not(.user):not([href^="/b/"]):not([href^="/v/"])')?.textContent?.trim() ?? null;
    const capsEl    = item.querySelector('.caps[data-rating]');
    const ratingRaw = capsEl ? parseFloat(capsEl.dataset.rating) : null;
    const score     = ratingRaw && ratingRaw > 0 ? Math.round(ratingRaw * 2 * 10) / 10 : null;
    const note      = item.querySelector('.checkin-comment p')?.textContent?.trim() ?? null;
    const venueName = item.querySelector('.text a[href^="/v/"]')?.textContent?.trim() ?? null;
    const drankAt   = item.querySelector('a.time')?.textContent?.trim() ?? null;
    const checkinId = item.getAttribute('data-checkin-id');
    if (beerName && brewery) {
      checkins.push({ untappd_checkin_id: checkinId, beer_name: beerName, brewery,
        style: null, abv: null, score, note: note||null,
        venue_name: venueName||null, drank_at: drankAt||null, imported_from: 'untappd' });
    }
  });
  if (!checkins.length) { alert('No check-ins found. Scroll to the bottom first.'); return; }
  const username = document.querySelector('p.username')?.textContent?.trim()
               ?? window.location.pathname.split('/').filter(Boolean).pop() ?? 'untappd';
  const blob = new Blob([JSON.stringify({ username, checkin_count: checkins.length, checkins }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = username + '-untappd.json'; a.click();
  console.log('Exported ' + checkins.length + ' check-ins for @' + username);
})();`

function ConsoleSnippet() {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(SNIPPET).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={copy}
        className="btn btn-secondary"
        style={{ position: 'absolute', top: 8, right: 8, fontSize: '0.8rem', padding: '6px 12px' }}
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
      <pre style={{
        background: 'var(--ink)',
        color: 'var(--amber-soft)',
        borderRadius: 'var(--radius)',
        padding: '16px',
        fontSize: '0.72rem',
        overflowX: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        lineHeight: 1.5,
        marginBottom: 40,
      }}>
        {SNIPPET}
      </pre>
    </div>
  )
}