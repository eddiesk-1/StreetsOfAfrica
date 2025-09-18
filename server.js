const express = require('express');
const fileUpload = require('express-fileupload');
const socketIo = require('socket.io');
const http = require('http');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(fileUpload({ limits: { fileSize: 10 * 1024 * 1024 }, abortOnLimit: true }));
app.use(express.static(path.join(__dirname, 'public')));

let services = [];
let messages = {};
let userStatus = {};

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong!');
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const validateUsername = username => /^[a-zA-Z0-9_]+@[0-9]{10}$/.test(username);

app.get('/api/services', (req, res) => res.json(services));

app.post('/api/service', async (req, res) => {
  const { username, title, description, category, price } = req.body;
  if (!validateUsername(username) || !title || !category) {
    return res.status(400).send('Missing required fields');
  }
  let filePath = '';
  if (req.files && req.files.file) {
    const file = req.files.file;
    if (file.size > 10 * 1024 * 1024) {
      return res.status(413).send('File too large! Max size is 10MB.');
    }
    filePath = `/uploads/${Date.now()}_${file.name}`;
    await file.mv(path.join(__dirname, 'public', filePath));
  }
  const service = { id: Date.now().toString(), username, title, description: description || '', category, price: price || '', file: filePath, ratings: [] };
  services.push(service);
  io.emit('serviceAdded', service);
  res.status(201).send('Service posted');
});

app.post('/api/rate', (req, res) => {
  const { id, rating } = req.body;
  const service = services.find(s => s.id === id);
  if (!service || !rating || rating < 1 || rating > 5) {
    return res.status(400).send('Invalid request');
  }
  service.ratings.push(rating);
  io.emit('serviceUpdated', service);
  res.status(200).send('Rating added');
});

app.delete('/api/service/:id', async (req, res) => {
  const { id } = req.params;
  const { username } = req.body;
  const serviceIndex = services.findIndex(s => s.id === id && s.username === username);
  if (serviceIndex === -1) {
    return res.status(403).send('Unauthorized or service not found');
  }
  const [service] = services.splice(serviceIndex, 1);
  if (service.file) {
    try {
      await fs.unlink(path.join(__dirname, 'public', service.file));
    } catch (err) {
      console.error('File deletion failed:', err);
    }
  }
  io.emit('serviceRemoved', id);
  res.status(200).send('Service removed');
});

app.post('/api/message', (req, res) => {
  const { from, to, content } = req.body;
  if (!validateUsername(from) || !validateUsername(to) || !content) {
    return res.status(400).send('Missing fields');
  }
  if (!messages[from]) messages[from] = {};
  if (!messages[to]) messages[to] = {};
  const message = { from, to, content, timestamp: new Date() };
  messages[from][to] = messages[from][to] || [];
  messages[to][from] = messages[to][from] || [];
  messages[from][to].push(message);
  messages[to][from].push(message);
  io.emit('newMessage', message);
  res.status(200).send('Message sent');
});

app.get('/api/messages/:username', (req, res) => {
  const { username } = req.params;
  res.json(messages[username] || {});
});

app.get('/api/status/:username', (req, res) => {
  const { username } = req.params;
  res.json({ status: userStatus[username] || 'offline' });
});

io.on('connection', socket => {
  socket.on('registerUser', username => {
    if (validateUsername(username)) {
      userStatus[username] = 'online';
      socket.join(username);
      io.emit('userStatus', { username, status: 'online' });
      socket.on('disconnect', () => {
        userStatus[username] = 'offline';
        io.emit('userStatus', { username, status: 'offline' });
      });
    }
  });
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 
