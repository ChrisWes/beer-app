import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ── Constants ─────────────────────────────────────────────────

const MACRO_BREWERIES = [
  'budweiser', 'bud light', 'coors', 'miller', 'corona', 'stella artois',
  'heineken', "foster's", 'fosters', 'carling', 'peroni', 'san miguel',
  'amstel', 'kronenbourg', 'carlsberg', "tennent's", 'tennents',
  'ab inbev', 'anheuser',
]

const LAGER_RE      = /pilsner|pils\b|helles|kellerbier|schwarzbier/i
const PASTRY_RE     = /pastry|smoothie|dessert/i
const PASTRY_ADJ    = new Set(['lactose', 'cacao'])
const FRESHNESS_RE  = /\bfresh\b|canned on|ddh\b|double dry hop/i

const AWARD_DEFS = [
  { id: 'sour_puss',         cat: 'style',      emoji: '🍋', name: 'Sour Puss',           flavor: 'Your jaw has been permanently clenched since July.' },
  { id: 'imperial_outlook',  cat: 'style',      emoji: '👑', name: 'Imperial Outlook',     flavor: 'Why drink a 4% session when you can drink an 11% liquid dessert?' },
  { id: 'lager_royalty',     cat: 'style',      emoji: '🍺', name: 'Lager King / Queen',   flavor: 'You spent the year in the craft scene just looking for a clean, honest pint.' },
  { id: 'pastry_chef',       cat: 'style',      emoji: '🧁', name: 'The Pastry Chef',      flavor: "You don't want a beer, you want a bakery in a can." },
  { id: 'appalling_taste',   cat: 'shame',      emoji: '🏭', name: 'Appalling Taste',      flavor: 'Spotted at an airport, a music festival, or an ultimate moment of weakness.' },
  { id: 'hype_victim',       cat: 'shame',      emoji: '💸', name: 'The Hype Victim',      flavor: 'You checked in beers the group loved — and hated every second of it.' },
  { id: 'diacetyl_disciple', cat: 'shame',      emoji: '🧈', name: 'Diacetyl Disciple',    flavor: 'You flew too close to the sun at a poorly kept village pub.' },
  { id: 'defiant_palate',    cat: 'palate',     emoji: '🦹', name: 'The Defiant Palate',   flavor: 'You love what the rest of the group despises. A true champion of the misunderstood.' },
  { id: 'iconoclast',        cat: 'palate',     emoji: '🏛️', name: 'The Iconoclast',       flavor: "Nobody hates craft beer more than a true craft beer fan." },
  { id: 'monogamous',        cat: 'palate',     emoji: '💍', name: 'Monogamous Drinker',   flavor: "Experimental? Groundbreaking? No thanks, I'll have the usual." },
  { id: 'nomad',             cat: 'palate',     emoji: '🧭', name: 'The Nomad',            flavor: 'Your palate has zero loyalty and a severe case of wanderlust.' },
  { id: 'iron_liver',        cat: 'highoctane', emoji: '🛢️', name: 'The Iron Liver',       flavor: "Your ABV average is higher than the average bear." },
  { id: 'sundown_savior',    cat: 'highoctane', emoji: '🌙', name: 'The Sundown Savior',   flavor: 'A badge awarded for survive-and-advance Tuesday nights.' },
  { id: 'freshness_hunter',  cat: 'highoctane', emoji: '🏹', name: 'The Freshness Hunter', flavor: "If it's been in the can for more than 14 days, you consider it ancient history." },
  { id: 'robs_disciple',     cat: 'legacy',     emoji: '📜', name: "Rob's Disciple",       flavor: 'Your palate is beautifully aligned with the sacred texts.' },
  { id: 'ghost_hunter',      cat: 'legacy',     emoji: '👻', name: 'The Ghost Hunter',     flavor: 'You resurrected a legend from the Time Capsule.' },
]

