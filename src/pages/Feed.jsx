import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import FeedCard from '../components/FeedCard'

export default function Feed() {
  const [ratings, setRatings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchFeed()

    // Real-time subscription
    const channel = supabase
      .channel('feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ratings' }, () => {
        fetchFeed()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  async function fetchFeed() {
    const { data } = await supabase
      .from('feed')
      .select('*')
      .limit(50)

    // Fetch reactions for each rating
    if (data?.length) {
      const ids = data.map(r => r.id)
      const { data: reactions } = await supabase
        .from('reactions')
        .select('*')
        .in('rating_id', ids)

      const withReactions = data.map(r => ({
        ...r,
        reactions: reactions?.filter(rx => rx.rating_id === r.id) ?? [],
      }))
      setRatings(withReactions)
    } else {
      setRatings([])
    }
    setLoading(false)
  }

  return (
    <div className="container page">
      <div className="page-header">
        <h1>Rounds</h1>
        <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          {ratings.length} pints logged
        </span>
      </div>

      {loading && <div className="loading-bar" />}

      {!loading && ratings.length === 0 && (
        <div className="empty-state">
          <p>No beers logged yet.</p>
          <p style={{ fontSize: '0.9rem' }}>Tap + Log to get started.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ratings.map(r => (
          <FeedCard key={r.id} rating={r} onReactionChange={fetchFeed} />
        ))}
      </div>
    </div>
  )
}
