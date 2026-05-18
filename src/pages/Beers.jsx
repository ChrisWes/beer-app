import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { STYLE_CATEGORIES } from '../lib/constants'

const STYLE_LABELS = {
  pale_ale: 'Pale Ale', ipa: 'IPA', neipa: 'NEIPA', hazy_ipa: 'Hazy (Hewzi) IPA', dipa: 'DIPA',
  west_coast_ipa: 'West Coast IPA', session_ipa: 'Session IPA', milkshake_ipa: 'Milkshake IPA',
  lager: 'Lager', dunkel: 'Dunkel', saison: 'Saison',
  stout_porter: 'Stout/Porter', imperial_stout: 'Imperial Stout',
  sour_wild: 'Sour/Wild', wheat: 'Wheat', belgian: 'Belgian',
  amber_red: 'Amber/Red', barleywine: 'Barleywine',
  bitter: 'Bitter', mild: 'Mild', cider: 'Cider',
  speciality: 'Speciality', other: 'Other',
}

const SCORE_BANDS = [
  { label: 'All', test: () => true },
  { label: '9',   test: b => parseFloat(b.avg_score) >= 9 },
  { label: '8',   test: b => parseFloat(b.avg_score) >= 8 && parseFloat(b.avg_score) < 9 },
  { label: '7',   test: b => parseFloat(b.avg_score) >= 7 && parseFloat(b.avg_score) < 8 },
  { label: '6',   test: b => parseFloat(b.avg_score) >= 6 && parseFloat(b.avg_score) < 7 },
  { label: '< 6', test: b => parseFloat(b.avg_score) < 6 },
]

