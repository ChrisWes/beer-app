import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

// ── Helpers ───────────────────────────────────────────────────

function getRatingCategory(score) {
  if (score == null) return 'Neutral'
  const n = Number(score)
  if (isNaN(n)) return 'Neutral'
  if (n >= 7) return 'Excellent'
  if (n >= 4) return 'Good'
  if (n > 0)  return 'Avoid'
  return 'Neutral'
}

const RATING_SCORE = { Excellent: 5, Good: 4, Neutral: 3, Avoid: 1 }

function key(name, brewery) {
  return `${(name ?? '').toLowerCase()}||${(brewery ?? '').toLowerCase()}`
}

const CHART_TOOLTIP_STYLE = {
  background: 'var(--ink-soft)', border: '1px solid var(--fog)',
  borderRadius: 6, fontSize: '0.82rem', color: 'var(--white)',
}

function truncate(str, max = 22) {
  return str.length > max ? str.slice(0, max) + '…' : str
}

// ── Main page ─────────────────────────────────────────────────

export default function RobsJourney() {
  const [profiles, setProfiles]           = useState([])
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [allRatings, setAllRatings]       = useState([])
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState(null)

  useEffect(() => {
    async function loadProfiles() {
      const { data } = await supabase.from('profiles').select('id, display_name').order('display_name')
      if (!data?.length) return
      const counts = await Promise.all(
        data.map(p => supabase.from('ratings').select('id', { count: 'exact', head: true }).eq('user_id', p.id))
      )
      const eligible = data.filter((_, i) => (counts[i].count ?? 0) >= 500)
      if (eligible.length) {
        setProfiles(eligible)
        setSelectedUserId(eligible[0].id)
      }
    }
    loadProfiles()
  }, [])

  useEffect(() => {
    if (selectedUserId) fetchData(selectedUserId)
  }, [selectedUserId])

  async function fetchData(userId) {
    setLoading(true)
    setError(null)
    setAllRatings([])
    try {
      const PAGE = 1000
      let all = [], from = 0
      while (true) {
        const { data, error: err } = await supabase
          .from('ratings')
          .select('id, score, drank_at, serving_type, beers(name, brewery, style_category, ibu)')
          .eq('user_id', userId)
          .range(from, from + PAGE - 1)
        if (err) throw err
        if (!data?.length) break
        all = all.concat(data)
        if (data.length < PAGE) break
        from += PAGE
      }

      setAllRatings(all.map(r => {
        const cat = getRatingCategory(r.score)
        return {
          id:             r.id,
          score:          r.score,
          drank_at:       r.drank_at,
          serving_type:   r.serving_type  ?? null,
          beer_name:      r.beers?.name   ?? null,
          brewery:        r.beers?.brewery ?? null,
          style_category: r.beers?.style_category ?? null,
          ibu:            r.beers?.ibu    ?? null,
          rating_category: cat,
          rating_score:   RATING_SCORE[cat],
        }
      }))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const selectedProfile = profiles.find(p => p.id === selectedUserId)

  // ── Derived analytics ─────────────────────────────────────
  const derived = useMemo(() => {
    if (!allRatings.length) return null

    const archive     = allRatings.filter(r => r.drank_at && r.drank_at < '2025-01-01')
    const modernItems = allRatings.filter(r => r.drank_at && r.drank_at >= '2025-01-01')

    const modernBeerKeys  = new Set(modernItems.map(r => key(r.beer_name, r.brewery)))
    const modernBreweries = new Set(modernItems.map(r => (r.brewery ?? '').toLowerCase()))

    // Summary
    const total          = allRatings.length
    const avoidCount     = allRatings.filter(r => r.rating_category === 'Avoid').length
    const excellentCount = allRatings.filter(r => r.rating_category === 'Excellent').length

    // Brewery volumes & scores (all ratings)
    const breweryVolume = {}, breweryScoreMap = {}
    for (const r of allRatings) {
      if (!r.brewery) continue
      breweryVolume[r.brewery] = (breweryVolume[r.brewery] || 0) + 1
      if (r.score == null) continue
      if (!breweryScoreMap[r.brewery]) breweryScoreMap[r.brewery] = []
      breweryScoreMap[r.brewery].push(r.score)
    }

    const topByVolume = Object.entries(breweryVolume)
      .sort(([, a], [, b]) => b - a).slice(0, 10)
      .map(([brewery, count]) => ({ brewery, count })).reverse()

    const topByRating = Object.entries(breweryScoreMap)
      .filter(([, s]) => s.length >= 5)
      .map(([brewery, scores]) => ({
        brewery,
        avgScore: +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2),
        count: scores.length,
      }))
      .sort((a, b) => b.avgScore - a.avgScore).slice(0, 10).reverse()

    // Time Capsule — Excellent archive beers absent from modern era
    const seen = new Set()
    const timeCapsuleBeers = archive
      .filter(r => r.rating_category === 'Excellent')
      .filter(r => !modernBeerKeys.has(key(r.beer_name, r.brewery)))
      .filter(r => {
        const k = key(r.beer_name, r.brewery)
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      .slice(0, 30)

    // Lost Ales — top archive breweries with zero modern logs
    const archiveVol = {}
    for (const r of archive) {
      if (!r.brewery) continue
      archiveVol[r.brewery] = (archiveVol[r.brewery] || 0) + 1
    }
    const lostAles = Object.entries(archiveVol)
      .sort(([, a], [, b]) => b - a).slice(0, 40)
      .filter(([b]) => !modernBreweries.has(b.toLowerCase()))
      .slice(0, 12)
      .map(([brewery, count]) => ({ brewery, count }))

    // ── Rich data flags ──────────────────────────────────────
    const hasServingData = allRatings.some(r => r.serving_type)
    const hasIbuData     = allRatings.some(r => r.ibu != null)
    const years = new Set(
      allRatings.map(r => r.drank_at ? new Date(r.drank_at).getFullYear() : null).filter(Boolean)
    )
    const hasYearRange = years.size >= 3

    // Serving type breakdown
    const servingMap = {}
    for (const r of allRatings) {
      if (!r.serving_type) continue
      if (!servingMap[r.serving_type]) servingMap[r.serving_type] = { count: 0, scores: [] }
      servingMap[r.serving_type].count++
      servingMap[r.serving_type].scores.push(r.rating_score)
    }
    const servingData = Object.entries(servingMap)
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([type, { count, scores }]) => ({
        type,
        count,
        avgScore: +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2),
      }))

    // IBU preference — bucket by 20-IBU ranges
    const IBU_BUCKETS = ['0–19', '20–39', '40–59', '60–79', '80–99', '100+']
    const ibuMap = Object.fromEntries(IBU_BUCKETS.map(b => [b, []]))
    for (const r of allRatings) {
      if (r.ibu == null) continue
      const i = r.ibu
      const bucket = i < 20 ? '0–19' : i < 40 ? '20–39' : i < 60 ? '40–59'
                   : i < 80 ? '60–79' : i < 100 ? '80–99' : '100+'
      ibuMap[bucket].push(r.rating_score)
    }
    const ibuData = IBU_BUCKETS
      .map(label => ({
        label,
        count:    ibuMap[label].length,
        avgScore: ibuMap[label].length
          ? +(ibuMap[label].reduce((a, b) => a + b, 0) / ibuMap[label].length).toFixed(2)
          : null,
      }))
      .filter(b => b.count > 0)

    // Year-by-year activity
    const yearMap = {}
    for (const r of allRatings) {
      if (!r.drank_at) continue
      const yr = new Date(r.drank_at).getFullYear()
      yearMap[yr] = (yearMap[yr] || 0) + 1
    }
    const yearData = Object.entries(yearMap)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([year, count]) => ({ year: String(year), count }))
    const busiestYear = yearData.reduce((best, d) => d.count > (best?.count ?? 0) ? d : best, null)

    return {
      total, avoidCount, excellentCount,
      topByVolume, topByRating,
      timeCapsuleBeers, lostAles,
      hasServingData, hasIbuData, hasYearRange,
      servingData, ibuData, yearData, busiestYear,
    }
  }, [allRatings])

  return (
    <div className="container page">

      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          display: 'inline-block', background: 'var(--ink)', color: 'var(--amber)',
          padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: '0.68rem',
          fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
          border: '1px solid var(--fog)', marginBottom: 10,
        }}>
          The Journey
        </div>
        <h1 style={{ marginBottom: 8, fontSize: '2rem' }}>A Bitter Odyssey</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          {selectedProfile ? `${selectedProfile.display_name}'s full beer archive.` : 'Full beer archive.'}
        </p>
      </div>

      {/* ── User selector ── */}
      {profiles.length > 1 && (
        <div className="pill-group" style={{ marginBottom: 24, flexWrap: 'wrap' }}>
          {profiles.map(p => (
            <button
              key={p.id}
              className={`pill ${selectedUserId === p.id ? 'selected' : ''}`}
              onClick={() => setSelectedUserId(p.id)}
            >
              {p.display_name}
            </button>
          ))}
        </div>
      )}

      {loading && <div className="loading-bar" />}
      {error && <div className="card" style={{ padding: 16, color: 'var(--amber-soft)' }}>{error}</div>}
      {!loading && !error && !derived && (
        <div className="empty-state"><p>No archive found for this user.</p></div>
      )}

      {!loading && !error && derived && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, paddingBottom: 40 }}>
          <SummaryStats
            total={derived.total}
            avoidCount={derived.avoidCount}
            excellentCount={derived.excellentCount}
          />
          <GiantsOfCellar
            topByVolume={derived.topByVolume}
            topByRating={derived.topByRating}
          />
          <TimeCapsule beers={derived.timeCapsuleBeers} />
          <LostAlesQuest breweries={derived.lostAles} />

          {derived.hasYearRange && (
            <YearByYear data={derived.yearData} busiestYear={derived.busiestYear} />
          )}
          {derived.hasServingData && (
            <ServingTypeBreakdown data={derived.servingData} />
          )}
          {derived.hasIbuData && (
            <IbuProfile data={derived.ibuData} />
          )}
        </div>
      )}
    </div>
  )
}

