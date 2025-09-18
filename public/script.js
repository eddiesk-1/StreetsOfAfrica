// client script (details-based layout)
const socket = io();
const gridArea = document.getElementById('gridArea');
const sentinel = document.getElementById('sentinel');
const search = document.getElementById('search');
const msgBadge = document.getElementById('msgBadge');

let services = [];
let offset = 0;
const limit = 12;
let unread = 0;
let currentUser = null;

// emoji mapping (1..5)
const ratingEmoji = ['','💔','😢','😐','😊','😍'];

// ask user for username once
setTimeout(()=> {
  const u = prompt('Enter username (format name@0123456789) — used for messaging and owner checks', '') || '';
  if (u && /^[a-zA-Z0-9_]+@[0-9]{10}$/.test(u)) currentUser = u;
  else currentUser = null;
}, 300);

// load initial
async function loadMore(){
  try {
    const res = await fetch(`/api/services?offset=${offset}&limit=${limit}`);
    const j = await res.json();
    offset = j.offset || offset + (j.services||[]).length;
    appendServices(j.services || []);
  } catch(e){ console.error('loadMore', e); }
}

function appendServices(list){
  if (!list || !list.length) return;
  services = services.concat(list);
  renderServices();
}

function renderServices(){
  gridArea.innerHTML = '';
  // group into rows: alternate 2 then 3
  let i=0, rowIdx=0;
  while (i < services.length){
    const cols = (rowIdx %2 === 0)? 2: 3;
    // wrap row in container (we still use details per service)
    const row = document.createElement('div');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    row.style.gap = '10px';
    for (let c=0;c<cols && i<services.length;c++,i++){
      const s = services[i];
      const details = document.createElement('details');
      details.className = 'svcDetails';
      details.dataset.id = s.id;

      // summary (compact)
      const summary = document.createElement('summary');
      summary.className = 'svcSummary';
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      if (s.mimetype && s.mimetype.startsWith('image')) {
        const img = document.createElement('img');
        img.src = '/' + s.filename;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        thumb.appendChild(img);
      } else {
        thumb.textContent = s.mimetype && s.mimetype.startsWith('video') ? '▶ Video' : '📄';
      }
      const md = document.createElement('div');
      md.innerHTML = `<h3>${escapeHtml(s.title)}</h3><div class="meta">${escapeHtml(s.username)} · ${s.price || ''}</div>`;
      summary.appendChild(thumb);
      summary.appendChild(md);

      // expanded content
      const content = document.createElement('div');
      content.className = 'svcContent';

      const mediaCol = document.createElement('div'); mediaCol.className='mediaCol';
      if (s.mimetype.startsWith('image')) mediaCol.innerHTML = `<img src="/${s.filename}" alt="">`;
      else if (s.mimetype.startsWith('video')) mediaCol.innerHTML = `<video src="/${s.filename}" controls></video>`;
      else if (s.mimetype.startsWith('audio')) mediaCol.innerHTML = `<audio src="/${s.filename}" controls></audio>`;
      else mediaCol.innerHTML = `<a href="/${s.filename}" target="_blank">Open Document</a>`;

      const contentCol = document.createElement('div'); contentCol.className='contentCol';
      contentCol.innerHTML = `
        <h3>${escapeHtml(s.title)}</h3>
        <details>
          <summary>Details</summary>
          <div class="detailsPreview">
            <img class="previewImg" src="${s.mimetype.startsWith('image')? '/'+s.filename : '/logo.jpg'}" alt="preview">
            <div>
              <div><strong>${escapeHtml(s.title)}</strong></div>
              <div>${escapeHtml(s.desc || '')}</div>
              <div>Price: ${escapeHtml(s.price || '—')}</div>
              <div>Rating: ${s.rating.count ? (s.rating.total/s.rating.count).toFixed(1) : 'No rating'}</div>
            </div>
          </div>
        </details>

        <div style="margin-top:8px">
          <label>Rate:</label>
          <select class="rateSelect">
            <option value="1">💔</option>
            <option value="2">😢</option>
            <option value="3">😐</option>
            <option value="4">😊</option>
            <option value="5">😍</option>
          </select>
          <button class="rateBtn">Rate</button>
        </div>

        <div style="margin-top:8px">
          <label>Message owner:</label>
          <textarea class="msgInput" placeholder="Type a message..."></textarea>
          <button class="msgBtn">Send</button>
        </div>

        <div style="margin-top:8px">
          <button class="removeBtn" style="display:none;background:#f66;color:#fff;padding:6px;border:none;border-radius:6px">Remove</button>
        </div>
      `;

      content.appendChild(mediaCol);
      content.appendChild(contentCol);

      details.appendChild(summary);
      details.appendChild(content);

      // events for rate, message, remove
      setTimeout(()=>{ // attach after DOM inserted
        const rateBtn = details.querySelector('.rateBtn');
        rateBtn.onclick = () => {
          const v = details.querySelector('.rateSelect').value;
          socket.emit('rate', { id: s.id, rating: v });
        };
        const msgBtn = details.querySelector('.msgBtn');
        msgBtn.onclick = () => {
          const text = details.querySelector('.msgInput').value.trim();
          if (!currentUser) return alert('Set your username first (format name@0123456789)');
          if (!text) return alert('Type a message');
          socket.emit('send-message', { from: currentUser, to: s.username, text });
          details.querySelector('.msgInput').value = '';
        };
        const removeBtn = details.querySelector('.removeBtn');
        if (currentUser && currentUser === s.username) {
          removeBtn.style.display = 'inline-block';
          removeBtn.onclick = async () => {
            await fetch('/api/delete', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: s.id })});
            services = services.filter(x=>x.id!==s.id);
            renderServices();
          };
        }
      }, 10);

      // append to row
      row.appendChild(details);
    }
    gridArea.appendChild(row);
    rowIdx++;
  }
}

// simple escape
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

// socket events
socket.on('initial-services', list => {
  services = list.slice();
  offset = services.length;
  renderServices();
  console.log('Initial services', services.length);
});
socket.on('new-service', svc => { services.unshift(svc); renderServices(); });
socket.on('rating-updated', ({ id, rating }) => {
  const s = services.find(x=>x.id===id);
  if (s) s.rating = rating;
  renderServices();
});
socket.on('message', m => {
  if (currentUser && m.to === currentUser) {
    unread++;
    msgBadge.innerText = unread;
    alert(`Message from ${m.from}: ${m.text}`);
  }
});
socket.emit('join');

// search behavior
search.addEventListener('input', () => {
  const q = search.value.trim().toLowerCase();
  if (!q) { renderServices(); return; }
  const filtered = services.filter(s => (s.title||'').toLowerCase().includes(q));
  // temporary render filtered
  const backup = services;
  services = filtered;
  renderServices();
  services = backup;
});

// upload modal controls
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
    const res = await fetch('/api/upload', { method:'POST', body: fd });
    if (!res.ok) {
      if (res.status === 413) alert('Server: file too large');
      else {
        const j = await res.json().catch(()=>null);
        alert('Upload failed: ' + (j && j.error ? j.error : res.status));
      }
      return;
    }
    const j = await res.json();
    services.unshift(j.service);
    renderServices();
    form.reset();
    document.getElementById('postModal').classList.add('hidden');
  } catch(err){ console.error(err); alert('Upload error'); }
});

// infinite scroll sentinel
const observer = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting) {
    console.log('Sentinel visible');
    loadMore();
  }
});
observer.observe(sentinel);

// initial load (if socket didn't send)
loadMore();
