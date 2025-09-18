// server.js - Streets of Africa (simple, in-memory)
const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// configuration
const PORT = process.env.PORT || 3002;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

// in-memory stores (reset on restart)
let services = []; // { id, username, title, desc, price, filename, mimetype, rating: {count,total}, created }
let messages = []; // { from, to, text, time, read }

// username validation: username@10digitphone
const usernameRe = /^[a-zA-Z0-9_]+@[0-9]{10}$/;

// middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({ limits: { fileSize: MAX_FILE_BYTES }, abortOnLimit: true }));
app.use(express.static(path.join(__dirname, 'public')));

// helpers
function allowedMime(mime) {
  const allowed = {
    'image/jpeg': '.jpg', 'image/png': '.png',
    'video/mp4': '.mp4', 'video/webm': '.webm', 'video/ogg': '.ogg',
    'audio/mpeg': '.mp3', 'audio/wav': '.wav',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx'
  };
  return allowed[mime] || null;
}

// upload endpoint
app.post('/api/upload', (req, res) => {
  try {
    const { username = '', title = 'Untitled', desc = '', price = '' } = req.body;
    if (!usernameRe.test(username)) return res.status(400).json({ error: 'invalid username format' });

    if (!req.files || !req.files.file) return res.status(400).json({ error: 'no file' });
    const file = req.files.file;

    const ext = allowedMime(file.mimetype);
    if (!ext) return res.status(415).json({ error: 'unsupported media type' });

    // save file
    const id = Date.now() + '-' + Math.floor(Math.random()*10000);
    const fname = `${id}${ext}`;
    const dest = path.join(__dirname, 'public', 'uploads', fname);

    file.mv(dest, err => {
      if (err) return res.status(500).json({ error: 'could not save file' });

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
      return res.json({ ok: true, service: svc });
    });
  } catch (e) {
    // file size abort handled by express-fileupload; respond 413
    if (e && e.status === 413) return res.status(413).json({ error: 'file too large' });
    return res.status(500).json({ error: 'upload failed' });
  }
});

// list services (pagination optional)
app.get('/api/services', (req, res) => {
  const offset = parseInt(req.query.offset || '0', 10);
  const limit = parseInt(req.query.limit || '12', 10);
  const slice = services.slice(offset, offset + limit);
  res.json({ services: slice, offset: offset + slice.length });
});

// rate service (REST)
app.post('/api/rate', (req, res) => {
  const { id, rating } = req.body;
  const svc = services.find(s => s.id === id);
  if (!svc) return res.status(404).json({ error: 'service not found' });
  const r = parseInt(rating, 10);
  if (isNaN(r) || r < 1 || r > 5) return res.status(400).json({ error: 'invalid rating' });
  svc.rating.count += 1;
  svc.rating.total += r;
  io.emit('rating-updated', { id: svc.id, rating: svc.rating });
  return res.json({ ok: true, rating: svc.rating });
});

// message (REST fallback)
app.post('/api/message', (req, res) => {
  const { from, to, text } = req.body;
  if (!usernameRe.test(from) || !usernameRe.test(to)) return res.status(400).json({ error: 'invalid username' });
  if (!text || text.trim() === '') return res.status(400).json({ error: 'empty message' });
  const m = { from, to, text, time: Date.now(), read: false };
  messages.push(m);
  io.emit('message', m);
  return res.json({ ok: true, message: m });
});

// socket.io
io.on('connection', socket => {
  console.log('socket connected', socket.id);

  // send initial batch
  socket.on('join', () => socket.emit('initial-services', services.slice(0, 12)));

  socket.on('rate', ({ id, rating }) => {
    const svc = services.find(s => s.id === id);
    if (!svc) return;
    const r = parseInt(rating, 10);
    if (isNaN(r) || r < 1 || r > 5) return;
    svc.rating.count += 1;
    svc.rating.total += r;
    io.emit('rating-updated', { id: svc.id, rating: svc.rating });
  });

  socket.on('send-message', m => {
    if (!m || !m.from || !m.to || !m.text) return;
    if (!usernameRe.test(m.from) || !usernameRe.test(m.to)) return;
    const mm = { ...m, time: Date.now(), read: false };
    messages.push(mm);
    io.emit('message', mm);
  });
});

// static default
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// global error for file size
app.use((err, req, res, next) => {
  if (err && err.status === 413) return res.status(413).send('File too large');
  return next(err);
});

// start
server.listen(PORT, () => console.log('Server listening on', PORT));
