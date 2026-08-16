import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Icon } from './ui'
import { useApp } from '../store/AppStore'

// PRD §0.5: top navigation — Home / Tasks / Notes / Bank / Errors / Profile
const links = [
  { to: '/', label: 'Home' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/notes', label: 'Notes' },
  { to: '/bank', label: 'Bank' },
  { to: '/errors', label: 'Errors' },
  { to: '/profile', label: 'Profile' },
]

export default function TopNav() {
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()
  const { showToast, student } = useApp()

  const name = student?.name ?? 'Student'
  const initial = (name[0] ?? 'S').toUpperCase()

  return (
    <header className="bg-pure-surface border-b border-whisper-line sticky top-0 z-40">
      <div className="flex items-center justify-between h-14 px-4 lg:px-8 max-w-max-width mx-auto w-full">
        {/* Logo */}
        <NavLink to="/" className="font-semibold text-lg tracking-tight text-deep-teal shrink-0">
          NOME<span className="text-deep-ink">.AI</span>
        </NavLink>

        {/* Center navigation */}
        <nav className="hidden md:flex items-center gap-1 h-full">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                `relative px-3 py-1.5 text-sm font-medium transition-colors rounded-comp ${
                  isActive ? 'text-deep-teal' : 'text-warm-stone hover:text-deep-ink'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {l.label}
                  {isActive && (
                    <span className="absolute left-3 right-3 -bottom-[9px] h-0.5 bg-deep-teal rounded-full" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <button
            className="p-2 rounded-comp text-warm-stone hover:text-deep-ink hover:bg-teal-tint transition-colors"
            onClick={() => showToast('No new notifications', 'info')}
            title="Notifications"
          >
            <Icon name="notifications" size={20} />
          </button>
          <button
            className="p-2 rounded-comp text-warm-stone hover:text-deep-ink hover:bg-teal-tint transition-colors"
            onClick={() => navigate('/profile?settings=1')}
            title="Settings"
          >
            <Icon name="settings" size={20} />
          </button>
          <button
            className="w-8 h-8 rounded-full bg-deep-teal text-white text-sm font-medium flex items-center justify-center"
            onClick={() => navigate('/profile')}
            title={name}
          >
            {initial}
          </button>
          {/* Mobile menu button */}
          <button className="md:hidden p-2 text-warm-stone" onClick={() => setMenuOpen(!menuOpen)}>
            <Icon name={menuOpen ? 'close' : 'menu'} size={22} />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <nav className="md:hidden border-t border-whisper-line bg-pure-surface px-4 py-2 flex flex-col">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `py-2.5 text-sm font-medium ${isActive ? 'text-deep-teal' : 'text-warm-stone'}`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  )
}
