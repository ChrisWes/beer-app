import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Analytics() {
  const [tab, setTab] = useState('group')
  const [beers, setBeers] = useState([])
  const [venues, setVenues] = useState([])
  const [profiles, setProfiles] = useState([])
  const [allRatings, setAllRatings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [
      { data: beerData },
      { data: venueData },
      { data: profileData },
      { data: ratingData },
    ] = await Promise.all([
      supabase.from('beer_leaderboard').select('*').limit(200),
      supabase.from('venue_leaderboard').select('*').limit(10),
      supabase.from('user_taste_profiles').select('*'),
      supabase.from('feed').select('*').limit(500),
    ])

    setBeers(beerData ?? [])
    setVenues(venueData ?? [])
    setProfiles(profileData ?? [])
    setAllRatings(ratingData ?? [])
    setLoading(false)
  }

  return (
    <div className="container page">
      <div className="page-header">
        <h1>Stats</h1>
      </div>

      <div className="pill-group" style={{ marginBottom: 20 }}>
        {['group', 'beers', 'pubs', 'people'].map(t => (
          <button key={t} className={`pill ${tab === t ? 'selected' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading && <div className="loading-bar" />}

      {!loading && tab === 'group'   && <GroupTab ratings={allRatings} profiles={profiles} />}
      {!loading && tab === 'beers'   && <BeersTab ratings={allRatings} />}
      {!loading && tab === 'pubs'    && <PubsTab venues={venues} />}
      {!loading && tab === 'people'  && <PeopleTab profiles={profiles} ratings={allRatings} />}
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

  const styleLabels = {
    pale_ale: 'Pale Ale', ipa: 'IPA', neipa: 'NEIPA',
    west_coast_ipa: 'West Coast IPA', session_ipa: 'Session IPA', milkshake_ipa: 'Milkshake IPA',
    lager: 'Lager', dunkel: 'Dunkel', saison: 'Saison',
    stout_porter: 'Stout/Porter', imperial_stout: 'Imperial Stout',
    sour_wild: 'Sour/Wild', wheat: 'Wheat', belgian: 'Belgian',
    amber_red: 'Amber/Red', barleywine: 'Barleywine',
    bitter: 'Bitter', mild: 'Mild', cider: 'Cider',
    speciality: 'Speciality', other: 'Other',
  }

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
                <span>{styleLabels[style] ?? style}</span>
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
  pale_ale: 'Pale Ale', ipa: 'IPA', neipa: 'NEIPA',
  west_coast_ipa: 'West Coast IPA', session_ipa: 'Session IPA', milkshake_ipa: 'Milkshake IPA',
  lager: 'Lager', dunkel: 'Dunkel', saison: 'Saison',
  stout_porter: 'Stout/Porter', imperial_stout: 'Imperial Stout',
  sour_wild: 'Sour/Wild', wheat: 'Wheat', belgian: 'Belgian',
  amber_red: 'Amber/Red', barleywine: 'Barleywine',
  bitter: 'Bitter', mild: 'Mild', cider: 'Cider',
  speciality: 'Speciality', other: 'Other',
}

function BeersTab({ ratings }) {
  const highestRated = [...ratings].sort((a, b) => parseFloat(b.score) - parseFloat(a.score))[0]

  // Aggregate ratings by beer+brewery to get avg scores per beer
  const beerMap = {}
  for (const r of ratings) {
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
    .sort(([a], [b]) => (styleCounts[b] || 0) - (styleCounts[a] || 0))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 80 }}>

      {highestRated && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Highest single rating
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem' }}>
            {highestRated.beer_name}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{highestRated.brewery}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <div className="score-badge high">{highestRated.score}</div>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>by {highestRated.display_name}</span>
          </div>
        </div>
      )}

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

      {ratings.length === 0 && (
        <div className="empty-state"><p>No beers rated yet.</p></div>
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
