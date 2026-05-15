export const BEER_COLOURS = [
  { value: 'straw',      label: 'Straw',      hex: '#f5e6a3' },
  { value: 'gold',       label: 'Gold',       hex: '#f0c040' },
  { value: 'amber',      label: 'Amber',      hex: '#e08020' },
  { value: 'copper',     label: 'Copper',     hex: '#b85c20' },
  { value: 'ruby',       label: 'Ruby',       hex: '#8b1a2a' },
  { value: 'brown',      label: 'Brown',      hex: '#5c2e10' },
  { value: 'dark_brown', label: 'Dark Brown', hex: '#2e1608' },
  { value: 'black',      label: 'Black',      hex: '#0d0805' },
]

export const STYLE_CATEGORIES = [
  { value: 'pale_ale',       label: 'Pale Ale' },
  { value: 'ipa',            label: 'IPA' },
  { value: 'neipa',          label: 'NEIPA' },
  { value: 'hazy_ipa',       label: 'Hazy (Hewzi) IPA' },
  { value: 'dipa',           label: 'DIPA' },
  { value: 'west_coast_ipa', label: 'West Coast IPA' },
  { value: 'session_ipa',    label: 'Session IPA' },
  { value: 'milkshake_ipa',  label: 'Milkshake IPA' },
  { value: 'lager',          label: 'Lager' },
  { value: 'dunkel',         label: 'Dunkel' },
  { value: 'saison',         label: 'Saison' },
  { value: 'stout_porter',   label: 'Stout / Porter' },
  { value: 'imperial_stout', label: 'Imperial Stout' },
  { value: 'sour_wild',      label: 'Sour / Wild' },
  { value: 'wheat',          label: 'Wheat / Hefeweizen' },
  { value: 'belgian',        label: 'Belgian' },
  { value: 'amber_red',      label: 'Amber / Red' },
  { value: 'barleywine',     label: 'Barleywine' },
  { value: 'bitter',         label: 'Bitter' },
  { value: 'mild',           label: 'Mild' },
  { value: 'cider',          label: 'Cider' },
  { value: 'speciality',     label: 'Speciality' },
  { value: 'other',          label: 'Other' },
]

// Which flavour dimensions apply to which style categories
export const FLAVOUR_DIMENSIONS = {
  acidity: {
    label: 'Acidity',
    labels: ['Gentle', 'Tart', 'Puckering', 'Face-inside-out'],
    styles: ['sour_wild', 'belgian', 'wheat', 'speciality'],
  },
  bitterness: {
    label: 'Bitterness',
    labels: ['None', 'Soft', 'Balanced', 'Bitter', 'Aggressive'],
    styles: ['pale_ale', 'ipa', 'stout_porter', 'imperial_stout', 'amber_red', 'barleywine', 'lager'],
  },
  sweetness: {
    label: 'Sweetness',
    labels: ['Bone dry', 'Off-dry', 'Medium', 'Sweet', 'Pudding'],
    styles: ['all'],
  },
  body: {
    label: 'Body',
    labels: ['Watery', 'Light', 'Medium', 'Full', 'Chewy'],
    styles: ['all'],
  },
  funk: {
    label: 'Funk',
    labels: ['Clean', 'Earthy', 'Barnyard', 'Full funk'],
    styles: ['sour_wild', 'belgian', 'speciality'],
  },
  smoke: {
    label: 'Smoke',
    labels: ['None', 'Hint', 'Present', 'Campfire'],
    styles: ['stout_porter', 'imperial_stout', 'speciality', 'other'],
  },
  alcohol_warmth: {
    label: 'Warmth',
    labels: ['Hidden', 'Gentle', 'Present', 'Hot', 'Paint stripper'],
    styles: ['imperial_stout', 'barleywine', 'belgian', 'speciality'],
  },
  roast: {
    label: 'Roast',
    labels: ['None', 'Cocoa', 'Dark choc', 'Espresso', 'Burnt', 'Acrid'],
    styles: ['stout_porter', 'imperial_stout'],
  },
}

export function getDimensionsForStyle(styleCategory) {
  if (!styleCategory) return ['sweetness', 'body', 'bitterness']
  return Object.entries(FLAVOUR_DIMENSIONS)
    .filter(([, dim]) => dim.styles.includes('all') || dim.styles.includes(styleCategory))
    .map(([key]) => key)
}

export const ADJUNCTS = [
  'Vanilla', 'Coffee', 'Coconut', 'Chilli', 'Caramel',
  'Oats', 'Lactose', 'Bourbon barrel', 'Rum barrel', 'Wine barrel',
  'Maple', 'Peanut butter', 'Raspberry', 'Cherry',
  'Cinnamon', 'Orange peel', 'Honey', 'Ginger',
]

export const SERVING_SIZES = [
  { value: 'third',      label: '⅓ pint' },
  { value: 'half',       label: '½ pint' },
  { value: 'two_thirds', label: '⅔ pint' },
  { value: 'pint',       label: 'Pint' },
  { value: 'bottle',     label: 'Bottle' },
  { value: 'can',        label: 'Can' },
]

export const CLARITY_OPTIONS = ['clear', 'hazy', 'murky']
export const HEAD_OPTIONS    = ['none', 'thin', 'proper', 'ridiculous']
export const CARBONATION_OPTIONS = ['flat', 'gentle', 'lively', 'fizzy']

export function scoreClass(score) {
  if (score >= 7.5) return 'high'
  if (score >= 5)   return 'mid'
  return 'low'
}

export function colourHex(colourValue) {
  return BEER_COLOURS.find(c => c.value === colourValue)?.hex ?? '#e08020'
}

export function abvFlame(abv) {
  if (!abv) return ''
  if (abv >= 11) return '🔥🔥'
  if (abv >= 8)  return '🔥'
  return ''
}

export function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7)  return `${diffDays}d ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
