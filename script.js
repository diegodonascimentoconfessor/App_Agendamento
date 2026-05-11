/* =====================================================
   Agenda+ — script.js
   Design original + multi-estabelecimento + admin
   ===================================================== */

// ── Dados ─────────────────────────────────────────────

const ALL_SLOTS = [
  '08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
  '14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30',
];

const SERVICES_BY_CAT = {
  salao:     [
    { id: 's1', icon: '💇', name: 'Corte Feminino',  duration: '60 min' },
    { id: 's2', icon: '💆', name: 'Escova',           duration: '45 min' },
    { id: 's3', icon: '🎨', name: 'Coloração',        duration: '120 min' },
    { id: 's4', icon: '✨', name: 'Hidratação',       duration: '60 min' },
  ],
  estetica:  [
    { id: 's1', icon: '🧖', name: 'Limpeza Facial',   duration: '50 min' },
    { id: 's2', icon: '💆', name: 'Massagem',          duration: '60 min' },
    { id: 's3', icon: '🌿', name: 'Peeling',           duration: '45 min' },
    { id: 's4', icon: '💎', name: 'Drenagem',          duration: '60 min' },
  ],
  manicure:  [
    { id: 's1', icon: '💅', name: 'Manicure',          duration: '30 min' },
    { id: 's2', icon: '🦶', name: 'Pedicure',          duration: '40 min' },
    { id: 's3', icon: '✨', name: 'Gel',               duration: '60 min' },
    { id: 's4', icon: '🎨', name: 'Nail Art',          duration: '45 min' },
  ],
  barbearia: [
    { id: 's1', icon: '✂️', name: 'Corte Masculino',  duration: '30 min' },
    { id: 's2', icon: '🪒', name: 'Barba',             duration: '20 min' },
    { id: 's3', icon: '✂️', name: 'Corte + Barba',    duration: '45 min' },
    { id: 's4', icon: '💆', name: 'Pigmentação',       duration: '30 min' },
  ],
};

const CAT_EMOJI = { salao:'💇', estetica:'🧖', manicure:'💅', barbearia:'✂️' };
const CAT_LABEL = { salao:'Salão', estetica:'Estética', manicure:'Manicure', barbearia:'Barbearia' };

const PT_MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const PT_DAYS   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

// ── Estado ────────────────────────────────────────────

let db              = null;
let currentUser     = null;
let userRole        = null;   // 'superadmin' | 'admin' | 'client'
let adminEstabId    = null;
let unsubscribe     = null;

let currentEstab    = null;
let selectedDate    = new Date();
let currentDate     = new Date();
let selectedService = null;
let selectedSlot    = null;
let appointments    = [];
let allEstabs       = [];
let activeCategory  = 'todos';

// ── Utilitários ───────────────────────────────────────

function fmt(d) {
  return [String(d.getDate()).padStart(2,'0'),
          String(d.getMonth()+1).padStart(2,'0'),
          d.getFullYear()].join('/');
}

function fmtKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// ══════════════════════════════════════════════════════
//  FIREBASE
// ══════════════════════════════════════════════════════

function initFirebase() {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

  firebase.auth().onAuthStateChanged(async user => {
    if (user) {
      currentUser = user;
      setDbStatus(true);
      await resolveRole(user);
    } else {
      currentUser = null;
      userRole    = null;
      document.getElementById('auth-overlay').style.display = 'flex';
      document.getElementById('app').style.display          = 'none';
    }
  });
}

async function resolveRole(user) {
  const adminDoc = await db.collection('admins').doc(user.email).get();

  // Preenche info do usuário na sidebar
  const name = user.displayName || user.email.split('@')[0];
  document.getElementById('user-name').textContent   = name;
  document.getElementById('user-email').textContent  = user.email;
  document.getElementById('user-avatar').textContent = name.charAt(0).toUpperCase();

  document.getElementById('auth-overlay').style.display = 'none';
  document.getElementById('app').style.display          = 'grid';

  if (adminDoc.exists) {
    const data   = adminDoc.data();
    userRole     = data.role;
    adminEstabId = data.estabelecimentoId || null;
    showAdminScreen(user, data);
  } else {
    userRole = 'client';
    showClientHome(user);
  }
}

