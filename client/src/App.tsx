import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './Dashboard'
import Login from './Login'
import GuestMeeting from './GuestMeeting'
import GuestRoom from './GuestRoom'

function App() {
  const isLoggedIn = Boolean(localStorage.getItem('intellmeetToken'))

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/guest-meeting/:meetingId"
          element={<GuestMeeting />}
        />

        <Route
          path="/guest-room/:meetingId"
          element={<GuestRoom />}
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
    </BrowserRouter>
  )
}

export default App