// ── 1. Summary Stats ──────────────────────────────────────────

function SummaryStats({ total, avoidCount, excellentCount }) {
  const stats = [
    { label: 'Lifetime Archive', value: total.toLocaleString(),         sub: 'unique beers catalogued',  accent: 'var(--amber)' },
    { label: 'The Golden Tier',  value: excellentCount.toLocaleString(), sub: 'rated Excellent (★)',      accent: 'var(--gold)' },
    { label: 'The Critic Metric',value: avoidCount.toLocaleString(),     sub: 'flagged as Avoid (✗)',     accent: 'var(--muted)' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      {stats.map(s => (
        <div key={s.label} className="card" style={{ padding: '14px 12px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.9rem', fontWeight: 700, color: s.accent, lineHeight: 1.1, marginBottom: 4 }}>
            {s.value}
          </div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--white)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
            {s.label}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', lineHeight: 1.3 }}>{s.sub}</div>
        </div>
      ))}
    </div>
  )
}

// ── 2. Giants of the Cellar ───────────────────────────────────

function GiantsOfCellar({ topByVolume, topByRating }) {
  const [view, setView] = useState('volume')
  const isVolume  = view === 'volume'
  const chartData = isVolume ? topByVolume : topByRating
  const dataKey   = isVolume ? 'count' : 'avgScore'
  const barColor  = isVolume ? 'var(--amber)' : 'var(--gold)'
  const xDomain   = isVolume ? [0, 'dataMax'] : [0, 10]
  const yAxisWidth = 150

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: '1.3rem' }}>Giants of the Cellar</h2>
      </div>
      <div className="pill-group" style={{ marginBottom: 16 }}>
        <button className={`pill ${view === 'volume' ? 'selected' : ''}`} onClick={() => setView('volume')}>Most Sampled</button>
        <button className={`pill ${view === 'rating' ? 'selected' : ''}`} onClick={() => setView('rating')}>Best Loved</button>
      </div>
      <div className="card" style={{ padding: '16px 8px 16px 0' }}>
        {chartData.length === 0 ? (
          <div className="empty-state" style={{ padding: 24 }}><p>Not enough data yet.</p></div>
        ) : (
          <>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)', paddingLeft: yAxisWidth + 16, marginBottom: 6 }}>
              {isVolume ? 'Top 10 breweries by unique beers in the archive' : 'Top 10 breweries by average score (min. 5 check-ins)'}
            </div>
            <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 34)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--fog)" horizontal={false} />
                <XAxis type="number" domain={xDomain} stroke="var(--fog)" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="brewery" width={yAxisWidth} tick={{ fontSize: 11, fill: 'var(--white)' }} tickLine={false} axisLine={false} tickFormatter={v => truncate(v)} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  formatter={(value, _name, props) =>
                    isVolume
                      ? [`${value} beers`, props.payload.brewery]
                      : [`${value.toFixed(2)} / 10 (${props.payload.count} beers)`, props.payload.brewery]
                  }
                  labelFormatter={() => ''}
                />
                <Bar dataKey={dataKey} fill={barColor} radius={[0, 4, 4, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </div>
  )
}

