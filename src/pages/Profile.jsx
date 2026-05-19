import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import FeedCard from '../components/FeedCard'
import { scoreClass, colourHex, formatDate } from '../lib/constants'

const THEMES = [
  { id: '',      label: 'The Pub',      bg: '#0e0b07', ring: '#d4841e' },
  { id: 'light', label: 'Light & Airy', bg: '#f8f4ee', ring: '#c4610a' },
]

export default function Profile() {
  const { profile, signOut } = useAuth()
  const [ratings, setRatings] = useState([])
  const [tasteProfile, setTasteProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('history') // 'history' | 'taste'
  const [currentTheme, setCurrentTheme] = useState(() => localStorage.getItem('theme') ?? '')

  function applyTheme(id) {
    document.documentElement.setAttribute('data-theme', id)
    localStorage.setItem('theme', id)
    setCurrentTheme(id)
  }

  useEffect(() => {
    if (!profile) return
    fetchData()
  }, [profile])

  async function fetchData() {
    const [{ data: ratingData }, { data: taste }] = await Promise.all([
      supabase
        .from('feed')
        .select('*')
        .eq('user_id', profile.id)
        .limit(100),
      supabase
        .from('user_taste_profiles')
        .select('*')
        .eq('user_id', profile.id)
        .single(),
    ])

    // Fetch reactions
    if (ratingData?.length) {
      const ids = ratingData.map(r => r.id)
      const { data: reactions } = await supabase
        .from('reactions')
        .select('*')
        .in('rating_id', ids)
      setRatings(ratingData.map(r => ({
        ...r,
        reactions: reactions?.filter(rx => rx.rating_id === r.id) ?? [],
      })))
    }

    setTasteProfile(taste)
    setLoading(false)
  }

  const totalRatings = ratings.length
  const avgScore = totalRatings
    ? (ratings.reduce((s, r) => s + parseFloat(r.score), 0) / totalRatings).toFixed(1)
    : '—'
  const seekAgainCount = ratings.filter(r => r.would_seek_again).length

  return (
    <div className="container page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Avatar profile={profile} size={56} />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.6rem' }}>{profile?.display_name}</h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{profile?.email ?? ''}</p>
        </div>
        <button className="btn btn-ghost" onClick={signOut} style={{ fontSize: '0.85rem' }}>
          Sign out
        </button>
      </div>

      {/* Stats row */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-value">{totalRatings}</div>
          <div className="stat-label">Beers logged</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{avgScore}</div>
          <div className="stat-label">Avg score</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{seekAgainCount}</div>
          <div className="stat-label">Seek again</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {tasteProfile?.imperial_stout_count ?? 0}
          </div>
          <div className="stat-label">Imperials</div>
        </div>
      </div>

      {/* Theme picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Theme</span>
        {THEMES.map(t => (
          <button key={t.id} onClick={() => applyTheme(t.id)} title={t.label}
            style={{
              width: 28, height: 28, borderRadius: '50%', border: 'none',
              cursor: 'pointer', background: t.bg,
              boxShadow: currentTheme === t.id
                ? `0 0 0 2px var(--amber), 0 0 0 4px ${t.ring}`
                : '0 0 0 1px var(--fog)',
            }} />
        ))}
      </div>

      {/* Tabs */}
      <div className="pill-group" style={{ marginBottom: 20 }}>
        <button className={`pill ${tab === 'history' ? 'selected' : ''}`} onClick={() => setTab('history')}>
          History
        </button>
        <button className={`pill ${tab === 'taste' ? 'selected' : ''}`} onClick={() => setTab('taste')}>
          Taste profile
        </button>
      </div>

      {loading && <div className="loading-bar" />}

      {/* History tab */}
      {!loading && tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ratings.length === 0 && (
            <div className="empty-state">
              <p>Nothing logged yet.</p>
            </div>
          )}
          {ratings.map(r => (
            <FeedCard key={r.id} rating={r} />
          ))}
        </div>
      )}

      {/* Taste profile tab */}
      {!loading && tab === 'taste' && (
        <TasteProfile profile={tasteProfile} ratings={ratings} />
      )}
    </div>
  )
}

