const express = require('express');
const app = express();
const port = process.env.PORT || 3002;
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } });

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let services = [];
let messages = [];

// Health check
app.get('/health', (req, res) => res.status(200).send('OK'));

// API endpoints
app.get('/services', (req, res) => res.json(services));
app.post('/service', upload.fields([{ name: 'photo' }, { name: 'music' }, { name: 'document' }]), (req, res) => {
  const { username, title, category, description, price } = req.body;
  if (!username || !title || !category || !/^[a-zA-Z0-9_]+@[0-9]{10}$/.test(username)) {
    return res.status(400).send('Invalid username or missing fields');
  }
  const photo = req.files['photo'] ? `/uploads/${req.files['photo'][0].filename}` : null;
  const music = req.files['music'] ? `/uploads/${req.files['music'][0].filename}` : null;
  const document = req.files['document'] ? `/uploads/${req.files['document'][0].filename}` : null;
  const service = { id: Date.now(), username, title, category, description: description || '', photo, music, document, price: price || '', ratings: [] };
  services.push(service);
  io.emit('serviceAdded', service);
  res.status(201).json(service);
});
app.post('/rate', (req, res) => {
  const { serviceId, rating } = req.body;
  const service = services.find(s => s.id === serviceId);
  if (service && !isNaN(rating) && rating >= 1 && rating <= 5) {
    service.ratings.push(Number(rating));
    io.emit('serviceUpdated', service);
    res.json(service);
  } else {
    res.status(400).send('Invalid rating');
  }
});
app.delete('/service/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = services.findIndex(s => s.id === id);
  if (index !== -1 && services[index].username === req.query.username) {
    services.splice(index, 1);
    io.emit('serviceRemoved', id);
    res.sendStatus(200);
  } else {
    res.status(403).send('Unauthorized');
  }
});
app.post('/message', (req, res) => {
  const { from, to, content } = req.body;
  if (!from || !to || !content || !/^[a-zA-Z0-9_]+@[0-9]{10}$/.test(from) || !/^[a-zA-Z0-9_]+@[0-9]{10}$/.test(to)) {
    return res.status(400).send('Invalid message data');
  }
  const message = { id: Date.now(), from, to, content, timestamp: new Date().toISOString() };
  messages.push(message);
  io.to(to).emit('newMessage', message);
  res.status(201).json(message);
});
app.get('/messages/:username', (req, res) => {
  const username = req.params.username;
  res.json(messages.filter(m => m.to === username || m.from === username));
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.on('join', (username) => socket.join(username));
});

http.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
}); 
