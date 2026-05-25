import { NavLink } from 'react-router-dom'
import { useState } from 'react'
import LogBeerModal from './LogBeerModal'

const HomeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
)

const VenueIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
)

const AnalyticsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6"  y1="20" x2="6"  y2="14"/>
  </svg>
)

const ProfileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
)

const BeerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M5 3h11l-1 13a2 2 0 01-2 2H8a2 2 0 01-2-2L5 3z"/>
    <path d="M16 7h3a1 1 0 011 1v4a1 1 0 01-1 1h-3"/>
    <line x1="8" y1="10" x2="8" y2="13"/>
    <line x1="12" y1="10" x2="12" y2="13"/>
  </svg>
)

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5"  y1="12" x2="19" y2="12"/>
  </svg>
)

const JourneyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9"/>
    <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="12" r="1.5" fill="var(--ink)"/>
  </svg>
)

export default function Nav() {
  const [logOpen, setLogOpen] = useState(false)

  return (
    <>
      <nav className="bottom-nav">
        <NavLink to="/" end>
          <HomeIcon />
          Feed
        </NavLink>

        <NavLink to="/venues">
          <VenueIcon />
          Pubs
        </NavLink>

        <NavLink to="/beers">
          <BeerIcon />
          Beers
        </NavLink>

        <button className="log-btn" onClick={() => setLogOpen(true)}>
          <PlusIcon />
          Log
        </button>

        <NavLink to="/analytics">
          <AnalyticsIcon />
          Stats
        </NavLink>

        <NavLink to="/robs-journey">
          <JourneyIcon />
          Journey
        </NavLink>

        <NavLink to="/profile">
          <ProfileIcon />
          Me
        </NavLink>
      </nav>

      {logOpen && <LogBeerModal onClose={() => setLogOpen(false)} />}
    </>
  )
}