function stopListener() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
}

// ══════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════

function switchTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('form-login').style.display    = isLogin ? '' : 'none';
  document.getElementById('form-register').style.display = isLogin ? 'none' : '';
  document.getElementById('tab-login').classList.toggle('active', isLogin);
  document.getElementById('tab-register').classList.toggle('active', !isLogin);
  document.getElementById('login-error').textContent = '';
  document.getElementById('reg-error').textContent   = '';
}

async function loginEmail() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.textContent = '';
  if (!email || !password) { errEl.textContent = 'Preencha e-mail e senha.'; return; }
  try { await firebase.auth().signInWithEmailAndPassword(email, password); }
  catch(e) { errEl.textContent = authMsg(e.code); }
}

async function registerEmail() {
  const name     = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl    = document.getElementById('reg-error');
  errEl.textContent = '';
  if (!name)               { errEl.textContent = 'Informe seu nome.'; return; }
  if (!email)              { errEl.textContent = 'Informe seu e-mail.'; return; }
  if (password.length < 6) { errEl.textContent = 'Senha mínima de 6 caracteres.'; return; }
  try {
    const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });
  } catch(e) { errEl.textContent = authMsg(e.code); }
}

async function loginGoogle() {
  try { await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
  catch(e) { document.getElementById('login-error').textContent = authMsg(e.code); }
}

async function logout() {
  stopListener();
  await firebase.auth().signOut();
}

function authMsg(code) {
  const m = {
    'auth/user-not-found':       'Usuário não encontrado.',
    'auth/wrong-password':       'Senha incorreta.',
    'auth/email-already-in-use': 'E-mail já cadastrado.',
    'auth/invalid-email':        'E-mail inválido.',
    'auth/weak-password':        'Senha muito fraca.',
    'auth/popup-closed-by-user': 'Login cancelado.',
    'auth/invalid-credential':   'E-mail ou senha incorretos.',
  };
  return m[code] || 'Erro ao autenticar. Tente novamente.';
}

// ══════════════════════════════════════════════════════
//  NAVEGAÇÃO DE TELAS (dentro do main)
// ══════════════════════════════════════════════════════

function showMainScreen(id) {
  ['screen-home','screen-booking','screen-admin'].forEach(s => {
    document.getElementById(s).style.display = s === id ? '' : 'none';
  });
}

// ══════════════════════════════════════════════════════
//  TELA HOME — CLIENTE (lista de estabelecimentos)
// ══════════════════════════════════════════════════════

async function showClientHome(user) {
  // Sidebar: mostra calendário, esconde painel admin
  document.getElementById('sidebar-client').style.display = '';
  document.getElementById('sidebar-admin').style.display  = 'none';

  const name = user.displayName || user.email.split('@')[0];
  document.getElementById('home-greeting').textContent = `Olá, ${name.split(' ')[0]}!`;

  showMainScreen('screen-home');
  renderMiniCal();
  await loadEstabs();
}

async function loadEstabs() {
  const grid = document.getElementById('estabs-grid');
  grid.innerHTML = '<div class="loading-state"><i class="ti ti-loader-2"></i> Carregando...</div>';
  const snap = await db.collection('estabelecimentos').where('ativo','==',true).get();
  allEstabs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderEstabs(allEstabs);
}

function renderEstabs(list) {
  const grid = document.getElementById('estabs-grid');
  if (!list.length) {
    grid.innerHTML = '<div class="empty-state">Nenhum estabelecimento encontrado.</div>';
    return;
  }
  grid.innerHTML = list.map(e => `
    <div class="estab-card" onclick="openBooking('${e.id}')">
      <div class="estab-card-emoji">${CAT_EMOJI[e.categoria] || '💇'}</div>
      <div class="estab-card-info">
        <div class="estab-card-name">${e.nome}</div>
        <div class="estab-card-cat">${CAT_LABEL[e.categoria] || e.categoria}</div>
        <div class="estab-card-addr"><i class="ti ti-map-pin"></i> ${e.endereco || 'Endereço não informado'}</div>
      </div>
      <i class="ti ti-chevron-right" style="color:var(--muted)"></i>
    </div>
  `).join('');
}

function filterEstabs() {
  const q = document.getElementById('search-input').value.toLowerCase();
  let filtered = allEstabs.filter(e =>
    e.nome.toLowerCase().includes(q) || (e.endereco||'').toLowerCase().includes(q)
  );
  if (activeCategory !== 'todos') filtered = filtered.filter(e => e.categoria === activeCategory);
  renderEstabs(filtered);
}

function filterCategory(cat, btn) {
  activeCategory = cat;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  filterEstabs();
}

// ══════════════════════════════════════════════════════
//  TELA AGENDAMENTO — CLIENTE
// ══════════════════════════════════════════════════════

async function openBooking(estabId) {
  const snap   = await db.collection('estabelecimentos').doc(estabId).get();
  currentEstab = { id: estabId, ...snap.data() };

  selectedDate    = new Date();
  currentDate     = new Date();
  selectedService = null;
  selectedSlot    = null;

  document.getElementById('booking-estab-title').textContent = currentEstab.nome;
  document.getElementById('main-date-sub').textContent =
    `${CAT_LABEL[currentEstab.categoria] || ''} — Selecione um horário`;

  // Pré-preenche nome e email do cliente logado
  const name = currentUser.displayName || '';
  if (name) document.getElementById('inp-name').value  = name;
  document.getElementById('inp-email').value = currentUser.email || '';

  showMainScreen('screen-booking');
  renderServices();
  renderMiniCal();
  renderMainDate();
  startBookingListener(estabId);
}

function startBookingListener(estabId) {
  stopListener();
  unsubscribe = db.collection('agendamentos')
    .where('estabelecimentoId','==', estabId)
    .onSnapshot(snap => {
      appointments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderSlots();
      renderAppointments();
      renderUpcoming();
      updateCounts();
    });
}

function goHome() {
  stopListener();
  currentEstab    = null;
  selectedService = null;
  selectedSlot    = null;
  appointments    = [];
  showMainScreen('screen-home');
}

// ── Sidebar calendário ────────────────────────────────

function renderMiniCal() {
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth();
  document.getElementById('mini-month-year').textContent = `${PT_MONTHS[m]} ${y}`;

  const firstWeekday = new Date(y, m, 1).getDay();
  const daysInMonth  = new Date(y, m+1, 0).getDate();
  const daysInPrev   = new Date(y, m, 0).getDate();
  const todayD       = new Date();

  let html = '', cells = 0;
  for (let i = firstWeekday - 1; i >= 0; i--) {
    html += `<div class="day-cell other-month">${daysInPrev - i}</div>`; cells++;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const thisDate   = new Date(y, m, d);
    const isToday    = todayD.getDate()===d && todayD.getMonth()===m && todayD.getFullYear()===y;
    const isSelected = selectedDate.getDate()===d && selectedDate.getMonth()===m && selectedDate.getFullYear()===y;
    const hasEvent   = appointments.some(a => a.dateKey === fmtKey(thisDate));
    let cls = 'day-cell';
    if (isToday)    cls += ' today';
    if (isSelected) cls += ' selected';
    if (hasEvent)   cls += ' has-event';
    html += `<div class="${cls}" onclick="selectDay(${y},${m},${d})">${d}</div>`; cells++;
  }
  let next = 1;
  while (cells % 7 !== 0) { html += `<div class="day-cell other-month">${next++}</div>`; cells++; }
  document.getElementById('mini-days').innerHTML = html;
}

function changeMonth(dir) {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + dir, 1);
  renderMiniCal();
}

