// script.js - client behavior
const socket = io();
const gridArea = document.getElementById('gridArea');
const sentinel = document.getElementById('sentinel');
const search = document.getElementById('search');
const msgBadge = document.getElementById('msgBadge');

let services = [];
let offset = 0;
let limit = 12;
let unread = 0;
let currentUser = null;

// util emoji map
const ratingEmoji = ['','💔','😢','😐','😊','😍'];

// --- fetch initial ---
async function loadMore() {
  try {
    const res = await fetch(`/api/services?offset=${offset}&limit=${limit}`);
    const data = await res.json();
    offset = data.offset || offset + (data.services||[]).length;
    appendServices(data.services || []);
    console.log('Rendering services');
  } catch (e) { console.error('loadMore', e); }
}

// append services in rows with alternating 2/3 columns
function appendServices(newList) {
  if (!newList || !newList.length) return;
  // push and render simply (we group by rows in rowsOf)
  services = services.concat(newList);
  renderServices();
}

function renderServices() {
  // create row groups: group services by rows of 2 (row 0), 3 (row1), 2,3...
  gridArea.innerHTML = '';
  let i = 0;
  let rowIndex = 0;
  while (i < services.length) {
    const cols = (rowIndex % 2 === 0) ? 2 : 3;
    const row = document.createElement('div');
    row.className = 'row';
    row.style.display = 'grid';
    row.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    row.style.gap = '10px';
    for (let c=0;c<cols && i < services.length; c++, i++){
      const s = services[i];
      const card = document.createElement('div');
      card.className = 'svcCard';
      card.innerHTML = `
        ${s.mimetype && s.mimetype.startsWith('image') ? `<img src="/${s.filename}" alt="${s.title}">` : `<div style="height:120px;display:flex;align-items:center;justify-content:center;background:#f0f0f0;border-radius:8px"> ${s.mimetype && s.mimetype.startsWith('video') ? '▶ Video' : '📄 File'}</div>`}
        <h3 style="font-size:14px;margin:8px 0 4px">${s.title}</h3>
        <div style="font-size:12px;color:#555">${s.username}</div>
        <div style="margin-top:6px">${s.rating.count ? ( (s.rating.total/s.rating.count).toFixed(1) ) : 'No rating'}</div>
      `;
      card.onclick = () => openExpanded(s);
      row.appendChild(card);
    }
    gridArea.appendChild(row);
    rowIndex++;
  }
}

