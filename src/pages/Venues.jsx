import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatDate } from '../lib/constants'

const FACILITY_ICONS = {
  has_dartboard:          { icon: '🎯', label: 'Darts' },
  has_pool_table:         { icon: '🎱', label: 'Pool' },
  has_open_fire:          { icon: '🔥', label: 'Fire' },
  has_beer_garden:        { icon: '🌳', label: 'Garden' },
  is_dog_friendly:        { icon: '🐕', label: 'Dogs' },
  has_sport_tv:           { icon: '📺', label: 'Sport' },
  has_live_music:         { icon: '🎵', label: 'Music' },
  is_accessible:          { icon: '♿', label: 'Access' },
}

const BEER_OFFER_ICONS = {
  has_cask:               { icon: '🍺', label: 'Cask' },
  has_craft_keg:          { icon: '🥂', label: 'Craft keg' },
  has_rotating_taps:      { icon: '🔄', label: 'Rotating' },
  has_bottle_can_selection:{ icon: '🍶', label: 'Bottles/cans' },
  has_clear_beer_list:    { icon: '📋', label: 'Beer list' },
}

const EDITABLE_FIELDS = [
  'name', 'town', 'country',
  'has_cask', 'has_craft_keg', 'has_rotating_taps', 'has_bottle_can_selection', 'has_clear_beer_list',
  'has_dartboard', 'has_pool_table', 'has_open_fire', 'has_beer_garden', 'is_dog_friendly',
  'has_sport_tv', 'has_live_music', 'is_accessible',
  'food_offer', 'noise_level', 'price_rating', 'tap_count_range',
]

function pickFields(obj) {
  return Object.fromEntries(EDITABLE_FIELDS.map(k => [k, obj[k] ?? null]))
}

function trimFields(obj) {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() || null) : v])
  )
}

export default function Venues() {
  const [venues, setVenues] = useState([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [sortBy, setSortBy] = useState('score') // 'score' | 'name'
  const [country, setCountry] = useState('') // '' = all
  const [search, setSearch] = useState('')

  useEffect(() => { fetchVenues() }, [])

  async function fetchVenues() {
    const { data } = await supabase
      .from('venue_leaderboard')
      .select('*')
    setVenues(data ?? [])
    setLoading(false)
  }

  const countries = [...new Set(venues.map(v => v.country?.trim()).filter(Boolean))].sort()

  const q = search.trim().toLowerCase()
  const visible = venues
    .filter(v => !q || v.name.toLowerCase().includes(q) || v.town?.toLowerCase().includes(q))
    .filter(v => !country || v.country?.trim() === country)
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      // score: venues with a score first, then no-score venues alphabetically
      if (a.avg_score && b.avg_score) return parseFloat(b.avg_score) - parseFloat(a.avg_score)
      if (a.avg_score) return -1
      if (b.avg_score) return 1
      return a.name.localeCompare(b.name)
    })

  return (
    <div className="container page">
      <div className="page-header">
        <h1>Pubs</h1>
        <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.9rem' }} onClick={() => setAddOpen(true)}>
          + Add pub
        </button>
      </div>

      <input
        type="search"
        placeholder="Search pub or town..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      {/* Sort + filter controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {['score', 'name'].map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`pill ${sortBy === s ? 'selected' : ''}`}
              style={{ fontSize: '0.8rem' }}
            >
              {s === 'score' ? 'By score' : 'A–Z'}
            </button>
          ))}
        </div>
        {countries.length > 1 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button
              onClick={() => setCountry('')}
              className={`pill ${country === '' ? 'selected' : ''}`}
              style={{ fontSize: '0.8rem' }}
            >
              All
            </button>
            {countries.map(c => (
              <button
                key={c}
                onClick={() => setCountry(c)}
                className={`pill ${country === c ? 'selected' : ''}`}
                style={{ fontSize: '0.8rem' }}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <div className="loading-bar" />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {visible.map((v, i) => (
          <VenueCard key={v.id} venue={v} rank={i + 1} onClick={() => setSelected(v)} />
        ))}
        {!loading && visible.length === 0 && (
          <div className="empty-state">
            <p>No pubs logged yet.</p>
            <p style={{ fontSize: '0.9rem' }}>Add your local.</p>
          </div>
        )}
      </div>

      {addOpen && <AddVenueModal onClose={() => { setAddOpen(false); fetchVenues() }} />}
      {selected && (
        <VenueDetailModal
          venue={selected}
          onClose={() => setSelected(null)}
          onUpdate={fetchVenues}
        />
      )}
    </div>
  )
}

function VenueCard({ venue, rank, onClick }) {
  return (
    <div className="feed-card" style={{ cursor: 'pointer' }} onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.4rem',
          color: rank <= 3 ? 'var(--amber)' : 'var(--muted)',
          width: 28,
          flexShrink: 0,
        }}>{rank}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>{venue.name}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
            {[venue.town, venue.country].filter(Boolean).join(', ')}
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {venue.avg_score && (
            <div className={`score-badge ${venue.avg_score >= 7.5 ? 'high' : venue.avg_score >= 5 ? 'mid' : 'low'}`}>
              {parseFloat(venue.avg_score).toFixed(1)}
            </div>
          )}
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4 }}>
            {venue.visit_count} visit{venue.visit_count !== 1 ? 's' : ''}
            {venue.unique_visitors > 1 ? ` · ${venue.unique_visitors} of us` : ''}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {venue.has_cask && <span className="tag">Cask</span>}
        {venue.has_craft_keg && <span className="tag">Craft keg</span>}
        {venue.price_rating && <span className="tag">{venue.price_rating}</span>}
      </div>
    </div>
  )
}

