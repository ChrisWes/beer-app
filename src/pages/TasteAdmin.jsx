import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function TasteAdmin() {
  const [tastings, setTastings] = useState([])
  const [selectedTastingId, setSelectedTastingId] = useState('')
  const [tastingEntries, setTastingEntries] = useState([])
  const [newTasting, setNewTasting] = useState({ name: '', year: new Date().getFullYear(), tasting_date: '', venue: '', notes: '' })
  const [newEntry, setNewEntry] = useState({ beer_name: '', brewery: '', style: '', abv: '', score: '', is_winner: false, notes: '' })
  const [tastingSaving, setTastingSaving] = useState(false)
  const [entrySaving, setEntrySaving] = useState(false)
  const [beerSearch, setBeerSearch] = useState('')
  const [beerSearchResults, setBeerSearchResults] = useState([])
  const [linkedBeerId, setLinkedBeerId] = useState(null)

  useEffect(() => {
    supabase.from('tastings').select('id, name, year').order('year', { ascending: false })
      .then(({ data }) => setTastings(data ?? []))
  }, [])

  async function createTasting() {
    if (!newTasting.name.trim() || !newTasting.year) return
    setTastingSaving(true)
    const payload = {
      name: newTasting.name.trim(),
      year: parseInt(newTasting.year),
      tasting_date: newTasting.tasting_date || null,
      venue: newTasting.venue.trim() || null,
      notes: newTasting.notes.trim() || null,
    }
    const { data } = await supabase.from('tastings').insert(payload).select('id, name, year').single()
    if (data) {
      setTastings(ts => [data, ...ts])
      setSelectedTastingId(data.id)
      setTastingEntries([])
    }
    setNewTasting({ name: '', year: new Date().getFullYear(), tasting_date: '', venue: '', notes: '' })
    setTastingSaving(false)
  }

  async function loadEntries(tastingId) {
    const { data } = await supabase
      .from('tasting_entries')
      .select('*')
      .eq('tasting_id', tastingId)
      .order('score', { ascending: false })
    setTastingEntries(data ?? [])
  }

  async function addEntry() {
    if (!selectedTastingId || !newEntry.beer_name.trim() || !newEntry.brewery.trim()) return
    setEntrySaving(true)
    const payload = {
      tasting_id: selectedTastingId,
      beer_id: linkedBeerId || null,
      beer_name: newEntry.beer_name.trim(),
      brewery: newEntry.brewery.trim(),
      style: newEntry.style.trim() || null,
      abv: newEntry.abv ? parseFloat(newEntry.abv) : null,
      score: newEntry.score !== '' ? parseFloat(newEntry.score) : null,
      is_winner: newEntry.is_winner,
      notes: newEntry.notes.trim() || null,
    }
    const { data } = await supabase.from('tasting_entries').insert(payload).select().single()
    if (data) setTastingEntries(ts => [...ts, data].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)))
    setNewEntry({ beer_name: '', brewery: '', style: '', abv: '', score: '', is_winner: false, notes: '' })
    setLinkedBeerId(null)
    setBeerSearch('')
    setBeerSearchResults([])
    setEntrySaving(false)
  }

  async function deleteEntry(id) {
    await supabase.from('tasting_entries').delete().eq('id', id)
    setTastingEntries(ts => ts.filter(e => e.id !== id))
  }

  async function searchBeers(q) {
    setBeerSearch(q)
    if (q.length < 2) { setBeerSearchResults([]); return }
    const { data } = await supabase.from('beers').select('id, name, brewery')
      .or(`name.ilike.%${q}%,brewery.ilike.%${q}%`).limit(8)
    setBeerSearchResults(data ?? [])
  }

  return (
    <div className="container page" style={{ paddingBottom: 80 }}>
      <h1 style={{ marginBottom: 8 }}>Tastings</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 24, fontSize: '0.9rem' }}>
        Manage annual tasting sessions and their results. Public results at{' '}
        <a href="/tastings" style={{ color: 'var(--amber-soft)' }}>/tastings</a>.
      </p>

      {/* Create new tasting */}
      <div className="form-stack" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--amber-soft)', marginBottom: 8 }}>
          Create tasting
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 10 }}>
          <div className="form-field">
            <label>Name</label>
            <input value={newTasting.name} onChange={e => setNewTasting(t => ({ ...t, name: e.target.value }))}
              placeholder="e.g. 2024 Annual Tasting" />
          </div>
          <div className="form-field">
            <label>Year</label>
            <input type="number" value={newTasting.year} onChange={e => setNewTasting(t => ({ ...t, year: e.target.value }))} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-field">
            <label>Date</label>
            <input type="date" value={newTasting.tasting_date} onChange={e => setNewTasting(t => ({ ...t, tasting_date: e.target.value }))} />
          </div>
          <div className="form-field">
            <label>Venue</label>
            <input value={newTasting.venue} onChange={e => setNewTasting(t => ({ ...t, venue: e.target.value }))}
              placeholder="e.g. St Paul's Church" />
          </div>
        </div>
        <div className="form-field">
          <label>Notes</label>
          <input value={newTasting.notes} onChange={e => setNewTasting(t => ({ ...t, notes: e.target.value }))}
            placeholder="Optional notes" />
        </div>
        <button className="btn btn-primary" onClick={createTasting}
          disabled={tastingSaving || !newTasting.name.trim()}>
          {tastingSaving ? 'Creating...' : 'Create tasting'}
        </button>
      </div>

      {/* Manage entries */}
      {tastings.length > 0 && (
        <div className="form-stack">
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--amber-soft)', marginBottom: 8 }}>
            Manage entries
          </div>
          <div className="form-field">
            <label>Select tasting</label>
            <select value={selectedTastingId} onChange={e => {
              setSelectedTastingId(e.target.value)
              if (e.target.value) loadEntries(e.target.value)
              else setTastingEntries([])
            }}>
              <option value="">— select a tasting —</option>
              {tastings.map(t => (
                <option key={t.id} value={t.id}>{t.year} — {t.name}</option>
              ))}
            </select>
          </div>

          {/* Existing entries */}
          {selectedTastingId && tastingEntries.length > 0 && (
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 10, fontSize: '0.9rem' }}>
                {tastingEntries.length} entr{tastingEntries.length !== 1 ? 'ies' : 'y'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tastingEntries.map((e, i) => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
                    padding: '6px 0', borderBottom: '1px solid var(--fog)' }}>
                    <span style={{ width: 22, color: 'var(--muted)', fontFamily: 'var(--font-display)', flexShrink: 0 }}>
                      {e.is_winner ? '🏆' : i + 1}
                    </span>
                    <div style={{ flex: 1, fontSize: '0.85rem' }}>
                      <div>{e.beer_name}</div>
                      <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{e.brewery}</div>
                    </div>
                    {e.score != null && (
                      <span style={{ fontFamily: 'var(--font-display)', color: 'var(--amber)', fontSize: '0.95rem', flexShrink: 0 }}>
                        {parseFloat(e.score).toFixed(1)}
                      </span>
                    )}
                    <button
                      onClick={() => deleteEntry(e.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--muted)',
                        cursor: 'pointer', fontSize: '0.85rem', padding: '2px 6px', lineHeight: 1, flexShrink: 0 }}
                      title="Remove entry">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add entry form */}
          {selectedTastingId && (
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 12, fontSize: '0.9rem' }}>Add entry</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="form-field">
                    <label>Beer name</label>
                    <input value={newEntry.beer_name} onChange={e => setNewEntry(n => ({ ...n, beer_name: e.target.value }))}
                      placeholder="e.g. Cloudwater DIPA" />
                  </div>
                  <div className="form-field">
                    <label>Brewery</label>
                    <input value={newEntry.brewery} onChange={e => setNewEntry(n => ({ ...n, brewery: e.target.value }))}
                      placeholder="e.g. Cloudwater" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 10 }}>
                  <div className="form-field">
                    <label>Style</label>
                    <input value={newEntry.style} onChange={e => setNewEntry(n => ({ ...n, style: e.target.value }))}
                      placeholder="e.g. DIPA" />
                  </div>
                  <div className="form-field">
                    <label>ABV %</label>
                    <input type="number" step="0.1" min="0" max="25" value={newEntry.abv}
                      onChange={e => setNewEntry(n => ({ ...n, abv: e.target.value }))} />
                  </div>
                  <div className="form-field">
                    <label>Score</label>
                    <input type="number" step="0.1" min="0" max="10" value={newEntry.score}
                      onChange={e => setNewEntry(n => ({ ...n, score: e.target.value }))} />
                  </div>
                </div>
                <div className="form-field">
                  <label>Notes</label>
                  <input value={newEntry.notes} onChange={e => setNewEntry(n => ({ ...n, notes: e.target.value }))}
                    placeholder="Optional tasting notes" />
                </div>
                <div style={{ position: 'relative' }}>
                  <div className="form-field">
                    <label>Link to beer in system (optional)</label>
                    <input
                      value={linkedBeerId ? `${newEntry.beer_name} — linked ✓` : beerSearch}
                      onChange={e => { setLinkedBeerId(null); searchBeers(e.target.value) }}
                      placeholder="Search by name or brewery…"
                      style={linkedBeerId ? { color: 'var(--amber-soft)' } : {}}
                    />
                  </div>
                  {beerSearchResults.length > 0 && !linkedBeerId && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0,
                      background: 'var(--ink-soft)', border: '1px solid var(--fog)',
                      borderRadius: 'var(--radius-sm)', zIndex: 10, maxHeight: 200, overflowY: 'auto' }}>
                      {beerSearchResults.map(b => (
                        <div key={b.id}
                          onClick={() => {
                            setLinkedBeerId(b.id)
                            setNewEntry(n => ({ ...n, beer_name: n.beer_name || b.name, brewery: n.brewery || b.brewery }))
                            setBeerSearchResults([])
                            setBeerSearch('')
                          }}
                          style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--fog)',
                            fontSize: '0.85rem' }}>
                          <div>{b.name}</div>
                          <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{b.brewery}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input type="checkbox" checked={newEntry.is_winner}
                    onChange={e => setNewEntry(n => ({ ...n, is_winner: e.target.checked }))} />
                  Winner 🏆
                </label>
                <button className="btn btn-primary" onClick={addEntry}
                  disabled={entrySaving || !newEntry.beer_name.trim() || !newEntry.brewery.trim()}>
                  {entrySaving ? 'Adding...' : 'Add entry'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
