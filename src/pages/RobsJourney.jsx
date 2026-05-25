import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

// ── Rating helpers ────────────────────────────────────────────

function getRatingCategory(score) {
  if (score == null) return 'Neutral'
  const n = Number(score)
  if (isNaN(n)) return 'Neutral'
  if (n >= 7) return 'Excellent'
  if (n >= 4) return 'Good'
  if (n > 0) return 'Avoid'
  return 'Neutral'
}

const RATING_SCORE = { Excellent: 5, Good: 4, Neutral: 3, Avoid: 1 }

// ── Main page ─────────────────────────────────────────────────

export default function RobsJourney() {
  const [historical, setHistorical] = useState([])
  const [modern, setModern]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    try {
      const PAGE = 1000

      // Pre-2025 archive: query ratings joined with beers to get rating_symbol
      let hist = [], from = 0
      while (true) {
        const { data, error: err } = await supabase
          .from('ratings')
          .select('id, score, drank_at, beers(name, brewery, style_category)')
          .gte('drank_at', '2024-12-31')
          .lt('drank_at', '2025-01-01')
          .range(from, from + PAGE - 1)
        if (err) throw err
        if (!data?.length) break
        hist = hist.concat(data)
        if (data.length < PAGE) break
        from += PAGE
      }

      // Modern era (2025+) — only need beer name + brewery for cross-referencing
      let mod = [], from2 = 0
      while (true) {
        const { data, error: err } = await supabase
          .from('feed')
          .select('beer_name, brewery')
          .gte('drank_at', '2025-01-01')
          .range(from2, from2 + PAGE - 1)
        if (err) throw err
        if (!data?.length) break
        mod = mod.concat(data)
        if (data.length < PAGE) break
        from2 += PAGE
      }

      // Flatten the nested beers join
      const flatHist = hist.map(r => {
        const cat = getRatingCategory(r.score)
        return {
          id:              r.id,
          rating_symbol:   r.score,
          drank_at:        r.drank_at,
          beer_name:       r.beers?.name      ?? null,
          brewery:         r.beers?.brewery   ?? null,
          style_category:  r.beers?.style_category ?? null,
          rating_category: cat,
          rating_score:    RATING_SCORE[cat],
        }
      })

      setHistorical(flatHist)
      setModern(mod)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Derived data ──────────────────────────────────────────
  const derived = useMemo(() => {
    if (!historical.length) return null

    const total         = historical.length
    const avoidCount    = historical.filter(r => r.rating_category === 'Avoid').length
    const excellentCount = historical.filter(r => r.rating_category === 'Excellent').length

    // Keys for modern beers (beer_name||brewery) and breweries
    const modernBeerKeys = new Set(
      modern.map(r => key(r.beer_name, r.brewery))
    )
    const modernBreweries = new Set(
      modern.map(r => (r.brewery ?? '').toLowerCase())
    )

    // Brewery volumes
    const breweryVolume = {}
    for (const r of historical) {
      if (!r.brewery) continue
      breweryVolume[r.brewery] = (breweryVolume[r.brewery] || 0) + 1
    }

    // Top 10 by volume — reversed so highest bar is at top in horizontal chart
    const topByVolume = Object.entries(breweryVolume)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([brewery, count]) => ({ brewery, count }))
      .reverse()

    // Brewery score totals (min 5 check-ins for Best-Loved)
    const breweryScores = {}
    for (const r of historical) {
      if (!r.brewery) continue
      if (!breweryScores[r.brewery]) breweryScores[r.brewery] = []
      breweryScores[r.brewery].push(r.rating_score)
    }
    const topByRating = Object.entries(breweryScores)
      .filter(([, scores]) => scores.length >= 5)
      .map(([brewery, scores]) => ({
        brewery,
        avgScore: +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2),
        count:    scores.length,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 10)
      .reverse()

    // Time Capsule: Excellent pre-2025 beers never logged in the modern era
    const seen = new Set()
    const timeCapsuleBeers = historical
      .filter(r => r.rating_category === 'Excellent')
      .filter(r => {
        const k = key(r.beer_name, r.brewery)
        return !modernBeerKeys.has(k)
      })
      .filter(r => {
        const k = key(r.beer_name, r.brewery)
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      .slice(0, 30)

    // Lost Ales Quest: high-volume pre-2025 breweries with zero post-2025 logs
    const lostAles = Object.entries(breweryVolume)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 40)
      .filter(([brewery]) => !modernBreweries.has(brewery.toLowerCase()))
      .slice(0, 12)
      .map(([brewery, count]) => ({ brewery, count }))

    return { total, avoidCount, excellentCount, topByVolume, topByRating, timeCapsuleBeers, lostAles }
  }, [historical, modern])

  return (
    <div className="container page">

      {/* ── Page header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{
          display: 'inline-block',
          background: 'var(--ink)',
          color: 'var(--amber)',
          padding: '4px 10px',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.68rem',
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          border: '1px solid var(--fog)',
          marginBottom: 10,
        }}>
          Rob's Journey
        </div>
        <h1 style={{ marginBottom: 8, fontSize: '2rem' }}>Beer Odyssey</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          The full pre-2025 archive — nearly 5,000 beers catalogued before the modern era began.
        </p>
      </div>

      {loading && <div className="loading-bar" />}

      {error && (
        <div className="card" style={{ padding: 16, color: 'var(--amber-soft)' }}>
          {error}
        </div>
      )}

      {!loading && !error && !derived && (
        <div className="empty-state"><p>No historical archive found.</p></div>
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
        </div>
      )}
    </div>
  )
}

// ── Key helper ────────────────────────────────────────────────

function key(name, brewery) {
  return `${(name ?? '').toLowerCase()}||${(brewery ?? '').toLowerCase()}`
}

// ── 1. Summary Stats ──────────────────────────────────────────

function SummaryStats({ total, avoidCount, excellentCount }) {
  const stats = [
    {
      label:   'Lifetime Archive',
      value:   total.toLocaleString(),
      sub:     'unique beers catalogued',
      accent:  'var(--amber)',
    },
    {
      label:   'The Golden Tier',
      value:   excellentCount.toLocaleString(),
      sub:     'rated Excellent (★)',
      accent:  'var(--gold)',
    },
    {
      label:   'The Critic Metric',
      value:   avoidCount.toLocaleString(),
      sub:     'flagged as Avoid (✗)',
      accent:  'var(--muted)',
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      {stats.map(s => (
        <div key={s.label} className="card" style={{ padding: '14px 12px', textAlign: 'center' }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.9rem',
            fontWeight: 700,
            color: s.accent,
            lineHeight: 1.1,
            marginBottom: 4,
          }}>
            {s.value}
          </div>
          <div style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            color: 'var(--white)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 3,
          }}>
            {s.label}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', lineHeight: 1.3 }}>
            {s.sub}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── 2. Giants of the Cellar ───────────────────────────────────

const CHART_TOOLTIP_STYLE = {
  background:   'var(--ink-soft)',
  border:       '1px solid var(--fog)',
  borderRadius: 6,
  fontSize:     '0.82rem',
  color:        'var(--white)',
}

function truncate(str, max = 22) {
  return str.length > max ? str.slice(0, max) + '…' : str
}

function GiantsOfCellar({ topByVolume, topByRating }) {
  const [view, setView] = useState('volume')
  const isVolume = view === 'volume'

  const chartData  = isVolume ? topByVolume : topByRating
  const dataKey    = isVolume ? 'count'     : 'avgScore'
  const barColor   = isVolume ? 'var(--amber)' : 'var(--gold)'
  const xLabel     = isVolume ? 'Beers'     : 'Avg Score'
  const xDomain    = isVolume ? [0, 'dataMax'] : [0, 5]

  const yAxisWidth = 150

  return (
    <div>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: '1.3rem' }}>Giants of the Cellar</h2>
      </div>

      {/* Toggle */}
      <div className="pill-group" style={{ marginBottom: 16 }}>
        <button
          className={`pill ${view === 'volume' ? 'selected' : ''}`}
          onClick={() => setView('volume')}
        >
          Most Sampled
        </button>
        <button
          className={`pill ${view === 'rating' ? 'selected' : ''}`}
          onClick={() => setView('rating')}
        >
          Best Loved
        </button>
      </div>

      <div className="card" style={{ padding: '16px 8px 16px 0' }}>
        {chartData.length === 0 ? (
          <div className="empty-state" style={{ padding: 24 }}>
            <p>Not enough data yet.</p>
          </div>
        ) : (
          <>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)', paddingLeft: yAxisWidth + 16, marginBottom: 6 }}>
              {isVolume
                ? 'Top 10 breweries by unique beers in the archive'
                : 'Top 10 breweries by average score (min. 5 check-ins)'}
            </div>
            <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 34)}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--fog)" horizontal={false} />
                <XAxis
                  type="number"
                  domain={xDomain}
                  stroke="var(--fog)"
                  tick={{ fontSize: 11, fill: 'var(--muted)' }}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: xLabel, position: 'insideBottomRight', offset: -4, fontSize: 10, fill: 'var(--muted)' }}
                />
                <YAxis
                  type="category"
                  dataKey="brewery"
                  width={yAxisWidth}
                  tick={{ fontSize: 11, fill: 'var(--white)' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => truncate(v)}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  formatter={(value, name, props) =>
                    isVolume
                      ? [`${value} beers`, props.payload.brewery]
                      : [`${value.toFixed(2)} / 5 (${props.payload.count} beers)`, props.payload.brewery]
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
          Excellent beers from the archive that have never been logged in the modern era.
          Time for a rediscovery?
        </p>
      </div>

      {beers.length === 0 ? (
        <div className="card" style={{ padding: 20 }}>
          <p style={{ color: 'var(--muted)' }}>
            Every excellent beer from the archive has already been revisited — legend.
          </p>
        </div>
      ) : (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
            gap: 10,
          }}>
            {visible.map((beer, i) => (
              <VintageCard key={`${beer.beer_name}||${beer.brewery}||${i}`} beer={beer} />
            ))}
          </div>

          {beers.length > 12 && !showAll && (
            <button
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: 12, fontSize: '0.85rem', padding: '10px 0' }}
              onClick={() => setShowAll(true)}
            >
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
    <div style={{
      background:    'var(--cream)',
      border:        '1px solid var(--fog)',
      borderRadius:  'var(--radius)',
      padding:       '13px 12px 12px',
      position:      'relative',
      overflow:      'hidden',
      display:       'flex',
      flexDirection: 'column',
      gap:           4,
    }}>
      {/* Watermark star */}
      <div style={{
        position:   'absolute',
        top:        -6,
        right:      6,
        fontSize:   '3.5rem',
        color:      'var(--amber)',
        opacity:    0.07,
        lineHeight: 1,
        userSelect: 'none',
        pointerEvents: 'none',
      }}>
        ★
      </div>

      {/* Era badge */}
      <div style={{
        fontSize:      '0.6rem',
        fontWeight:    700,
        color:         'var(--amber)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
      }}>
        Pre-2025 Archive
      </div>

      {/* Beer name */}
      <div style={{
        fontFamily:  'var(--font-display)',
        fontSize:    '0.9rem',
        fontWeight:  700,
        color:       'var(--white)',
        lineHeight:  1.3,
      }}>
        {beer.beer_name || 'Unknown'}
      </div>

      {/* Brewery */}
      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.3 }}>
        {beer.brewery || 'Unknown Brewery'}
      </div>

      {/* CTA */}
      <div style={{
        marginTop:     6,
        fontSize:      '0.65rem',
        fontWeight:    700,
        color:         'var(--amber-soft)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        Rediscover →
      </div>
    </div>
  )
}