function VenueDetailModal({ venue, onClose, onUpdate }) {
  const { profile } = useAuth()
  const [myScore, setMyScore] = useState(7)
  const [myNote, setMyNote] = useState('')
  const [visitedAt, setVisitedAt] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [fullVenue, setFullVenue] = useState(null)
  const [editorName, setEditorName] = useState(null)
  const [editHistory, setEditHistory] = useState([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => { loadVenue() }, [venue.id])

  async function loadVenue() {
    const { data } = await supabase.from('venues').select('*').eq('id', venue.id).single()
    setFullVenue(data)
    if (data?.updated_by) {
      const { data: ed } = await supabase
        .from('profiles').select('display_name').eq('id', data.updated_by).maybeSingle()
      setEditorName(ed?.display_name ?? null)
    }
  }

  async function loadHistory() {
    const { data } = await supabase
      .from('venue_edits')
      .select('edited_at, profiles(display_name)')
      .eq('venue_id', venue.id)
      .order('edited_at', { ascending: false })
      .limit(20)
    setEditHistory(data ?? [])
  }

  async function logVisit() {
    setSaving(true)
    await supabase.from('venue_ratings').insert({
      user_id: profile.id,
      venue_id: venue.id,
      score: myScore,
      note: myNote || null,
      visited_at: visitedAt,
    })
    setSaving(false)
    onClose()
  }

  function handleEditSave() {
    setEditOpen(false)
    loadVenue()
    onUpdate()
  }

  const v = fullVenue ?? venue

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
          <div>
            <h2 className="modal-title" style={{ marginBottom: 2 }}>{v.name}</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0 }}>
              {[v.town, v.country].filter(Boolean).join(', ')}
            </p>
            {editorName && v.updated_at && (
              <p style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: 4 }}>
                Last updated by {editorName} on {formatDate(v.updated_at)}
              </p>
            )}
          </div>
          <button
            className="btn btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.85rem', flexShrink: 0, marginTop: 4 }}
            onClick={() => setEditOpen(true)}
          >
            Edit
          </button>
        </div>

        {/* Facilities */}
        {fullVenue && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Facilities
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Object.entries(FACILITY_ICONS).map(([key, { icon, label }]) =>
                fullVenue[key] ? <span key={key} className="tag">{icon} {label}</span> : null
              )}
              {Object.entries(BEER_OFFER_ICONS).map(([key, { icon, label }]) =>
                fullVenue[key] ? <span key={key} className="tag">{icon} {label}</span> : null
              )}
              {fullVenue.food_offer && fullVenue.food_offer !== 'none' && (
                <span className="tag">
                  🍕 {fullVenue.food_offer === 'full_kitchen' ? 'Full kitchen' : 'Bar snacks'}
                </span>
              )}
              {fullVenue.price_rating && <span className="tag">{fullVenue.price_rating}</span>}
              {fullVenue.noise_level && <span className="tag">{fullVenue.noise_level.replace('_', ' ')}</span>}
            </div>
          </div>
        )}

        {/* Edit history toggle */}
        <div style={{ marginBottom: 16 }}>
          <button
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '0.82rem', cursor: 'pointer', padding: 0 }}
            onClick={() => {
              setHistoryOpen(o => !o)
              if (!historyOpen) loadHistory()
            }}
          >
            {historyOpen ? '▾' : '▸'} Edit history
          </button>
          {historyOpen && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {editHistory.length === 0 ? (
                <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No edits recorded yet.</span>
              ) : editHistory.map((e, i) => (
                <span key={i} style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  {e.profiles?.display_name ?? 'Unknown'} — {formatDate(e.edited_at)}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="divider" />

        {/* Log a visit */}
        <div style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Log a visit</h3>
          <div className="form-stack">
            <div className="form-field">
              <label>Score</label>
              <div className="score-slider-wrap">
                <div className="score-display">{myScore}<span>/10</span></div>
                <input type="range" min="1" max="10" step="1" value={myScore} onChange={e => setMyScore(e.target.value)} />
              </div>
            </div>
            <div className="form-field">
              <label>Date</label>
              <input type="date" value={visitedAt} onChange={e => setVisitedAt(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Note</label>
              <textarea value={myNote} onChange={e => setMyNote(e.target.value)} placeholder="What was it like?" />
            </div>
            <button className="btn btn-primary" onClick={logVisit} disabled={saving}>
              {saving ? 'Saving...' : 'Log visit'}
            </button>
          </div>
        </div>
      </div>

      {editOpen && (
        <EditVenueModal
          venue={fullVenue ?? venue}
          onClose={() => setEditOpen(false)}
          onSave={handleEditSave}
        />
      )}
    </div>
  )
}

function EditVenueModal({ venue, onClose, onSave }) {
  const { profile } = useAuth()
  const [form, setForm] = useState(pickFields(venue))
  const [saving, setSaving] = useState(false)

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function save() {
    if (!form.name?.trim()) return
    setSaving(true)
    const now = new Date().toISOString()
    const fields = trimFields(form)

    await supabase.from('venues')
      .update({ ...fields, updated_by: profile.id, updated_at: now })
      .eq('id', venue.id)

    await supabase.from('venue_edits').insert({
      venue_id: venue.id,
      edited_by: profile.id,
      edited_at: now,
      ...fields,
    })

    setSaving(false)
    onSave()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <h2 className="modal-title">Edit pub</h2>

        <div className="form-stack">
          <div className="form-field">
            <label>Name *</label>
            <input value={form.name ?? ''} onChange={e => set('name', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-field">
              <label>Town</label>
              <input value={form.town ?? ''} onChange={e => set('town', e.target.value)} />
            </div>
            <div className="form-field">
              <label>Country</label>
              <input value={form.country ?? ''} onChange={e => set('country', e.target.value)} />
            </div>
          </div>

          <div className="form-field">
            <label>Beer offer</label>
            <div className="pill-group">
              {Object.entries(BEER_OFFER_ICONS).map(([key, { icon, label }]) => (
                <button key={key} className={`pill ${form[key] ? 'selected' : ''}`} onClick={() => set(key, !form[key])}>
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-field">
              <label>Taps</label>
              <select value={form.tap_count_range ?? ''} onChange={e => set('tap_count_range', e.target.value)}>
                <option value="">—</option>
                <option value="handful">Handful</option>
                <option value="loads">Loads</option>
                <option value="ridiculous">Ridiculous</option>
              </select>
            </div>
            <div className="form-field">
              <label>Price</label>
              <select value={form.price_rating ?? ''} onChange={e => set('price_rating', e.target.value)}>
                <option value="">—</option>
                <option value="£">£</option>
                <option value="££">££</option>
                <option value="£££">£££</option>
              </select>
            </div>
          </div>

          <div className="form-field">
            <label>Facilities</label>
            <div className="pill-group">
              {Object.entries(FACILITY_ICONS).map(([key, { icon, label }]) => (
                <button key={key} className={`pill ${form[key] ? 'selected' : ''}`} onClick={() => set(key, !form[key])}>
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-field">
              <label>Food</label>
              <select value={form.food_offer ?? ''} onChange={e => set('food_offer', e.target.value)}>
                <option value="">—</option>
                <option value="none">None</option>
                <option value="bar_snacks">Bar snacks</option>
                <option value="full_kitchen">Full kitchen</option>
              </select>
            </div>
            <div className="form-field">
              <label>Noise</label>
              <select value={form.noise_level ?? ''} onChange={e => set('noise_level', e.target.value)}>
                <option value="">—</option>
                <option value="quiet">Quiet</option>
                <option value="lively">Lively</option>
                <option value="cant_hear_yourself">Can't hear yourself</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={save} disabled={saving || !form.name?.trim()}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AddVenueModal({ onClose }) {
  const { profile } = useAuth()
  const [form, setForm] = useState({
    name: '', town: '', country: 'UK',
    has_cask: false, has_craft_keg: false, has_rotating_taps: false,
    has_bottle_can_selection: false, has_clear_beer_list: false,
    has_dartboard: false, has_pool_table: false, has_open_fire: false,
    has_beer_garden: false, is_dog_friendly: false, has_sport_tv: false,
    has_live_music: false, is_accessible: false,
    food_offer: '', noise_level: '', price_rating: '',
    tap_count_range: '',
  })
  const [saving, setSaving] = useState(false)

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    await supabase.from('venues').insert({ ...trimFields(form), created_by: profile.id })
    setSaving(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <h2 className="modal-title">Add a pub</h2>

        <div className="form-stack">
          <div className="form-field">
            <label>Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="The Jolly Brewer" autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-field">
              <label>Town</label>
              <input value={form.town} onChange={e => set('town', e.target.value)} placeholder="Sheffield" />
            </div>
            <div className="form-field">
              <label>Country</label>
              <input value={form.country} onChange={e => set('country', e.target.value)} />
            </div>
          </div>

          <div className="form-field">
            <label>Beer offer</label>
            <div className="pill-group">
              {Object.entries(BEER_OFFER_ICONS).map(([key, { icon, label }]) => (
                <button key={key} className={`pill ${form[key] ? 'selected' : ''}`} onClick={() => set(key, !form[key])}>
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-field">
              <label>Taps</label>
              <select value={form.tap_count_range} onChange={e => set('tap_count_range', e.target.value)}>
                <option value="">—</option>
                <option value="handful">Handful</option>
                <option value="loads">Loads</option>
                <option value="ridiculous">Ridiculous</option>
              </select>
            </div>
            <div className="form-field">
              <label>Price</label>
              <select value={form.price_rating} onChange={e => set('price_rating', e.target.value)}>
                <option value="">—</option>
                <option value="£">£</option>
                <option value="££">££</option>
                <option value="£££">£££</option>
              </select>
            </div>
          </div>

          <div className="form-field">
            <label>Facilities</label>
            <div className="pill-group">
              {Object.entries(FACILITY_ICONS).map(([key, { icon, label }]) => (
                <button key={key} className={`pill ${form[key] ? 'selected' : ''}`} onClick={() => set(key, !form[key])}>
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-field">
              <label>Food</label>
              <select value={form.food_offer} onChange={e => set('food_offer', e.target.value)}>
                <option value="">—</option>
                <option value="none">None</option>
                <option value="bar_snacks">Bar snacks</option>
                <option value="full_kitchen">Full kitchen</option>
              </select>
            </div>
            <div className="form-field">
              <label>Noise</label>
              <select value={form.noise_level} onChange={e => set('noise_level', e.target.value)}>
                <option value="">—</option>
                <option value="quiet">Quiet</option>
                <option value="lively">Lively</option>
                <option value="cant_hear_yourself">Can't hear yourself</option>
              </select>
            </div>
          </div>

          <button className="btn btn-primary" onClick={save} disabled={saving || !form.name.trim()}>
            {saving ? 'Saving...' : 'Add pub'}
          </button>
        </div>
      </div>
    </div>
  )
}