function selectDay(y, m, d) {
  selectedDate = new Date(y, m, d);
  currentDate  = new Date(y, m, 1);
  selectedSlot = null;
  renderMiniCal();
  renderMainDate();
  renderSlots();
  renderAppointments();
}

function renderMainDate() {
  const d = selectedDate;
  document.getElementById('booking-estab-title').textContent = currentEstab ? currentEstab.nome : '';
  document.getElementById('main-date-sub').textContent =
    `${PT_DAYS[d.getDay()]}, ${d.getDate()} de ${PT_MONTHS[d.getMonth()]}`;
}

// ── Serviços ──────────────────────────────────────────

function renderServices() {
  const services = SERVICES_BY_CAT[currentEstab.categoria] || SERVICES_BY_CAT.salao;
  document.getElementById('services-grid').innerHTML = services.map(s => `
    <div class="service-card ${selectedService===s.id ? 'selected-service' : ''}"
         onclick="selectService('${s.id}')">
      <div class="service-icon">${s.icon}</div>
      <div class="service-name">${s.name}</div>
      <div class="service-duration">${s.duration}</div>
    </div>
  `).join('');
}

function selectService(id) {
  selectedService = id;
  selectedSlot    = null;
  renderServices();
  renderSlots();
}

// ── Horários ──────────────────────────────────────────

