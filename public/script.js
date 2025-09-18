const socket = io();
const grid = document.getElementById('grid');
const sentinel = document.getElementById('sentinel');
const search = document.getElementById('search');
const expanded = document.getElementById('expanded');

let allServices = [];
let offset = 0;

function renderServices(arr) {
  console.log("Rendering services");
  arr.forEach((svc, i) => {
    const div = document.createElement('div');
    div.className = 'item';
    div.textContent = svc.title;
    div.onclick = () => openExpanded(svc);
    grid.appendChild(div);
  });
}

function openExpanded(svc) {
  expanded.classList.remove('hidden');
  expanded.querySelector('.media-container').innerHTML = getMedia(svc);
  expanded.querySelector('.content-container').innerHTML = `
    <h2>${svc.title}</h2>
    <details><summary>Details</summary>
      <p>${svc.desc}</p>
      <p>Price: ${svc.price}</p>
    </details>
    <select id="rateSelect">
      <option value="1">💔</option>
      <option value="2">😢</option>
      <option value="3">😐</option>
      <option value="4">😊</option>
      <option value="5">😍</option>
    </select>
    <textarea id="msgTxt"></textarea>
    <button id="sendMsg">Send</button>
  `;
  document.getElementById('sendMsg').onclick = () => {
    const msg = document.getElementById('msgTxt').value;
    socket.emit('send-message', { from: "test@1234567890", to: svc.username, msg });
  };
  document.getElementById('rateSelect').onchange = e => {
    socket.emit('rate', { id: svc.id, rating: e.target.value });
  };
}

function getMedia(svc) {
  if (svc.mimetype.startsWith('image')) return `<img src='${svc.filename}' width='100%'>`;
  if (svc.mimetype.startsWith('video')) return `<video src='${svc.filename}' controls width='100%'></video>`;
  if (svc.mimetype.startsWith('audio')) return `<audio src='${svc.filename}' controls></audio>`;
  return `<a href='${svc.filename}' target='_blank'>Download</a>`;
}

socket.on('initial-services', svcs => { allServices = svcs; renderServices(svcs); });
socket.on('new-service', svc => { allServices.unshift(svc); renderServices([svc]); });
socket.on('rating-updated', data => console.log("Rating updated", data));
socket.on('message', m => console.log("Message", m));

const observer = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting) {
    console.log("Sentinel visible");
    fetch(`/api/services?offset=${offset}`).then(r => r.json()).then(d => {
      offset = d.offset;
      renderServices(d.services);
    });
  }
});
observer.observe(sentinel);

search.oninput = () => {
  grid.innerHTML = '';
  const f = allServices.filter(s => s.title.toLowerCase().includes(search.value.toLowerCase()));
  renderServices(f);
};
 
