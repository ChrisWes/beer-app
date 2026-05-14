import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'
import { scoreClass, colourHex, abvFlame, formatDate, BEER_COLOURS, STYLE_CATEGORIES } from '../lib/constants'

const REACTION_EMOJIS = ['👍', '🍺', '😍', '🤢', '🔥', '💀']

export default function FeedCard({ rating, onReactionChange }) {
  const { profile } = useAuth()
  const [reactions, setReactions] = useState(rating.reactions ?? [])
  const [editingBeer, setEditingBeer] = useState(false)

  const score = parseFloat(rating.score)
  const flame = abvFlame(rating.abv)

  async function toggleReaction(emoji) {
    const mine = reactions.find(r => r.user_id === profile.id && r.emoji === emoji)
    if (mine) {
      await supabase.from('reactions').delete().eq('id', mine.id)
      setReactions(r => r.filter(x => x.id !== mine.id))
    } else {
      const { data } = await supabase.from('reactions').insert({
        user_id: profile.id,
        rating_id: rating.id,
        emoji,
      }).select().single()
      if (data) setReactions(r => [...r, data])
    }
  }

  // Group reactions by emoji
  const grouped = REACTION_EMOJIS.reduce((acc, emoji) => {
    const list = reactions.filter(r => r.emoji === emoji)
    if (list.length > 0) acc[emoji] = list
    return acc
  }, {})

  return (
    <>
    <div className="feed-card">
      {/* Header: avatar + name + time */}
      <div className="feed-card-header">
        <Avatar profile={{ display_name: rating.display_name, avatar_url: rating.avatar_url }} />
        <div className="feed-card-meta">
          <div className="user-name">{rating.display_name}</div>
          <div className="time">{formatDate(rating.drank_at)}</div>
        </div>
        {rating.venue_name && (
          <div className="feed-card-venue">
            <span>📍</span>
            <span>{rating.venue_name}{rating.venue_town ? `, ${rating.venue_town}` : ''}</span>
          </div>
        )}
      </div>

      {/* Beer info + score */}
      <div className="feed-card-beer">
        {/* Colour dot */}
        {rating.colour && (
          <div
            className="colour-dot"
            style={{ background: colourHex(rating.colour), marginTop: 4 }}
            title={rating.colour}
          />
        )}

        <div className="feed-card-beer-info">
          <div className="beer-name">
            {rating.beer_name}
            {flame && <span className="abv-flame" style={{ marginLeft: 4 }}>{flame}</span>}
            <button
              onClick={() => setEditingBeer(true)}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.8rem', padding: '0 4px', lineHeight: 1, verticalAlign: 'middle' }}
              title="Edit beer"
            >✎</button>
          </div>
          <div className="brewery">{rating.brewery}</div>
          {(rating.style || rating.abv) && (
            <div className="style-abv">
              {[rating.style, rating.abv ? `${rating.abv}%` : null].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>

        <div className={`score-badge ${scoreClass(score)}`}>
          {score % 1 === 0 ? score : score.toFixed(1)}
        </div>
      </div>

      {/* Tags */}
      {(rating.clarity || rating.head || rating.adjuncts?.length > 0 || rating.would_seek_again != null) && (
        <div className="feed-card-tags">
          {rating.clarity && rating.clarity !== 'clear' && (
            <span className="tag">{rating.clarity}</span>
          )}
          {rating.head && rating.head !== 'thin' && (
            <span className="tag">{rating.head} head</span>
          )}
          {rating.adjuncts?.slice(0, 3).map(a => (
            <span key={a} className="tag">{a}</span>
          ))}
          {rating.would_seek_again === true && (
            <span className="tag seek-again">Would seek again ✓</span>
          )}
        </div>
      )}

      {/* Note */}
      {rating.note && (
        <div className="feed-card-note">"{rating.note}"</div>
      )}

      <div className="divider" />

      {/* Reactions */}
      <div className="reactions-row">
        {Object.entries(grouped).map(([emoji, list]) => (
          <button
            key={emoji}
            className={`reaction-btn ${list.some(r => r.user_id === profile?.id) ? 'mine' : ''}`}
            onClick={() => toggleReaction(emoji)}
          >
            {emoji} <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{list.length}</span>
          </button>
        ))}
        {/* Add reaction picker */}
        <ReactionPicker onSelect={toggleReaction} />
      </div>
    </div>

    {editingBeer && (
      <EditBeerModal
        ratingId={rating.id}
        onClose={() => setEditingBeer(false)}
        onSave={() => { setEditingBeer(false); onReactionChange() }}
      />
    )}
  </>
  )
}

function ReactionPicker({ onSelect }) {
  const [open, setOpen] = useState(false)
  const REACTION_EMOJIS = ['👍', '🍺', '😍', '🤢', '🔥', '💀']

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="reaction-btn"
        onClick={() => setOpen(o => !o)}
        style={{ color: 'var(--muted)' }}
      >
        + React
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          bottom: '110%',
          left: 0,
          background: 'var(--ink-soft)',
          border: '1px solid var(--fog)',
          borderRadius: 'var(--radius)',
          padding: '8px',
          display: 'flex',
          gap: '4px',
          boxShadow: 'var(--shadow)',
          zIndex: 50,
        }}>
          {REACTION_EMOJIS.map(e => (
            <button
              key={e}
              onClick={() => { onSelect(e); setOpen(false) }}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.4rem',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '6px',
                transition: 'background 0.1s',
              }}
              onMouseEnter={ev => ev.target.style.background = 'var(--cream-dark)'}
              onMouseLeave={ev => ev.target.style.background = 'none'}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function EditBeerModal({ ratingId, onClose, onSave }) {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('ratings').select('beer_id').eq('id', ratingId).single().then(({ data: r }) => {
      if (!r?.beer_id) return
      supabase.from('beers').select('*').eq('id', r.beer_id).single().then(({ data }) => {
        if (data) setForm(data)
      })
    })
  }, [ratingId])

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function save() {
    if (!form?.name?.trim() || !form?.brewery?.trim()) return
    setSaving(true)
    await supabase.from('beers').update({
      name:           form.name.trim(),
      brewery:        form.brewery.trim(),
      style:          form.style || null,
      style_category: form.style_category || null,
      abv:            form.abv ? parseFloat(form.abv) : null,
      colour:         form.colour || null,
    }).eq('id', form.id)
    setSaving(false)
    onSave()
  }

  if (!form) return null

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <h2 className="modal-title">Edit beer</h2>
        <div className="form-stack">
          <div className="form-field">
            <label>Beer name</label>
            <input value={form.name ?? ''} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="form-field">
            <label>Brewery</label>
            <input value={form.brewery ?? ''} onChange={e => set('brewery', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-field">
              <label>Style</label>
              <input value={form.style ?? ''} onChange={e => set('style', e.target.value)} placeholder="e.g. West Coast IPA" />
            </div>
            <div className="form-field">
              <label>ABV %</label>
              <input type="number" step="0.1" min="0" max="25" value={form.abv ?? ''} onChange={e => set('abv', e.target.value)} />
            </div>
          </div>
          <div className="form-field">
            <label>Style category</label>
            <select value={form.style_category ?? ''} onChange={e => set('style_category', e.target.value)}>
              <option value="">— unknown —</option>
              {STYLE_CATEGORIES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Colour</label>
            <div className="colour-picker">
              {BEER_COLOURS.map(c => (
                <div
                  key={c.value}
                  className={`colour-option ${form.colour === c.value ? 'selected' : ''}`}
                  style={{ background: c.hex }}
                  title={c.label}
                  onClick={() => set('colour', c.value)}
                />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={save} disabled={saving || !form.name?.trim() || !form.brewery?.trim()}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