function renderSlots() {
  const dateKey = fmtKey(selectedDate);
  const booked  = appointments.filter(a => a.dateKey === dateKey).map(a => a.time);
  document.getElementById('time-slots').innerHTML = ALL_SLOTS.map(t => {
    const isBooked = booked.includes(t);
    const isSel    = selectedSlot === t;
    let cls = 'slot';
    if (isBooked)   cls += ' booked';
    else if (isSel) cls += ' selected-slot';
    const click = isBooked ? '' : `onclick="selectSlot('${t}')"`;
    return `<div class="${cls}" ${click}>${t}</div>`;
  }).join('');
}

function selectSlot(t) { selectedSlot = t; renderSlots(); }

// ── Confirmação ───────────────────────────────────────

async function confirmBooking() {
  const name  = document.getElementById('inp-name').value.trim();
  const phone = document.getElementById('inp-phone').value.trim();
  const email = document.getElementById('inp-email').value.trim();
  const obs   = document.getElementById('inp-obs').value.trim();

  if (!name)            { showToast('⚠ Informe seu nome.');     return; }
  if (!selectedService) { showToast('⚠ Selecione um serviço.'); return; }
  if (!selectedSlot)    { showToast('⚠ Selecione um horário.'); return; }

  const services = SERVICES_BY_CAT[currentEstab.categoria] || SERVICES_BY_CAT.salao;
  const svc      = services.find(s => s.id === selectedService);
  const btn      = document.querySelector('.btn-confirm');
  btn.disabled = true; btn.textContent = 'Salvando...';

  try {
    await db.collection('agendamentos').add({
      uid:                 currentUser.uid,
      clienteName:         name,
      clienteEmail:        email,
      clientePhone:        phone,
      obs,
      time:                selectedSlot,
      serviceName:         svc.name,
      serviceId:           selectedService,
      dateKey:             fmtKey(selectedDate),
      year:                selectedDate.getFullYear(),
      month:               selectedDate.getMonth(),
      day:                 selectedDate.getDate(),
      estabelecimentoId:   currentEstab.id,
      estabelecimentoNome: currentEstab.nome,
      status:              'confirmado',
      createdAt:           firebase.firestore.FieldValue.serverTimestamp(),
    });
    document.getElementById('inp-phone').value = '';
    document.getElementById('inp-obs').value   = '';
    selectedSlot = null;
    showToast('✓ Agendamento confirmado!');
  } catch(e) {
    console.error(e);
    showToast('❌ Erro ao salvar. Tente novamente.');
  } finally {
    btn.disabled = false; btn.textContent = 'Confirmar Agendamento';
  }
}

// ── Lista de agendamentos do dia ──────────────────────

