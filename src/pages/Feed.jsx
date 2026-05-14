import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import FeedCard from '../components/FeedCard'

const PAGE_SIZE = 30

export default function Feed() {
  const [ratings, setRatings] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const sentinelRef = useRef(null)
  const loadingMoreRef = useRef(false)
  const hasMoreRef = useRef(true)

  useEffect(() => {
    fetchPage(0, true)

    const channel = supabase
      .channel('feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ratings' }, () => {
        fetchPage(0, true)
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  // Sync refs so the IntersectionObserver callback always reads current values
  useEffect(() => { hasMoreRef.current = hasMore }, [hasMore])
  useEffect(() => { loadingMoreRef.current = loadingMore }, [loadingMore])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMoreRef.current && !loadingMoreRef.current) {
          setRatings(prev => {
            fetchPage(prev.length, false)
            return prev
          })
        }
      },
      { rootMargin: '300px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  async function fetchPage(pageOffset, replace) {
    if (replace) setLoading(true)
    else {
      if (loadingMoreRef.current) return
      setLoadingMore(true)
      loadingMoreRef.current = true
    }

    const { data } = await supabase
      .from('feed')
      .select('*')
      .order('drank_at', { ascending: false })
      .range(pageOffset, pageOffset + PAGE_SIZE - 1)

    if (data?.length) {
      const ids = data.map(r => r.id)
      const { data: reactions } = await supabase
        .from('reactions').select('*').in('rating_id', ids)

      const withReactions = data.map(r => ({
        ...r,
        reactions: reactions?.filter(rx => rx.rating_id === r.id) ?? [],
      }))

      if (replace) {
        setRatings(withReactions)
      } else {
        setRatings(prev => [...prev, ...withReactions])
      }
      const more = data.length === PAGE_SIZE
      setHasMore(more)
      hasMoreRef.current = more
    } else {
      if (replace) setRatings([])
      setHasMore(false)
      hasMoreRef.current = false
    }

    if (replace) setLoading(false)
    else {
      setLoadingMore(false)
      loadingMoreRef.current = false
    }
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
          <FeedCard key={r.id} rating={r} onReactionChange={() => fetchPage(0, true)} />
        ))}
      </div>

      <div ref={sentinelRef} style={{ height: 1 }} />
      {loadingMore && <div className="loading-bar" style={{ marginTop: 12 }} />}
    </div>
  )
}
