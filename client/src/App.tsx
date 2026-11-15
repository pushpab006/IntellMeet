
import type { ReactNode } from 'react'
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation
} from 'react-router-dom'

import Dashboard from './Dashboard'
import Login from './Login'
import GuestMeeting from './GuestMeeting'
import GuestRoom from './GuestRoom'

function ProtectedGuestRoute({ children }: { children: ReactNode }) {
  const location = useLocation()
  const isLoggedIn = Boolean(localStorage.getItem('intellmeetToken'))

  if (!isLoggedIn) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    )
  }

  return <>{children}</>
}

function AppRoutes() {
  const location = useLocation()
  const isLoggedIn = Boolean(localStorage.getItem('intellmeetToken'))

  return (
    <Routes location={location}>
      <Route
        path="/guest-meeting/:meetingId"
        element={
          <ProtectedGuestRoute>
            <GuestMeeting />
          </ProtectedGuestRoute>
        }
      />

      <Route
        path="/guest-room/:meetingId"
        element={
          <ProtectedGuestRoute>
            <GuestRoom />
          </ProtectedGuestRoute>
        }
      />

      <Route
        path="/"
        element={
          isLoggedIn ? <Dashboard /> : <Navigate to="/login" replace />
        }
      />

      <Route
        path="/login"
        element={
          isLoggedIn ? <Navigate to="/" replace /> : <Login />
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
