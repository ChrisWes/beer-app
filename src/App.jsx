import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Feed from './pages/Feed'
import Profile from './pages/Profile'
import Analytics from './pages/Analytics'
import Venues from './pages/Venues'
import Admin from './pages/Admin'
import Nav from './components/Nav'
import './index.css'

function SetupProfile() {
  const { user, fetchProfile } = useAuth()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function save(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    await supabase.from('profiles').upsert({ id: user.id, display_name: name.trim() })
    await fetchProfile(user.id)
    setSaving(false)
  }

  return (
    <div className="container page">
      <h1 style={{ marginBottom: 8 }}>Welcome</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 24 }}>What should we call you?</p>
      <form onSubmit={save} className="form-stack">
        <div className="form-field">
          <label>Your name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Ben W"
            autoFocus
          />
        </div>
        <button className="btn btn-primary" disabled={!name.trim() || saving}>
          {saving ? 'Saving...' : 'Get started'}
        </button>
      </form>
    </div>
  )
}

function AppRoutes() {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ padding: '40px 20px' }}>
        <div className="loading-bar" />
      </div>
    )
  }

  if (!user) return <Login />
  if (!profile) return <SetupProfile />

  return (
    <>
      <Routes>
        <Route path="/"          element={<Feed />} />
        <Route path="/profile"   element={<Profile />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/venues"    element={<Venues />} />
        <Route path="/admin"     element={<Admin />} />
        <Route path="*"          element={<Navigate to="/" />} />
      </Routes>
      <Nav />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
