import { Routes, Route, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { AppProvider, useApp } from './store/AppStore'
import TopNav from './components/TopNav'
import { Toast } from './components/ui'
import Home from './pages/Home'
import Tasks from './pages/Tasks'
import Exercise from './pages/Exercise'
import Summary from './pages/Summary'
import Errors from './pages/Errors'
import ErrorRedo from './pages/ErrorRedo'
import Notes from './pages/Notes'
import Bank from './pages/Bank'
import Profile from './pages/Profile'

function Shell() {
  const { toast, bootStatus, bootError, retryBootstrap } = useApp()
  const location = useLocation()

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  // Exercise pages use a standalone full-screen layout (no TopNav, PRD §2.2)
  const bareLayout = location.pathname.startsWith('/exercise/') || location.pathname.startsWith('/bank/exercise/') || location.pathname.startsWith('/errors/review/')

  return (
    <div className="min-h-screen flex flex-col">
      {!bareLayout && <TopNav />}
      <main className="flex-1">
        {bootStatus === 'error' ? (
          <section className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
            <div className="zb-card max-w-md w-full text-center py-10">
              <h1 className="text-xl font-bold tracking-tight">We couldn&apos;t load your learning data</h1>
              <p role="alert" className="text-sm text-warm-stone mt-2">{bootError?.message || 'Please check your connection and try again.'}</p>
              <button className="zb-btn-primary mt-6" onClick={retryBootstrap}>Retry loading</button>
            </div>
          </section>
        ) : (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/exercise/:taskId" element={<Exercise />} />
            <Route path="/summary/:sessionId" element={<Summary />} />
            <Route path="/errors" element={<Errors />} />
            <Route path="/errors/review/:id" element={<ErrorRedo />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/notes/:id" element={<Notes />} />
            <Route path="/bank" element={<Bank />} />
            <Route path="/bank/exercise/:qId" element={<Exercise bankMode />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<Home />} />
          </Routes>
        )}
      </main>
      <Toast toast={toast} />
    </div>
  )
}

export default function App({ services }) {
  return (
    <AppProvider services={services}>
      <Shell />
    </AppProvider>
  )
}
