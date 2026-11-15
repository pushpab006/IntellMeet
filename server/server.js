
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

require('dotenv').config();

console.log('MONGODB_URI loaded:', Boolean(process.env.MONGODB_URI));

const authRoutes = require('./routes/auth');
const meetingRoutes = require('./routes/meetings');
const aiRoutes = require('./routes/ai');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;

// Middleware

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://intell-meet-rose.vercel.app'
  ],
  credentials: true
}));


app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/ai', aiRoutes);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

// Store connected participants by meeting room
const meetingRooms = new Map();

io.on('connection', (socket) => {
  console.log('Participant connected:', socket.id);

  socket.on('join-meeting', ({ meetingId, participantName }) => {
    if (!meetingId || !participantName) return;

    socket.join(meetingId);
    socket.data.meetingId = meetingId;
    socket.data.participantName = participantName;

    if (!meetingRooms.has(meetingId)) {
      meetingRooms.set(meetingId, new Map());
    }

    const participants = meetingRooms.get(meetingId);

    const existingParticipants = Array.from(participants.entries()).map(
      ([id, name]) => ({ socketId: id, participantName: name })
    );

    participants.set(socket.id, participantName);

    socket.emit('existing-participants', existingParticipants);

    socket.to(meetingId).emit('participant-joined', {
      socketId: socket.id,
      participantName
    });

    console.log(`${participantName} joined meeting ${meetingId}`);
  });

 socket.on('webrtc-offer', ({ to, offer }) => {
  io.to(to).emit('webrtc-offer', {
    from: socket.id,
    offer
  })
})

socket.on('webrtc-answer', ({ to, answer }) => {
  io.to(to).emit('webrtc-answer', {
    from: socket.id,
    answer
  })
})

socket.on('webrtc-ice-candidate', ({ to, candidate }) => {
  io.to(to).emit('webrtc-ice-candidate', {
    from: socket.id,
    candidate
  })
})

  socket.on('chat-message', ({ meetingId, message }) => {
  if (!meetingId || !message) return;

  // Send the message to everyone else in this meeting.
  socket.to(meetingId).emit('chat-message', message);
});

  socket.on('webrtc-answer', ({ to, answer }) => {
    io.to(to).emit('webrtc-answer', {
      from: socket.id,
      answer
    });
  });

  socket.on('webrtc-ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('webrtc-ice-candidate', {
      from: socket.id,
      candidate
    });
  });

  socket.on('leave-meeting', () => {
    leaveMeeting(socket);
  });

  
  // Join workspace-wide Team Chat
  socket.on('join-team-chat', ({ participantName }) => {
    if (!participantName) return;

    socket.join('team-chat');
    socket.data.teamChatName = participantName;

    console.log(`${participantName} joined Team Chat`);
  });

  // Send Team Chat message
  socket.on('team-chat-message', ({ message }) => {
    if (!socket.rooms.has('team-chat')) return;
    if (!message || !message.trim()) return;

    const chatMessage = {
      id: `${Date.now()}-${socket.id}`,
      sender: socket.data.teamChatName || 'Team Member',
      message: message.trim(),
      timestamp: new Date().toISOString()
    };

    io.to('team-chat').emit('team-chat-message', chatMessage);
  });


  socket.on('disconnect', () => {
    leaveMeeting(socket);
    console.log('Participant disconnected:', socket.id);
  });
});

function leaveMeeting(socket) {
  const meetingId = socket.data.meetingId;

  if (!meetingId) return;

  const participants = meetingRooms.get(meetingId);

  if (participants) {
    participants.delete(socket.id);

    if (participants.size === 0) {
      meetingRooms.delete(meetingId);
    }
  }

  socket.to(meetingId).emit('participant-left', {
    socketId: socket.id
  });

  socket.leave(meetingId);
  socket.data.meetingId = null;
}

// Home route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to the IntellMeet API!'
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'IntellMeet server is running!'
  });
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected successfully!');
  })
  .catch((error) => {
    console.error('MongoDB connection failed:', error.message);
  });

// Start HTTP and Socket.IO server
server.listen(PORT, () => {
  console.log(`IntellMeet server running at http://localhost:${PORT}`);
  console.log('Socket.IO meeting service is ready!');
});
