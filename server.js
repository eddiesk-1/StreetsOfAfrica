const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3002;

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public/uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|mp3|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// In-memory storage
let services = []; // {id, username, title, description, category, price, photo, music, document, ratings: []}
let messages = {}; // {from_to: [{from, to, content, timestamp}]}
let onlineUsers = new Set();

// Username validation regex
const usernameRegex = /^[a-zA-Z0-9_]+@[0-9]{10}$/;

// Socket.io
io.on('connection', (socket) => {
  socket.on('registerUser', (username) => {
    if (usernameRegex.test(username)) {
      socket.username = username;
      onlineUsers.add(username);
      io.emit('userStatus', { username, status: 'Online' });
    }
  });

  socket.on('disconnect', () => {
    if (socket.username) {
      onlineUsers.delete(socket.username);
      io.emit('userStatus', { username: socket.username, status: 'Offline' });
    }
  });
});

// API Endpoints

// Health check
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Post service
app.post('/api/service', upload.fields([{name: 'photo'}, {name: 'music'}, {name: 'document'}]), (req, res) => {
  const { username, title, description, category, price } = req.body;
  if (!usernameRegex.test(username) || !title || !category) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  const id = Date.now().toString();
  const photo = req.files.photo ? `/uploads/${req.files.photo[0].filename}` : null;
  const music = req.files.music ? `/uploads/${req.files.music[0].filename}` : null;
  const document = req.files.document ? `/uploads/${req.files.document[0].filename}` : null;
  const service = { id, username, title, description, category, price: parseFloat(price) || null, photo, music, document, ratings: [] };
  services.push(service);
  io.emit('serviceAdded', service);
  res.status(201).json(service);
});

// Rate service
app.post('/api/rate', (req, res) => {
  const { id, rating } = req.body;
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Invalid rating' });
  }
  const service = services.find(s => s.id === id);
  if (!service) {
    return res.status(404).json({ error: 'Service not found' });
  }
  service.ratings.push(rating);
  io.emit('serviceUpdated', service);
  res.status(200).json(service);
});

// Delete service
app.delete('/api/service/:id', express.json(), (req, res) => {
  const { id } = req.params;
  const { username } = req.body;
  const index = services.findIndex(s => s.id === id && s.username === username);
  if (index === -1) {
    return res.status(403).json({ error: 'Unauthorized or not found' });
  }
  const service = services[index];
  [service.photo, service.music, service.document].forEach(file => {
    if (file) {
      fs.unlink(path.join(__dirname, 'public', file), err => {
        if (err) console.error(err);
      });
    }
  });
  services.splice(index, 1);
  io.emit('serviceRemoved', id);
  res.status(200).json({ message: 'Deleted' });
});

// Send message
app.post('/api/message', (req, res) => {
  const { from, to, content } = req.body;
  if (!usernameRegex.test(from) || !usernameRegex.test(to) || !content) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  const key1 = `${from}_${to}`;
  const key2 = `${to}_${from}`;
  const key = messages[key1] ? key1 : (messages[key2] ? key2 : key1);
  if (!messages[key]) messages[key] = [];
  const msg = { from, to, content, timestamp: Date.now() };
  messages[key].push(msg);
  io.emit('newMessage', msg);
  res.status(200).json(msg);
});

// Get messages for user (all conversations)
app.get('/api/messages/:username', (req, res) => {
  const { username } = req.params;
  const userMessages = {};
  Object.keys(messages).forEach(key => {
    if (key.includes(username)) {
      const [u1, u2] = key.split('_');
      const other = u1 === username ? u2 : u1;
      userMessages[other] = messages[key];
    }
  });
  res.status(200).json(userMessages);
});

// Get services
app.get('/api/services', (req, res) => {
  res.status(200).json(services);
});

// Get user status
app.get('/api/status/:username', (req, res) => {
  const status = onlineUsers.has(req.params.username) ? 'Online' : 'Offline';
  res.status(200).json({ status });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
}); 
