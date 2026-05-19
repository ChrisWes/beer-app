import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { STYLE_CATEGORIES } from '../lib/constants'

const WORKER_URL = import.meta.env.VITE_WORKER_URL

// Infer style category from style string and/or beer name
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
  if (s.includes('golden ale') || s.includes('golden') || s.includes('blonde')) return 'golden_ale'
  if (s.includes('pale ale') || s.includes('pale')) return 'pale_ale'
  if (s.includes('cider') || s.includes('cyder')) return 'cider'
  if (s.includes('dunkel') || s.includes('dark lager')) return 'dunkel'
  if (s.includes('lager') || s.includes('pilsner') || s.includes('pilsener') || s.includes('helles') || s.includes('kolsch') || s.includes('kölsch') || s.includes('pils')) return 'lager'
  if (s.includes('saison') || s.includes('farmhouse')) return 'saison'
  if (s.includes('sour') || s.includes('lambic') || s.includes('gueuze') || s.includes('gose') || s.includes('berliner') || s.includes('wild ale') || s.includes('kriek')) return 'sour_wild'
  if (s.includes('wheat') || s.includes('hefeweizen') || s.includes('witbier') || s.includes('weizen') || s.includes('wit')) return 'wheat'
  if (s.includes('belgian') || s.includes('tripel') || s.includes('dubbel') || s.includes('quadrupel') || s.includes(' quad')) return 'belgian'
  if (s.includes('fruit') || s.includes('cherry') || s.includes('kirsch') ||
      s.includes('raspberry') || s.includes('strawberry') || s.includes('mango') ||
      s.includes('peach') || s.includes('apricot') || s.includes('plum') ||
      s.includes('blackberry') || s.includes('blueberry') || s.includes('blackcurrant') ||
      s.includes('cranberry') || s.includes('passion') || s.includes('gooseberry') ||
      s.includes('berry')) return 'fruit'
  if (s.includes('amber') || s.includes('red ale') || s.includes('red ipa')) return 'amber_red'
  if (s.includes('winter')) return 'winter_warmer'
  if (s.includes('dark ale')) return 'dark_ale'
  if (s.includes('strong ale') && s.includes('english')) return 'barleywine'
  if (s.includes('barleywine') || s.includes('barley wine')) return 'barleywine'
  return null
}

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function bigramSimilarity(a, b) {
  const s1 = normalize(a), s2 = normalize(b)
  if (s1 === s2) return 1
  if (s1.length < 4 || s2.length < 4) return s1 === s2 ? 1 : 0
  const pairs = s => Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2))
  const p1 = pairs(s1), p2set = new Set(pairs(s2))
  const hits = p1.filter(p => p2set.has(p)).length
  return (2 * hits) / (p1.length + p2set.size)
}

function findBestMatch(row, existingBeers) {
  let best = null, bestScore = 0
  for (const beer of existingBeers) {
    const nameSim    = bigramSimilarity(row.beer_name, beer.name)
    const brewerySim = bigramSimilarity(row.brewery, beer.brewery)
    if (nameSim >= 0.75 && brewerySim >= 0.6) {
      const score = (nameSim * 2 + brewerySim) / 3  // name weighted more
      if (score > bestScore) { bestScore = score; best = beer }
    }
  }
  return best
}

function parseBeerCsv(text) {
  const clean = text.replace(/^﻿/, '').trim()  // strip BOM
  const lines = clean.split(/\r?\n/)
  const delim = lines[0].includes(';') ? ';' : ','
  const splitRow = row => row.split(delim).map(c => c.trim().replace(/^"|"$/g, ''))
  const header = splitRow(lines[0]).map(h => h.toLowerCase())
  const breweryIdx = header.findIndex(h => h.includes('brewery'))
  const nameIdx    = header.findIndex(h => h.includes('name') && !h.includes('brewery'))
  const ratingIdx  = header.findIndex(h => h.includes('rating') || h.includes('score'))
  if (breweryIdx < 0 || nameIdx < 0 || ratingIdx < 0) return { error: `Columns found: ${header.join(', ')}` }

  return lines.slice(1).flatMap(line => {
    if (!line.trim()) return []
    const cols = splitRow(line)
    const raw = parseFloat(cols[ratingIdx])
    const brewery  = cols[breweryIdx]?.trim() || null
    const beerName = cols[nameIdx]?.trim()    || null
    if (!brewery || !beerName || isNaN(raw)) return []
    return [{
      brewery, beer_name: beerName,
      score:          ({ 1: 1, 3: 5, 5: 8 })[Math.round(raw)] ?? Math.round(raw * 2 * 10) / 10,
      style:          null, abv: null, note: null,
      venue_name:     null, drank_at: null,
      imported_from:  'csv',
      untappd_checkin_id: null,
    }]
  })
}

