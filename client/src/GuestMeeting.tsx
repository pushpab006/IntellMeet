
import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useNavigate, useParams } from 'react-router-dom'
import { Video, UserPlus, CalendarDays } from 'lucide-react'

function GuestMeeting() {
  const { meetingId } = useParams()
  const navigate = useNavigate()
  console.log('Guest Meeting ID:', meetingId)

  const socketRef = useRef<Socket | null>(null)

  const [joined, setJoined] = useState(false)
  const [participantName, setParticipantName] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('Not connected')

  // Connect guest to meeting
  const handleJoin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!participantName.trim() || !meetingId) {
      alert('Please enter your name.')
      return
    }

    if (socketRef.current?.connected) {
      return
    }

    setConnectionStatus('Connecting...')

    const socket = io('https://intellmeet-ca8e.onrender.com')
    socketRef.current = socket

   socket.emit('join-meeting', {
  meetingId,
  participantName: participantName.trim()
})

setConnectionStatus('Connected to meeting server')
setJoined(true)

navigate(`/guest-room/${meetingId}`, {
  state: { participantName: participantName.trim() }
})
    

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error)
      setConnectionStatus('Could not connect to meeting server')
      setJoined(false)
    })

    socket.on('participant-joined', (participant) => {
      console.log('New participant joined:', participant.participantName)
    })

    socket.on('participant-left', (participant) => {
      console.log('Participant left:', participant.socketId)
    })
  }

  // Disconnect guest when leaving the page
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.emit('leave-meeting')
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '20px',
      background: 'linear-gradient(135deg, #eef2ff, #dbeafe)'
    }}>
      <form
        onSubmit={handleJoin}
        style={{
          width: '100%',
          maxWidth: '520px',
          padding: '40px',
          borderRadius: '20px',
          background: 'linear-gradient(145deg, #172554, #0f172a)',
          border: '1px solid #3b82f6',
          boxShadow: '0 20px 50px rgba(30, 64, 175, 0.25)',
          color: '#ffffff',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <div style={{
            width: '65px',
            height: '65px',
            borderRadius: '18px',
            background: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px'
          }}>
            <Video size={34} color="#ffffff" />
          </div>

          <h1 style={{
            color: '#ffffff',
            fontSize: '32px',
            margin: '0 0 12px'
          }}>
           GUEST PAGE TEST
          </h1>

          <p style={{
            color: '#cbd5e1',
            fontSize: '16px',
            margin: 0
          }}>
            Enter your name to join as a guest.
          </p>
        </div>

        <label
          htmlFor="participantName"
          style={{
            display: 'block',
            color: '#ffffff',
            fontWeight: 600,
            marginBottom: '10px'
          }}
        >
          Your name
        </label>

        <input
          id="participantName"
          type="text"
          value={participantName}
          onChange={(event) => setParticipantName(event.target.value)}
          placeholder="Enter your name"
          required
          disabled={joined}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '16px',
            marginBottom: '20px',
            border: '1px solid #475569',
            borderRadius: '12px',
            background: '#0b1428',
            color: '#ffffff',
            fontSize: '16px'
          }}
        />

        {joined && (
          <div style={{
            marginBottom: '20px',
            padding: '12px',
            borderRadius: '10px',
            background: '#1e3a8a',
            color: '#bfdbfe',
            textAlign: 'center'
          }}>
            {connectionStatus}
          </div>
        )}

        {!joined && connectionStatus !== 'Not connected' && (
          <p style={{
            color: '#fca5a5',
            textAlign: 'center'
          }}>
            {connectionStatus}
          </p>
        )}

        <button
          type="submit"
          disabled={joined}
          style={{
            width: '100%',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            background: joined ? '#475569' : 'linear-gradient(90deg, #3b82f6, #2563eb)',
            color: '#ffffff',
            border: '1px solid #60a5fa',
            borderRadius: '12px',
            fontSize: '17px',
            fontWeight: 600,
            cursor: joined ? 'not-allowed' : 'pointer'
          }}
        >
          <UserPlus size={22} />
          {joined ? 'Joined' : 'Join Meeting'}
        </button>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          marginTop: '30px',
          color: '#cbd5e1',
          fontSize: '15px'
        }}>
          <CalendarDays size={19} />
          Meeting ID:
          <strong style={{ color: '#60a5fa' }}>
            {meetingId}
          </strong>
        </div>
      </form>
    </div>
  )
}

export default GuestMeeting