// ── 4. Lost Ales Quest ────────────────────────────────────────

function LostAlesQuest({ breweries }) {
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: 6 }}>The Lost Ales Quest</h2>
        <p style={{
          color:      'var(--muted)',
          fontSize:   '0.85rem',
          fontStyle:  'italic',
          lineHeight: 1.5,
          borderLeft: '3px solid var(--fog)',
          paddingLeft: 12,
        }}>
          "You drank heavily from these legendary cellars a decade ago, but haven't checked them in
          since the modern era began. Are they extinct, or are you due a pint?"
        </p>
      </div>

      {breweries.length === 0 ? (
        <div className="card" style={{ padding: 20 }}>
          <p style={{ color: 'var(--muted)' }}>
            Every major brewery from the archive has a modern check-in. The quest is complete.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {breweries.map((b, i) => (
            <QuestEntry key={b.brewery} brewery={b.brewery} count={b.count} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function QuestEntry({ brewery, count, rank }) {
  return (
    <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      {/* Rank */}
      <div style={{
        width:          34,
        height:         34,
        borderRadius:   8,
        background:     'var(--fog)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontFamily:     'var(--font-display)',
        fontSize:       '1rem',
        color:          rank <= 3 ? 'var(--amber)' : 'var(--muted)',
        flexShrink:     0,
        fontWeight:     700,
      }}>
        {rank}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight:   600,
          fontSize:     '0.95rem',
          whiteSpace:   'nowrap',
          overflow:     'hidden',
          textOverflow: 'ellipsis',
        }}>
          {brewery}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>
          {count} beers in the archive · 0 in the modern era
        </div>
      </div>

      {/* Status pill */}
      <div style={{
        fontSize:       '0.65rem',
        fontWeight:     700,
        color:          'var(--amber)',
        textTransform:  'uppercase',
        letterSpacing:  '0.06em',
        background:     'rgba(212,132,30,0.12)',
        padding:        '4px 8px',
        borderRadius:   4,
        border:         '1px solid rgba(212,132,30,0.25)',
        flexShrink:     0,
        whiteSpace:     'nowrap',
      }}>
        Untouched
      </div>
    </div>
  )
}