// expanded view
function openExpanded(svc) {
  const expanded = document.getElementById('expanded');
  expanded.classList.remove('hidden');
  const expMedia = document.getElementById('expMedia');
  const expContent = document.getElementById('expContent');

  // media left
  if (svc.mimetype.startsWith('image')) {
    expMedia.innerHTML = `<img src="/${svc.filename}" alt="${svc.title}">`;
  } else if (svc.mimetype.startsWith('video')) {
    expMedia.innerHTML = `<video src="/${svc.filename}" controls style="width:100%"></video>`;
  } else if (svc.mimetype.startsWith('audio')) {
    expMedia.innerHTML = `<audio src="/${svc.filename}" controls></audio>`;
  } else {
    expMedia.innerHTML = `<a href="/${svc.filename}" target="_blank">Open Document</a>`;
  }

  // content right
  expContent.innerHTML = `
    <h2>${svc.title}</h2>
    <details>
      <summary>Details</summary>
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
        <img class="preview" src="${svc.mimetype.startsWith('image')? '/'+svc.filename : '/logo.jpg'}" alt="preview">
        <div>
          <div><strong>${svc.title}</strong></div>
          <div>${svc.desc || ''}</div>
          <div>Price: ${svc.price || '—'}</div>
          <div>Rating: ${svc.rating.count ? (svc.rating.total/svc.rating.count).toFixed(1) : 'No rating'}</div>
        </div>
      </div>
    </details>
    <div style="margin-top:8px">
      <select id="rateSelect">
        <option value="1">💔</option>
        <option value="2">😢</option>
        <option value="3">😐</option>
        <option value="4">😊</option>
        <option value="5">😍</option>
      </select>
      <button id="sendRate">Rate</button>
    </div>
    <div style="margin-top:10px">
      <textarea id="msgTxt" placeholder="Message the owner..." style="width:100%;height:60px"></textarea>
      <button id="sendMsgBtn">Send</button>
    </div>
    <div style="margin-top:6px">
      <button id="removeBtn" style="display:none;background:#f66;color:#fff;padding:6px;border:none;border-radius:6px">Remove</button>
      <button id="closeExp" style="margin-left:6px">Close</button>
    </div>
  `;

  // handlers
  document.getElementById('sendRate').onclick = () => {
    const v = document.getElementById('rateSelect').value;
    socket.emit('rate', { id: svc.id, rating: v });
  };
  document.getElementById('sendMsgBtn').onclick = () => {
    const text = document.getElementById('msgTxt').value.trim();
    if (!currentUser) {
      alert('Set your username first (format: name@0123456789)');
      return;
    }
    socket.emit('send-message', { from: currentUser, to: svc.username, text });
    document.getElementById('msgTxt').value = '';
  };

  // remove button visible only to owner (simple check)
  const removeBtn = document.getElementById('removeBtn');
  if (currentUser && currentUser === svc.username) {
    removeBtn.style.display = 'inline-block';
    removeBtn.onclick = async () => {
      // simple in-memory removal via POST (not secured)
      await fetch(`/api/delete`, { method: 'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: svc.id }) });
      // update local
      services = services.filter(s => s.id !== svc.id);
      renderServices();
      document.getElementById('expanded').classList.add('hidden');
    };
  } else {
    removeBtn.style.display = 'none';
  }

  document.getElementById('closeExp').onclick = () => document.getElementById('expanded').classList.add('hidden');
}

// message/unread logic
socket.on('message', m => {
  // increment unread if message is to me
  if (!currentUser) return;
  if (m.to === currentUser) {
    unread++;
    msgBadge.innerText = unread;
    // quick alert
    try { navigator.vibrate && navigator.vibrate(100); } catch(e){}
    alert(`New message from ${m.from}: ${m.text}`);
  }
});

// rating updates
socket.on('rating-updated', ({ id, rating }) => {
  const s = services.find(x => x.id === id);
  if (s) s.rating = rating;
  renderServices();
});

// new service push
socket.on('new-service', svc => {
  services.unshift(svc);
  renderServices();
});

// initial join
socket.emit('join');

// infinite scroll sentinel
const ioObserver = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting) {
    console.log('Sentinel visible');
    loadMore();
  }
});
ioObserver.observe(sentinel);

// search filter
search.addEventListener('input', () => {
  const q = search.value.toLowerCase();
  const filtered = services.filter(s => s.title.toLowerCase().includes(q));
  // render filtered quickly
  const store = services;
  services = filtered;
  renderServices();
  services = store;
});

// upload flow (open modal)
document.getElementById('postBtn').onclick = () => document.getElementById('postModal').classList.remove('hidden');
document.getElementById('closePost').onclick = () => document.getElementById('postModal').classList.add('hidden');

document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const file = form.file.files[0];
  if (!file) return alert('Choose a file');
  if (file.size > 10 * 1024 * 1024) return alert('File too large (max 10MB)');
  const fd = new FormData(form);
  try {
    const r = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!r.ok) {
      if (r.status === 413) alert('Server: file too large');
      else {
        const j = await r.json().catch(()=>null);
        alert('Upload failed: ' + (j && j.error ? j.error : r.status));
      }
      return;
    }
    const j = await r.json();
    services.unshift(j.service);
    renderServices();
    form.reset();
    document.getElementById('postModal').classList.add('hidden');
  } catch (err) {
    alert('Upload error');
    console.error(err);
  }
});

// PWA service worker registration
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(()=>{});
}

// prompt for username once
setTimeout(() => {
  const u = prompt('Enter your username (format name@0123456789) — this is used for messages/rating', '') || '';
  if (u && /^[a-zA-Z0-9_]+@[0-9]{10}$/.test(u)) currentUser = u;
  else currentUser = null;
}, 500);

// load initial services
loadMore();
