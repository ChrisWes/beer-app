import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

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
  { label: '9',   test: b => b.avg_score != null && parseFloat(b.avg_score) >= 9 },
  { label: '8',   test: b => b.avg_score != null && parseFloat(b.avg_score) >= 8 && parseFloat(b.avg_score) < 9 },
  { label: '7',   test: b => b.avg_score != null && parseFloat(b.avg_score) >= 7 && parseFloat(b.avg_score) < 8 },
  { label: '6',   test: b => b.avg_score != null && parseFloat(b.avg_score) >= 6 && parseFloat(b.avg_score) < 7 },
  { label: '< 6', test: b => b.avg_score != null && parseFloat(b.avg_score) < 6 },
]

export default function PublicPage() {
  const [beers, setBeers] = useState([])
  const [topBreweries, setTopBreweries] = useState([])
  const [styleChart2025, setStyleChart2025] = useState([])
  const [totalRatings, setTotalRatings] = useState(0)
  const [uniqueBreweryCount, setUniqueBreweryCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const [styleFilter, setStyleFilter] = useState(null)
  const [scoreBandIdx, setScoreBandIdx] = useState(0)
  const [search, setSearch] = useState('')
  const [extraBeers, setExtraBeers] = useState([])

  useEffect(() => {
    async function fetchAll() {
      const PAGE = 1000
      let allData = [], from = 0
      while (true) {
        const { data } = await supabase
          .from('ratings')
          .select('score, drank_at, beer_id, beers(id, name, brewery, style_category, abv)')
          .not('beer_id', 'is', null)
          .range(from, from + PAGE - 1)
        if (!data?.length) break
        allData = allData.concat(data)
        if (data.length < PAGE) break
        from += PAGE
      }

      setTotalRatings(allData.length)

      const beerMap = {}
      const breweryMap = {}
      const styleCounts2025 = {}

      for (const r of allData) {
        const b = r.beers
        if (!b) continue

        if (!beerMap[b.id]) beerMap[b.id] = { ...b, scores: [] }
        beerMap[b.id].scores.push(parseFloat(r.score))

        if (b.brewery) breweryMap[b.brewery] = (breweryMap[b.brewery] || 0) + 1

        if (r.drank_at && new Date(r.drank_at).getFullYear() >= 2025) {
          const s = b.style_category || 'other'
          styleCounts2025[s] = (styleCounts2025[s] || 0) + 1
        }
      }

      const aggregated = Object.values(beerMap).map(b => ({
        ...b,
        avg_score: b.scores.reduce((s, v) => s + v, 0) / b.scores.length,
        rating_count: b.scores.length,
      })).sort((a, b) => b.avg_score - a.avg_score)

      setBeers(aggregated)
      setTopBreweries(Object.entries(breweryMap).sort(([,a],[,b]) => b - a).slice(0, 10))
      setStyleChart2025(Object.entries(styleCounts2025).sort(([,a],[,b]) => b - a))
      setUniqueBreweryCount(Object.keys(breweryMap).length)
      setLoading(false)
    }
    fetchAll()
  }, [])

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
  const isDrillDown  = !isSearchMode && styleFilter !== null
  const isStyleGrid  = !isSearchMode && styleFilter === null

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
          .map(b => ({ ...b, avg_score: null, rating_count: 0 }))
      )
    }, 300)
    return () => clearTimeout(timer)
  }, [q, beers])

  const styleList = useMemo(() =>
    [...new Set(beers.map(b => b.style_category).filter(Boolean))].sort()
  , [beers])

  const band = SCORE_BANDS[scoreBandIdx]
  const visible = useMemo(() => {
    if (!q && !styleFilter) return []
    let list = beers
    if (q) {
      list = list.filter(b =>
        b.name.toLowerCase().includes(q) || b.brewery.toLowerCase().includes(q))
      list = [...list, ...extraBeers]
    }
    if (styleFilter) list = list.filter(b =>
      styleFilter === '__none__' ? !b.style_category : b.style_category === styleFilter)
    list = list.filter(band.test)
    return q ? list.slice(0, 100) : list
  }, [beers, extraBeers, q, styleFilter, scoreBandIdx, band])

  const total2025     = styleChart2025.reduce((s, [,c]) => s + c, 0)
  const maxStyle2025  = styleChart2025[0]?.[1] ?? 1

  return (
    <div className="container page" style={{ paddingBottom: 60 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
        <h1 style={{ margin: 0 }}>What We've Been Drinking</h1>
        <a href="/" style={{ fontSize: '0.8rem', color: 'var(--amber-soft)',
          textDecoration: 'none', whiteSpace: 'nowrap', paddingTop: 6 }}>
          Sign in →
        </a>
      </div>

      {loading
        ? <div className="loading-bar" style={{ marginBottom: 28 }} />
        : (
          <p style={{ color: 'var(--muted)', marginBottom: 28, fontSize: '0.9rem' }}>
            {totalRatings.toLocaleString()} check-ins · {beers.length.toLocaleString()} unique beers · {uniqueBreweryCount.toLocaleString()} breweries
          </p>
        )
      }

      {/* Most popular breweries */}
      {!loading && topBreweries.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <h3 style={{ marginBottom: 14 }}>Most popular breweries</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topBreweries.map(([name, count], i) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-display)',
                  color: i < 3 ? 'var(--amber)' : 'var(--muted)', width: 24, flexShrink: 0 }}>
                  {i + 1}
                </span>
                <span style={{ flex: 1 }}>{name}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--amber)' }}>
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Most popular styles since 2025 */}
      {!loading && styleChart2025.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <h3 style={{ marginBottom: 14 }}>Most popular styles since 2025</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {styleChart2025.map(([style, count]) => (
              <div key={style}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 3 }}>
                  <span>{STYLE_LABELS[style] ?? style}</span>
                  <span style={{ color: 'var(--muted)' }}>
                    {count} ({Math.round(count / total2025 * 100)}%)
                  </span>
                </div>
                <div style={{ height: 6, background: 'var(--fog)', borderRadius: 3 }}>
                  <div style={{
                    height: '100%',
                    width: `${(count / maxStyle2025) * 100}%`,
                    background: 'var(--amber)',
                    borderRadius: 3,
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search + browse */}
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
          <h2 style={{ margin: 0 }}>Browse beers</h2>
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

      {/* Style pills — search mode */}
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

      {/* Score band pills — drill-down and search */}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {b.avg_score != null ? (
                    <div className={`score-badge ${b.avg_score >= 7.5 ? 'high' : b.avg_score >= 5 ? 'mid' : 'low'}`}>
                      {parseFloat(b.avg_score).toFixed(1)}
                    </div>
                  ) : (
                    <div className="score-badge" style={{ background: 'var(--fog)', color: 'var(--muted)' }}>—</div>
                  )}
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4 }}>
                    {b.rating_count} log{b.rating_count !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
