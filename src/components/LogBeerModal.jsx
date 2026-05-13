import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  BEER_COLOURS, STYLE_CATEGORIES, FLAVOUR_DIMENSIONS, getDimensionsForStyle,
  ADJUNCTS, SERVING_SIZES, CLARITY_OPTIONS, HEAD_OPTIONS, CARBONATION_OPTIONS,
} from '../lib/constants'

export default function LogBeerModal({ onClose, prefillRating }) {
  const { profile } = useAuth()

  // Beer search
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedBeer, setSelectedBeer] = useState(null)
  const [manualMode, setManualMode] = useState(false)

  // Beer fields
  const [beerName, setBeerName] = useState('')
  const [brewery, setBrewery] = useState('')
  const [style, setStyle] = useState('')
  const [styleCategory, setStyleCategory] = useState('')
  const [abv, setAbv] = useState('')

  // Rating fields
  const [score, setScore] = useState(7)
  const [note, setNote] = useState('')
  const [colour, setColour] = useState('')
  const [clarity, setClarity] = useState('')
  const [head, setHead] = useState('')
  const [carbonation, setCarbonation] = useState('')
  const [flavourProfile, setFlavourProfile] = useState({})
  const [adjuncts, setAdjuncts] = useState([])
  const [wouldSeekAgain, setWouldSeekAgain] = useState(null)
  const [servingSize, setServingSize] = useState('')
  const [venueId, setVenueId] = useState('')
  const [drankAt, setDrankAt] = useState(new Date().toISOString().slice(0, 10))

  // Venues
  const [venues, setVenues] = useState([])

  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState('beer') // 'beer' | 'rate'
  const searchTimeout = useRef(null)

  useEffect(() => {
    supabase.from('venues').select('id, name, town').order('name').then(({ data }) => {
      setVenues(data ?? [])
    })
  }, [])

  // Prefill from existing rating (for editing)
  useEffect(() => {
    if (prefillRating) {
      setBeerName(prefillRating.beer_name ?? '')
      setBrewery(prefillRating.brewery ?? '')
      setStyle(prefillRating.style ?? '')
      setStyleCategory(prefillRating.style_category ?? '')
      setAbv(prefillRating.abv ?? '')
      setScore(prefillRating.score ?? 7)
      setNote(prefillRating.note ?? '')
      setColour(prefillRating.colour ?? '')
      setClarity(prefillRating.clarity ?? '')
      setHead(prefillRating.head ?? '')
      setCarbonation(prefillRating.carbonation ?? '')
      setFlavourProfile(prefillRating.flavour_profile ?? {})
      setAdjuncts(prefillRating.adjuncts ?? [])
      setWouldSeekAgain(prefillRating.would_seek_again ?? null)
      setServingSize(prefillRating.serving_size ?? '')
      setStep('rate')
      setManualMode(true)
    }
  }, [prefillRating])

  async function searchBeers(q) {
    if (q.length < 2) { setSearchResults([]); return }
    setSearching(true)

    // Search our own database first
    const { data: ours } = await supabase
      .from('beers')
      .select('*')
      .ilike('name', `%${q}%`)
      .limit(5)

    setSearchResults(ours ?? [])
    setSearching(false)
  }

  function handleQueryChange(e) {
    const q = e.target.value
    setQuery(q)
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => searchBeers(q), 300)
  }

  function selectBeer(beer) {
    setSelectedBeer(beer)
    setBeerName(beer.name)
    setBrewery(beer.brewery)
    setStyle(beer.style ?? '')
    setStyleCategory(beer.style_category ?? '')
    setAbv(beer.abv ?? '')
    setSearchResults([])
    setQuery('')
    setStep('rate')
  }

  function goManual() {
    setManualMode(true)
    setSelectedBeer(null)
    setStep('rate')
  }

  function toggleFlavour(key, value) {
    setFlavourProfile(p => ({ ...p, [key]: value }))
  }

  function toggleAdjunct(a) {
    setAdjuncts(prev =>
      prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]
    )
  }

  async function save() {
    if (!beerName.trim() || !brewery.trim()) return
    setSaving(true)

    // Upsert beer
    let beerId = selectedBeer?.id
    if (!beerId) {
      const { data: existing } = await supabase
        .from('beers')
        .select('id')
        .ilike('name', beerName.trim())
        .ilike('brewery', brewery.trim())
        .single()

      if (existing) {
        beerId = existing.id
      } else {
        const { data: newBeer } = await supabase.from('beers').insert({
          name: beerName.trim(),
          brewery: brewery.trim(),
          style: style || null,
          style_category: styleCategory || null,
          abv: abv ? parseFloat(abv) : null,
          created_by: profile.id,
        }).select().single()
        beerId = newBeer?.id
      }
    }

    if (!beerId) { setSaving(false); return }

    await supabase.from('ratings').insert({
      user_id: profile.id,
      beer_id: beerId,
      venue_id: venueId || null,
      score: parseFloat(score),
      note: note || null,
      colour: colour || null,
      clarity: clarity || null,
      head: head || null,
      carbonation: carbonation || null,
      flavour_profile: flavourProfile,
      adjuncts,
      would_seek_again: wouldSeekAgain,
      serving_size: servingSize || null,
      drank_at: drankAt,
      imported_from: 'manual',
    })

    setSaving(false)
    onClose()
  }

  const dimensions = getDimensionsForStyle(styleCategory)
  const showAdjuncts = ['imperial_stout', 'stout_porter', 'speciality', 'barleywine', 'belgian'].includes(styleCategory)

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />

        {step === 'beer' ? (
          <>
            <h2 className="modal-title">What are you drinking?</h2>
            <div className="form-stack">
              <div className="form-field">
                <label>Search beers</label>
                <input
                  value={query}
                  onChange={handleQueryChange}
                  placeholder="Beer name or brewery..."
                  autoFocus
                />
              </div>

              {searching && <div className="loading-bar" />}

              {searchResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {searchResults.map(b => (
                    <button
                      key={b.id}
                      onClick={() => selectBeer(b)}
                      style={{
                        text: 'left',
                        padding: '10px 12px',
                        background: 'var(--cream-dark)',
                        border: '1px solid var(--fog)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{b.name}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                        {b.brewery}{b.abv ? ` · ${b.abv}%` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <button className="btn btn-secondary" onClick={goManual}>
                Not listed — add manually
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="modal-title">
              {manualMode && !selectedBeer ? 'Add a beer' : beerName || 'Rate it'}
            </h2>

            <div className="form-stack">
              {/* Beer details (manual mode) */}
              {(manualMode && !selectedBeer) && (
                <>
                  <div className="form-field">
                    <label>Beer name *</label>
                    <input value={beerName} onChange={e => setBeerName(e.target.value)} placeholder="e.g. Thornbridge Jaipur" />
                  </div>
                  <div className="form-field">
                    <label>Brewery *</label>
                    <input value={brewery} onChange={e => setBrewery(e.target.value)} placeholder="e.g. Thornbridge" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-field">
                      <label>Style</label>
                      <input value={style} onChange={e => setStyle(e.target.value)} placeholder="e.g. IPA" />
                    </div>
                    <div className="form-field">
                      <label>ABV %</label>
                      <input type="number" step="0.1" min="0" max="25" value={abv} onChange={e => setAbv(e.target.value)} placeholder="5.9" />
                    </div>
                  </div>
                  <div className="form-field">
                    <label>Style category</label>
                    <select value={styleCategory} onChange={e => setStyleCategory(e.target.value)}>
                      <option value="">— select —</option>
                      {STYLE_CATEGORIES.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Score */}
              <div className="form-field">
                <label>Score</label>
                <div className="score-slider-wrap">
                  <div className="score-display">
                    {score}<span>/10</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="0.5"
                    value={score}
                    onChange={e => setScore(e.target.value)}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--muted)' }}>
                    <span>Drain pour</span>
                    <span>Perfect pint</span>
                  </div>
                </div>
              </div>

              {/* Colour */}
              <div className="form-field">
                <label>Colour</label>
                <div className="colour-picker">
                  {BEER_COLOURS.map(c => (
                    <div
                      key={c.value}
                      className={`colour-option ${colour === c.value ? 'selected' : ''}`}
                      style={{ background: c.hex }}
                      title={c.label}
                      onClick={() => setColour(c.value)}
                    />
                  ))}
                </div>
              </div>

              {/* Appearance */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-field">
                  <label>Clarity</label>
                  <div className="pill-group" style={{ flexDirection: 'column' }}>
                    {CLARITY_OPTIONS.map(o => (
                      <button key={o} className={`pill ${clarity === o ? 'selected' : ''}`} onClick={() => setClarity(o)}>
                        {o.charAt(0).toUpperCase() + o.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-field">
                  <label>Head</label>
                  <div className="pill-group" style={{ flexDirection: 'column' }}>
                    {HEAD_OPTIONS.map(o => (
                      <button key={o} className={`pill ${head === o ? 'selected' : ''}`} onClick={() => setHead(o)}>
                        {o.charAt(0).toUpperCase() + o.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-field">
                  <label>Carbonation</label>
                  <div className="pill-group" style={{ flexDirection: 'column' }}>
                    {CARBONATION_OPTIONS.map(o => (
                      <button key={o} className={`pill ${carbonation === o ? 'selected' : ''}`} onClick={() => setCarbonation(o)}>
                        {o.charAt(0).toUpperCase() + o.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Flavour dimensions */}
              {dimensions.length > 0 && (
                <div className="form-field">
                  <label>Flavour</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {dimensions.map(key => {
                      const dim = FLAVOUR_DIMENSIONS[key]
                      const val = flavourProfile[key] ?? 0
                      return (
                        <div key={key} className="flavour-row">
                          <span className="flavour-label">{dim.label}</span>
                          <input
                            type="range"
                            min="0"
                            max={dim.labels.length - 1}
                            step="1"
                            value={val}
                            onChange={e => toggleFlavour(key, parseInt(e.target.value))}
                            style={{ flex: 1 }}
                          />
                          <span className="flavour-value">{dim.labels[val]}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Adjuncts */}
              {showAdjuncts && (
                <div className="form-field">
                  <label>Adjuncts</label>
                  <div className="adjunct-grid">
                    {ADJUNCTS.map(a => (
                      <button
                        key={a}
                        className={`pill ${adjuncts.includes(a) ? 'selected' : ''}`}
                        onClick={() => toggleAdjunct(a)}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Note */}
              <div className="form-field">
                <label>Tasting note</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="What did you think?"
                />
              </div>

              {/* Venue + serving */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-field">
                  <label>Pub / venue</label>
                  <select value={venueId} onChange={e => setVenueId(e.target.value)}>
                    <option value="">— none —</option>
                    {venues.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name}{v.town ? `, ${v.town}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label>Serving</label>
                  <select value={servingSize} onChange={e => setServingSize(e.target.value)}>
                    <option value="">— none —</option>
                    {SERVING_SIZES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Date */}
              <div className="form-field">
                <label>Date</label>
                <input
                  type="date"
                  value={drankAt}
                  onChange={e => setDrankAt(e.target.value)}
                />
              </div>

              {/* Would seek again */}
              <label className={`seek-again-toggle ${wouldSeekAgain === true ? 'yes' : ''}`}>
                <input
                  type="checkbox"
                  checked={wouldSeekAgain === true}
                  onChange={e => setWouldSeekAgain(e.target.checked ? true : null)}
                />
                <span>Would seek this out again</span>
              </label>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10 }}>
                {step === 'rate' && !prefillRating && (
                  <button className="btn btn-ghost" onClick={() => setStep('beer')}>
                    ← Back
                  </button>
                )}
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={save}
                  disabled={saving || !beerName.trim() || !brewery.trim()}
                >
                  {saving ? 'Saving...' : 'Log this beer'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
