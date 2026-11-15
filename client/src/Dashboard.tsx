import { useEffect, useState, useRef, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import api from './api'
import { io, type Socket } from 'socket.io-client'
import './App.css'
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
} from 'lucide-react'

interface Meeting {
  _id: string
  title: string
  description: string
  date: string
  time: string
}

interface ChatMessage {
  id: string
  sender: string
  message: string
  time: string
}

const ICE_SERVERS = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302'
    }
  ]
}

function App() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('Overview')

  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null)
  const [participantName, setParticipantName] = useState('')
  const [micOn, setMicOn] = useState(true)
  const [remoteStreams, setRemoteStreams] = useState<
  { socketId: string; participantName: string; stream: MediaStream }[]
>([])
const [cameraOn, setCameraOn] = useState(true)
const videoRef = useRef<HTMLVideoElement | null>(null)
const streamRef = useRef<MediaStream | null>(null)
const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map())
const participantNamesRef = useRef<Map<string, string>>(new Map())
const socketRef = useRef<Socket | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
const [deleteMessage, setDeleteMessage] = useState('')

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])

  const [selectedProject, setSelectedProject] = useState('')
const [showProjectDetails, setShowProjectDetails] = useState(false)

const [teamMessages, setTeamMessages] = useState<any[]>([])
const [teamMessage, setTeamMessage] = useState('')
const [teamSocket, setTeamSocket] = useState<Socket | null>(null)

  const [selectedMeetingId, setSelectedMeetingId] = useState('')
const [transcript, setTranscript] = useState('')
const [aiSummary, setAiSummary] = useState('')
const [aiLoading, setAiLoading] = useState(false)

  const upcomingMeetings = meetings
  .filter((meeting) => {
    const meetingDateTime = new Date(
      `${meeting.date.slice(0, 10)}T${meeting.time || '00:00'}`
    )
    return meetingDateTime >= new Date()
  })
  .sort((a, b) => {
    const dateA = new Date(`${a.date.slice(0, 10)}T${a.time || '00:00'}`)
    const dateB = new Date(`${b.date.slice(0, 10)}T${b.time || '00:00'}`)
    return dateA.getTime() - dateB.getTime()
  })

  const user = JSON.parse(localStorage.getItem('intellmeetUser') || '{}')
  const initials = (user.fullName || 'User')
    .split(' ')
    .map((name: string) => name[0])
    .join('')
    .toUpperCase()

    


