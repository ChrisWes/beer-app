import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { STYLE_CATEGORIES } from '../lib/constants'

const STYLE_LABELS = {
  pale_ale: 'Pale Ale', ipa: 'IPA', lager: 'Lager',
  stout_porter: 'Stout/Porter', imperial_stout: 'Imperial Stout',
  sour_wild: 'Sour/Wild', wheat: 'Wheat', belgian: 'Belgian',
  amber_red: 'Amber/Red', barleywine: 'Barleywine',
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
  const [editing, setEditing] = useState(null) // beer object being edited

  useEffect(() => {
    supabase
      .from('ratings')
      .select('score, would_seek_again, beer_id, beers(id, name, brewery, style, style_category, abv)')
      .not('beer_id', 'is', null)
      .limit(5000)
      .then(({ data }) => {
        if (!data) { setLoading(false); return }

        // Aggregate per beer client-side
        const map = {}
        for (const r of data) {
          const b = r.beers
          if (!b) continue
          if (!map[b.id]) {
            map[b.id] = { ...b, scores: [], seek_again_count: 0 }
          }
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <div style={{ textAlign: 'right' }}>
                  <div className={`score-badge ${b.avg_score >= 7.5 ? 'high' : b.avg_score >= 5 ? 'mid' : 'low'}`}>
                    {parseFloat(b.avg_score).toFixed(1)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4 }}>
                    {b.rating_count} log{b.rating_count !== 1 ? 's' : ''}
                  </div>
                </div>
                <button
                  onClick={() => setEditing(b)}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.85rem', padding: '4px', lineHeight: 1 }}
                  title="Edit beer"
                >✎</button>
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

function EditBeerModal({ beer, onClose, onSave }) {
  const [form, setForm] = useState({
    name:           beer.name ?? '',
    brewery:        beer.brewery ?? '',
    style:          beer.style ?? '',
    style_category: beer.style_category ?? '',
    abv:            beer.abv ?? '',
  })
  const [saving, setSaving] = useState(false)

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function save() {
    if (!form.name.trim() || !form.brewery.trim()) return
    setSaving(true)
    await supabase.from('beers').update({
      name:           form.name.trim(),
      brewery:        form.brewery.trim(),
      style:          form.style || null,
      style_category: form.style_category || null,
      abv:            form.abv ? parseFloat(form.abv) : null,
    }).eq('id', beer.id)
    setSaving(false)
    onSave({ id: beer.id, ...form, abv: form.abv ? parseFloat(form.abv) : null })
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