// ── 3. Time Capsule ───────────────────────────────────────────

function TimeCapsule({ beers }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? beers : beers.slice(0, 12)

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: 6 }}>The 2024 Time Capsule</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
          Excellent beers from the archive that have never been logged in the modern era. Time for a rediscovery?
        </p>
      </div>
      {beers.length === 0 ? (
        <div className="card" style={{ padding: 20 }}>
          <p style={{ color: 'var(--muted)' }}>Every excellent beer from the archive has already been revisited — legend.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 10 }}>
            {visible.map((beer, i) => <VintageCard key={`${beer.beer_name}||${beer.brewery}||${i}`} beer={beer} />)}
          </div>
          {beers.length > 12 && !showAll && (
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: 12, fontSize: '0.85rem', padding: '10px 0' }} onClick={() => setShowAll(true)}>
              Show all {beers.length} time capsule beers
            </button>
          )}
        </>
      )}
    </div>
  )
}

function VintageCard({ beer }) {
  return (
    <div style={{ background: 'var(--cream)', border: '1px solid var(--fog)', borderRadius: 'var(--radius)', padding: '13px 12px 12px', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ position: 'absolute', top: -6, right: 6, fontSize: '3.5rem', color: 'var(--amber)', opacity: 0.07, lineHeight: 1, userSelect: 'none', pointerEvents: 'none' }}>★</div>
      <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Pre-2025 Archive</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--white)', lineHeight: 1.3 }}>{beer.beer_name || 'Unknown'}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.3 }}>{beer.brewery || 'Unknown Brewery'}</div>
      <div style={{ marginTop: 6, fontSize: '0.65rem', fontWeight: 700, color: 'var(--amber-soft)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Rediscover →</div>
    </div>
  )
}

// ── 4. Lost Ales Quest ────────────────────────────────────────

function LostAlesQuest({ breweries }) {
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: 6 }}>The Lost Ales Quest</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', fontStyle: 'italic', lineHeight: 1.5, borderLeft: '3px solid var(--fog)', paddingLeft: 12 }}>
          "You drank heavily from these legendary cellars a decade ago, but haven't checked them in since the modern era began. Are they extinct, or are you due a pint?"
        </p>
      </div>
      {breweries.length === 0 ? (
        <div className="card" style={{ padding: 20 }}>
          <p style={{ color: 'var(--muted)' }}>Every major brewery from the archive has a modern check-in. The quest is complete.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {breweries.map((b, i) => <QuestEntry key={b.brewery} brewery={b.brewery} count={b.count} rank={i + 1} />)}
        </div>
      )}
    </div>
  )
}

