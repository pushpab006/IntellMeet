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
    if (activeTab === 'My Meetings') {
      fetchMeetings()
    }
  }, [activeTab])

  
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
  setSelectedMeeting(meeting)
  setActiveTab('Meeting Room')

  const socket = io('http://localhost:5000')
  socketRef.current = socket

  socket.on('connect', () => {
    socket.emit('join-meeting', {
      meetingId: meeting._id,
      participantName: user.fullName || 'Host'
    })

    console.log('Host joined meeting:', meeting._id)
  })

  socket.on('connect_error', (error) => {
    console.error('Host connection error:', error)
    alert('Could not connect to meeting server.')
  })

  socket.on('chat-message', (data: ChatMessage) => {
  setMessages((previous) => [...previous, data])
})

socket.on('existing-participants', (participants) => {
  participants.forEach((person: {
    socketId: string
    participantName: string
  }) => {
    participantNamesRef.current.set(
      person.socketId,
      person.participantName
    )

    void sendOffer(person.socketId)
  })
})

socket.on('participant-joined', (person: {
  socketId: string
  participantName: string
}) => {
  participantNamesRef.current.set(
    person.socketId,
    person.participantName
  )

  void sendOffer(person.socketId)
})

socket.on('webrtc-offer', async ({ from, offer }) => {
  try {
    const peer = createPeer(from)

    await peer.setRemoteDescription(
      new RTCSessionDescription(offer)
    )

    const answer = await peer.createAnswer()
    await peer.setLocalDescription(answer)

    socketRef.current?.emit('webrtc-answer', {
      to: from,
      answer
    })
  } catch (error) {
    console.error('Error answering WebRTC offer:', error)
  }
})

socket.on('webrtc-answer', async ({ from, answer }) => {
  try {
    const peer = peersRef.current.get(from)

    if (!peer) return

    await peer.setRemoteDescription(
      new RTCSessionDescription(answer)
    )
  } catch (error) {
    console.error('Error receiving WebRTC answer:', error)
  }
})

socket.on('participant-left', ({ socketId }) => {
  const peer = peersRef.current.get(socketId)

  if (peer) {
    peer.close()
    peersRef.current.delete(socketId)
  }

  participantNamesRef.current.delete(socketId)

  setRemoteStreams((previous) =>
    previous.filter(item => item.socketId !== socketId)
  )
})

socket.on('webrtc-ice-candidate', async ({ from, candidate }) => {

  try {
    const peer = peersRef.current.get(from)

    if (!peer) return

    await peer.addIceCandidate(
      new RTCIceCandidate(candidate)
    )
  } catch (error) {
    console.error('Error adding ICE candidate:', error)
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

        {['Overview', 'My Meetings', 'AI Summaries', 'Team Chat', 'Projects', 'Analytics'].map((item) => (
          <button
            key={item}
            className={`nav-item ${activeTab === item ? 'active' : ''}`}
            onClick={() => setActiveTab(item)}
          >
            {item}
          </button>
        ))}

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

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
    <h1>AI Meeting Summaries</h1>
    <p>Review your meeting summaries and key discussion points.</p>

    <div className="panel" style={{ marginTop: '20px' }}>
      <h2>No AI summaries yet</h2>
      <p>
        Your meeting summaries will appear here after AI processing
        is implemented.
      </p>
    </div>
  </section>
)}

{activeTab !== 'Overview' &&
  activeTab !== 'My Meetings' &&
  activeTab !== 'Meeting Room' &&
  activeTab !== 'AI Summaries' && (
    <section style={{ padding: '30px 0' }}>
      <h1>{activeTab}</h1>
      <p>This section is coming soon.</p>
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
