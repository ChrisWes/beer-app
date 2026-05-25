import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import AwardsTab from './Awards'

const ABV_COLOURS = ['#d4841e','#4ea8de','#56c27a','#e06c75','#c678dd','#61afef','#e5c07b','#98c379']

export default function Analytics() {
  const [tab, setTab] = useState('group')
  const [beers, setBeers] = useState([])
  const [venues, setVenues] = useState([])
  const [profiles, setProfiles] = useState([])
  const [allRatings, setAllRatings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: beerData }, { data: venueData }, { data: profileData }] = await Promise.all([
      supabase.from('beer_leaderboard').select('*').limit(200),
      supabase.from('venue_leaderboard').select('*').limit(10),
      supabase.from('user_taste_profiles').select('*'),
    ])

    // Paginate feed to bypass server-side row cap
    const PAGE = 1000
    let allRatings = [], from = 0
    while (true) {
      const { data } = await supabase.from('feed').select('*').range(from, from + PAGE - 1)
      if (!data?.length) break
      allRatings = allRatings.concat(data)
      if (data.length < PAGE) break
      from += PAGE
    }

    setBeers(beerData ?? [])
    setVenues(venueData ?? [])
    setProfiles(profileData ?? [])
    setAllRatings(allRatings)
    setLoading(false)
  }

  return (
    <div className="container page">
      <div className="page-header">
        <h1>Stats</h1>
      </div>

      <div className="pill-group" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
        {['2026', '2025', 'group', 'beers', 'pubs', 'people', 'awards'].map(t => (
          <button key={t} className={`pill ${tab === t ? 'selected' : ''}`} onClick={() => setTab(t)}>
            {t === 'awards' ? '🏆 Awards' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading && <div className="loading-bar" />}

      {!loading && (() => {
        const forYear = yr => allRatings.filter(r =>
          r.drank_at && new Date(r.drank_at).getFullYear() === yr
        )
        return (
          <>
            {tab === '2026'   && <YearTab year={2026} ratings={forYear(2026)} />}
            {tab === '2025'   && <YearTab year={2025} ratings={forYear(2025)} />}
            {tab === 'group'  && <GroupTab ratings={allRatings} profiles={profiles} />}
            {tab === 'beers'  && <BeersTab ratings={allRatings} />}
            {tab === 'pubs'   && <PubsTab venues={venues} />}
            {tab === 'people'  && <PeopleTab profiles={profiles} ratings={allRatings} />}
            {tab === 'awards'  && <AwardsTab />}
          </>
        )
      })()}
    </div>
  )
}

// ── Year tab (2026, 2025, …) ───────────────────────────────────

function YearTab({ year, ratings }) {
  if (ratings.length === 0) {
    return <div className="empty-state"><p>No beers logged in {year} yet.</p></div>
  }

  const total = ratings.length

  // What we drank — style breakdown
  const drinkCounts = {}
  for (const r of ratings) {
    const s = r.style_category || 'other'
    drinkCounts[s] = (drinkCounts[s] || 0) + 1
  }
  const sortedStyles = Object.entries(drinkCounts).sort(([,a],[,b]) => b - a)
  const maxStyle = sortedStyles[0]?.[1] ?? 1

  // A · Beers logged per user
  const byUser = {}
  for (const r of ratings) {
    byUser[r.display_name] = (byUser[r.display_name] || 0) + 1
  }
  const userBoard = Object.entries(byUser).sort(([,a],[,b]) => b - a)

  // B · Most visited pubs (from venue_name on rating rows)
  const byVenue = {}
  for (const r of ratings) {
    if (!r.venue_name) continue
    byVenue[r.venue_name] = (byVenue[r.venue_name] || 0) + 1
  }
  const venueBoard = Object.entries(byVenue)
    .filter(([name]) => name !== 'Untappd at Home')
    .sort(([,a],[,b]) => b - a)
    .slice(0, 10)

  // C · Most logged beers
  const byBeer = {}
  for (const r of ratings) {
    if (!r.beer_name) continue
    const key = `${r.beer_name}||${r.brewery}`
    if (!byBeer[key]) byBeer[key] = { beer_name: r.beer_name, brewery: r.brewery, count: 0 }
    byBeer[key].count++
  }
  const beerBoard = Object.values(byBeer).sort((a, b) => b.count - a.count).slice(0, 10)

  // D · Top beer per category (avg score, ≥2 logs)
  const beerMap = {}
  for (const r of ratings) {
    if (!r.beer_name || !r.style_category) continue
    const key = `${r.beer_name}||${r.brewery}`
    if (!beerMap[key]) beerMap[key] = { beer_name: r.beer_name, brewery: r.brewery, style_category: r.style_category, scores: [] }
    beerMap[key].scores.push(parseFloat(r.score))
  }
  const styleCounts = {}, styleMap = {}
  for (const beer of Object.values(beerMap)) {
    const cat = beer.style_category
    const avg = beer.scores.reduce((s, v) => s + v, 0) / beer.scores.length
    styleCounts[cat] = (styleCounts[cat] || 0) + beer.scores.length
    if (beer.scores.length >= 2 && (!styleMap[cat] || avg > styleMap[cat].avg)) {
      styleMap[cat] = { ...beer, avg, count: beer.scores.length }
    }
  }
  const styleWinners = Object.entries(styleMap)
    .sort(([a],[b]) => (styleCounts[b] || 0) - (styleCounts[a] || 0))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 80 }}>

      {/* A · Beers logged leaderboard */}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginBottom: 14 }}>Beers logged in {year}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {userBoard.map(([name, count], i) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-display)', color: i < 3 ? 'var(--amber)' : 'var(--muted)', width: 24 }}>{i + 1}</span>
              <span style={{ flex: 1 }}>{name}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--amber)' }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* B · Most visited pubs */}
      {venueBoard.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 14 }}>Most visited pubs in {year}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {venueBoard.map(([name, count], i) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-display)', color: i < 3 ? 'var(--amber)' : 'var(--muted)', width: 24 }}>{i + 1}</span>
                <span style={{ flex: 1 }}>{name}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--amber)' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What we drank — style breakdown chart */}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginBottom: 14 }}>What we drank</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sortedStyles.map(([style, count]) => (
            <div key={style}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 3 }}>
                <span>{STYLE_LABELS[style] ?? style}</span>
                <span style={{ color: 'var(--muted)' }}>{count} ({Math.round(count / total * 100)}%)</span>
              </div>
              <div style={{ height: 6, background: 'var(--fog)', borderRadius: 3 }}>
                <div style={{
                  height: '100%',
                  width: `${(count / maxStyle) * 100}%`,
                  background: 'var(--amber)',
                  borderRadius: 3,
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* C · Most logged beers */}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginBottom: 14 }}>Most logged beers</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {beerBoard.map((b, i) => (
            <div key={`${b.beer_name}||${b.brewery}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-display)', color: i < 3 ? 'var(--amber)' : 'var(--muted)', width: 24 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem' }}>{b.beer_name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{b.brewery}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--amber)' }}>{b.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* D · Top beer per category */}
      {styleWinners.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 14 }}>Best per style</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {styleWinners.map(([style, b]) => (
              <div key={style} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                    {STYLE_LABELS[style] ?? style}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem' }}>{b.beer_name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    {b.brewery} · {b.count} log{b.count !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className={`score-badge ${b.avg >= 7.5 ? 'high' : b.avg >= 5 ? 'mid' : 'low'}`}>
                  {b.avg % 1 === 0 ? b.avg : b.avg.toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Group overview ────────────────────────────────────────────

function GroupTab({ ratings, profiles }) {
  const total = ratings.length
  const avgScore = total
    ? (ratings.reduce((s, r) => s + parseFloat(r.score), 0) / total).toFixed(1)
    : '—'

  // Style breakdown across whole group
  const styleCounts = ratings.reduce((acc, r) => {
    const s = r.style_category || 'other'
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})


  const sortedStyles = Object.entries(styleCounts).sort(([,a],[,b]) => b-a)
  const maxStyle = sortedStyles[0]?.[1] ?? 1

  // Most prolific drinker
  const byUser = ratings.reduce((acc, r) => {
    acc[r.display_name] = (acc[r.display_name] || 0) + 1
    return acc
  }, {})
  const topDrinker = Object.entries(byUser).sort(([,a],[,b]) => b-a)[0]

  // Adjunct frequency
  const adjunctCounts = ratings.reduce((acc, r) => {
    ;(r.adjuncts ?? []).forEach(a => { acc[a] = (acc[a] || 0) + 1 })
    return acc
  }, {})
  const topAdjuncts = Object.entries(adjunctCounts).sort(([,a],[,b]) => b-a).slice(0,5)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 80 }}>

      {/* Style breakdown */}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginBottom: 14 }}>What we drink</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sortedStyles.map(([style, count]) => (
            <div key={style}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 3 }}>
                <span>{STYLE_LABELS[style] ?? style}</span>
                <span style={{ color: 'var(--muted)' }}>{count} ({Math.round(count/total*100)}%)</span>
              </div>
              <div style={{ height: 6, background: 'var(--fog)', borderRadius: 3 }}>
                <div style={{
                  height: '100%',
                  width: `${(count / maxStyle) * 100}%`,
                  background: 'var(--amber)',
                  borderRadius: 3,
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top adjuncts */}
      {topAdjuncts.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 14 }}>Top adjuncts</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {topAdjuncts.map(([adjunct, count], i) => (
              <div key={adjunct} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-display)', color: 'var(--amber)', width: 20 }}>{i+1}</span>
                <span style={{ flex: 1 }}>{adjunct}</span>
                <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Beer leaderboard ──────────────────────────────────────────

const STYLE_LABELS = {
  pale_ale: 'Pale Ale', ipa: 'IPA', neipa: 'NEIPA', hazy_ipa: 'Hazy (Hewzi) IPA', dipa: 'DIPA',
  west_coast_ipa: 'West Coast IPA', session_ipa: 'Session IPA', milkshake_ipa: 'Milkshake IPA',
  lager: 'Lager', dunkel: 'Dunkel', saison: 'Saison',
  stout_porter: 'Stout/Porter', imperial_stout: 'Imperial Stout',
  sour_wild: 'Sour/Wild', wheat: 'Wheat', belgian: 'Belgian',
  golden_ale: 'Blonde / Golden Ale', amber_red: 'Amber/Red', dark_ale: 'Dark Ale',
  winter_warmer: 'Winter Warmer', barleywine: 'Barleywine', fruit: 'Fruit',
  bitter: 'Bitter', mild: 'Mild', cider: 'Cider',
  speciality: 'Speciality', other: 'Other',
}

function BeersTab({ ratings }) {
  const [yearFilter, setYearFilter] = useState('2026')

  const filteredRatings = ratings.filter(r => {
    if (!r.drank_at) return false
    const y = new Date(r.drank_at).getFullYear()
    if (yearFilter === '2024-') return y <= 2024
    return y === parseInt(yearFilter)
  })

  // Aggregate ratings by beer+brewery to get avg scores per beer
  const beerMap = {}
  for (const r of filteredRatings) {
    const cat = r.style_category
    if (!cat || !r.beer_name) continue
    const key = `${r.beer_name}||${r.brewery}`
    if (!beerMap[key]) {
      beerMap[key] = { beer_name: r.beer_name, brewery: r.brewery, style_category: cat, scores: [] }
    }
    beerMap[key].scores.push(parseFloat(r.score))
  }

  // Find best avg-scored beer per style, sorted by style log count
  const styleMap = {}
  const styleCounts = {}
  for (const beer of Object.values(beerMap)) {
    const cat = beer.style_category
    const avg = beer.scores.reduce((s, v) => s + v, 0) / beer.scores.length
    styleCounts[cat] = (styleCounts[cat] || 0) + beer.scores.length
    if (!styleMap[cat] || avg > styleMap[cat].avg) {
      styleMap[cat] = { ...beer, avg, count: beer.scores.length }
    }
  }

  const styleWinners = Object.entries(styleMap)
    .sort(([a], [b]) => (STYLE_LABELS[a] ?? a).localeCompare(STYLE_LABELS[b] ?? b))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 80 }}>
      {styleWinners.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ margin: 0 }}>Best per style</h3>
            <div className="pill-group" style={{ gap: 6 }}>
              {[['2024-', '2024 and before'], ['2025', '2025'], ['2026', '2026']].map(([val, label]) => (
                <button key={val} className={`pill${yearFilter === val ? ' selected' : ''}`}
                  onClick={() => setYearFilter(val)} style={{ fontSize: '0.78rem', padding: '4px 10px' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {styleWinners.map(([style, b]) => (
              <div key={style} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                    {STYLE_LABELS[style] ?? style}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem' }}>{b.beer_name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    {b.brewery} · {b.count} log{b.count !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className={`score-badge ${b.avg >= 7.5 ? 'high' : b.avg >= 5 ? 'mid' : 'low'}`}>
                  {b.avg % 1 === 0 ? b.avg : b.avg.toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {filteredRatings.length === 0 && (
        <div className="empty-state"><p>No beers rated in this period.</p></div>
      )}
    </div>
  )
}

// ── Pub leaderboard ───────────────────────────────────────────

function PubsTab({ venues }) {
  const frequent = [...venues]
    .filter(v => v.visit_count > 1 && v.name !== 'Untappd at Home')
    .sort((a, b) => b.visit_count - a.visit_count)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 80 }}>
      {frequent.length === 0 && (
        <div className="empty-state"><p>No pubs visited more than once yet.</p></div>
      )}
      {frequent.map((v, i) => (
        <div key={v.id} className="feed-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.3rem',
              color: i < 3 ? 'var(--amber)' : 'var(--muted)',
              width: 28,
            }}>{i+1}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem' }}>{v.name}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                {[v.town, v.country].filter(Boolean).join(', ')}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--amber)' }}>
                {v.visit_count}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                visit{v.visit_count !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
          {v.avg_score && (
            <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 4 }}>
              avg score <span className={`score-badge ${v.avg_score >= 7.5 ? 'high' : v.avg_score >= 5 ? 'mid' : 'low'}`} style={{ fontSize: '0.78rem', padding: '1px 6px' }}>{parseFloat(v.avg_score).toFixed(1)}</span>
              {v.unique_visitors > 1 && ` · ${v.unique_visitors} of us`}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── People comparison ─────────────────────────────────────────

function PeopleTab({ profiles, ratings }) {
  const [hiddenAbvUsers, setHiddenAbvUsers] = useState(new Set())

  function toggleAbvUser(name) {
    setHiddenAbvUsers(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const { abvChartData, abvUsers } = useMemo(() => {
    const entries = ratings.filter(r => r.abv != null && r.display_name)
    const users = [...new Set(entries.map(r => r.display_name))].sort()
    const userTotals = {}
    entries.forEach(r => { userTotals[r.display_name] = (userTotals[r.display_name] || 0) + 1 })
    const buckets = {}
    entries.forEach(r => {
      const bucket = (Math.round(r.abv * 2) / 2).toFixed(1)
      if (!buckets[bucket]) buckets[bucket] = { abv: parseFloat(bucket) }
      buckets[bucket][r.display_name] = (buckets[bucket][r.display_name] || 0) + 1
    })
    const data = Object.values(buckets).sort((a, b) => a.abv - b.abv).map(point => {
      const norm = { abv: point.abv }
      users.forEach(name => {
        if (point[name] != null)
          norm[name] = Math.round((point[name] / userTotals[name]) * 1000) / 10
      })
      return norm
    })
    return { abvChartData: data, abvUsers: users }
  }, [ratings])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {abvUsers.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>ABV preference distribution</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {abvUsers.map((name, i) => {
              const hidden = hiddenAbvUsers.has(name)
              return (
                <button key={name} onClick={() => toggleAbvUser(name)} style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: '0.8rem',
                  cursor: 'pointer', border: 'none', transition: 'opacity 0.15s',
                  background: hidden ? 'var(--fog)' : ABV_COLOURS[i % ABV_COLOURS.length],
                  color: hidden ? 'var(--muted)' : '#fff',
                  opacity: hidden ? 0.5 : 1,
                }}>
                  {name}
                </button>
              )
            })}
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={abvChartData} margin={{ top: 4, right: 16, left: -10, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--fog)" />
              <XAxis dataKey="abv" type="number" domain={['dataMin', 'dataMax']}
                tickFormatter={v => `${v}%`} stroke="var(--muted)" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `${v}%`} stroke="var(--muted)" tick={{ fontSize: 11 }} />
              <Tooltip
                labelFormatter={v => `${v}% ABV`}
                formatter={(v, name) => [`${v}% of ${name}'s ratings`, name]}
                contentStyle={{ background: 'var(--ink-soft)', border: '1px solid var(--fog)',
                  borderRadius: 6, fontSize: '0.82rem' }}
              />
              {abvUsers.map((name, i) => (
                <Line key={name} dataKey={name} type="monotone"
                  stroke={ABV_COLOURS[i % ABV_COLOURS.length]}
                  strokeWidth={2} dot={false} connectNulls
                  hide={hiddenAbvUsers.has(name)} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {profiles.length === 0 && (
        <div className="empty-state"><p>No profiles yet.</p></div>
      )}
      {profiles
        .sort((a,b) => b.total_ratings - a.total_ratings)
        .map(p => {
          const userRatings = ratings.filter(r => r.user_id === p.user_id)
          const imperials = userRatings.filter(r => r.style_category === 'imperial_stout').length
          const sours = userRatings.filter(r => r.style_category === 'sour_wild').length

          return (
            <div key={p.user_id} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'var(--mahogany)', color: 'var(--cream)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: '1rem', flexShrink: 0,
                }}>
                  {p.display_name?.slice(0,2).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{p.display_name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    {p.total_ratings} beers · avg {p.avg_score}
                    {p.avg_abv_rated ? ` · avg ${parseFloat(p.avg_abv_rated).toFixed(1)}% ABV` : ''}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {imperials > 0 && <span className="tag">🔥 {imperials} imperials</span>}
                {sours > 0 && <span className="tag">🍋 {sours} sours</span>}
                {p.favourite_style_category && (
                  <span className="tag">Fave: {p.favourite_style_category.replace('_', ' ')}</span>
                )}
              </div>
            </div>
          )
        })
      }
    </div>
  )
}