const CATEGORIES = [
  { id: 'all',        label: 'All' },
  { id: 'style',      label: 'Style' },
  { id: 'shame',      label: 'Shame' },
  { id: 'palate',     label: 'Palate' },
  { id: 'highoctane', label: 'High Octane' },
  { id: 'legacy',     label: "Rob's Legacy" },
]

// ── Helpers ───────────────────────────────────────────────────

function bk(name, brewery) {
  return `${(name ?? '').toLowerCase()}||${(brewery ?? '').toLowerCase()}`
}

function pickWinner(candidates, formatStat) {
  const valid = candidates.filter(c => c.value != null && !isNaN(c.value))
  if (!valid.length) return { type: 'no_data' }
  const max = Math.max(...valid.map(c => c.value))
  if (max <= 0) return { type: 'no_data' }
  const winners = valid.filter(c => c.value === max)
  return { type: winners.length > 1 ? 'tie' : 'winner', userIds: winners.map(w => w.userId), value: max, stat: formatStat(max) }
}

// ── Compute all 16 awards from flat row array ─────────────────

function computeAllAwards(yearRatings, profilesMap, robExcellentSet, robUserId) {
  const noData = AWARD_DEFS.map(d => ({ ...d, result: { type: 'no_data', names: [] } }))
  if (!yearRatings.length) return noData

  // Pre-computation pass
  const byUser = new Map()
  const byBeer = new Map()

  for (const r of yearRatings) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, [])
    byUser.get(r.user_id).push(r)

    if (!byBeer.has(r.beerKey)) byBeer.set(r.beerKey, { scores: [] })
    if (r.score != null) byBeer.get(r.beerKey).scores.push(r.score)
  }

  // Group average per beer (only beers with 2+ raters)
  const groupAvg = new Map()
  for (const [k, { scores }] of byBeer) {
    if (scores.length >= 2) groupAvg.set(k, scores.reduce((a, b) => a + b, 0) / scores.length)
  }

  const userIds = [...byUser.keys()]
  const u = uid => byUser.get(uid)

  // 1 · Sour Puss
  const sourResult = pickWinner(
    userIds.map(uid => ({ userId: uid, value: u(uid).filter(r => r.style_category === 'sour_wild').length })),
    n => `${n} sour${n !== 1 ? 's' : ''} logged`
  )

  // 2 · Imperial Outlook
  const imperialResult = pickWinner(
    userIds.map(uid => ({
      userId: uid,
      value: u(uid).filter(r =>
        r.style_category === 'imperial_stout' || r.style_category === 'dipa' ||
        (r.style ?? '').toLowerCase().includes('imperial')
      ).length,
    })),
    n => `${n} imperial${n !== 1 ? 's' : ''} logged`
  )

  // 3 · Lager Royalty
  const lagerResult = pickWinner(
    userIds.map(uid => ({
      userId: uid,
      value: u(uid).filter(r =>
        r.style_category === 'lager' || r.style_category === 'dunkel' || LAGER_RE.test(r.style ?? '')
      ).length,
    })),
    n => `${n} lager${n !== 1 ? 's' : ''} logged`
  )

  // 4 · Pastry Chef
  const pastryResult = pickWinner(
    userIds.map(uid => ({
      userId: uid,
      value: u(uid).filter(r =>
        PASTRY_RE.test(r.style ?? '') ||
        (r.adjuncts ?? []).some(a => PASTRY_ADJ.has((a ?? '').toLowerCase()))
      ).length,
    })),
    n => `${n} pastry beer${n !== 1 ? 's' : ''} logged`
  )

  // 5 · Appalling Taste
  const macroResult = pickWinner(
    userIds.map(uid => ({
      userId: uid,
      value: u(uid).filter(r =>
        MACRO_BREWERIES.some(m => (r.brewery ?? '').toLowerCase().trim().includes(m))
      ).length,
    })),
    n => `${n} macro check-in${n !== 1 ? 's' : ''}`
  )

  // 6 · Hype Victim (group avg >= 3.5, personal < 3.5)
  const hypeResult = pickWinner(
    userIds.map(uid => ({
      userId: uid,
      value: u(uid).filter(r => {
        const ga = groupAvg.get(r.beerKey)
        return ga != null && ga >= 3.5 && (r.score ?? 5) < 3.5
      }).length,
    })),
    n => `${n} overhyped beer${n !== 1 ? 's' : ''}`
  )

  // 7 · Diacetyl Disciple
  const diacetylResult = pickWinner(
    userIds.map(uid => ({
      userId: uid,
      value: u(uid).filter(r => r.style_category === 'bitter' && (r.score ?? 5) < 4).length,
    })),
    n => `${n} poorly-rated bitter${n !== 1 ? 's' : ''}`
  )

  // 8 · Defiant Palate (avg delta above group)
  const defiantResult = (() => {
    const cands = userIds.map(uid => {
      const q = u(uid).filter(r => groupAvg.has(r.beerKey) && r.score != null)
      if (q.length < 5) return null
      const avg = q.reduce((s, r) => s + (r.score - groupAvg.get(r.beerKey)), 0) / q.length
      return { userId: uid, value: Math.round(avg * 100) / 100 }
    }).filter(Boolean)
    return pickWinner(cands, n => `+${n.toFixed(2)} avg above group`)
  })()

  // 9 · Iconoclast (avg delta below group — negate then pick max)
  const iconoclastResult = (() => {
    const cands = userIds.map(uid => {
      const q = u(uid).filter(r => groupAvg.has(r.beerKey) && r.score != null)
      if (q.length < 5) return null
      const avg = q.reduce((s, r) => s + (r.score - groupAvg.get(r.beerKey)), 0) / q.length
      return { userId: uid, value: Math.round(-avg * 100) / 100 }
    }).filter(Boolean)
    const r = pickWinner(cands, n => `-${n.toFixed(2)} avg below group`)
    return r
  })()

  // 10 · Monogamous Drinker (lowest unique/total ratio, min 10 check-ins)
  const monoResult = (() => {
    const cands = userIds
      .filter(uid => u(uid).length >= 10)
      .map(uid => {
        const ratings = u(uid)
        const unique = new Set(ratings.map(r => r.beerKey)).size
        return { userId: uid, value: unique / ratings.length, unique, total: ratings.length }
      })
    if (!cands.length) return { type: 'no_data' }
    const min = Math.min(...cands.map(c => c.value))
    const winners = cands.filter(c => c.value === min)
    const w = winners[0]
    return {
      type: winners.length > 1 ? 'tie' : 'winner',
      userIds: winners.map(c => c.userId),
      value: min,
      stat: `${w.unique} unique / ${w.total} total (${Math.round(min * 100)}%)`,
    }
  })()

  // 11 · The Nomad
  const nomadResult = pickWinner(
    userIds.map(uid => ({
      userId: uid,
      value: new Set(u(uid).map(r => (r.brewery ?? '').toLowerCase().trim()).filter(Boolean)).size,
    })),
    n => `${n} unique breweries`
  )

  // 12 · Iron Liver (avg ABV > 0, min 5 ratings)
  const liverResult = (() => {
    const cands = userIds.map(uid => {
      const valid = u(uid).filter(r => r.abv > 0)
      if (valid.length < 5) return null
      const avg = valid.reduce((s, r) => s + r.abv, 0) / valid.length
      return { userId: uid, value: Math.round(avg * 10) / 10 }
    }).filter(Boolean)
    return pickWinner(cands, n => `${n}% avg ABV`)
  })()

  // 13 · Sundown Savior (ABV > 9%, after 10pm, Mon–Thu, exclude Rob's 2024-12-31 archive rows)
  const sundownResult = pickWinner(
    userIds.map(uid => ({
      userId: uid,
      value: u(uid).filter(r => {
        if ((r.drank_at ?? '').startsWith('2024-12-31')) return false
        if ((r.abv ?? 0) <= 9) return false
        const d = new Date(r.drank_at)
        return d.getHours() >= 22 && d.getDay() >= 1 && d.getDay() <= 4
      }).length,
    })),
    n => `${n} late-night heavy hitter${n !== 1 ? 's' : ''}`
  )

  // 14 · Freshness Hunter
  const freshnessResult = pickWinner(
    userIds.map(uid => ({
      userId: uid,
      value: u(uid).filter(r => FRESHNESS_RE.test(r.note ?? '')).length,
    })),
    n => `${n} freshness note${n !== 1 ? 's' : ''}`
  )

  // 15 · Rob's Disciple
  const discipleResult = robExcellentSet.size > 0
    ? pickWinner(
        userIds.filter(uid => uid !== robUserId).map(uid => ({
          userId: uid,
          value: u(uid).filter(r => robExcellentSet.has(r.beerKey)).length,
        })),
        n => `${n} of Rob's classics revisited`
      )
    : { type: 'no_data' }

  // 16 · Ghost Hunter (first non-Rob to log each Rob-Excellent beer this year)
  const ghostResult = (() => {
    if (!robExcellentSet.size) return { type: 'no_data' }
    const firstBy = new Map()
    const eligible = yearRatings
      .filter(r => r.user_id !== robUserId && robExcellentSet.has(r.beerKey))
      .sort((a, b) => new Date(a.drank_at) - new Date(b.drank_at))
    for (const r of eligible) {
      if (!firstBy.has(r.beerKey)) firstBy.set(r.beerKey, r.user_id)
    }
    const counts = new Map()
    for (const uid of firstBy.values()) counts.set(uid, (counts.get(uid) ?? 0) + 1)
    return pickWinner(
      [...counts.entries()].map(([userId, value]) => ({ userId, value })),
      n => `${n} ghost beer${n !== 1 ? 's' : ''} discovered`
    )
  })()

  const resultMap = {
    sour_puss: sourResult, imperial_outlook: imperialResult, lager_royalty: lagerResult,
    pastry_chef: pastryResult, appalling_taste: macroResult, hype_victim: hypeResult,
    diacetyl_disciple: diacetylResult, defiant_palate: defiantResult, iconoclast: iconoclastResult,
    monogamous: monoResult, nomad: nomadResult, iron_liver: liverResult,
    sundown_savior: sundownResult, freshness_hunter: freshnessResult,
    robs_disciple: discipleResult, ghost_hunter: ghostResult,
  }

  return AWARD_DEFS.map(def => ({
    ...def,
    result: {
      ...resultMap[def.id],
      names: (resultMap[def.id].userIds ?? []).map(uid => profilesMap.get(uid) ?? 'Unknown'),
    },
  }))
}

