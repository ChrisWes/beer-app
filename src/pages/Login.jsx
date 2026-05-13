import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await signIn(email)
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--ink)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      {/* Logo area */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{
          fontSize: '4rem',
          marginBottom: 8,
          filter: 'drop-shadow(0 4px 12px rgba(196,122,30,0.4))',
        }}>🍺</div>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          color: 'var(--amber-soft)',
          fontSize: '2.5rem',
          marginBottom: 4,
        }}>Rounds</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.95rem' }}>
          The future of beers and pubs, today!
        </p>
      </div>

      {/* Card */}
      <div style={{
        background: 'var(--ink-soft)',
        borderRadius: 'var(--radius-lg)',
        padding: '28px 24px',
        width: '100%',
        maxWidth: 380,
        boxShadow: 'var(--shadow-lg)',
      }}>
        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📬</div>
            <h2 style={{ marginBottom: 8 }}>Check your email</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
              We've sent a link to <strong>{email}</strong>.
              Tap it to sign in — no password needed.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="form-stack">
            <div style={{ marginBottom: 4 }}>
              <h2 style={{ marginBottom: 4 }}>Sign in</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                We'll email you a magic link.
              </p>
            </div>

            <div className="form-field">
              <label>Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>

            {error && (
              <p style={{ color: 'var(--ruby)', fontSize: '0.9rem' }}>{error}</p>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={!email || loading}
              style={{ width: '100%' }}
            >
              {loading ? 'Sending...' : 'Send magic link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