function QuestEntry({ brewery, count, rank }) {
  return (
    <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--fog)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '1rem', color: rank <= 3 ? 'var(--amber)' : 'var(--muted)', flexShrink: 0, fontWeight: 700 }}>
        {rank}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{brewery}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>{count} beers in the archive · 0 in the modern era</div>
      </div>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.06em', background: 'rgba(212,132,30,0.12)', padding: '4px 8px', borderRadius: 4, border: '1px solid rgba(212,132,30,0.25)', flexShrink: 0, whiteSpace: 'nowrap' }}>
        Untouched
      </div>
    </div>
  )
}

// ── 5. Year-by-Year Activity ──────────────────────────────────

function YearByYear({ data, busiestYear }) {
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: 4 }}>Year by Year</h2>
        {busiestYear && (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            Busiest year: <span style={{ color: 'var(--amber-soft)', fontWeight: 600 }}>{busiestYear.year}</span> with {busiestYear.count.toLocaleString()} beers logged.
          </p>
        )}
      </div>
      <div className="card" style={{ padding: '16px 8px 8px 0' }}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--fog)" vertical={false} />
            <XAxis dataKey="year" stroke="var(--fog)" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--fog)" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              formatter={(value, _n, props) => [`${value} beers`, props.payload.year]}
              labelFormatter={() => ''}
            />
            <Bar dataKey="count" fill="var(--amber)" radius={[3, 3, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── 6. Serving Type Breakdown ─────────────────────────────────

function ServingTypeBreakdown({ data }) {
  const [view, setView] = useState('count')
  const isCount   = view === 'count'
  const dataKey   = isCount ? 'count' : 'avgScore'
  const barColor  = isCount ? 'var(--amber)' : 'var(--gold)'
  const xDomain   = isCount ? [0, 'dataMax'] : [0, 5]
  const chartData = [...data].reverse()

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: 4 }}>How You Drink</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Serving type breakdown across your archive.</p>
      </div>
      <div className="pill-group" style={{ marginBottom: 12 }}>
        <button className={`pill ${view === 'count' ? 'selected' : ''}`} onClick={() => setView('count')}>Volume</button>
        <button className={`pill ${view === 'score' ? 'selected' : ''}`} onClick={() => setView('score')}>Avg Score</button>
      </div>
      <div className="card" style={{ padding: '16px 8px 16px 0' }}>
        <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 36)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--fog)" horizontal={false} />
            <XAxis type="number" domain={xDomain} stroke="var(--fog)" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="type" width={80} tick={{ fontSize: 11, fill: 'var(--white)' }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              formatter={(value, _n, props) =>
                isCount
                  ? [`${value} beers`, props.payload.type]
                  : [`${value.toFixed(2)} / 5`, props.payload.type]
              }
              labelFormatter={() => ''}
            />
            <Bar dataKey={dataKey} fill={barColor} radius={[0, 4, 4, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── 7. IBU Preference Profile ─────────────────────────────────

function IbuProfile({ data }) {
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: 4 }}>Bitterness Profile</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          Average score by IBU range — does bitterness make it better?
        </p>
      </div>
      <div className="card" style={{ padding: '16px 8px 8px 0' }}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--fog)" />
            <XAxis dataKey="label" stroke="var(--fog)" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} />
            <YAxis domain={[1, 5]} stroke="var(--fog)" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              formatter={(value, _n, props) => [
                `${value.toFixed(2)} / 5 (${props.payload.count} beers)`,
                `${props.payload.label} IBU`,
              ]}
              labelFormatter={() => ''}
            />
            <Line
              type="monotone"
              dataKey="avgScore"
              stroke="var(--gold)"
              strokeWidth={2.5}
              dot={{ fill: 'var(--gold)', r: 4 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
