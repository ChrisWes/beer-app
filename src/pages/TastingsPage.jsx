import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function TastingsPage() {
  const [tastings, setTastings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('tastings')
      .select('*, tasting_entries(*)')
      .order('year', { ascending: false })
      .then(({ data }) => {
        const sorted = (data ?? []).map(t => ({
          ...t,
          tasting_entries: [...(t.tasting_entries ?? [])].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
        }))
        setTastings(sorted)
        setLoading(false)
      })
  }, [])

  return (
    <div className="container page" style={{ paddingBottom: 60 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
        <h1 style={{ margin: 0 }}>Annual Beer Tastings</h1>
        <a href="/" style={{ fontSize: '0.8rem', color: 'var(--amber-soft)',
          textDecoration: 'none', whiteSpace: 'nowrap', paddingTop: 6 }}>
          Sign in →
        </a>
      </div>
      <p style={{ color: 'var(--muted)', marginBottom: 28, fontSize: '0.9rem' }}>
        {tastings.length > 0
          ? `${tastings.length} tasting${tastings.length !== 1 ? 's' : ''} · ${tastings.reduce((s, t) => s + t.tasting_entries.length, 0)} beers entered`
          : 'Our annual blind tasting results'}
      </p>

      {loading && <div className="loading-bar" />}

      {!loading && tastings.length === 0 && (
        <div className="empty-state"><p>No tastings recorded yet.</p></div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {tastings.map(t => (
          <TastingCard key={t.id} tasting={t} />
        ))}
      </div>
    </div>
  )
}

function TastingCard({ tasting }) {
  const { name, year, tasting_date, venue, notes, tasting_entries: entries } = tasting

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ margin: 0, marginBottom: 4 }}>{name}</h3>
        <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          {[
            tasting_date ? new Date(tasting_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : `${year}`,
            venue,
          ].filter(Boolean).join(' · ')}
        </div>
        {notes && (
          <div style={{ fontSize: '0.82rem', color: 'var(--muted)', fontStyle: 'italic', marginTop: 4 }}>{notes}</div>
        )}
      </div>

      {entries.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No entries recorded.</div>
      ) : (
        <div>
          {entries.map((entry, idx) => (
            <EntryRow key={entry.id} entry={entry} rank={idx + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function EntryRow({ entry, rank }) {
  const isWinner = entry.is_winner
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '8px 0',
      borderBottom: '1px solid var(--fog)',
    }}>
      <span style={{
        width: 28, flexShrink: 0,
        fontFamily: 'var(--font-display)',
        fontSize: isWinner ? '1.1rem' : '1.0rem',
        color: isWinner ? 'var(--amber)' : 'var(--muted)',
        textAlign: 'center',
      }}>
        {isWinner ? '🏆' : rank}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.0rem',
          color: isWinner ? 'var(--white)' : 'var(--white)',
        }}>
          {entry.beer_name}
          {isWinner && (
            <span className="tag seek-again" style={{ marginLeft: 8, fontSize: '0.7rem', verticalAlign: 'middle' }}>
              Winner
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          {[entry.brewery, entry.abv ? `${entry.abv}%` : null, entry.style].filter(Boolean).join(' · ')}
        </div>
        {entry.notes && (
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', fontStyle: 'italic', marginTop: 2 }}>
            {entry.notes}
          </div>
        )}
      </div>
      {entry.score != null ? (
        <div className={`score-badge ${entry.score >= 7.5 ? 'high' : entry.score >= 5 ? 'mid' : 'low'}`}
          style={{ flexShrink: 0 }}>
          {parseFloat(entry.score).toFixed(1)}
        </div>
      ) : (
        <div className="score-badge" style={{ background: 'var(--fog)', color: 'var(--muted)', flexShrink: 0 }}>—</div>
      )}
    </div>
  )
}
