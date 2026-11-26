const DB_NAME = 'AlqaemStudentsPlannerDB';
const DB_VERSION = 1;
const STORE_ENTRIES = 'entries';
const STORE_PROFILE = 'profile';

let db;
let activeSavedCat = 'all';
let activeAddCat = 'notes';
let activeCalMode = 'daily';
let deferredInstallPrompt = null;

// 3-Second Splash Screen (#1 Zoom & Glow)
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const splash = document.getElementById('splashScreen');
    if (splash) {
      splash.classList.add('fade-out');
      setTimeout(() => splash.remove(), 450);
    }
  }, 3000);
});

// Open IndexedDB Offline Database
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE_ENTRIES)) {
        d.createObjectStore(STORE_ENTRIES, { keyPath: 'id', autoIncrement: true });
      }
      if (!d.objectStoreNames.contains(STORE_PROFILE)) {
        d.createObjectStore(STORE_PROFILE, { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
    req.onerror = (e) => reject(e);
  });
}

function saveProfileData(profile) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROFILE, 'readwrite');
    tx.objectStore(STORE_PROFILE).put({ key: 'user', ...profile });
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

function getProfileData() {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_PROFILE, 'readonly');
    const req = tx.objectStore(STORE_PROFILE).get('user');
    req.onsuccess = () => resolve(req.result || null);
  });
}

function insertEntry(entry) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ENTRIES, 'readwrite');
    tx.objectStore(STORE_ENTRIES).add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

function fetchAllEntries() {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_ENTRIES, 'readonly');
    const req = tx.objectStore(STORE_ENTRIES).getAll();
    req.onsuccess = () => resolve((req.result || []).reverse());
  });
}

function removeEntryById(id) {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_ENTRIES, 'readwrite');
    tx.objectStore(STORE_ENTRIES).delete(id);
    tx.oncomplete = () => resolve();
  });
}

// View Navigation (5 Footer Icons)
function openView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');

  document.querySelectorAll('.foot-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.target === viewId);
  });

  if (viewId === 'savedView') renderSavedList();
  if (viewId === 'calendarView') renderCalendarList();
}

document.querySelectorAll('.foot-btn').forEach(btn => {
  btn.addEventListener('click', () => openView(btn.dataset.target));
});

// Profile Load & Save
async function loadHeaderProfile() {
  const prof = await getProfileData();
  const nameEl = document.getElementById('headerPersonName');
  const picEl = document.getElementById('headerProfilePic');
  const fallbackEl = document.getElementById('headerPicFallback');
  const nameInput = document.getElementById('profileNameInput');

  if (prof) {
    if (prof.name) {
      nameEl.textContent = prof.name;
      nameInput.value = prof.name;
    }
    if (prof.picBlob) {
      const url = URL.createObjectURL(prof.picBlob);
      picEl.src = url;
      picEl.classList.remove('hidden');
      fallbackEl.classList.add('hidden');
    }
  }
}

document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const current = (await getProfileData()) || {};
  const name = document.getElementById('profileNameInput').value.trim();
  const picFile = document.getElementById('profilePicInput').files[0];

  await saveProfileData({
    name: name || current.name || 'Student Name',
    picBlob: picFile || current.picBlob || null
  });

  await loadHeaderProfile();
  alert('Profile saved!');
  openView('savedView');
});

// Add New Category Switcher
document.querySelectorAll('#addCategoryPills .pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('#addCategoryPills .pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeAddCat = pill.dataset.addcat;

    document.getElementById('linkBox').classList.toggle('hidden', activeAddCat !== 'links');
    document.getElementById('scheduleBox').classList.toggle('hidden', activeAddCat !== 'schedule');

    const mediaBox = document.getElementById('mediaBox');
    const fileInput = document.getElementById('itemFile');
    if (activeAddCat === 'images' || activeAddCat === 'videos') {
      mediaBox.classList.remove('hidden');
      fileInput.accept = activeAddCat === 'images' ? 'image/*' : 'video/*';
    } else {
      mediaBox.classList.add('hidden');
      fileInput.value = '';
    }
  });
});

// Save New Entry to Offline DB
document.getElementById('addEntryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('itemTitle').value.trim();
  const body = document.getElementById('itemBody').value.trim();
  const fileObj = document.getElementById('itemFile').files[0] || null;

  await insertEntry({
    category: activeAddCat,
    title,
    body,
    url: document.getElementById('itemUrl').value.trim(),
    calType: document.getElementById('calType').value,
    calDate: document.getElementById('calDate').value,
    calTime: document.getElementById('calTime').value,
    calDay: document.getElementById('calDay').value,
    fileBlob: fileObj,
    createdAt: Date.now()
  });

  e.target.reset();
  alert('Saved offline on your device!');
  openView('savedView');
});

// Saved Filter Pills & Search
document.querySelectorAll('#savedCategoryPills .pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('#savedCategoryPills .pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeSavedCat = pill.dataset.cat;
    renderSavedList();
  });
});

document.getElementById('searchSaved').addEventListener('input', renderSavedList);