// Generate AI meeting summary
const generateAISummary = async () => {
  if (!selectedMeetingId) {
    alert('Please select a meeting.')
    return
  }

  if (!transcript.trim()) {
    alert('Please enter the meeting transcript.')
    return
  }

  try {
    setAiLoading(true)
    setAiSummary('')

    const token = localStorage.getItem('intellmeetToken')

    const response = await api.post(
      `/api/ai/summarize/${selectedMeetingId}`,
      { transcript },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    setAiSummary(response.data.summary)
  } catch (error: any) {
    console.error('AI summary error:', error)
    alert(
      error.response?.data?.message ||
      'Unable to generate AI summary.'
    )
  } finally {
    setAiLoading(false)
  }
}


// Send Team Chat message
const sendTeamMessage = () => {
  if (!teamMessage.trim()) return

  if (!teamSocket?.connected) {
    alert('Team Chat is not connected. Please try again.')
    return
  }

  teamSocket.emit('team-chat-message', {
    message: teamMessage
  })

  setTeamMessage('')
}



// Copy AI summary
const copyAISummary = async () => {
  try {
    await navigator.clipboard.writeText(aiSummary)
    alert('AI summary copied successfully!')
  } catch (error) {
    alert('Unable to copy summary.')
  }
}

// Download AI summary
const downloadAISummary = () => {
  const blob = new Blob([aiSummary], {
    type: 'text/plain;charset=utf-8'
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = 'IntellMeet-AI-Summary.txt'
  link.click()

  URL.revokeObjectURL(url)
}


// Load meetings from MongoDB
const fetchMeetings = async () => {
  const token = localStorage.getItem('intellmeetToken')

  if (!token) {
    window.location.href = '/login'
    return
  }

  try {
    setLoading(true)
    setError('')

    const response = await api.get('/api/meetings', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    setMeetings(response.data.meetings || [])
  } catch (err: any) {
    setError(err.response?.data?.message || 'Unable to load meetings.')
  } finally {
    setLoading(false)
  }
}

useEffect(() => {
  if (
    activeTab === 'My Meetings' ||
    activeTab === 'AI Summaries' ||
    activeTab === 'Analytics'
  ) {
    fetchMeetings()
  }
}, [activeTab])


// Connect to workspace Team Chat
useEffect(() => {
  if (activeTab !== 'Team Chat') return

  const socket = io('http://localhost:5000')

  setTeamSocket(socket)

  socket.on('connect', () => {
    socket.emit('join-team-chat', {
      participantName: user.fullName || 'Team Member'
    })

    console.log('Connected to Team Chat')
  })

  socket.on('team-chat-message', (newMessage) => {
    setTeamMessages((previousMessages) => [
      ...previousMessages,
      newMessage
    ])
  })

  return () => {
    socket.off('team-chat-message')
    socket.disconnect()
    setTeamSocket(null)
  }
}, [activeTab, user.fullName])



  
// Create or update a meeting
const handleCreateMeeting = async (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault()

  const token = localStorage.getItem('intellmeetToken')

  if (!token) {
    window.location.href = '/login'
    return
  }

  try {
    setSaving(true)
    setError('')
    setMessage('')

    if (editingId) {
      await api.put(
        `/api/meetings/${editingId}`,
        { title, description, date, time },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      setMessage('Meeting updated successfully!')
      setEditingId(null)
    } else {
      await api.post(
        '/api/meetings',
        { title, description, date, time },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      setMessage('Meeting created successfully!')
    }

    setTitle('')
    setDescription('')
    setDate('')
    setTime('')

    await fetchMeetings()

  } catch (err: any) {
    console.error('Meeting save error:', err)
    setError(err.response?.data?.message || err.message || 'Unable to save meeting.')
  } finally {
    setSaving(false)
  }
}

  // Edit meeting
const handleEditMeeting = (meeting: Meeting) => {
  setEditingId(meeting._id)
  setTitle(meeting.title)
  setDescription(meeting.description)
  setDate(meeting.date.slice(0, 10))
  setTime(meeting.time)
  setMessage('')
  setError('')
  setDeleteMessage('')
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// Delete meeting
const handleDeleteMeeting = async (id: string) => {
  const confirmed = window.confirm(
    'Are you sure you want to delete this meeting?'
  )

  if (!confirmed) return

  try {
    const token = localStorage.getItem('intellmeetToken')

    await api.delete(`/api/meetings/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    setDeleteMessage('Meeting deleted successfully!')
    setMessage('')
    await fetchMeetings()
  } catch (err: any) {
    setError(err.response?.data?.message || 'Unable to delete meeting.')
  }
}

const handleJoinMeeting = (meeting: Meeting) => {
  navigate(`/guest-room/${meeting._id}`, {
    state: {
      participantName: user.fullName || 'Host'
    }
  })
}

const createPeer = (remoteId: string) => {
  const existingPeer = peersRef.current.get(remoteId)
  if (existingPeer) return existingPeer

  const peer = new RTCPeerConnection(ICE_SERVERS)
  const stream = streamRef.current

  if (stream) {
    stream.getTracks().forEach((track) => {
      peer.addTrack(track, stream)
    })
  }

  peer.ontrack = (event) => {
    const remoteStream = event.streams[0]
    if (!remoteStream) return

    const participantName =
      participantNamesRef.current.get(remoteId) || 'Participant'

    setRemoteStreams((previous) => {
      const existing = previous.find(item => item.socketId === remoteId)

      if (existing) {
        return previous.map(item =>
          item.socketId === remoteId
            ? { ...item, stream: remoteStream }
            : item
        )
      }

      return [...previous, {
        socketId: remoteId,
        participantName,
        stream: remoteStream
      }]
    })
  }

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      socketRef.current?.emit('webrtc-ice-candidate', {
        to: remoteId,
        candidate: event.candidate
      })
    }
  }

  peersRef.current.set(remoteId, peer)
  return peer
}

const sendOffer = async (remoteId: string) => {
  const peer = createPeer(remoteId)

  try {
    const offer = await peer.createOffer()
    await peer.setLocalDescription(offer)

    socketRef.current?.emit('webrtc-offer', {
      to: remoteId,
      offer
    })
  } catch (error) {
    console.error('Error sending WebRTC offer:', error)
  }
}

const startCamera = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    })

    streamRef.current = stream

    if (videoRef.current) {
      videoRef.current.srcObject = stream
    }

    setCameraOn(true)
    setMicOn(true)
  } catch (error) {
    console.error('Camera or microphone error:', error)
    alert('Please allow camera and microphone permissions in your browser.')
  }
}

const toggleMicrophone = () => {
  const stream = streamRef.current

  if (!stream) {
    alert('Please turn on your camera and microphone first.')
    return
  }

  const newState = !micOn

  stream.getAudioTracks().forEach((track) => {
    track.enabled = newState
  })

  setMicOn(newState)
}

const toggleCamera = () => {
  const stream = streamRef.current

  if (!stream) {
    alert('Please turn on your camera first.')
    return
  }

  const newState = !cameraOn

  stream.getVideoTracks().forEach((track) => {
    track.enabled = newState
  })

  setCameraOn(newState)
}

return (
    <div className="app">
      <aside className="sidebar">
        <h2 className="logo">✦ IntellMeet</h2>

        <p className="menu-label">WORKSPACE</p>

        <nav className="sidebar-nav">
  {['Overview', 'My Meetings', 'AI Summaries', 'Team Chat', 'Projects', 'Analytics'].map((item) => (
    <button
      key={item}
      className={`nav-item ${activeTab === item ? 'active' : ''}`}
      onClick={() => setActiveTab(item)}
    >
      {item}
    </button>
  ))}
</nav>

        <div className="profile">
          <div className="avatar">{initials}</div>
          <div>
            <strong>{user.fullName || 'User'}</strong>
            <p>{user.email || 'Team Member'}</p>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <span>Workspace / {activeTab}</span>

          <div className="top-actions">
            <button className="icon-button" aria-label="Notifications">♧</button>

            <button
              className="text-button"
              onClick={() => {
                localStorage.removeItem('intellmeetToken')
                localStorage.removeItem('intellmeetUser')
                window.location.href = '/login'
              }}
            >
              Logout
            </button>

            <div className="avatar">{initials}</div>
          </div>
        </header>

        {activeTab === 'Overview' && (
          <>
            <section className="welcome">
              <div>
                <p className="eyebrow">YOUR COLLABORATION HUB</p>
                <h1>Meet smarter. <span>Work better.</span></h1>
                <p className="subtitle">
                  Bring your team together. Let AI handle the meeting notes.
                </p>
              </div>

              <button
                className="primary-button"
                onClick={() => setActiveTab('My Meetings')}
              >
                + New Meeting
              </button>
            </section>

            <section className="stats">
              <article className="stat-card">
                <span>Meetings this week</span>
                <h2>{upcomingMeetings.length}</h2>
                <p>Your saved meetings</p>
              </article>

              <article className="stat-card">
                <span>AI summaries</span>
                <h2>08</h2>
                <p>Ready to review</p>
              </article>

              <article className="stat-card">
                <span>Pending actions</span>
                <h2>05</h2>
                <p>Across your projects</p>
              </article>
            </section>

            <section className="content-grid">
              <article className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Upcoming meetings</h2>
                    <p>Your saved conversations</p>
                  </div>

                  <button
                    className="text-button"
                    onClick={() => setActiveTab('My Meetings')}
                  >
                    View all →
                  </button>
                </div>

                {upcomingMeetings.length === 0 ? (
                  <p>No meetings created yet. Create your first meeting!</p>
                ) : (
                  upcomingMeetings.slice(0, 3).map((meeting) => (
                    <div className="meeting" key={meeting._id}>
                      <div className="meeting-date">
                        <strong>
                          {new Date(meeting.date).getDate()}
                        </strong>
                        <span>
                          {new Date(meeting.date).toLocaleString('en', {
                            month: 'short'
                          }).toUpperCase()}
                        </span>
                      </div>

                      <div className="meeting-info">
                        <h3>{meeting.title}</h3>
                        <p>{meeting.time}</p>
                      </div>

                      <span className="meeting-tag">Meeting</span>
                    </div>
                  ))
                )}
              </article>

              <article className="panel ai-panel">
                <div className="ai-icon">✧</div>
                <p className="eyebrow">POWERED BY AI</p>
                <h2>Your meetings, understood.</h2>
                <p className="ai-description">
                  Turn long conversations into clear summaries, decisions, and action items.
                </p>
                <div className="ai-feature">✓ Smart meeting summaries</div>
                <div className="ai-feature">✓ Automatic action items</div>
                <div className="ai-feature">✓ Key decisions highlighted</div>

                <button
                  className="secondary-button"
                  onClick={() => setActiveTab('AI Summaries')}
                >
                  Explore AI summaries →
                </button>
              </article>
            </section>
          </>
        )}

        {activeTab === 'My Meetings' && (
          <section style={{ padding: '25px 0' }}>
            <div className="welcome">
              <div>
                <p className="eyebrow">YOUR WORKSPACE</p>
                <h1>My Meetings</h1>
                <p className="subtitle">
                  Create and manage your meetings.
                </p>
              </div>
            </div>

            <article className="panel" style={{ marginBottom: '25px' }}>
              <h2>Create a New Meeting</h2>
              <p>Enter the details below to schedule a meeting.</p>

              <form onSubmit={handleCreateMeeting}>
                <div style={{ marginTop: '20px' }}>
                  <label>Meeting Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter meeting title"
                    required
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginTop: '15px' }}>
                  <label>Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Enter meeting description"
                    rows={3}
                    style={inputStyle}
                  />
                </div>

                <div style={{
                  display: 'flex',
                  gap: '15px',
                  flexWrap: 'wrap',
                  marginTop: '15px'
                }}>
                  <div style={{ flex: '1', minWidth: '180px' }}>
                    <label>Date</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      min={new Date().toLocaleDateString('en-CA')}
                      required
                      style={inputStyle}
                    />
                  </div>

                  <div style={{ flex: '1', minWidth: '180px' }}>
                    <label>Time</label>
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      required
                      style={inputStyle}
                    />
                  </div>
                </div>

                {error && (
                  <p style={{ color: 'red', marginTop: '15px' }}>
                    {error}
                  </p>
                )}

                {message && (
                  <p style={{ color: 'green', marginTop: '15px' }}>
                    {message}
                  </p>
                )}

                {deleteMessage && (
  <p style={{ color: 'green', marginTop: '15px' }}>
    {deleteMessage}
  </p>
)}

                <button
                  type="submit"
                  className="primary-button"
                  disabled={saving}
                  style={{ marginTop: '20px' }}
                >
                  {saving
  ? 'Saving...'
  : editingId
    ? 'Update Meeting'
    : '+ Create Meeting'}
                </button>
              </form>
            </article>

            <article className="panel">
              <div className="section-heading">
                <div>
                  <h2>Saved Meetings</h2>
                  <p>Your meetings stored in the database</p>
                </div>

                <button
                  className="text-button"
                  onClick={fetchMeetings}
                >
                  Refresh
                </button>
              </div>

              {loading ? (
                <p>Loading meetings...</p>
              ) : meetings.length === 0 ? (
                <p>No meetings yet. Create your first meeting above.</p>
              ) : (
                meetings.map((meeting) => (
                  <div className="meeting" key={meeting._id}>
                    <div className="meeting-date">
                      <strong>
                        {new Date(meeting.date).getDate()}
                      </strong>
                      <span>
                        {new Date(meeting.date).toLocaleString('en', {
                          month: 'short'
                        }).toUpperCase()}
                      </span>
                    </div>

                    <div className="meeting-info">
                      <h3>{meeting.title}</h3>
                      <p>
                        {meeting.description || 'No description'} · {meeting.time}
                      </p>
                    </div>

                  <div className="meeting-actions">
  <button
  className="primary-button"
  onClick={() => handleJoinMeeting(meeting)}
>
  Join Meeting
</button>

<button
  className="secondary-button"
  onClick={() => {
    const guestLink = `${window.location.origin}/guest-room/${meeting._id}`
    navigator.clipboard.writeText(guestLink)
      .then(() => alert('Guest link copied!'))
      .catch(() => alert('Could not copy guest link.'))
  }}
>
  Copy Guest Link
</button>

  <button
    className="secondary-button"
    onClick={() => handleEditMeeting(meeting)}
  >
    Edit
  </button>

  <button
    className="text-button"
    onClick={() => handleDeleteMeeting(meeting._id)}
    style={{ color: 'red' }}
  >
    Delete
  </button>
</div>
                  </div>
                ))
              )}
            </article>
          </section>
        )}

        {activeTab === 'Meeting Room' && selectedMeeting && (
  <section style={{ padding: '30px 0' }}>
    <h1>Meeting Room</h1>

    <div className="meeting-card" style={{ marginTop: '20px' }}>
      <h2>{selectedMeeting.title}</h2>
      <p>{selectedMeeting.description}</p>
      <p>Date: {selectedMeeting.date.slice(0, 10)}</p>
      <p>Time: {selectedMeeting.time}</p>

      <div style={{
  width: '100%',
  maxWidth: '700px',
  height: '400px',
  background: '#111827',
  borderRadius: '15px',
  overflow: 'hidden',
  marginTop: '20px'
}}>
  <video
    ref={videoRef}
    autoPlay
    playsInline
    muted
    style={{
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }}
  />
</div>

<button
  className="primary-button"
  onClick={startCamera}
  style={{ marginTop: '15px' }}
>
  Turn On Camera
</button>

      <div style={{ display: 'flex', gap: '12px', marginTop: '25px' }}>
        <button
  className="secondary-button"
  onClick={toggleMicrophone}
  title={micOn ? 'Mute microphone' : 'Unmute microphone'}
>
  {micOn ? <Mic size={20} /> : <MicOff size={20} />}
  {micOn ? 'Mute' : 'Unmute'}
</button>

        <button
  className="secondary-button"
  onClick={toggleCamera}
  title={cameraOn ? 'Turn camera off' : 'Turn camera on'}
>
  {cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
  {cameraOn ? 'Camera Off' : 'Camera On'}
</button>
      </div>

      <div style={{ marginTop: '25px' }}>
        <h3>Participants</h3>
        <p>You are currently in this meeting room.</p>
        <p>Live participant connections will be added in the WebRTC stage.</p>
      </div>

      <button
  className="primary-button"
  style={{ marginTop: '25px' }}
  onClick={() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setSelectedMeeting(null)
    setCameraOn(false)
    setMicOn(false)
    setActiveTab('My Meetings')
  }}
>
  <PhoneOff size={20} />
  Leave Meeting
</button>
    </div>
  </section>
)}

       {activeTab === 'AI Summaries' && (
  <section style={{ padding: '30px 0' }}>
    <div className="welcome">
      <div>
        <p className="eyebrow">POWERED BY GROQ AI</p>
        <h1>AI Meeting Summaries</h1>
        <p className="subtitle">
          Generate meeting summaries, key decisions and action items.
        </p>
      </div>
    </div>

    <article className="panel" style={{ marginTop: '20px' }}>
      <h2>Select Meeting</h2>

      <select
        value={selectedMeetingId}
        onChange={(e) => setSelectedMeetingId(e.target.value)}
        style={inputStyle}
      >
        <option value="">Choose a meeting</option>
        {meetings.map((meeting) => (
          <option key={meeting._id} value={meeting._id}>
            {meeting.title}
          </option>
        ))}
      </select>

      <h2 style={{ marginTop: '25px' }}>Meeting Transcript</h2>

      <textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="Paste your meeting transcript here..."
        rows={10}
        style={{
          ...inputStyle,
          resize: 'vertical',
          lineHeight: '1.6'
        }}
      />

      <button
        className="primary-button"
        onClick={generateAISummary}
        disabled={aiLoading}
        style={{ marginTop: '20px' }}
      >
        {aiLoading ? 'Generating Summary...' : '✦ Generate AI Summary'}
      </button>
    </article>

    {aiSummary && (
      <article className="panel" style={{ marginTop: '25px' }}>
        <p className="eyebrow">GENERATED BY GROQ AI</p>
        <h2>Meeting Summary</h2>


<div style={{
  display: 'flex',
  gap: '12px',
  flexWrap: 'wrap',
  marginTop: '15px',
  marginBottom: '15px'
}}>
  <button
    className="primary-button"
    onClick={copyAISummary}
  >
    📋 Copy Summary
  </button>

  <button
    className="primary-button"
    onClick={downloadAISummary}
  >
    ⬇ Download Summary
  </button>
</div>


       
<div style={{
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
  gap: '18px',
  marginTop: '20px'
}}>
  {aiSummary
    .split(/(?=^(?:\d+\.\s*)?(?:MEETING OVERVIEW|KEY DISCUSSION POINTS|IMPORTANT DECISIONS|ACTION ITEMS|ASSIGNED TASKS)\s*:?\s*$)/gim)
    .filter(section => section.trim())
    .map((section, index) => {
      const lines = section.trim().split('\n')
      const heading = lines.shift()?.replace(/^\d+\.\s*/, '').replace(/\*\*/g, '').replace(/:$/, '').trim()

      const icons = ['📋', '💬', '🎯', '✅', '👥']

      return (
        <div
          key={index}
          style={{
           background: '#ffffff',
color: '#1f2937',
            border: '1px solid var(--border-color, #e5e7eb)',
            borderRadius: '14px',
            padding: '22px',
            minHeight: '150px'
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: '15px',color: '#111827', }}>
            {icons[index] || '📌'} {heading || `Section ${index + 1}`}
          </h3>

          <div style={{
  whiteSpace: 'pre-wrap',
  lineHeight: '1.8',
  color: '#374151',
  maxHeight: '220px',
  overflowY: 'auto',
  overflowX: 'hidden',
  paddingRight: '8px'
}}>
            {lines.join('\n').replace(/\*\*/g, '').trim()}
          </div>
        </div>
      )
    })}
</div>

      </article>
    )}
  </section>
)}


{activeTab === 'Team Chat' && (
  <section style={{ padding: '30px 0' }}>
    <div className="welcome">
      <div>
        <p className="eyebrow">TEAM WORKSPACE</p>
        <h1>Team Chat 💬</h1>
        <p className="subtitle">
          Connect and collaborate with your team in real time.
        </p>
      </div>
    </div>

    <article className="panel" style={{
      marginTop: '20px',
      height: '550px',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{
        borderBottom: '1px solid #e5e7eb',
        paddingBottom: '15px'
      }}>
        <h2>Workspace Messages</h2>
        <p style={{ color: '#64748b' }}>
          {teamSocket?.connected ? '🟢 Connected' : 'Connecting...'}
        </p>
      </div>

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '15px 0'
      }}>
        {teamMessages.length === 0 ? (
          <p style={{
            textAlign: 'center',
            color: '#64748b',
            marginTop: '100px'
          }}>
            No messages yet. Start the conversation!
          </p>
        ) : (
          teamMessages.map((msg, index) => (
            <div key={msg.id || index} style={{
              background: '#f1f5f9',
              color: '#1e293b',
              padding: '12px 16px',
              borderRadius: '12px',
              marginBottom: '12px'
            }}>
              <strong>{msg.sender}</strong>

              <p style={{
                margin: '8px 0',
                whiteSpace: 'pre-wrap'
              }}>
                {msg.message}
              </p>

              <small style={{ color: '#64748b' }}>
                {new Date(msg.timestamp).toLocaleTimeString()}
              </small>
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          sendTeamMessage()
        }}
        style={{
          display: 'flex',
          gap: '10px',
          borderTop: '1px solid #e5e7eb',
          paddingTop: '15px'
        }}
      >
        <input
          type="text"
          value={teamMessage}
          onChange={(e) => setTeamMessage(e.target.value)}
          placeholder="Type your team message..."
          style={{ ...inputStyle, flex: 1 }}
        />

        <button
          type="submit"
          className="primary-button"
          disabled={!teamSocket?.connected || !teamMessage.trim()}
        >
          Send ➤
        </button>
      </form>
    </article>
  </section>
)}




{activeTab === 'Projects' && (
  <section style={{ padding: '30px 0', textAlign: 'left' }}>
    <div style={{ marginBottom: '30px' }}>
      <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>
        My Projects
      </h1>
      <p style={{ color: '#94a3b8', margin: 0 }}>
        Manage and explore your team projects.
      </p>
    </div>

    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      gap: '22px'
    }}>
      <div className="project-card">
        <h2>IntellMeet</h2>
        <p>AI-Powered Enterprise Meeting & Collaboration Platform</p>
        <p><strong>Technology</strong></p>
        <p>React · TypeScript · Node.js · MongoDB · Socket.IO · Groq AI</p>
        <span className="status-badge">In Progress</span>
        <div>
          <button onClick={() => {
            setSelectedProject('IntellMeet')
            setShowProjectDetails(true)
          }}>
            View Details
          </button>
        </div>
      </div>

      <div className="project-card">
        <h2>Project LOOP</h2>
        <p>AI Customer Feedback Intelligence Platform</p>
        <p><strong>Technology</strong></p>
        <p>AI · Web Development</p>
        <span className="status-badge">Completed</span>
        <div>
          <button onClick={() => {
            setSelectedProject('Project LOOP')
            setShowProjectDetails(true)
          }}>
            View Details
          </button>
        </div>
      </div>
    </div>

    {showProjectDetails && (
      <div className="project-details">
        <button
          onClick={() => setShowProjectDetails(false)}
          style={{ float: 'right' }}
        >
          Close
        </button>

        {selectedProject === 'IntellMeet' ? (
          <>
            <h2>IntellMeet - Project Details</h2>
            <p>AI-powered enterprise meeting and collaboration platform.</p>
            <h3>Features</h3>
            <ul>
              <li>User authentication</li>
              <li>Live meetings and video communication</li>
              <li>Real-time meeting chat</li>
              <li>AI meeting summaries using Groq</li>
            </ul>
            <p><strong>Technologies:</strong> React, TypeScript, Node.js, Express.js, MongoDB, Socket.IO, Groq AI</p>
            <p><strong>Status:</strong> In Progress</p>
          </>
        ) : (
          <>
            <h2>Project LOOP - Project Details</h2>
            <p>AI Customer Feedback Intelligence Platform.</p>
            <h3>Purpose</h3>
            <p>Analyze customer feedback from support tickets, app reviews, surveys, and sales-call text.</p>
            <h3>Features</h3>
            <ul>
              <li>Customer feedback analysis</li>
              <li>AI-based feedback categorization</li>
              <li>Feedback summaries for product teams</li>
            </ul>
            <p><strong>Status:</strong> Completed</p>
          </>
        )}
      </div>
    )}
  </section>
)}




{activeTab === 'Analytics' && (
  <section style={{ padding: '30px 0', textAlign: 'left' }}>
    <div style={{ marginBottom: '30px' }}>
      <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>
        Analytics Dashboard
      </h1>
      <p style={{ color: '#94a3b8' }}>
        Overview of your meeting activity and projects.
      </p>
    </div>

    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '20px'
    }}>
      <div className="project-card">
        <h3>Total Meetings</h3>
        <h1>{meetings.length}</h1>
        <p>All scheduled meetings</p>
      </div>

      <div className="project-card">
        <h3>Upcoming Meetings</h3>
        <h1>
          {meetings.filter(m => new Date(m.date) >= new Date(new Date().toDateString())).length}
        </h1>
        <p>Meetings scheduled for today or later</p>
      </div>

      <div className="project-card">
        <h3>Past Meetings</h3>
        <h1>
          {meetings.filter(m => new Date(m.date) < new Date(new Date().toDateString())).length}
        </h1>
        <p>Meetings before today</p>
      </div>

      <div className="project-card">
        <h3>Total Projects</h3>
        <h1>2</h1>
        <p>IntellMeet and Project LOOP</p>
      </div>
    </div>

    <div className="project-details" style={{ marginTop: '25px' }}>
  <h2>Meeting Activity Chart</h2>

  {[
    {
      label: 'Total Meetings',
      count: meetings.length,
      color: '#6366f1'
    },
    {
      label: 'Past Meetings',
      count: meetings.filter(m =>
        new Date(m.date) < new Date(new Date().toDateString())
      ).length,
      color: '#f59e0b'
    },
    {
      label: 'Upcoming Meetings',
      count: meetings.filter(m =>
        new Date(m.date) >= new Date(new Date().toDateString())
      ).length,
      color: '#10b981'
    }
  ].map((item) => (
    <div key={item.label} style={{ marginBottom: '22px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '8px'
      }}>
        <strong>{item.label}</strong>
        <strong>{item.count}</strong>
      </div>

      <div style={{
        width: '100%',
        height: '12px',
        background: '#334155',
        borderRadius: '10px',
        overflow: 'hidden'
      }}>
        <div style={{
          width: `${meetings.length ? (item.count / meetings.length) * 100 : 0}%`,
          height: '100%',
          background: item.color,
          borderRadius: '10px'
        }} />
      </div>
    </div>
  ))}
</div>

    <div className="project-details" style={{ marginTop: '25px' }}>
      <h2>Meeting Overview</h2>
      <p>Total scheduled meetings: {meetings.length}</p>
      <p>
        Upcoming: {
          meetings.filter(m => new Date(m.date) >= new Date(new Date().toDateString())).length
        }
      </p>
      <p>
        Past: {
          meetings.filter(m => new Date(m.date) < new Date(new Date().toDateString())).length
        }
      </p>
    </div>
  </section>
)}




        <footer>IntellMeet · One workspace, smarter collaboration.</footer>
      </main>
    </div>
  )
}

const inputStyle = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box' as const,
  padding: '12px',
  marginTop: '8px',
  border: '1px solid #ccc',
  borderRadius: '8px',
  fontSize: '14px',
  fontFamily: 'inherit'
}

export default App
