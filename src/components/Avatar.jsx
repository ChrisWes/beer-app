export default function Avatar({ profile, size = 36 }) {
  const initials = profile?.display_name
    ? profile.display_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={profile.display_name}
        className="avatar"
        style={{ width: size, height: size }}
      />
    )
  }

  // Generate a consistent colour from the name
  const colours = ['#5c2e0e', '#7a3b1e', '#8b4513', '#6b3a2a', '#4a2c17']
  const idx = (profile?.display_name?.charCodeAt(0) ?? 0) % colours.length

  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        background: colours[idx],
        fontSize: size * 0.38,
      }}
    >
      {initials}
    </div>
  )
}
