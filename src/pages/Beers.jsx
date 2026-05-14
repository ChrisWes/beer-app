import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const STYLE_LABELS = {
  pale_ale: 'Pale Ale', ipa: 'IPA', lager: 'Lager',
  stout_porter: 'Stout/Porter', imperial_stout: 'Imperial Stout',
  sour_wild: 'Sour/Wild', wheat: 'Wheat', belgian: 'Belgian',
  amber_red: 'Amber/Red', barleywine: 'Barleywine',
  speciality: 'Speciality', other: 'Other',
}

const SCORE_BANDS = [
  { label: 'All',  test: () => true },
  { label: '9+',   test: b => parseFloat(b.avg_score) >= 9 },
  { label: '8+',   test: b => parseFloat(b.avg_score) >= 8 },
  { label: '7+',   test: b => parseFloat(b.avg_score) >= 7 },
  { label: '6+',   test: b => parseFloat(b.avg_score) >= 6 },
  { label: '< 6',  test: b => parseFloat(b.avg_score) < 6 },
]

export default function Beers() {
  const [beers, setBeers] = useState([])
  const [loading, setLoading] = useState(true)
  const [styleFilter, setStyleFilter] = useState(null)
  const [scoreBandIdx, setScoreBandIdx] = useState(0)

  useEffect(() => {
    supabase
      .from('beer_leaderboard')
      .select('*')
      .order('avg_score', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        setBeers(data ?? [])
        setLoading(false)
      })
  }, [])

  const styles = [...new Set(beers.map(b => b.style_category).filter(Boolean))].sort()
  const band = SCORE_BANDS[scoreBandIdx]

  const visible = beers
    .filter(b => !styleFilter || b.style_category === styleFilter)
    .filter(band.test)

  return (
    <div className="container page">
      <div className="page-header">
        <h1>Beers</h1>
        <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{visible.length}</span>
      </div>

      {/* Style filter */}
      <div className="pill-group" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
        <button
          className={`pill ${!styleFilter ? 'selected' : ''}`}
          onClick={() => setStyleFilter(null)}
        >All styles</button>
        {styles.map(s => (
          <button
            key={s}
            className={`pill ${styleFilter === s ? 'selected' : ''}`}
            onClick={() => setStyleFilter(f => f === s ? null : s)}
          >{STYLE_LABELS[s] ?? s}</button>
        ))}
      </div>

      {/* Score band filter */}
      <div className="pill-group" style={{ marginBottom: 16 }}>
        {SCORE_BANDS.map((band, i) => (
          <button
            key={band.label}
            className={`pill ${scoreBandIdx === i ? 'selected' : ''}`}
            onClick={() => setScoreBandIdx(i)}
          >{band.label}</button>
        ))}
      </div>

      {loading && <div className="loading-bar" />}

      {!loading && visible.length === 0 && (
        <div className="empty-state"><p>No beers match these filters.</p></div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 80 }}>
        {visible.map((b, i) => (
          <div key={b.id} className="feed-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.2rem',
                color: i < 3 ? 'var(--amber)' : 'var(--muted)',
                width: 26, flexShrink: 0,
              }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.0rem' }}>{b.name}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  {b.brewery}{b.abv ? ` · ${b.abv}%` : ''}
                </div>
                {b.style_category && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--amber-soft)', marginTop: 2 }}>
                    {STYLE_LABELS[b.style_category] ?? b.style_category}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className={`score-badge ${b.avg_score >= 7.5 ? 'high' : b.avg_score >= 5 ? 'mid' : 'low'}`}>
                  {parseFloat(b.avg_score).toFixed(1)}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4 }}>
                  {b.rating_count} log{b.rating_count !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
            {b.seek_again_count > 0 && (
              <div style={{ marginTop: 4 }}>
                <span className="tag seek-again">{b.seek_again_count} would seek again</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
