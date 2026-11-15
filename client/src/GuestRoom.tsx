
import { useEffect, useRef, useState } from 'react'
import { useLocation, useParams, useNavigate } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import {
  Video, VideoOff, Mic, MicOff, PhoneOff, Users,
  Settings, Monitor, MessageSquare, MoreVertical,
    Copy, ShieldCheck, X, Send, PanelRight, LogOut, Search, Pin
} from 'lucide-react'

interface Participant {
  socketId: string
  participantName: string
}

interface RemoteStream {
  socketId: string
  participantName: string
  stream: MediaStream
}

interface ChatMessage {
  id: string
  sender: string
  message: string
  time: string
}

const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
}

function RemoteVideo({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream
      void videoRef.current.play().catch(console.error)
    }
  }, [stream])

  return <video ref={videoRef} autoPlay playsInline />
}

function GuestRoom() {
  const { meetingId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const storedUser = localStorage.getItem('intellmeetUser')

const participantName = storedUser
  ? JSON.parse(storedUser).fullName || 'Registered User'
  : 'Registered User'

  const socketRef = useRef<Socket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const namesRef = useRef<Map<string, string>>(new Map())

  const [cameraOn, setCameraOn] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [status, setStatus] = useState('Connecting...')
  const [participants, setParticipants] = useState<Participant[]>([])
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([])
  const [chatOpen, setChatOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
 const [showParticipants, setShowParticipants] = useState(true)
const [showParticipantSearch, setShowParticipantSearch] = useState(false)
const [participantSearch, setParticipantSearch] = useState('')
const [pinnedParticipant, setPinnedParticipant] = useState<string | null>(null)
const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageInput, setMessageInput] = useState('')

  const updateParticipant = (socketId: string, name: string) => {
    namesRef.current.set(socketId, name)
    setParticipants(previous => {
      if (previous.some(person => person.socketId === socketId)) {
        return previous.map(person =>
          person.socketId === socketId
            ? { socketId, participantName: name }
            : person
        )
      }
      return [...previous, { socketId, participantName: name }]
    })
  }

  const closePeer = (socketId: string) => {
    peersRef.current.get(socketId)?.close()
    peersRef.current.delete(socketId)
    namesRef.current.delete(socketId)

    setRemoteStreams(previous =>
      previous.filter(item => item.socketId !== socketId)
    )
    setParticipants(previous =>
      previous.filter(item => item.socketId !== socketId)
    )
  }

  const createPeer = (remoteId: string) => {
    const existing = peersRef.current.get(remoteId)
    if (existing) return existing

    const peer = new RTCPeerConnection(ICE_SERVERS)

    streamRef.current?.getTracks().forEach(track => {
      peer.addTrack(track, streamRef.current!)
    })

    peer.onicecandidate = event => {
      if (event.candidate) {
        socketRef.current?.emit('webrtc-ice-candidate', {
          to: remoteId,
          candidate: event.candidate
        })
      }
    }

    peer.ontrack = event => {
      const remoteStream = event.streams[0]
      if (!remoteStream) return

      const name = namesRef.current.get(remoteId) || 'Participant'

      setRemoteStreams(previous => {
        const withoutOld = previous.filter(item => item.socketId !== remoteId)
        return [...withoutOld, {
          socketId: remoteId,
          participantName: name,
          stream: remoteStream
        }]
      })
    }

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed' ||
          peer.connectionState === 'closed') {
        closePeer(remoteId)
      }
    }

    peersRef.current.set(remoteId, peer)
    return peer
  }

  const togglePinParticipant = (socketId: string) => {
  setPinnedParticipant(current =>
    current === socketId ? null : socketId
  )
}

