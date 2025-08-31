const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /\.(jpe?g|png|mp4|webm|ogg|mp3|wav|pdf|doc|docx)$/i;
    if (!filetypes.test(path.extname(file.originalname))) {
      return cb(new Error('File type not allowed'), false);
    }
    cb(null, true);
  }
});

let services = [];
let messages = {};
let users = {};

app.use(express.static('public'));
app.use(express.json());

app.get('/health', (req, res) => res.sendStatus(200));

app.get('/api/services', (req, res) => res.json(services));

app.post('/api/service', upload.single('file'), (req, res) => {
  const { username, title, description, category, price } = req.body;
  if (!username || !title || !category) return res.status(400).json({ error: 'Missing required fields' });
  const service = {
    id: Date.now().toString(),
    username,
    title,
    description,
    category,
    price,
    file: req.file ? `/uploads/${req.file.filename}` : '',
    ratings: []
  };
  services.push(service);
  io.emit('serviceAdded', service);
  res.status(201).json(service);
});

app.post('/api/message', (req, res) => {
  const { from, to, content } = req.body;
  if (!from || !to || !content) return res.status(400).json({ error: 'Missing fields' });
  const message = { from, to, content, timestamp: new Date() };
  if (!messages[from]) messages[from] = {};
  if (!messages[to]) messages[to] = {};
  messages[from][to] = messages[from][to] || [];
  messages[to][from] = messages[to][from] || [];
  messages[from][to].push(message);
  messages[to][from].push(message);
  io.emit('newMessage', message);
  res.sendStatus(200);
});

app.get('/api/messages/:username', (req, res) => {
  const { username } = req.params;
  res.json(messages[username] || {});
});

app.post('/api/rate', (req, res) => {
  const { id, rating } = req.body;
  if (!id || !rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Invalid rating' });
  const service = services.find(s => s.id === id);
  if (!service) return res.status(404).json({ error: 'Service not found' });
  service.ratings.push(rating);
  io.emit('serviceUpdated', service);
  res.sendStatus(200);
});

app.delete('/api/service/:id', (req, res) => {
  const { id } = req.params;
  const { username } = req.body;
  const serviceIndex = services.findIndex(s => s.id === id && s.username === username);
  if (serviceIndex === -1) return res.status(403).json({ error: 'Not authorized or service not found' });
  services.splice(serviceIndex, 1);
  io.emit('serviceRemoved', id);
  res.sendStatus(200);
});

app.get('/api/status/:username', (req, res) => {
  const { username } = req.params;
  res.json({ status: users[username] ? 'Online' : 'Offline' });
});

io.on('connection', socket => {
  socket.on('registerUser', username => {
    users[username] = socket.id;
    io.emit('userStatus', { username, status: 'Online' });
    socket.on('disconnect', () => {
      delete users[username];
      io.emit('userStatus', { username, status: 'Offline' });
    });
  });
});

server.listen(3002, () => console.log('Server running on port 3002')); 