export default function Admin() {
  const { profile } = useAuth()
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState('')
  const [untappdUsername, setUntappdUsername] = useState('')
  const [autoUntappdUsername, setAutoUntappdUsername] = useState('')
  const [savingAutoUsername, setSavingAutoUsername] = useState(false)
  const [savedAutoUsername, setSavedAutoUsername] = useState(false)
  const [scraping, setScraping] = useState(false)
  const [scraped, setScraped] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [log, setLog] = useState([])

  // CSV import
  const csvRowsRef = useRef([])
  const [csvPreview, setCsvPreview] = useState([])
  const [csvMatching, setCsvMatching] = useState(false)
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvProgress, setCsvProgress] = useState(null) // { done, total }
  const [csvResult, setCsvResult] = useState(null)
  const [csvError, setCsvError] = useState(null)

  // Auto-classify
  const [unclassified, setUnclassified]       = useState(null)
  const [classifyLoading, setClassifyLoading] = useState(false)
  const [classifyResults, setClassifyResults] = useState(null)
  const [classifyApplying, setClassifyApplying] = useState(false)
  const [classifyDone, setClassifyDone]       = useState(null)

  // Repair missing ratings
  const [repairCheckins, setRepairCheckins] = useState(null)
  const [repairScanning, setRepairScanning] = useState(false)
  const [repairMissing, setRepairMissing] = useState(null)
  const [repairImporting, setRepairImporting] = useState(false)
  const [repairResult, setRepairResult] = useState(null)
  const [repairError, setRepairError] = useState(null)

  useEffect(() => {
    supabase.from('profiles').select('id, display_name').then(({ data }) => setUsers(data ?? []))
  }, [])

  useEffect(() => {
    if (!selectedUser) { setAutoUntappdUsername(''); return }
    supabase.from('profiles').select('untappd_username').eq('id', selectedUser).single()
      .then(({ data }) => setAutoUntappdUsername(data?.untappd_username ?? ''))
  }, [selectedUser])

  async function saveAutoUntappdUsername() {
    if (!selectedUser) return
    setSavingAutoUsername(true)
    await supabase.rpc('set_untappd_username', {
      target_user_id: selectedUser,
      username: autoUntappdUsername.trim() || null,
    })
    setSavingAutoUsername(false)
    setSavedAutoUsername(true)
    setTimeout(() => setSavedAutoUsername(false), 2000)
  }

  function handleRepairFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setRepairMissing(null)
    setRepairResult(null)
    setRepairError(null)
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result)
        if (!data.checkins || !Array.isArray(data.checkins)) throw new Error('Invalid format')
        setRepairCheckins(sanitizeCheckins(data.checkins))
      } catch {
        setRepairError('Could not parse file — use the same JSON from the console snippet.')
      }
    }
    reader.readAsText(file)
  }

  async function scanMissingRatings() {
    if (!repairCheckins || !selectedUser) return
    setRepairScanning(true)
    setRepairMissing(null)
    setRepairError(null)

    // Fetch all beers for matching
    const PAGE = 1000
    let allBeers = [], from = 0
    while (true) {
      const { data } = await supabase.from('beers').select('id, name, brewery').range(from, from + PAGE - 1)
      if (!data?.length) break
      allBeers = allBeers.concat(data)
      if (data.length < PAGE) break
      from += PAGE
    }

    // Match each check-in to a beer
    const matches = repairCheckins.flatMap(c => {
      const beer = findBestMatch(c, allBeers)
      return beer ? [{ checkin: c, beer }] : []
    })

    if (matches.length === 0) {
      setRepairError('No check-ins could be matched to beers in the database.')
      setRepairScanning(false)
      return
    }

    // Batch check which of those beers already have a rating for this user
    const beerIds = [...new Set(matches.map(m => m.beer.id))]
    const { data: existing } = await supabase
      .from('ratings')
      .select('beer_id')
      .eq('user_id', selectedUser)
      .in('beer_id', beerIds)

    const ratedIds = new Set((existing ?? []).map(r => r.beer_id))
    const missing = matches.filter(m => !ratedIds.has(m.beer.id))

    setRepairMissing(missing)
    setRepairScanning(false)
  }

  async function importMissingRatings() {
    if (!repairMissing?.length || !selectedUser) return
    setRepairImporting(true)
    setRepairResult(null)

    const rows = repairMissing.map(({ checkin, beer }) => ({
      user_id:       selectedUser,
      beer_id:       beer.id,
      score:         checkin.score ?? null,
      drank_at:      checkin.drank_at ?? null,
      note:          checkin.note ?? null,
      imported_from: 'untappd',
    }))

    const { error } = await supabase.from('ratings').insert(rows)
    setRepairImporting(false)
    if (error) { setRepairError(error.message); return }
    setRepairResult(rows.length)
    setRepairMissing(null)
  }

  async function loadUnclassified() {
    setClassifyLoading(true)
    setClassifyResults(null)
    setClassifyDone(null)
    const PAGE = 1000
    let all = [], from = 0
    while (true) {
      const { data } = await supabase.from('beers')
        .select('id, name, brewery, style')
        .or('style_category.is.null,style_category.eq.other')
        .range(from, from + PAGE - 1)
      if (!data?.length) break
      all = all.concat(data)
      if (data.length < PAGE) break
      from += PAGE
    }
    setUnclassified(all)
    setClassifyLoading(false)
  }

  function exportUnclassified() {
    if (!unclassified?.length) return
    const json = JSON.stringify(
      unclassified.map(b => ({ id: b.id, name: b.name, brewery: b.brewery })),
      null, 2
    )
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'unclassified-beers.json'
    a.click()
  }

  function handleClassifyImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result)
        setClassifyResults(data.filter(r => r.found && (r.style_category || r.style)))
        setUnclassified(null)
      } catch {
        // ignore parse errors
      }
    }
    reader.readAsText(file)
  }

  function classifyBeers() {
    if (!unclassified?.length) return
    // Apply mapStyleCategory locally using the existing style text — no web request needed
    const results = unclassified.flatMap(b => {
      const style_category = mapStyleCategory(b.style, b.name)
      return style_category ? [{ ...b, style_category }] : []
    })
    setClassifyResults(results)
  }

  function removeClassification(id) {
    setClassifyResults(rs => rs.filter(r => r.id !== id))
  }

  async function applyClassifications() {
    if (!classifyResults?.length) return
    setClassifyApplying(true)
    const CHUNK = 20
    for (let i = 0; i < classifyResults.length; i += CHUNK) {
      await Promise.all(
        classifyResults.slice(i, i + CHUNK).map(r =>
          supabase.from('beers').update({
            ...(r.style          ? { style:          r.style          } : {}),
            ...(r.abv            ? { abv:            r.abv            } : {}),
            ...(r.style_category ? { style_category: r.style_category } : {}),
          }).eq('id', r.id)
        )
      )
    }
    setClassifyApplying(false)
    setClassifyDone(classifyResults.length)
    setClassifyResults(null)
    setUnclassified(null)
  }

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

  // Untappd shows recent check-ins as "18 hours ago" instead of a real date.
  // Replace any relative string with today's date so the import doesn't break.
  function sanitizeDrankAt(val) {
    if (!val) return null
    if (/ago|just now|hour|minute|second/i.test(val)) return new Date().toISOString()
    const d = new Date(val)
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
  }

  function sanitizeCheckins(checkins) {
    return checkins.map(c => ({ ...c, drank_at: sanitizeDrankAt(c.drank_at) }))
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
        data.checkins = sanitizeCheckins(data.checkins)
        addLog(`Loaded ${data.checkin_count} check-ins from file for @${data.username}.`)
        setScraped(data)
      } catch {
        addLog('Could not parse file. Make sure it is the JSON from the console snippet.')
      }
    }
    reader.readAsText(file)
  }

  function handleCsvFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvResult(null)
    setCsvError(null)
    setCsvPreview([])
    csvRowsRef.current = []
    const reader = new FileReader()
    reader.onload = async ev => {
      const rows = parseBeerCsv(ev.target.result)
      if (!rows) { setCsvError('Could not parse file.'); return }
      if (rows.error) { setCsvError(`Could not find required columns. ${rows.error}`); return }
      if (!rows.length) { setCsvError('No valid rows found in file.'); return }

      setCsvMatching(true)
      const { data: existingBeers } = await supabase.from('beers').select('id, name, brewery')
      const tagged = rows.map(r => ({ ...r, match: findBestMatch(r, existingBeers ?? []) }))
      csvRowsRef.current = tagged
      setCsvPreview(tagged.slice(0, 5))
      setCsvMatching(false)
    }
    reader.readAsText(file)
  }

  async function importCsv() {
    if (!selectedUser || !csvRowsRef.current.length) return
    setCsvImporting(true)
    setCsvResult(null)
    setCsvProgress(null)

    const checkins = csvRowsRef.current.map(r => {
      const name    = r.match ? r.match.name    : r.beer_name
      const brewery = r.match ? r.match.brewery : r.brewery
      return {
        ...r,
        beer_name:      name,
        brewery:        brewery,
        style_category: mapStyleCategory('', name),
        match:          undefined,
      }
    })

    const BATCH = 500
    const total = checkins.length
    let beersCreated = 0, ratingsCreated = 0, skipped = 0

    for (let i = 0; i < total; i += BATCH) {
      setCsvProgress({ done: i, total })
      const { data, error } = await supabase.rpc('import_untappd_checkins', {
        p_checkins: checkins.slice(i, i + BATCH),
        p_user_id:  selectedUser,
      })
      if (error) { setCsvError(error.message); setCsvImporting(false); return }
      beersCreated   += data.beers_created   ?? 0
      ratingsCreated += data.ratings_created ?? 0
      skipped        += data.skipped         ?? 0
    }

    // Tag the newly created ratings — the RPC hardcodes imported_from='untappd',
    // so fix it up for any rating this user has with no date (all from this CSV batch)
    await supabase.from('ratings')
      .update({ imported_from: 'csv' })
      .eq('user_id', selectedUser)
      .is('drank_at', null)

    setCsvProgress(null)
    setCsvImporting(false)
    setCsvResult({ beers_created: beersCreated, ratings_created: ratingsCreated, skipped })
  }

  async function importCheckins() {
    if (!scraped || !selectedUser) return
    setImporting(true)
    setImportResult(null)

    const checkins = scraped.checkins
    let beersCreated = 0
    let ratingsCreated = 0
    let skipped = 0

    addLog(`Importing ${checkins.length} check-ins via database function...`)

    const { data, error: importError } = await supabase.rpc('import_untappd_checkins', {
      p_checkins: checkins.map(c => ({
        beer_name:      c.beer_name    || null,
        brewery:        c.brewery      || null,
        style:          c.style        || null,
        abv:            c.abv          || null,
        style_category: mapStyleCategory(c.style, c.beer_name) || null,
        score:          c.score        ?? null,
        note:           c.note         || null,
        drank_at:       c.drank_at     || null,
        venue_name:     c.venue_name   || null,
      })),
      p_user_id: selectedUser,
    })

    if (importError) {
      addLog(`Import error: ${importError.message}`)
      setImporting(false)
      return
    }

    beersCreated   = data.beers_created   ?? 0
    ratingsCreated = data.ratings_created ?? 0
    skipped        = data.skipped         ?? 0

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

      {/* CSV import */}
      <h2 style={{ marginBottom: 8 }}>Import from CSV</h2>
      <p style={{ color: 'var(--muted)', marginBottom: 16, fontSize: '0.9rem' }}>
        For a simple list with Brewery, Name, Rating (0–5 scale) columns.
      </p>

      <div className="form-stack">
        <div className="form-field">
          <label>Import for which user?</label>
          <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
            <option value="">— select a user —</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.display_name}</option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label>Upload CSV</label>
          <input type="file" accept=".csv" onChange={handleCsvFile} style={{ padding: '8px 0' }} />
        </div>

        {csvError && (
          <div style={{ color: 'var(--red, #c0392b)', fontSize: '0.85rem' }}>{csvError}</div>
        )}

        {csvMatching && (
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Matching against existing beers...</div>
        )}

        {csvPreview.length > 0 && !csvMatching && (() => {
          const matchCount = csvRowsRef.current.filter(r => r.match).length
          const newCount   = csvRowsRef.current.length - matchCount
          return (
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {csvRowsRef.current.length} rows — {matchCount} matched to existing beers, {newCount} new
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 12 }}>
                Preview (first 5):
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.82rem' }}>
                {csvPreview.map((r, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ color: 'var(--amber)', flexShrink: 0, width: 36 }}>{r.score}/10</span>
                      <span style={{ textDecoration: r.match ? 'line-through' : 'none', color: r.match ? 'var(--muted)' : 'inherit' }}>
                        {r.beer_name} — {r.brewery}
                      </span>
                    </div>
                    {r.match && (
                      <div style={{ paddingLeft: 44, color: 'var(--amber-soft)', fontSize: '0.78rem' }}>
                        → matched: {r.match.name} — {r.match.brewery}
                      </div>
                    )}
                  </div>
                ))}
                {csvRowsRef.current.length > 5 && (
                  <div style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
                    ...and {csvRowsRef.current.length - 5} more
                  </div>
                )}
              </div>

              <button
                className="btn btn-primary"
                style={{ marginTop: 16, width: '100%' }}
                onClick={importCsv}
                disabled={csvImporting || !selectedUser}
              >
                {csvImporting
                  ? csvProgress
                    ? `Importing... ${csvProgress.done} / ${csvProgress.total}`
                    : 'Importing...'
                  : `Import ${csvRowsRef.current.length} beers for ${users.find(u => u.id === selectedUser)?.display_name ?? '...'}`}
              </button>
            </div>
          )
        })()}

        {csvResult && (
          <div className="card" style={{ padding: 16, background: 'rgba(212,132,30,0.12)', borderColor: 'var(--amber)' }}>
            <div style={{ fontWeight: 600, color: 'var(--amber-soft)', marginBottom: 4 }}>Import complete</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--amber-soft)' }}>
              {csvResult.ratings_created} ratings · {csvResult.beers_created} new beers · {csvResult.skipped} skipped
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="divider" style={{ margin: '32px 0' }} />

      {/* Repair missing ratings */}
      <h2 style={{ marginBottom: 8 }}>Repair missing ratings</h2>
      <p style={{ color: 'var(--muted)', marginBottom: 16, fontSize: '0.9rem' }}>
        Upload an Untappd JSON file to find check-ins where the beer was created but no rating was recorded, then add the missing ratings.
      </p>

      <div className="form-stack">
        <div className="form-field">
          <label>Repair for which user?</label>
          <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
            <option value="">— select a user —</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.display_name}</option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label>Upload Untappd JSON</label>
          <input type="file" accept=".json" onChange={handleRepairFile} style={{ padding: '8px 0' }} />
        </div>

        {repairCheckins && !repairMissing && (
          <button
            className="btn btn-secondary"
            onClick={scanMissingRatings}
            disabled={repairScanning || !selectedUser}
          >
            {repairScanning ? 'Scanning...' : `Scan ${repairCheckins.length} check-ins for missing ratings`}
          </button>
        )}

        {repairError && (
          <div style={{ color: 'var(--red, #c0392b)', fontSize: '0.85rem' }}>{repairError}</div>
        )}

        {repairMissing && (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              {repairMissing.length === 0
                ? 'No missing ratings found — all check-ins already have a rating.'
                : `${repairMissing.length} check-in${repairMissing.length !== 1 ? 's' : ''} missing a rating`}
            </div>
            {repairMissing.length > 0 && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto', fontSize: '0.82rem', marginBottom: 12 }}>
                  {repairMissing.map(({ checkin, beer }, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8 }}>
                      <span style={{ color: 'var(--amber)', flexShrink: 0, width: 40 }}>
                        {checkin.score != null ? `${checkin.score}/10` : '—'}
                      </span>
                      <span style={{ flex: 1 }}>{beer.name} — {beer.brewery}</span>
                      <span style={{ color: 'var(--muted)', flexShrink: 0 }}>
                        {checkin.drank_at ? new Date(checkin.drank_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : 'no date'}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={importMissingRatings}
                  disabled={repairImporting}
                >
                  {repairImporting ? 'Adding ratings...' : `Add ${repairMissing.length} missing rating${repairMissing.length !== 1 ? 's' : ''}`}
                </button>
              </>
            )}
          </div>
        )}

        {repairResult != null && (
          <div className="card" style={{ padding: 16, background: 'rgba(212,132,30,0.12)', borderColor: 'var(--amber)' }}>
            <div style={{ fontWeight: 600, color: 'var(--amber-soft)', marginBottom: 4 }}>Repair complete</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--amber-soft)' }}>
              {repairResult} rating{repairResult !== 1 ? 's' : ''} added.
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="divider" style={{ margin: '32px 0' }} />

      {/* Auto-classify */}
      <h2 style={{ marginBottom: 8 }}>Auto-classify beers</h2>
      <p style={{ color: 'var(--muted)', marginBottom: 16, fontSize: '0.9rem' }}>
        Classify from existing style text, or export the list and run the Playwright script to look up styles on Untappd using a real browser.
      </p>

      <div className="form-stack">
        <button
          className="btn btn-secondary"
          onClick={loadUnclassified}
          disabled={classifyLoading}
        >
          {classifyLoading ? 'Loading...' : 'Load uncategorised beers'}
        </button>

        {!classifyResults && (
          <div className="form-field">
            <label style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
              Import Playwright results
            </label>
            <input type="file" accept=".json" onChange={handleClassifyImport} style={{ padding: '8px 0' }} />
          </div>
        )}

        {unclassified && !classifyResults && (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>
              {unclassified.length === 0
                ? 'All beers are already categorised.'
                : `${unclassified.length} beer${unclassified.length !== 1 ? 's' : ''} with no style category (including "other")`}
            </div>
            {unclassified.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="btn btn-secondary" onClick={classifyBeers}>
                  Classify from style text
                </button>
                <button className="btn btn-secondary" onClick={exportUnclassified}>
                  Export for Playwright script
                </button>
              </div>
            )}
          </div>
        )}

        {classifyResults && (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {classifyResults.length} beer{classifyResults.length !== 1 ? 's' : ''} to update
              {unclassified && classifyResults.length < unclassified.length && (
                <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.85rem' }}>
                  {' '}· {unclassified.length - classifyResults.length} not found on Untappd
                </span>
              )}
            </div>
            {classifyResults.length > 0 && (
              <>
                <div style={{ maxHeight: 400, overflowY: 'auto', margin: '12px 0',
                  display: 'flex', flexDirection: 'column' }}>
                  {classifyResults.map(r => {
                    const categoryLabel = r.style_category
                      ? (STYLE_CATEGORIES.find(s => s.value === r.style_category)?.label ?? r.style_category)
                      : null
                    return (
                      <div key={r.id} style={{ display: 'flex', gap: 10, fontSize: '0.82rem',
                        padding: '10px 0', borderBottom: '1px solid var(--fog)', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{r.name}</div>
                          <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{r.brewery}</div>
                          {r.style && (
                            <div style={{ color: 'var(--muted)', fontSize: '0.75rem', fontStyle: 'italic', marginTop: 2 }}>
                              "{r.style}"
                            </div>
                          )}
                        </div>
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          {categoryLabel
                            ? <div style={{ color: 'var(--amber-soft)', fontWeight: 600 }}>{categoryLabel}</div>
                            : <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>style text only</div>
                          }
                          {r.abv && (
                            <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>{r.abv}%</div>
                          )}
                        </div>
                        <button
                          onClick={() => removeClassification(r.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--muted)',
                            cursor: 'pointer', fontSize: '0.9rem', padding: '0 2px',
                            lineHeight: 1, flexShrink: 0, alignSelf: 'center' }}
                          title="Remove from list">✕</button>
                      </div>
                    )
                  })}
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={applyClassifications}
                  disabled={classifyApplying}
                >
                  {classifyApplying ? 'Applying...' : `Apply ${classifyResults.length} classification${classifyResults.length !== 1 ? 's' : ''}`}
                </button>
              </>
            )}
          </div>
        )}

        {classifyDone != null && (
          <div className="card" style={{ padding: 16, background: 'rgba(212,132,30,0.12)', borderColor: 'var(--amber)' }}>
            <div style={{ fontWeight: 600, color: 'var(--amber-soft)', marginBottom: 4 }}>Done</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--amber-soft)' }}>
              {classifyDone} beer{classifyDone !== 1 ? 's' : ''} updated.
            </div>
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

      {/* Auto-import configuration */}
      <h2 style={{ marginBottom: 8 }}>Auto-import</h2>
      <p style={{ color: 'var(--muted)', marginBottom: 16, fontSize: '0.9rem' }}>
        Set an Untappd username per user to enable the daily auto-import worker.
        New check-ins will be pulled automatically each morning.
      </p>

      <div className="form-stack">
        <div className="form-field">
          <label>Configure for which user?</label>
          <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
            <option value="">— select a user —</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.display_name}</option>
            ))}
          </select>
        </div>

        {selectedUser && (
          <div className="form-field">
            <label>Untappd username (leave blank to disable)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={autoUntappdUsername}
                onChange={e => setAutoUntappdUsername(e.target.value)}
                placeholder="e.g. beerchris"
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-primary"
                onClick={saveAutoUntappdUsername}
                disabled={savingAutoUsername}
                style={{ whiteSpace: 'nowrap' }}
              >
                {savedAutoUsername ? '✓ Saved' : savingAutoUsername ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>

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
    const timeEl    = item.querySelector('a.time');
    const drankAt   = timeEl?.getAttribute('title') || timeEl?.getAttribute('data-time') || timeEl?.textContent?.trim() || null;
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