export default function Beers() {
  const [beers, setBeers] = useState([])
  const [loading, setLoading] = useState(true)
  const [styleFilter, setStyleFilter] = useState(null)
  const [scoreBandIdx, setScoreBandIdx] = useState(0)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [viewingLogs, setViewingLogs] = useState(null)
  const [extraBeers, setExtraBeers] = useState([])
  const [tastingMap, setTastingMap] = useState({})

  useEffect(() => {
    async function fetchAll() {
      const PAGE = 1000
      let allData = [], from = 0
      while (true) {
        const { data } = await supabase
          .from('ratings')
          .select('score, would_seek_again, beer_id, beers(id, name, brewery, style, style_category, abv)')
          .not('beer_id', 'is', null)
          .range(from, from + PAGE - 1)
        if (!data?.length) break
        allData = allData.concat(data)
        if (data.length < PAGE) break
        from += PAGE
      }

      const map = {}
      for (const r of allData) {
        const b = r.beers
        if (!b) continue
        if (!map[b.id]) map[b.id] = { ...b, scores: [], seek_again_count: 0 }
        map[b.id].scores.push(parseFloat(r.score))
        if (r.would_seek_again) map[b.id].seek_again_count++
      }

      const aggregated = Object.values(map).map(b => ({
        ...b,
        avg_score: b.scores.reduce((s, v) => s + v, 0) / b.scores.length,
        rating_count: b.scores.length,
      })).sort((a, b) => b.avg_score - a.avg_score)

      setBeers(aggregated)
      setLoading(false)
    }

    async function fetchTastingMap() {
      const { data } = await supabase
        .from('tasting_entries')
        .select('beer_id, is_winner, tastings(year)')
        .not('beer_id', 'is', null)
      const map = {}
      for (const e of data ?? []) {
        if (!map[e.beer_id]) map[e.beer_id] = []
        map[e.beer_id].push({ year: e.tastings?.year, is_winner: e.is_winner })
      }
      setTastingMap(map)
    }

    fetchAll()
    fetchTastingMap()
  }, [])

  // Style cards — computed once after beers load
  const styleCards = useMemo(() => {
    const groups = {}
    for (const b of beers) {
      const key = b.style_category || '__none__'
      if (!groups[key]) groups[key] = []
      groups[key].push(b)
    }
    return Object.entries(groups).map(([key, list]) => ({
      key,
      label: key === '__none__' ? 'Uncategorised' : (STYLE_LABELS[key] ?? key),
      count: list.length,
    })).sort((a, b) => b.count - a.count)
  }, [beers])

  const q            = search.trim().toLowerCase()
  const isSearchMode = q.length > 0

  // When searching, also query the beers table directly so zero-rating beers are found
  useEffect(() => {
    if (q.length < 2) { setExtraBeers([]); return }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('beers')
        .select('id, name, brewery, style_category, abv')
        .or(`name.ilike.%${q}%,brewery.ilike.%${q}%`)
        .limit(50)
      const ratedIds = new Set(beers.map(b => b.id))
      setExtraBeers(
        (data ?? [])
          .filter(b => !ratedIds.has(b.id))
          .map(b => ({ ...b, avg_score: null, rating_count: 0, seek_again_count: 0 }))
      )
    }, 300)
    return () => clearTimeout(timer)
  }, [q, beers])
  const isDrillDown  = !isSearchMode && styleFilter !== null
  const isStyleGrid  = !isSearchMode && styleFilter === null

  const band = SCORE_BANDS[scoreBandIdx]
  const visible = useMemo(() => {
    if (!q && !styleFilter) return []
    let list = beers
    if (q) {
      list = list.filter(b =>
        b.name.toLowerCase().includes(q) || b.brewery.toLowerCase().includes(q))
      // Append zero-rating beers from direct beers table search
      list = [...list, ...extraBeers]
    }
    if (styleFilter) list = list.filter(b =>
      styleFilter === '__none__' ? !b.style_category : b.style_category === styleFilter)
    list = list.filter(band.test)
    return q ? list.slice(0, 100) : list
  }, [beers, extraBeers, q, styleFilter, scoreBandIdx, band])

  const styleList = useMemo(() =>
    [...new Set(beers.map(b => b.style_category).filter(Boolean))].sort()
  , [beers])

  return (
    <div className="container page">
      <div className="page-header">
        {isDrillDown ? (
          <button
            onClick={() => setStyleFilter(null)}
            style={{ background: 'none', border: 'none', color: 'var(--amber-soft)',
              fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: 0 }}
          >
            ← {STYLE_LABELS[styleFilter] ?? styleFilter}
          </button>
        ) : (
          <h1>Beers</h1>
        )}
        <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          {isStyleGrid
            ? `${styleCards.length} styles`
            : `${visible.length}${isSearchMode && visible.length === 100 ? '+' : ''}`}
        </span>
      </div>

      <input
        type="search"
        placeholder="Search beer or brewery..."
        value={search}
        onChange={e => { setSearch(e.target.value); if (e.target.value) setStyleFilter(null) }}
        style={{ marginBottom: 12 }}
      />

      {/* Style pills — search mode only */}
      {isSearchMode && (
        <div className="pill-group" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
          <button className={`pill ${!styleFilter ? 'selected' : ''}`} onClick={() => setStyleFilter(null)}>
            All styles
          </button>
          {styleList.map(s => (
            <button key={s} className={`pill ${styleFilter === s ? 'selected' : ''}`}
              onClick={() => setStyleFilter(f => f === s ? null : s)}>
              {STYLE_LABELS[s] ?? s}
            </button>
          ))}
        </div>
      )}

      {/* Score band — drill-down and search only */}
      {(isDrillDown || isSearchMode) && (
        <div className="pill-group" style={{ marginBottom: 16 }}>
          {SCORE_BANDS.map((b, i) => (
            <button key={b.label} className={`pill ${scoreBandIdx === i ? 'selected' : ''}`}
              onClick={() => setScoreBandIdx(i)}>{b.label}</button>
          ))}
        </div>
      )}

      {loading && <div className="loading-bar" />}

      {/* Style card grid */}
      {isStyleGrid && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, paddingBottom: 80 }}>
          {styleCards.map(sc => (
            <button
              key={sc.key}
              onClick={() => { setStyleFilter(sc.key); setScoreBandIdx(0) }}
              style={{ background: 'var(--fog)', border: '1px solid var(--fog)',
                borderRadius: 'var(--radius)', padding: '14px 12px', textAlign: 'left',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--white)' }}>
                {sc.label}
              </div>
              <div style={{ fontSize: '0.95rem', color: 'var(--muted)' }}>
                {sc.count} beer{sc.count !== 1 ? 's' : ''}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Beer list — drill-down and search */}
      {(isDrillDown || isSearchMode) && !loading && visible.length === 0 && (
        <div className="empty-state"><p>No beers match these filters.</p></div>
      )}

      {(isDrillDown || isSearchMode) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 80 }}>
          {visible.map((b, i) => (
            <div key={b.id} className="feed-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem',
                  color: i < 3 ? 'var(--amber)' : 'var(--muted)', width: 26, flexShrink: 0 }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.0rem' }}>{b.name}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                    {b.brewery}{b.abv ? ` · ${b.abv}%` : ''}
                  </div>
                  {isSearchMode && b.style_category && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--amber-soft)', marginTop: 2 }}>
                      {STYLE_LABELS[b.style_category] ?? b.style_category}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    {b.avg_score != null ? (
                      <div className={`score-badge ${b.avg_score >= 7.5 ? 'high' : b.avg_score >= 5 ? 'mid' : 'low'}`}>
                        {parseFloat(b.avg_score).toFixed(1)}
                      </div>
                    ) : (
                      <div className="score-badge" style={{ background: 'var(--fog)', color: 'var(--muted)' }}>—</div>
                    )}
                    {b.rating_count > 0 ? (
                      <button
                        onClick={() => setViewingLogs(b)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                          fontSize: '0.75rem', color: 'var(--amber-soft)', marginTop: 4, display: 'block' }}>
                        {b.rating_count} log{b.rating_count !== 1 ? 's' : ''}
                      </button>
                    ) : (
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4 }}>0 logs</div>
                    )}
                  </div>
                  <button onClick={() => setEditing(b)}
                    style={{ background: 'none', border: 'none', color: 'var(--muted)',
                      cursor: 'pointer', fontSize: '0.85rem', padding: '4px', lineHeight: 1 }}
                    title="Edit beer">✎</button>
                </div>
              </div>
              {(b.seek_again_count > 0 || tastingMap[b.id]) && (
                <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {b.seek_again_count > 0 && (
                    <span className="tag seek-again">{b.seek_again_count} would seek again</span>
                  )}
                  {tastingMap[b.id]?.map(t => (
                    <span key={t.year} className="tag seek-again"
                      style={t.is_winner ? {} : { background: 'var(--fog)', color: 'var(--muted)' }}>
                      {t.is_winner ? `🏆 ${t.year}` : `Tasting ${t.year}`}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {viewingLogs && (
        <BeerLogsModal beer={viewingLogs} onClose={() => setViewingLogs(null)} />
      )}

      {editing && (
        <EditBeerModal
          beer={editing}
          onClose={() => setEditing(null)}
          onSave={updated => {
            setBeers(bs => bs.map(b => b.id === updated.id ? { ...b, ...updated } : b))
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function BeerLogsModal({ beer, onClose }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('ratings')
      .select('score, drank_at, note, would_seek_again, profiles(display_name)')
      .eq('beer_id', beer.id)
      .order('drank_at', { ascending: false })
      .then(({ data }) => {
        setLogs(data ?? [])
        setLoading(false)
      })
  }, [beer.id])

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <h2 className="modal-title">{beer.name}</h2>
        <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 16 }}>
          {beer.brewery} · {beer.rating_count} log{beer.rating_count !== 1 ? 's' : ''} · avg {parseFloat(beer.avg_score).toFixed(1)}
        </div>

        {loading && <div className="loading-bar" />}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '60vh', overflowY: 'auto' }}>
          {logs.map((log, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '10px 0', borderBottom: '1px solid var(--fog)' }}>
              <div className={`score-badge ${log.score >= 7.5 ? 'high' : log.score >= 5 ? 'mid' : 'low'}`}
                style={{ flexShrink: 0 }}>
                {parseFloat(log.score).toFixed(1)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  {log.profiles?.display_name ?? '—'}
                  {log.would_seek_again && (
                    <span className="tag seek-again" style={{ marginLeft: 8, fontSize: '0.7rem' }}>seek again</span>
                  )}
                </div>
                {log.drank_at && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                    {new Date(log.drank_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                )}
                {log.note && (
                  <div style={{ fontSize: '0.82rem', color: 'var(--white)', marginTop: 4, fontStyle: 'italic' }}>
                    "{log.note}"
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <button className="btn btn-ghost" style={{ marginTop: 16, width: '100%' }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

function EditBeerModal({ beer, onClose, onSave }) {
  const [form, setForm] = useState({
    name:           beer.name ?? '',
    brewery:        beer.brewery ?? '',
    style:          beer.style ?? '',
    style_category: beer.style_category ?? '',
    abv:            beer.abv ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function save() {
    if (!form.name.trim() || !form.brewery.trim()) return
    setSaving(true)
    setSaveError(null)
    const trimmed = {
      name:           form.name.trim(),
      brewery:        form.brewery.trim(),
      style:          form.style.trim() || null,
      style_category: form.style_category || null,
      abv:            form.abv ? parseFloat(form.abv) : null,
    }
    const { error } = await supabase.from('beers').update(trimmed).eq('id', beer.id)
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    onSave({ id: beer.id, ...trimmed })
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <h2 className="modal-title">Edit beer</h2>
        <div className="form-stack">
          <div className="form-field">
            <label>Beer name</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="form-field">
            <label>Brewery</label>
            <input value={form.brewery} onChange={e => set('brewery', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-field">
              <label>Style</label>
              <input value={form.style} onChange={e => set('style', e.target.value)} placeholder="e.g. Oatmeal Stout" />
            </div>
            <div className="form-field">
              <label>ABV %</label>
              <input type="number" step="0.1" min="0" max="25" value={form.abv} onChange={e => set('abv', e.target.value)} />
            </div>
          </div>
          <div className="form-field">
            <label>Style category</label>
            <select value={form.style_category} onChange={e => set('style_category', e.target.value)}>
              <option value="">— unknown —</option>
              {STYLE_CATEGORIES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          {saveError && (
            <div style={{ color: 'var(--red, #c0392b)', fontSize: '0.82rem', padding: '8px 0' }}>
              Error: {saveError}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={save}
              disabled={saving || !form.name.trim() || !form.brewery.trim()}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
