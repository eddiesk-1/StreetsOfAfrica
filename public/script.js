const socket = io();
let currentUser = localStorage.getItem('username') || '';
let unreadMessages = 0;
let services = [];
let displayedServices = [];
let isLoading = false;

const categoryColors = {
  Food: 'green', Crafts: 'blue', Services: 'orange', Fashion: 'purple',
  Technology: 'red', Education: 'yellow', Health: 'pink', Agriculture: 'brown'
};

function registerUser() {
  if (!currentUser || !/^[a-zA-Z0-9_]+@[0-9]{10}$/.test(currentUser)) {
    currentUser = prompt('Enter your username (e.g., user@0123456789)', 'user@0123456789');
    while (!/^[a-zA-Z0-9_]+@[0-9]{10}$/.test(currentUser)) {
      currentUser = prompt('Invalid username. Try again.', 'user@0123456789');
    }
    localStorage.setItem('username', currentUser);
  }
  socket.emit('registerUser', currentUser);
}

async function apiCall(url, method = 'GET', body = null) {
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (body instanceof FormData) {
    options.body = body;
    delete options.headers['Content-Type'];
  } else if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(res.statusText);
  return res.status === 204 ? null : res.json();
}

async function fetchServices() {
  try {
    services = await apiCall('/api/services');
    displayedServices = [...services];
    console.log('Initial services:', services.length);
    renderServices();
    setupInfiniteScroll();
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

function setupSocketListeners() {
  socket.on('serviceAdded', service => {
    services.push(service);
    displayedServices = [...services];
    console.log('Service added:', service.title);
    renderServices();
  });
  socket.on('serviceUpdated', updated => {
    const index = services.findIndex(s => s.id === updated.id);
    if (index !== -1) services[index] = updated;
    displayedServices = [...services];
    renderServices();
  });
  socket.on('serviceRemoved', id => {
    services = services.filter(s => s.id !== id);
    displayedServices = [...services];
    renderServices();
  });
  socket.on('newMessage', msg => {
    if (msg.to === currentUser && document.getElementById('msg-form').style.display !== 'block') {
      unreadMessages++;
      document.getElementById('msg-notification').style.display = 'block';
      document.getElementById('msg-notification').innerText = unreadMessages;
    }
    if ((msg.to === currentUser || msg.from === currentUser) && document.getElementById('msg-form').style.display === 'block') {
      loadMessages();
    }
  });
  socket.on('userStatus', ({username, status}) => {
    if (document.getElementById('msg-to').value === username) {
      document.getElementById('msg-status').innerText = `${username} is ${status}`;
    }
  });
}

function toggleBg() {
  const bg = document.getElementById('background');
  const show = bg.style.display === 'none';
  bg.style.display = show ? 'block' : 'none';
  bg.style.backgroundImage = show ? 'url(/background.jpg)' : '';
}

function showPopup(id) {
  document.getElementById(id).style.display = 'block';
}
function closePopup(id) {
  document.getElementById(id).style.display = 'none';
}

async function postService() {
  const username = document.getElementById('post-username').value;
  const title = document.getElementById('post-title').value;
  const desc = document.getElementById('post-desc').value;
  const category = document.getElementById('post-category').value;
  const price = document.getElementById('post-price').value;
  const file = document.getElementById('post-file').files[0];
  if (!/^[a-zA-Z0-9_]+@[0-9]{10}$/.test(username) || !title || !category) {
    return alert('Invalid or missing required fields');
  }
  if (file && file.size > 10 * 1024 * 1024) {
    return alert('File too large! Max size is 10MB.');
  }
  const formData = new FormData();
  formData.append('username', username);
  formData.append('title', title);
  formData.append('description', desc);
  formData.append('category', category);
  formData.append('price', price);
  if (file) formData.append('file', file);
  try {
    await apiCall('/api/service', 'POST', formData);
    closePopup('post-form');
    document.getElementById('post-title').value = '';
    document.getElementById('post-desc').value = '';
    document.getElementById('post-category').value = '';
    document.getElementById('post-price').value = '';
    document.getElementById('post-file').value = '';
  } catch (err) {
    alert('Error posting: ' + err.message);
  }
}

async function sendMessage() {
  const to = document.getElementById('msg-to').value;
  const content = document.getElementById('msg-content').value;
  if (!/^[a-zA-Z0-9_]+@[0-9]{10}$/.test(to) || !content) {
    return alert('Invalid or missing fields');
  }
  try {
    await apiCall('/api/message', 'POST', { from: currentUser, to, content });
    document.getElementById('msg-content').value = '';
    loadMessages();
  } catch (err) {
    alert('Error sending: ' + err.message);
  }
}

async function loadMessages() {
  const to = document.getElementById('msg-to').value;
  if (!to) {
    document.getElementById('message-list').innerHTML = '';
    document.getElementById('msg-status').innerText = '';
    return;
  }
  try {
    const data = await apiCall(`/api/messages/${currentUser}`);
    const conv = data[to] || [];
    document.getElementById('message-list').innerHTML = conv
      .map(m => `<p>${m.from}: ${m.content} (${new Date(m.timestamp).toLocaleString()})</p>`)
      .join('');
    const { status } = await apiCall(`/api/status/${to}`);
    document.getElementById('msg-status').innerText = `${to} is ${status}`;
  } catch (err) {}
}

async function saveProfile() {
  const newUser = document.getElementById('profile-username').value;
  if (!/^[a-zA-Z0-9_]+@[0-9]{10}$/.test(newUser)) {
    return alert('Invalid username');
  }
  currentUser = newUser;
  localStorage.setItem('username', currentUser);
  socket.emit('registerUser', currentUser);
  alert('Profile updated');
  loadPostedServices();
  renderServices();
}

function loadPostedServices() {
  document.getElementById('posted-services').innerHTML = services
    .filter(s => s.username === currentUser)
    .map(s => `<div>${s.title} <span class="remove-btn" onclick="removeService('${s.id}')">X</span></div>`)
    .join('');
}

async function removeService(id) {
  if (!confirm('Remove this service?')) return;
  try {
    await apiCall(`/api/service/${id}`, 'DELETE', { username: currentUser });
    loadPostedServices();
  } catch (err) {
    alert('Error removing: ' + err.message);
  }
}

function renderServices() {
  const container = document.getElementById('service-container');
  container.innerHTML = '<div id="sentinel"></div>';
  const query = document.getElementById('search-input').value.toLowerCase();
  const filteredServices = query ? displayedServices.filter(s => s.title.toLowerCase().includes(query)) : displayedServices;
  console.log('Rendering services:', filteredServices.length);
  let row;
  filteredServices.forEach((s, index) => {
    if (index % 5 === 0) {
      row = document.createElement('div');
      row.className = 'grid-row';
      container.insertBefore(row, document.getElementById('sentinel'));
    }
    const avgRating = s.ratings.length ? (s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length) : 0;
    const size = 80 + (avgRating * 4);
    const circle = document.createElement('div');
    circle.className = 'service-circle';
    circle.style.width = `${size}px`;
    circle.style.height = `${size}px`;
    circle.style.backgroundColor = categoryColors[s.category] || 'gray';
    let preview = '';
    if (s.file) {
      if (s.file.match(/\.(jpe?g|png)$/i)) {
        preview = `<img class="circle-preview" src="${s.file}" alt="Preview">`;
      } else if (s.file.match(/\.(mp4|webm|ogg)$/i)) {
        preview = `<img class="circle-preview" src="https://via.placeholder.com/80?text=Video" alt="Video Preview">`;
      } else if (s.file.match(/\.(mp3|wav)$/i)) {
        preview = `<img class="circle-preview" src="https://via.placeholder.com/80?text=Audio" alt="Audio Preview">`;
      } else if (s.file.match(/\.(pdf|doc|docx)$/i)) {
        preview = `<img class="circle-preview" src="https://via.placeholder.com/80?text=Doc" alt="Document Preview">`;
      }
    }
    const isOwner = s.username === currentUser;
    circle.innerHTML = `
      ${preview}
      <div class="circle-content">
        <h3>${s.title}</h3>
        <p>Rating: ${avgRating.toFixed(1)}/5</p>
        ${isOwner ? `<span class="remove-btn" onclick="event.stopPropagation(); removeService('${s.id}')">X</span>` : ''}
      </div>
    `;
    circle.onclick = e => {
      if (e.target.className === 'remove-btn' || e.target.className === 'close-btn-expanded' || e.target.id === 'msg-to-provider') return;
      if (circle.classList.contains('expanded')) return;
      document.querySelectorAll('.service-circle.expanded').forEach(c => {
        if (c !== circle) c.querySelector('.close-btn-expanded')?.click();
      });
      circle.classList.add('expanded');
      let detailsPreview = '';
      if (s.file) {
        if (s.file.match(/\.(jpe?g|png)$/i)) {
          detailsPreview = `<img src="${s.file}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 5px;">`;
        } else if (s.file.match(/\.(mp4|webm|ogg)$/i)) {
          detailsPreview = `<img src="https://via.placeholder.com/50?text=Video" style="width: 50px; height: 50px; border-radius: 5px;">`;
        } else if (s.file.match(/\.(mp3|wav)$/i)) {
          detailsPreview = `<img src="https://via.placeholder.com/50?text=Audio" style="width: 50px; height: 50px; border-radius: 5px;">`;
        } else if (s.file.match(/\.(pdf|doc|docx)$/i)) {
          detailsPreview = `<img src="https://via.placeholder.com/50?text=Doc" style="width: 50px; height: 50px; border-radius: 5px;">`;
        }
      }
      circle.innerHTML = `
        <span class="close-btn-expanded" onclick="event.stopPropagation(); this.parentElement.classList.remove('expanded'); renderServices()">X</span>
        <div class="media-container">
          ${s.file && s.file.match(/\.(jpe?g|png)$/i) ? `<img src="${s.file}" alt="File">` : ''}
          ${s.file && s.file.match(/\.(mp4|webm|ogg)$/i) ? `<video controls src="${s.file}"></video>` : ''}
          ${s.file && s.file.match(/\.(mp3|wav)$/i) ? `<audio controls src="${s.file}"></audio>` : ''}
          ${s.file && s.file.match(/\.(pdf|doc|docx)$/i) ? `<a href="${s.file}" target="_blank">View Document</a>` : ''}
        </div>
        <div class="content-container">
          <h3>${s.title}</h3>
          <details>
            <summary>Details</summary>
            <div class="details-content">
              ${detailsPreview}
              <p>Title: ${s.title}</p>
              <p>Description: ${s.description || 'N/A'}</p>
              <p>Price: ${s.price || 'N/A'}</p>
              <p>Rating: ${avgRating.toFixed(1)}/5</p>
            </div>
          </details>
          <select id="rate-${s.id}">
            <option value="0">Rate</option>
            <option value="1">💔</option>
            <option value="2">😞</option>
            <option value="3">😎</option>
            <option value="4">😁</option>
            <option value="5">😍</option>
          </select>
          <button onclick="event.stopPropagation(); rateService('${s.id}')">Submit Rating</button>
          <textarea id="msg-to-provider" placeholder="Message to provider..."></textarea>
          <button onclick="event.stopPropagation(); sendToProvider('${s.username}')">Send</button>
          ${isOwner ? `<span class="remove-btn" onclick="event.stopPropagation(); removeService('${s.id}')">X</span>` : ''}
        </div>
      `;
    };
    row.appendChild(circle);
  });
}

async function rateService(id) {
  const select = document.getElementById(`rate-${id}`);
  const rating = parseInt(select.value);
  if (!rating || rating < 1 || rating > 5) {
    return alert('Select a rating');
  }
  try {
    await apiCall('/api/rate', 'POST', { id, rating });
    select.value = '0';
    renderServices();
  } catch (err) {
    alert('Error rating: ' + err.message);
  }
}

async function sendToProvider(to) {
  const content = document.getElementById('msg-to-provider').value;
  if (!content) return alert('Enter a message');
  try {
    await apiCall('/api/message', 'POST', { from: currentUser, to, content });
    document.getElementById('msg-to-provider').value = '';
  } catch (err) {
    alert('Error sending: ' + err.message);
  }
}

function setupSearch() {
  document.getElementById('search-input').addEventListener('input', () => {
    displayedServices = [...services];
    renderServices();
  });
}

function setupInfiniteScroll() {
  if (!services.length) {
    console.log('No services to scroll—post some!');
    return;
  }
  const sentinel = document.getElementById('sentinel');
  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && !isLoading) {
      console.log('Sentinel visible, appending services');
      isLoading = true;
      displayedServices.push(...services);
      renderServices();
      isLoading = false;
    }
  }, { root: null, threshold: 0.1 });
  observer.observe(sentinel);
}

function init() {
  registerUser();
  fetchServices();
  setupSocketListeners();
  document.getElementById('post-icon').onclick = () => {
    document.getElementById('post-username').value = currentUser;
    showPopup('post-form');
  };
  document.getElementById('profile-icon').onclick = () => {
    showPopup('profile-form');
    document.getElementById('profile-username').value = currentUser;
    loadPostedServices();
  };
  document.getElementById('msg-icon').onclick = () => {
    showPopup('msg-form');
    unreadMessages = 0;
    document.getElementById('msg-notification').style.display = 'none';
    document.getElementById('msg-notification').innerText = '0';
    loadMessages();
  };
  document.getElementById('settings-toggle').onclick = toggleBg;
  setupSearch();
}

init(); 