// ── Award Card ────────────────────────────────────────────────

function AwardCard({ emoji, name, flavor, result }) {
  const { type, names = [], stat } = result
  return (
    <div className="card" style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{emoji}</span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: 700, color: 'var(--white)' }}>
          {name}
        </span>
      </div>

      {type === 'no_data' ? (
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: 0 }}>No qualifiers this year</p>
      ) : (
        <>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.15rem',
            color: type === 'tie' ? 'var(--gold)' : 'var(--amber)',
          }}>
            {type === 'tie'
              ? `Tied: ${names.slice(0, 2).join(' & ')}${names.length > 2 ? ` & ${names.length - 2} more` : ''}`
              : names[0]}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{stat}</div>
          <div style={{
            borderTop: '1px solid var(--fog)', paddingTop: 8,
            fontSize: '0.76rem', color: 'var(--muted)', fontStyle: 'italic',
          }}>
            "{flavor}"
          </div>
        </>
      )}
    </div>
  )
}

// ── Main tab component ────────────────────────────────────────

export default function AwardsTab() {
  const currentYear = new Date().getFullYear()
  const [year, setYear]               = useState(currentYear)
  const [catFilter, setCatFilter]     = useState('all')
  const [yearRatings, setYearRatings] = useState([])
  const [profilesMap, setProfilesMap] = useState(new Map())
  const [robExcellentSet, setRobExcellentSet] = useState(new Set())
  const [robUserId, setRobUserId]     = useState(null)
  const [loadingRatings, setLoading]  = useState(false)

  // Profiles — once
  useEffect(() => {
    supabase.from('profiles').select('id, display_name').then(({ data }) => {
      if (!data?.length) return
      setProfilesMap(new Map(data.map(p => [p.id, p.display_name])))
      const rob = data.find(p => /^rob(\s|$)/i.test(p.display_name.trim()))
      if (rob) setRobUserId(rob.id)
    })
  }, [])

  // Rob's archive — once robUserId resolves
  useEffect(() => {
    if (!robUserId) return
    async function load() {
      const PAGE = 1000
      let all = [], from = 0
      while (true) {
        const { data } = await supabase
          .from('ratings')
          .select('score, beers(name, brewery)')
          .eq('user_id', robUserId)
          .lt('drank_at', '2025-01-01')
          .range(from, from + PAGE - 1)
        if (!data?.length) break
        all = all.concat(data)
        if (data.length < PAGE) break
        from += PAGE
      }
      setRobExcellentSet(new Set(
        all.filter(r => (r.score ?? 0) >= 7 && r.beers?.name).map(r => bk(r.beers.name, r.beers.brewery))
      ))
    }
    load()
  }, [robUserId])

  // Year ratings — refetch on year change
  useEffect(() => {
    async function load() {
      setLoading(true)
      setYearRatings([])
      const PAGE = 1000
      let all = [], from = 0
      while (true) {
        const { data } = await supabase
          .from('ratings')
          .select('user_id, score, drank_at, note, adjuncts, beers(name, brewery, style, style_category, abv, ibu)')
          .gte('drank_at', `${year}-01-01`)
          .lt('drank_at', `${year + 1}-01-01`)
          .range(from, from + PAGE - 1)
        if (!data?.length) break
        all = all.concat(data)
        if (data.length < PAGE) break
        from += PAGE
      }
      setYearRatings(all.map(r => ({
        user_id:        r.user_id,
        score:          r.score,
        drank_at:       r.drank_at,
        note:           r.note ?? '',
        adjuncts:       r.adjuncts ?? [],
        brewery:        r.beers?.brewery ?? null,
        style:          r.beers?.style ?? null,
        style_category: r.beers?.style_category ?? null,
        abv:            r.beers?.abv ?? null,
        beerKey:        bk(r.beers?.name, r.beers?.brewery),
      })))
      setLoading(false)
    }
    load()
  }, [year])

  const awards = useMemo(
    () => computeAllAwards(yearRatings, profilesMap, robExcellentSet, robUserId),
    [yearRatings, profilesMap, robExcellentSet, robUserId]
  )

  const filtered = catFilter === 'all' ? awards : awards.filter(a => a.cat === catFilter)

  return (
    <div>
      <div className="pill-group" style={{ marginBottom: 12 }}>
        {[2025, 2026].map(y => (
          <button key={y} className={`pill ${year === y ? 'selected' : ''}`} onClick={() => setYear(y)}>
            {y}
          </button>
        ))}
      </div>

      <div className="pill-group" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
        {CATEGORIES.map(c => (
          <button key={c.id} className={`pill ${catFilter === c.id ? 'selected' : ''}`} onClick={() => setCatFilter(c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      {loadingRatings && <div className="loading-bar" style={{ marginBottom: 16 }} />}

      {!loadingRatings && yearRatings.length === 0 && (
        <div className="empty-state"><p>No check-ins in {year} yet.</p></div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 14,
        paddingBottom: 40,
      }}>
        {filtered.map(award => (
          <AwardCard key={award.id} {...award} />
        ))}
      </div>
    </div>
  )
}
