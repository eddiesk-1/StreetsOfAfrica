const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3002;

let services = [];
let messages = [];

const usernameRe = /^[a-zA-Z0-9_]+@[0-9]{10}$/;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({ limits: { fileSize: 10 * 1024 * 1024 }, abortOnLimit: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/upload', (req, res) => {
  const { username = 'anon@0000000000', title = 'Untitled', desc = '', price = '' } = req.body;
  if (!usernameRe.test(username)) return res.status(400).json({ error: 'invalid username' });

  if (!req.files || !req.files.file) return res.status(400).json({ error: 'no file' });
  const file = req.files.file;

  const allowed = {
    'image/jpeg': '.jpg', 'image/png': '.png',
    'video/mp4': '.mp4', 'video/webm': '.webm', 'video/ogg': '.ogg',
    'audio/mpeg': '.mp3', 'audio/wav': '.wav',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx'
  };
  if (!allowed[file.mimetype]) return res.status(415).json({ error: 'unsupported file type' });

  const id = Date.now() + '-' + Math.floor(Math.random() * 10000);
  const fname = `${id}${allowed[file.mimetype]}`;
  const dest = path.join(__dirname, 'public', 'uploads', fname);

  file.mv(dest, err => {
    if (err) return res.status(500).json({ error: 'save failed' });

    const svc = {
      id,
      username,
      title,
      desc,
      price,
      filename: `uploads/${fname}`,
      mimetype: file.mimetype,
      rating: { count: 0, total: 0 },
      created: Date.now()
    };
    services.unshift(svc);
    io.emit('new-service', svc);
    res.json({ ok: true, service: svc });
  });
});

app.post('/api/rate', (req, res) => {
  const { id, rating } = req.body;
  const svc = services.find(s => s.id === id);
  if (!svc) return res.status(404).json({ error: 'not found' });
  const r = parseInt(rating, 10);
  if (r < 1 || r > 5) return res.status(400).json({ error: 'bad rating' });
  svc.rating.count++;
  svc.rating.total += r;
  io.emit('rating-updated', { id: svc.id, rating: svc.rating });
  res.json({ ok: true, rating: svc.rating });
});

app.get('/api/services', (req, res) => {
  const offset = parseInt(req.query.offset || '0');
  const limit = 12;
  res.json({ services: services.slice(offset, offset + limit), offset: offset + limit });
});

app.post('/api/message', (req, res) => {
  const { from, to, msg } = req.body;
  if (!usernameRe.test(from) || !usernameRe.test(to)) return res.status(400).json({ error: 'invalid username' });
  if (!msg) return res.status(400).json({ error: 'empty' });
  const m = { from, to, msg, time: Date.now(), read: false };
  messages.push(m);
  io.emit('message', m);
  res.json({ ok: true, msg: m });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

io.on('connection', socket => {
  socket.emit('initial-services', services.slice(0, 12));

  socket.on('send-message', m => {
    if (!usernameRe.test(m.from) || !usernameRe.test(m.to)) return;
    const mm = { ...m, time: Date.now(), read: false };
    messages.push(mm);
    io.emit('message', mm);
  });

  socket.on('rate', ({ id, rating }) => {
    const svc = services.find(s => s.id === id);
    if (!svc) return;
    const r = parseInt(rating, 10);
    if (r < 1 || r > 5) return;
    svc.rating.count++;
    svc.rating.total += r;
    io.emit('rating-updated', { id: svc.id, rating: svc.rating });
  });
});

server.listen(PORT, () => console.log('Server running on', PORT));