function TasteProfile({ profile: taste, ratings }) {
  if (!taste || ratings.length < 5) {
    return (
      <div className="empty-state">
        <p>Log at least 5 beers to see your taste profile.</p>
      </div>
    )
  }

  // Style breakdown
  const styleCounts = ratings.reduce((acc, r) => {
    const s = r.style_category || 'other'
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})

  const styleLabels = {
    pale_ale: 'Pale Ale', ipa: 'IPA', lager: 'Lager',
    stout_porter: 'Stout/Porter', imperial_stout: 'Imperial Stout',
    sour_wild: 'Sour/Wild', wheat: 'Wheat', belgian: 'Belgian',
    amber_red: 'Amber/Red', barleywine: 'Barleywine',
    speciality: 'Speciality', other: 'Other',
  }

  const sortedStyles = Object.entries(styleCounts)
    .sort(([,a],[,b]) => b - a)
    .slice(0, 6)

  const maxCount = sortedStyles[0]?.[1] ?? 1

  // Top breweries
  const breweryCounts = ratings.reduce((acc, r) => {
    acc[r.brewery] = (acc[r.brewery] || 0) + 1
    return acc
  }, {})
  const topBreweries = Object.entries(breweryCounts)
    .sort(([,a],[,b]) => b - a)
    .slice(0, 5)

  // Flavour fingerprint
  const flavourKeys = ['bitterness', 'sweetness', 'body', 'acidity', 'funk', 'roast', 'alcohol_warmth']
  const flavourAvgs = flavourKeys
    .map(k => {
      const vals = ratings
        .map(r => r.flavour_profile?.[k])
        .filter(v => v != null)
      if (!vals.length) return null
      return { key: k, avg: vals.reduce((s, v) => s + v, 0) / vals.length }
    })
    .filter(Boolean)

  const flavourLabels = {
    bitterness: 'Bitterness', sweetness: 'Sweetness', body: 'Body',
    acidity: 'Acidity', funk: 'Funk', roast: 'Roast', alcohol_warmth: 'Warmth',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Style breakdown */}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginBottom: 14 }}>Style breakdown</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sortedStyles.map(([style, count]) => (
            <div key={style}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 3 }}>
                <span>{styleLabels[style] ?? style}</span>
                <span style={{ color: 'var(--muted)' }}>{count}</span>
              </div>
              <div style={{ height: 6, background: 'var(--fog)', borderRadius: 3 }}>
                <div style={{
                  height: '100%',
                  width: `${(count / maxCount) * 100}%`,
                  background: 'var(--amber)',
                  borderRadius: 3,
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Flavour fingerprint */}
      {flavourAvgs.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 14 }}>Flavour fingerprint</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {flavourAvgs.map(({ key, avg }) => (
              <div key={key} className="flavour-row">
                <span className="flavour-label">{flavourLabels[key]}</span>
                <div style={{ flex: 1, height: 6, background: 'var(--fog)', borderRadius: 3 }}>
                  <div style={{
                    height: '100%',
                    width: `${(avg / 4) * 100}%`,
                    background: 'var(--mahogany)',
                    borderRadius: 3,
                  }} />
                </div>
                <span className="flavour-value">{avg.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top breweries */}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginBottom: 14 }}>Favourite breweries</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {topBreweries.map(([brewery, count], i) => (
            <div key={brewery} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.1rem',
                color: 'var(--amber)',
                width: 20,
              }}>{i + 1}</span>
              <span style={{ flex: 1 }}>{brewery}</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{count} beers</span>
            </div>
          ))}
        </div>
      </div>

      {/* ABV preference */}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginBottom: 4 }}>Average ABV rated</h3>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--amber)' }}>
          {taste.avg_abv_rated ? `${parseFloat(taste.avg_abv_rated).toFixed(1)}%` : '—'}
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 4 }}>
          {taste.avg_abv_rated >= 7 ? 'You lean towards the heavy end.' :
           taste.avg_abv_rated >= 5 ? 'Solidly mid-strength territory.' :
           'You like a sessionable pint.'}
        </p>
      </div>
    </div>
  )
}