function renderAppointments() {
  const dateKey = fmtKey(selectedDate);
  const list    = appointments
    .filter(a => a.dateKey === dateKey && a.uid === currentUser.uid)
    .sort((a,b) => a.time.localeCompare(b.time));

  document.getElementById('appts-label').textContent = `Meus agendamentos — ${fmt(selectedDate)}`;
  const container = document.getElementById('appointments-list');

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="ti ti-calendar-off" style="font-size:2rem;display:block;margin-bottom:8px;opacity:0.35"></i>
        Nenhum agendamento neste dia.
      </div>`;
    return;
  }

  container.innerHTML = list.map(a => `
    <div class="appt-card">
      <div class="appt-time-badge">${a.time}</div>
      <div class="appt-info">
        <div class="appt-name">${a.clienteName}</div>
        <div class="appt-service">${a.serviceName} · ${a.clientePhone || '—'}</div>
      </div>
      <span class="appt-status status-confirmed">Confirmado</span>
      <button class="btn-cancel-appt" onclick="cancelAppt('${a.id}')">Cancelar</button>
    </div>
  `).join('');
}

async function cancelAppt(id) {
  try { await db.collection('agendamentos').doc(id).delete(); showToast('Agendamento cancelado.'); }
  catch(e) { showToast('❌ Erro ao cancelar.'); }
}

// ── Próximos (sidebar) ────────────────────────────────

function renderUpcoming() {
  if (userRole !== 'client') return;
  const now = new Date();
  const upcoming = appointments
    .filter(a => {
      if (a.uid !== currentUser.uid) return false;
      const [h, m] = a.time.split(':').map(Number);
      return new Date(a.year, a.month, a.day, h, m) >= now;
    })
    .sort((a,b) => {
      const da = new Date(a.year, a.month, a.day, ...a.time.split(':').map(Number));
      const db = new Date(b.year, b.month, b.day, ...b.time.split(':').map(Number));
      return da - db;
    })
    .slice(0,4);

  document.getElementById('upcoming-list').innerHTML = upcoming.length
    ? upcoming.map(a => `
        <div class="upcoming-item">
          <div class="upcoming-dot"></div>
          <div class="upcoming-info">
            <div class="upcoming-title">${a.serviceName}</div>
            <div class="upcoming-time">
              ${String(a.day).padStart(2,'0')}/${String(a.month+1).padStart(2,'0')} às ${a.time}
            </div>
          </div>
        </div>`).join('')
    : `<div style="font-size:0.75rem;color:rgba(255,255,255,0.3)">Sem agendamentos futuros.</div>`;
}

// ── Contadores ────────────────────────────────────────

function updateCounts() {
  const todayD    = new Date();
  const todayKey  = fmtKey(todayD);
  const weekStart = new Date(todayD); weekStart.setDate(todayD.getDate() - todayD.getDay());
  const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  const mine      = appointments.filter(a => a.uid === currentUser.uid);

  document.getElementById('count-today').textContent =
    mine.filter(a => a.dateKey === todayKey).length;
  document.getElementById('count-week').textContent =
    mine.filter(a => { const d=new Date(a.year,a.month,a.day); return d>=weekStart&&d<=weekEnd; }).length;
  document.getElementById('count-total').textContent = mine.length;
}

// ══════════════════════════════════════════════════════
//  PAINEL ADMIN
// ══════════════════════════════════════════════════════

async function showAdminScreen(user, adminData) {
  // Sidebar: mostra painel admin, esconde calendário
  document.getElementById('sidebar-client').style.display = 'none';
  document.getElementById('sidebar-admin').style.display  = '';

  const estabNome = adminData.estabelecimentoNome || 'Admin';
  document.getElementById('admin-estab-name-sidebar').textContent = estabNome;
  document.getElementById('admin-title').textContent    = `Painel — ${estabNome}`;
  document.getElementById('admin-subtitle').textContent = 'Todos os agendamentos';

  if (userRole === 'superadmin') {
    document.getElementById('superadmin-sidebar').style.display    = '';
    document.getElementById('admin-estab-select').style.display    = '';
    await loadEstabsForSelect();
  }

  // Define data padrão como hoje
  document.getElementById('admin-date-filter').value = new Date().toISOString().split('T')[0];

  showMainScreen('screen-admin');
  await loadAdminData();
}

async function loadEstabsForSelect() {
  const snap   = await db.collection('estabelecimentos').get();
  const select = document.getElementById('admin-estab-select');
  snap.docs.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = d.data().nome;
    select.appendChild(opt);
  });
}

async function loadAdminData() {
  stopListener();

  let estabId = adminEstabId;

  if (userRole === 'superadmin') {
    estabId = document.getElementById('admin-estab-select').value;
    if (!estabId) { document.getElementById('admin-appointments-list').innerHTML = ''; return; }
  }

  unsubscribe = db.collection('agendamentos')
    .where('estabelecimentoId','==', estabId)
    .onSnapshot(snap => {
      appointments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAdminList();
      updateAdminCounts();
    });
}

function renderAdminList() {
  const filterDate = document.getElementById('admin-date-filter').value;
  let list = [...appointments];

  if (filterDate) {
    const [fy,fm,fd] = filterDate.split('-').map(Number);
    list = list.filter(a => a.year===fy && a.month===(fm-1) && a.day===fd);
  }

  list.sort((a,b) => a.time.localeCompare(b.time));

  const container = document.getElementById('admin-appointments-list');
  if (!list.length) {
    container.innerHTML = '<div class="empty-state">Nenhum agendamento nesta data.</div>';
    return;
  }

  container.innerHTML = list.map(a => `
    <div class="appt-card admin-appt-card">
      <div class="appt-time-badge">${String(a.day).padStart(2,'0')}/${String(a.month+1).padStart(2,'0')}<br>${a.time}</div>
      <div class="appt-info">
        <div class="appt-name">${a.clienteName}</div>
        <div class="appt-service">${a.serviceName} · ${a.clientePhone || '—'}</div>
        <div class="appt-email">${a.clienteEmail || ''}</div>
      </div>
      <span class="appt-status status-confirmed">Confirmado</span>
      <button class="btn-cancel-appt" onclick="adminCancelAppt('${a.id}')">Cancelar</button>
    </div>
  `).join('');
}

function clearDateFilter() {
  document.getElementById('admin-date-filter').value = '';
  renderAdminList();
}

async function adminCancelAppt(id) {
  if (!confirm('Cancelar este agendamento?')) return;
  try { await db.collection('agendamentos').doc(id).delete(); showToast('Agendamento cancelado.'); }
  catch(e) { showToast('❌ Erro ao cancelar.'); }
}

function updateAdminCounts() {
  const todayD    = new Date();
  const todayKey  = fmtKey(todayD);
  const weekStart = new Date(todayD); weekStart.setDate(todayD.getDate() - todayD.getDay());
  const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);

  document.getElementById('adm-today').textContent =
    appointments.filter(a => a.dateKey === todayKey).length;
  document.getElementById('adm-week').textContent =
    appointments.filter(a => { const d=new Date(a.year,a.month,a.day); return d>=weekStart&&d<=weekEnd; }).length;
  document.getElementById('adm-total').textContent = appointments.length;
}

// ── Cadastrar estabelecimento (super admin) ───────────

async function createEstab() {
  const nome       = document.getElementById('new-estab-name').value.trim();
  const categoria  = document.getElementById('new-estab-cat').value;
  const endereco   = document.getElementById('new-estab-addr').value.trim();
  const adminEmail = document.getElementById('new-estab-admin-email').value.trim();

  if (!nome || !adminEmail) { showToast('⚠ Preencha nome e e-mail do admin.'); return; }

  try {
    const ref = await db.collection('estabelecimentos').add({
      nome, categoria, endereco, ativo: true,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('admins').doc(adminEmail).set({
      role: 'admin',
      estabelecimentoId:   ref.id,
      estabelecimentoNome: nome,
      email: adminEmail,
    });
    ['new-estab-name','new-estab-addr','new-estab-admin-email'].forEach(id => {
      document.getElementById(id).value = '';
    });
    showToast(`✓ "${nome}" cadastrado!`);
    await loadEstabsForSelect();
  } catch(e) {
    console.error(e);
    showToast('❌ Erro ao cadastrar.');
  }
}

// ══════════════════════════════════════════════════════
//  STATUS DB / TOAST / AUX
// ══════════════════════════════════════════════════════

function setDbStatus(online) {
  document.getElementById('db-dot').style.background = online ? '#2ecc71' : '#f39c12';
  document.getElementById('db-label').textContent    = online ? 'Firebase conectado' : 'Modo offline';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function scrollToForm() {
  document.getElementById('booking-form').scrollIntoView({ behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', initFirebase);