const filteredParticipants = participants.filter(person =>
  person.participantName
    .toLowerCase()
    .includes(participantSearch.trim().toLowerCase())
)

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
      console.error('Offer error:', error)
    }
  }

  useEffect(() => {
    if (!meetingId) return

    const socket = io('http://localhost:5000')
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('join-meeting', { meetingId, participantName })
      setStatus('Connected')
    })

    socket.on('connect_error', error => {
      console.error('Socket error:', error)
      setStatus('Connection failed')
    })

    socket.on('existing-participants', (existing: Participant[]) => {
      existing.forEach(person => {
        updateParticipant(person.socketId, person.participantName)
        void sendOffer(person.socketId)
      })
    })

    socket.on('participant-joined', (person: Participant) => {
      updateParticipant(person.socketId, person.participantName)
    })

    socket.on('participant-left', ({ socketId }: { socketId: string }) => {
      closePeer(socketId)
    })

    socket.on('webrtc-offer', async ({ from, offer }) => {
      try {
        const peer = createPeer(from)
        await peer.setRemoteDescription(new RTCSessionDescription(offer))

        const answer = await peer.createAnswer()
        await peer.setLocalDescription(answer)

        socket.emit('webrtc-answer', { to: from, answer })
      } catch (error) {
        console.error('Answer error:', error)
      }
    })

    socket.on('webrtc-answer', async ({ from, answer }) => {
      try {
        const peer = peersRef.current.get(from)
        if (peer) {
          await peer.setRemoteDescription(new RTCSessionDescription(answer))
        }
      } catch (error) {
        console.error('Answer handling error:', error)
      }
    })

    socket.on('webrtc-ice-candidate', async ({ from, candidate }) => {
      try {
        const peer = peersRef.current.get(from)
        if (peer && candidate) {
          await peer.addIceCandidate(new RTCIceCandidate(candidate))
        }
      } catch (error) {
        console.error('ICE candidate error:', error)
      }
    })

    socket.on('chat-message', (data: ChatMessage) => {
      setMessages(previous => [...previous, data])
    })

    return () => {
      socket.emit('leave-meeting')
      socket.disconnect()

      peersRef.current.forEach(peer => peer.close())
      peersRef.current.clear()

      streamRef.current?.getTracks().forEach(track => track.stop())
      screenStreamRef.current?.getTracks().forEach(track => track.stop())
    }
  }, [meetingId, participantName])

  // Attach the local camera stream whenever the video element appears.
  useEffect(() => {
    if (cameraOn && localVideoRef.current && streamRef.current) {
      localVideoRef.current.srcObject = streamRef.current
      void localVideoRef.current.play().catch(console.error)
    }
  }, [cameraOn])

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      })

      streamRef.current = stream

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
        await localVideoRef.current.play()
      }

      setCameraOn(true)
      setMicOn(true)

      // Add the new tracks to existing peer connections.
      for (const [remoteId, peer] of peersRef.current.entries()) {
        const senders = peer.getSenders()

        for (const track of stream.getTracks()) {
          const existingSender = senders.find(
            sender => sender.track?.kind === track.kind
          )

          if (existingSender) {
            await existingSender.replaceTrack(track)
          } else {
            peer.addTrack(track, stream)
          }
        }

        const offer = await peer.createOffer()
        await peer.setLocalDescription(offer)

        socketRef.current?.emit('webrtc-offer', {
          to: remoteId,
          offer
        })
      }
    } catch (error) {
      console.error('Camera or microphone error:', error)
      alert('Could not access your camera or microphone. Check browser permissions.')
    }
  }

  const toggleCamera = () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return

    track.enabled = !track.enabled
    setCameraOn(track.enabled)
  }

  const toggleMic = () => {
    const track = streamRef.current?.getAudioTracks()[0]
    if (!track) return

    track.enabled = !track.enabled
    setMicOn(track.enabled)
  }

  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      })

      screenStreamRef.current = screenStream
      const screenTrack = screenStream.getVideoTracks()[0]

      if (localVideoRef.current) {
  localVideoRef.current.srcObject = screenStream
  await localVideoRef.current.play().catch(console.error)
}

      for (const peer of peersRef.current.values()) {
        const videoSender = peer.getSenders().find(
          sender => sender.track?.kind === 'video'
        )

        if (videoSender) {
          await videoSender.replaceTrack(screenTrack)
        } else {
          peer.addTrack(screenTrack, screenStream)
        }
      }

      setSharing(true)

      screenTrack.onended = () => {
        void stopScreenShare()
      }
    } catch (error) {
      console.error('Screen sharing error:', error)
    }
  }

  const stopScreenShare = async () => {
    screenStreamRef.current?.getTracks().forEach(track => track.stop())
    screenStreamRef.current = null

    const cameraTrack = streamRef.current?.getVideoTracks()[0]

    if (localVideoRef.current) {
  localVideoRef.current.srcObject =
    cameraOn && streamRef.current ? streamRef.current : null

  if (cameraOn) {
    await localVideoRef.current.play().catch(console.error)
  }
}

    for (const peer of peersRef.current.values()) {
      const videoSender = peer.getSenders().find(
        sender => sender.track?.kind === 'video'
      )

      if (videoSender) {
        await videoSender.replaceTrack(cameraTrack || null)
      }
    }

    setSharing(false)
  }

  const sendMessage = () => {
    const message = messageInput.trim()
    if (!message) return

    const data: ChatMessage = {
      id: `${Date.now()}-${Math.random()}`,
      sender: participantName,
      message,
      time: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })
    }

    socketRef.current?.emit('chat-message', {
      meetingId,
      message: data
    })

    setMessages(previous => [...previous, data])
    setMessageInput('')
  }

  const copyMeetingId = async () => {
    if (!meetingId) return

    try {
      await navigator.clipboard.writeText(meetingId)
      alert('Meeting ID copied!')
    } catch {
      alert('Could not copy the meeting ID.')
    }
  }

  const leaveMeeting = () => {
  // Stop camera and microphone
  streamRef.current?.getTracks().forEach((track) => {
    track.stop();
  });
  streamRef.current = null;

  // Stop screen sharing
  screenStreamRef.current?.getTracks().forEach((track) => {
    track.stop();
  });
  screenStreamRef.current = null;

  // Close all WebRTC connections
  peersRef.current.forEach((peer) => peer.close());
  peersRef.current.clear();

  // Disconnect meeting socket
  socketRef.current?.emit('leave-meeting');
  socketRef.current?.disconnect();
  socketRef.current = null;

  // Clear video preview
  if (localVideoRef.current) {
    localVideoRef.current.srcObject = null;
  }

  navigate('/');
};
  return (
    <div className="meeting-app">
      <style>{`
        * { box-sizing: border-box; }
        .meeting-app {
          min-height: 100vh; background: #0b1120; color: #f8fafc;
          font-family: Inter, Arial, sans-serif; display: flex; flex-direction: column;
        }
        .meeting-header {
          min-height: 72px; padding: 0 24px; display: flex;
          align-items: center; justify-content: space-between;
          border-bottom: 1px solid #253149; background: #111a2e;
        }
        .brand { display: flex; align-items: center; gap: 12px; }
        .brand-icon {
          width: 40px; height: 40px; border-radius: 12px;
          display: grid; place-items: center; background: #2563eb;
        }
        .brand-name { font-size: 21px; font-weight: 700; }
        .meeting-info { display: flex; align-items: center; gap: 10px; }
        .meeting-id { color: #cbd5e1; background: #1e293b; padding: 10px 14px; border-radius: 9px; font-size: 13px; }
        .status { color: #4ade80; font-size: 13px; }
        .icon-btn, .copy-btn {
          border: 1px solid #334155; background: #1e293b;
          color: white; border-radius: 9px; padding: 10px; cursor: pointer;
        }
        .meeting-content {
          flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) 280px;
          gap: 20px; padding: 22px;
        }
        .meeting-content.no-sidebar { grid-template-columns: 1fr; }
        .video-section { min-width: 0; }
        .section-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
        .section-heading h2 { font-size: 19px; margin: 0; }
        .video-stage {
          min-height: 390px; height: 52vh; position: relative;
          background: #020617; border: 1px solid #26344c;
          border-radius: 18px; overflow: hidden; display: grid; place-items: center;
        }
        .main-video { width: 100%; height: 100%; object-fit: cover; }
        .camera-placeholder { text-align: center; color: #94a3b8; }
        .avatar {
          width: 90px; height: 90px; border-radius: 50%;
          display: grid; place-items: center; margin: 0 auto 15px;
          background: #1d4ed8; font-size: 32px; font-weight: 700;
        }
        .video-label, .remote-name {
          position: absolute; bottom: 12px; left: 12px;
          background: #0f172acc; padding: 8px 12px;
          border-radius: 8px; font-size: 13px;
        }
        .remote-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin-top: 14px; }
        .remote-tile { position: relative; min-height: 180px; overflow: hidden; background: #020617; border: 1px solid #26344c; border-radius: 14px; }
        .remote-tile video { width: 100%; height: 180px; object-fit: cover; }
        .side-panel, .chat-panel {
          background: #111a2e; border: 1px solid #26344c;
          border-radius: 16px; padding: 18px; height: fit-content;
        }
        .side-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
        .side-title h3 { margin: 0; font-size: 17px; }
        .count { background: #1d4ed8; padding: 4px 9px; border-radius: 20px; font-size: 12px; }
        .person { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #26344c; }
        .person-avatar { width: 38px; height: 38px; border-radius: 50%; background: #334155; display: grid; place-items: center; font-weight: 700; }
        .person-name { font-size: 14px; font-weight: 600; }
        .person-role { color: #94a3b8; font-size: 12px; margin-top: 4px; }
        .bottom-bar {
          min-height: 88px; background: #111a2e; border-top: 1px solid #26344c;
          display: flex; justify-content: center; align-items: center; gap: 12px; padding: 14px;
        }
        .control {
          min-width: 54px; height: 52px; border-radius: 13px;
          border: 1px solid #334155; background: #26344c; color: white;
          display: flex; align-items: center; justify-content: center;
          gap: 8px; cursor: pointer; padding: 0 15px; font-size: 13px;
        }
        .control:hover { background: #334155; }
        .control.active { background: #1d4ed8; border-color: #3b82f6; }
        .control.leave { background: #dc2626; border-color: #ef4444; }
        .secure-note { color: #94a3b8; font-size: 12px; text-align: center; padding: 0 10px 12px; }
        .floating-panel {
          position: fixed; right: 20px; bottom: 105px; z-index: 10;
          width: min(360px, calc(100vw - 30px)); max-height: 65vh;
          overflow: auto; background: #111a2e; border: 1px solid #334155;
          border-radius: 16px; padding: 16px; box-shadow: 0 12px 40px #0008;
        }
        .panel-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
        .panel-heading h3 { margin: 0; }
        .close-btn { background: transparent; border: 0; color: white; cursor: pointer; }
        .chat-messages { max-height: 280px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
        .chat-message { background: #1e293b; padding: 10px; border-radius: 10px; overflow-wrap: anywhere; }
        .chat-message small { color: #94a3b8; display: block; margin-top: 5px; }
        .chat-form { display: flex; gap: 8px; margin-top: 12px; }
        .chat-form input { min-width: 0; flex: 1; background: #020617; color: white; border: 1px solid #334155; border-radius: 9px; padding: 10px; }
        .chat-form button, .menu-option {
          background: #2563eb; color: white; border: 0; border-radius: 9px;
          padding: 10px 12px; cursor: pointer;
        }
        .menu-options { display: flex; flex-direction: column; gap: 8px; }
        .menu-option { display: flex; gap: 10px; align-items: center; text-align: left; background: #1e293b; }
        .menu-option:hover { background: #334155; }
        @media(max-width: 800px) {
          .meeting-content { grid-template-columns: 1fr; padding: 12px; }
          .meeting-header { padding: 0 12px; }
          .meeting-id { display: none; }
          .control span { display: none; }
          .bottom-bar { gap: 7px; flex-wrap: wrap; }
          .control { min-width: 46px; padding: 0 11px; }
          .video-stage { min-height: 300px; height: 42vh; }
        }
      `}</style>

      <header className="meeting-header">
        <div className="brand">
          <div className="brand-icon"><Video size={23} /></div>
          <span className="brand-name">IntellMeet</span>
        </div>
        <div className="meeting-info">
          <span className="status">● {status}</span>
          <span className="meeting-id">ID: {meetingId}</span>
          <button className="copy-btn" onClick={copyMeetingId} title="Copy meeting ID"><Copy size={17} /></button>
          <button className="icon-btn" onClick={() => setMenuOpen(!menuOpen)} title="Settings"><Settings size={18} /></button>
        </div>
      </header>

      <main className={`meeting-content ${!showParticipants ? 'no-sidebar' : ''}`}>
        <section className="video-section">
          <div className="section-heading">
            <h2>Meeting Room</h2>
            <span style={{ color: '#94a3b8', fontSize: 13 }}>
              <ShieldCheck size={15} style={{ verticalAlign: 'middle' }} /> Secure meeting
            </span>
          </div>

          <div className="video-stage">
            {(cameraOn || sharing) ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="main-video"
              />
            ) : (
              <div className="camera-placeholder">
                <div className="avatar">{participantName.charAt(0).toUpperCase()}</div>
                <h3>{participantName}</h3>
                <p>Camera is turned off</p>
              </div>
            )}
            <div className="video-label">{participantName} (You)</div>
          </div>

         <div className="remote-grid">
  {[...remoteStreams]
    .sort((a, b) =>
      a.socketId === pinnedParticipant ? -1 :
      b.socketId === pinnedParticipant ? 1 : 0
    )
    .map(remote => (
              <div className="remote-tile" key={remote.socketId}>
                <RemoteVideo stream={remote.stream} />
                <div className="remote-name">{remote.participantName}</div>
              </div>
            ))}
          </div>
        </section>

        {showParticipants && (
          <aside className="side-panel">
            <div className="side-title">
              <h3><Users size={18} style={{ verticalAlign: 'middle' }} /> Participants</h3>
              <span className="count">{participants.length + 1}</span>
            </div>

            <div className="person">
              <div className="person-avatar">{participantName.charAt(0).toUpperCase()}</div>
              <div>
                <div className="person-name">{participantName} (You)</div>
                <div className="person-role">Guest participant</div>
              </div>
            </div>

           {showParticipantSearch && (
  <input
    value={participantSearch}
    onChange={event => setParticipantSearch(event.target.value)}
    placeholder="Search participants..."
    style={{
      width: '100%',
      padding: 10,
      marginBottom: 10,
      background: '#020617',
      color: 'white',
      border: '1px solid #334155',
      borderRadius: 9
    }}
  />
)}

{filteredParticipants.map(person => (
  <div className="person" key={person.socketId}>
    <div className="person-avatar">
      {person.participantName.charAt(0).toUpperCase()}
    </div>

    <div style={{ flex: 1 }}>
      <div className="person-name">{person.participantName}</div>
      <div className="person-role">
        {pinnedParticipant === person.socketId
          ? 'Pinned participant'
          : 'Participant'}
      </div>
    </div>

    <button
      className="icon-btn"
      title="Pin participant"
      onClick={() => togglePinParticipant(person.socketId)}
    >
      <Pin size={16} />
    </button>
  </div>
))}

{filteredParticipants.length === 0 && (
  <p style={{ color: '#94a3b8', fontSize: 13 }}>
    No participants found.
  </p>
)}
          </aside>
        )}
      </main>

      {chatOpen && (
        <div className="floating-panel">
          <div className="panel-heading">
            <h3>Meeting chat</h3>
            <button className="close-btn" onClick={() => setChatOpen(false)}><X size={20} /></button>
          </div>
          <div className="chat-messages">
            {messages.length === 0 && <p style={{ color: '#94a3b8' }}>No messages yet. Start the conversation!</p>}
            {messages.map(message => (
              <div className="chat-message" key={message.id}>
                <strong>{message.sender}</strong>
                <div>{message.message}</div>
                <small>{message.time}</small>
              </div>
            ))}
          </div>
          <form className="chat-form" onSubmit={event => { event.preventDefault(); sendMessage() }}>
            <input
              value={messageInput}
              onChange={event => setMessageInput(event.target.value)}
              placeholder="Write a message..."
            />
            <button type="submit" aria-label="Send message"><Send size={18} /></button>
          </form>
        </div>
      )}

      {menuOpen && (
        <div className="floating-panel" style={{ width: 250 }}>
          <div className="panel-heading">
            <h3>More options</h3>
            <button className="close-btn" onClick={() => setMenuOpen(false)}><X size={20} /></button>
          </div>
          <div className="menu-options">
            <button className="menu-option" onClick={() => { void copyMeetingId(); setMenuOpen(false) }}>
              <Copy size={17} /> Copy meeting ID
            </button>
            <button className="menu-option" onClick={() => { setShowParticipants(!showParticipants); setMenuOpen(false) }}>
              <PanelRight size={17} /> {showParticipants ? 'Hide participants' : 'Show participants'}
            </button>
            <button
  className="menu-option"
  onClick={() => {
    setShowParticipants(true)
    setShowParticipantSearch(true)
    setMenuOpen(false)
  }}
>
  <Search size={17} /> Search participants
</button>
            <button className="menu-option" onClick={() => { setChatOpen(!chatOpen); setMenuOpen(false) }}>
              <MessageSquare size={17} /> Open meeting chat
            </button>
            <button className="menu-option" onClick={() => { setMenuOpen(false); leaveMeeting() }}>
              <LogOut size={17} /> Leave meeting
            </button>
          </div>
        </div>
      )}

      <footer className="bottom-bar">
        <button className={`control ${micOn ? 'active' : ''}`} onClick={toggleMic}>
          {micOn ? <Mic size={20} /> : <MicOff size={20} />}
          <span>{micOn ? 'Mute' : 'Unmute'}</span>
        </button>

        <button className={`control ${cameraOn ? 'active' : ''}`} onClick={cameraOn ? toggleCamera : startCamera}>
          {cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
          <span>{cameraOn ? 'Camera Off' : 'Camera On'}</span>
        </button>

        <button
          className={`control ${sharing ? 'active' : ''}`}
          onClick={sharing ? () => { void stopScreenShare() } : () => { void startScreenShare() }}
        >
          <Monitor size={20} /><span>{sharing ? 'Stop Share' : 'Share'}</span>
        </button>

        <button className={`control ${chatOpen ? 'active' : ''}`} onClick={() => setChatOpen(!chatOpen)}>
          <MessageSquare size={20} /><span>Chat</span>
        </button>

        <button className="control" onClick={() => setMenuOpen(!menuOpen)} title="More options">
          <MoreVertical size={20} />
        </button>

        <button className="control leave" onClick={leaveMeeting}>
          <PhoneOff size={20} /><span>Leave</span>
        </button>
      </footer>

      <div className="secure-note">
        IntellMeet • Meeting ID: {meetingId} • {status}
      </div>
    </div>
  )
}

export default GuestRoom
