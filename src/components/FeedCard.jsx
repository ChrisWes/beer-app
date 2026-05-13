import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'
import { scoreClass, colourHex, abvFlame, formatDate } from '../lib/constants'

const REACTION_EMOJIS = ['👍', '🍺', '😍', '🤢', '🔥', '💀']

export default function FeedCard({ rating, onReactionChange }) {
  const { profile } = useAuth()
  const [reactions, setReactions] = useState(rating.reactions ?? [])

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