async function renderSavedList() {
  const box = document.getElementById('savedContainer');
  const q = document.getElementById('searchSaved').value.trim().toLowerCase();
  const all = await fetchAllEntries();

  const items = all.filter(item => {
    const catOk = activeSavedCat === 'all' || item.category === activeSavedCat;
    const textOk = !q ||
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.body && item.body.toLowerCase().includes(q));
    return catOk && textOk;
  });

  if (!items.length) {
    box.innerHTML = `<div class="entry-card" style="text-align:center;color:#64748b;">No saved items found yet.</div>`;
    return;
  }

  box.innerHTML = '';
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'entry-card';

    let extra = '';
    if (item.category === 'links' && item.url) {
      extra += `<a href="${item.url}" target="_blank" rel="noopener" class="entry-link">${item.url}</a>`;
    }
    if (item.category === 'schedule') {
      extra += `<div style="font-size:0.84rem;color:#0d9488;margin-bottom:6px;">🗓️ ${item.calType.toUpperCase()} | ${item.calDay} | ${item.calDate || ''} ⏰ ${item.calTime || ''}</div>`;
    }
    if (item.fileBlob) {
      const objUrl = URL.createObjectURL(item.fileBlob);
      if (item.category === 'images') {
        extra += `<div class="entry-media"><img src="${objUrl}" alt="${item.title}" /></div>`;
      } else if (item.category === 'videos') {
        extra += `<div class="entry-media"><video src="${objUrl}" controls></video></div>`;
      }
    }

    card.innerHTML = `
      <div class="entry-top">
        <span class="entry-title">${item.title}</span>
        <span class="entry-cat">${item.category}</span>
      </div>
      ${extra}
      ${item.body ? `<div class="entry-body">${item.body}</div>` : ''}
      <div class="entry-footer-row">
        <button class="del-small" onclick="deleteSaved(${item.id})">Delete</button>
      </div>
    `;
    box.appendChild(card);
  });
}

window.deleteSaved = async (id) => {
  if (confirm('Are you sure you want to delete this item?')) {
    await removeEntryById(id);
    renderSavedList();
    renderCalendarList();
  }
};

// Calendar View (Daily, Weekly, Monthly, Annual)
document.querySelectorAll('#calModePills .pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('#calModePills .pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeCalMode = pill.dataset.cal;
    renderCalendarList();
  });
});

async function renderCalendarList() {
  const box = document.getElementById('calendarContainer');
  const all = await fetchAllEntries();
  const rows = all.filter(i => i.category === 'schedule' && i.calType === activeCalMode);

  if (!rows.length) {
    box.innerHTML = `<div class="entry-card" style="text-align:center;color:#64748b;">No timetable entries set for this view yet.</div>`;
    return;
  }

  rows.sort((a, b) => (a.calTime || '').localeCompare(b.calTime || ''));
  box.innerHTML = rows.map(r => `
    <div class="entry-card">
      <div class="entry-top">
        <span class="entry-title">⏰ ${r.calTime || '--:--'} — ${r.title}</span>
        <span class="entry-cat">${r.calDay}</span>
      </div>
      <div style="font-size:0.84rem;color:#0d9488;">Date: ${r.calDate || 'Scheduled Time'}</div>
      ${r.body ? `<div class="entry-body">${r.body}</div>` : ''}
    </div>
  `).join('');
}

// Reminder Check Every 30 Seconds
setInterval(async () => {
  if (!db) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const currentHM = `${hh}:${mm}`;

  if (now.getSeconds() < 30) {
    const all = await fetchAllEntries();
    all.filter(i => i.category === 'schedule' && i.calTime === currentHM).forEach(task => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`⏰ ${task.title}`, { body: task.body || 'It is time for your scheduled activity.' });
      }
    });
  }
}, 30000);

// Settings Actions
document.getElementById('notifPermBtn').addEventListener('click', async () => {
  if (!('Notification' in window)) return alert('Notifications are not supported in this browser.');
  const p = await Notification.requestPermission();
  alert(p === 'granted' ? 'Notifications enabled!' : 'Notification permission was not granted.');
});

document.getElementById('exportJsonBtn').addEventListener('click', async () => {
  const all = await fetchAllEntries();
  const safe = all.map(({ fileBlob, ...rest }) => rest);
  const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'alqaem-students-planner-backup.json';
  a.click();
});

document.getElementById('importJsonFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const arr = JSON.parse(ev.target.result);
    for (const item of arr) {
      delete item.id;
      await insertEntry(item);
    }
    alert('Backup restored!');
    renderSavedList();
  };
  reader.readAsText(file);
});

document.getElementById('wipeDbBtn').addEventListener('click', () => {
  if (confirm('Are you sure you want to delete all offline data?')) {
    indexedDB.deleteDatabase(DB_NAME);
    location.reload();
  }
});

// PWA Install Button
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('installAppBtn').classList.remove('hidden');
});

document.getElementById('installAppBtn').addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById('installAppBtn').classList.add('hidden');
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

openDB().then(async () => {
  await loadHeaderProfile();
  await renderSavedList();
});
