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
    { id: 's5', icon: '👦', name: 'Corte Infantil',   duration: '20 min' },
  ],
};

const CAT_EMOJI = { salao:'💇', estetica:'🧖', manicure:'💅', barbearia:'✂️' };
const CAT_LABEL = { salao:'Salão', estetica:'Estética', manicure:'Manicure', barbearia:'Barbearia' };

const PT_MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const PT_DAYS   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

const CATEGORY_KEYS = new Set(['todos', ...Object.keys(CAT_LABEL)]);
const TIME_SLOT_KEYS = new Set(ALL_SLOTS);

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function isSafeFirestoreId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function safeCategory(value) {
  return CATEGORY_KEYS.has(value) ? value : 'salao';
}

function setupEventHandlers() {
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    if (action === 'switch-tab') switchTab(target.dataset.tab);
    if (action === 'login-email') loginEmail();
    if (action === 'login-google') loginGoogle();
    if (action === 'register-email') registerEmail();
    if (action === 'logout') logout();
    if (action === 'change-month') changeMonth(Number(target.dataset.dir));
    if (action === 'create-estab') createEstab();
    if (action === 'filter-category') filterCategory(target.dataset.category, target);
    if (action === 'open-booking') openBooking(target.dataset.id);
    if (action === 'go-home') goHome();
    if (action === 'scroll-to-form') scrollToForm();
    if (action === 'select-day') selectDay(Number(target.dataset.year), Number(target.dataset.month), Number(target.dataset.day));
    if (action === 'select-service') selectService(target.dataset.id);
    if (action === 'select-slot') selectSlot(target.dataset.time);
    if (action === 'confirm-booking') confirmBooking();
    if (action === 'cancel-appt') cancelAppt(target.dataset.id);
    if (action === 'admin-cancel-appt') adminCancelAppt(target.dataset.id);
    if (action === 'clear-date-filter') clearDateFilter();
  });

  document.addEventListener('keydown', event => {
    if ((event.key !== 'Enter' && event.key !== ' ') || !event.target.matches('[data-action="select-service"]')) return;
    event.preventDefault();
    selectService(event.target.dataset.id);
  });

  document.getElementById('search-input').addEventListener('input', filterEstabs);
  document.getElementById('inp-phone').addEventListener('input', event => {
    event.target.value = event.target.value.replace(/[^0-9()\s-]/g, '');
  });
  document.getElementById('admin-estab-select').addEventListener('change', loadAdminData);
  document.getElementById('admin-date-filter').addEventListener('change', renderAdminList);
}

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
  if (!['login', 'register'].includes(tab)) return;
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
    grid.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Nenhum estabelecimento encontrado.';
    grid.appendChild(empty);
    return;
  }
  grid.innerHTML = list.map(e => {
    const categoria = safeCategory(e.categoria);
    const id = isSafeFirestoreId(e.id) ? e.id : '';
    return `
    <button type="button" class="estab-card" data-action="open-booking" data-id="${escapeHTML(id)}">
      <div class="estab-card-emoji">${escapeHTML(CAT_EMOJI[categoria] || '💇')}</div>
      <div class="estab-card-info">
        <div class="estab-card-name">${escapeHTML(e.nome)}</div>
        <div class="estab-card-cat">${escapeHTML(CAT_LABEL[categoria] || categoria)}</div>
        <div class="estab-card-addr"><i class="ti ti-map-pin"></i> ${escapeHTML(e.endereco || 'Endereço não informado')}</div>
      </div>
      <i class="ti ti-chevron-right" style="color:var(--muted)"></i>
    </button>
  `}).join('');
}

function filterEstabs() {
  const q = document.getElementById('search-input').value.toLowerCase();
  let filtered = allEstabs.filter(e =>
    String(e.nome || '').toLowerCase().includes(q) || String(e.endereco || '').toLowerCase().includes(q)
  );
  if (activeCategory !== 'todos') filtered = filtered.filter(e => e.categoria === activeCategory);
  renderEstabs(filtered);
}

function filterCategory(cat, btn) {
  if (!CATEGORY_KEYS.has(cat)) return;
  activeCategory = cat;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  filterEstabs();
}

// ══════════════════════════════════════════════════════
//  TELA AGENDAMENTO — CLIENTE
// ══════════════════════════════════════════════════════

async function openBooking(estabId) {
  if (!isSafeFirestoreId(estabId)) return;
  const snap   = await db.collection('estabelecimentos').doc(estabId).get();
  if (!snap.exists) { showToast('Estabelecimento não encontrado.'); return; }
  currentEstab = { id: estabId, ...snap.data() };
  currentEstab.categoria = safeCategory(currentEstab.categoria);

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
    html += `<button type="button" class="${cls}" data-action="select-day" data-year="${y}" data-month="${m}" data-day="${d}">${d}</button>`; cells++;
  }
  let next = 1;
  while (cells % 7 !== 0) { html += `<div class="day-cell other-month">${next++}</div>`; cells++; }
  document.getElementById('mini-days').innerHTML = html;
}

function changeMonth(dir) {
  if (![1, -1].includes(dir)) return;
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + dir, 1);
  renderMiniCal();
}

function selectDay(y, m, d) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return;
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
         data-action="select-service" data-id="${escapeHTML(s.id)}" role="button" tabindex="0">
      <div class="service-icon">${escapeHTML(s.icon)}</div>
      <div class="service-name">${escapeHTML(s.name)}</div>
      <div class="service-duration">${escapeHTML(s.duration)}</div>
    </div>
  `).join('');
}

function selectService(id) {
  const services = SERVICES_BY_CAT[currentEstab?.categoria] || SERVICES_BY_CAT.salao;
  if (!services.some(s => s.id === id)) return;
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
    const action = isBooked ? '' : `data-action="select-slot" data-time="${escapeHTML(t)}"`;
    return `<button type="button" class="${cls}" ${action}>${escapeHTML(t)}</button>`;
  }).join('');
}

function selectSlot(t) {
  if (!TIME_SLOT_KEYS.has(t)) return;
  selectedSlot = t;
  renderSlots();
}

// ── Confirmação ───────────────────────────────────────

async function confirmBooking() {
  const name  = document.getElementById('inp-name').value.trim();
  const phone = document.getElementById('inp-phone').value.trim();
  const email = document.getElementById('inp-email').value.trim();
  const obs   = document.getElementById('inp-obs').value.trim();

  if (!name)            { showToast('⚠ Informe seu nome.');     return; }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('⚠ Informe um e-mail válido.'); return; }
  if (!selectedService) { showToast('⚠ Selecione um serviço.'); return; }
  if (!selectedSlot)    { showToast('⚠ Selecione um horário.'); return; }

  const services = SERVICES_BY_CAT[currentEstab.categoria] || SERVICES_BY_CAT.salao;
  const svc      = services.find(s => s.id === selectedService);
  if (!svc || !TIME_SLOT_KEYS.has(selectedSlot) || !isSafeFirestoreId(currentEstab.id)) {
    showToast('⚠ Dados do agendamento inválidos.');
    return;
  }
  const [slotHour, slotMinute] = selectedSlot.split(':').map(Number);
  const selectedDateTime = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), slotHour, slotMinute);
  if (selectedDateTime < new Date()) { showToast('⚠ Escolha um horário futuro.'); return; }

  const btn      = document.querySelector('.btn-confirm');
  btn.disabled = true; btn.textContent = 'Salvando...';

  try {
    const bookingId = [
      currentEstab.id,
      fmtKey(selectedDate).replace(/-/g, ''),
      selectedSlot.replace(':', ''),
    ].join('_');
    const bookingRef = db.collection('agendamentos').doc(bookingId);

    await db.runTransaction(async transaction => {
      const existing = await transaction.get(bookingRef);
      if (existing.exists) {
        const err = new Error('slot-unavailable');
        err.code = 'slot-unavailable';
        throw err;
      }
      transaction.set(bookingRef, {
        uid:                 currentUser.uid,
        clienteName:         name.slice(0, 120),
        clienteEmail:        currentUser.email || email,
        clientePhone:        phone.slice(0, 20),
        obs:                 obs.slice(0, 500),
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
    });


    document.getElementById('inp-phone').value = '';
    document.getElementById('inp-obs').value   = '';
    selectedSlot = null;
    showToast('✓ Agendamento confirmado!');
  } catch(e) {
    console.error(e);
    showToast(e.code === 'slot-unavailable' ? '⚠ Este horário acabou de ser reservado.' : '❌ Erro ao salvar. Tente novamente.');
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

  container.innerHTML = list.map(a => isSafeFirestoreId(a.id) ? `
    <div class="appt-card">
      <div class="appt-time-badge">${escapeHTML(a.time)}</div>
      <div class="appt-info">
        <div class="appt-name">${escapeHTML(a.clienteName)}</div>
        <div class="appt-service">${escapeHTML(a.serviceName)} · ${escapeHTML(a.clientePhone || '—')}</div>
      </div>
      <span class="appt-status status-confirmed">Confirmado</span>
      <button type="button" class="btn-cancel-appt" data-action="cancel-appt" data-id="${escapeHTML(a.id)}">Cancelar</button>
    </div>
  ` : '').join('');
}

async function cancelAppt(id) {
  if (!isSafeFirestoreId(id)) return;
  try {
    const ref = db.collection('agendamentos').doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.data().uid !== currentUser.uid) {
      showToast('Você não pode cancelar este agendamento.');
      return;
    }
    await ref.delete();
    showToast('Agendamento cancelado.');
  }
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
            <div class="upcoming-title">${escapeHTML(a.serviceName)}</div>
            <div class="upcoming-time">
              ${escapeHTML(String(a.day).padStart(2,'0'))}/${escapeHTML(String(a.month+1).padStart(2,'0'))} às ${escapeHTML(a.time)}
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

  container.innerHTML = list.map(a => isSafeFirestoreId(a.id) ? `
    <div class="appt-card admin-appt-card">
      <div class="appt-time-badge">${escapeHTML(String(a.day).padStart(2,'0'))}/${escapeHTML(String(a.month+1).padStart(2,'0'))}<br>${escapeHTML(a.time)}</div>
      <div class="appt-info">
        <div class="appt-name">${escapeHTML(a.clienteName)}</div>
        <div class="appt-service">${escapeHTML(a.serviceName)} · ${escapeHTML(a.clientePhone || '—')}</div>
        <div class="appt-email">${escapeHTML(a.clienteEmail || '')}</div>
      </div>
      <span class="appt-status status-confirmed">Confirmado</span>
      <button type="button" class="btn-cancel-appt" data-action="admin-cancel-appt" data-id="${escapeHTML(a.id)}">Cancelar</button>
    </div>
  ` : '').join('');
}

function clearDateFilter() {
  document.getElementById('admin-date-filter').value = '';
  renderAdminList();
}

async function adminCancelAppt(id) {
  if (!isSafeFirestoreId(id)) return;
  if (!confirm('Cancelar este agendamento?')) return;
  try {
    const ref = db.collection('agendamentos').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return;
    const appt = snap.data();
    const allowed = userRole === 'superadmin' || appt.estabelecimentoId === adminEstabId;
    if (!allowed) {
      showToast('Você não pode cancelar este agendamento.');
      return;
    }
    await ref.delete();
    showToast('Agendamento cancelado.');
  }
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) { showToast('⚠ E-mail do admin inválido.'); return; }
  if (!CATEGORY_KEYS.has(categoria) || categoria === 'todos') { showToast('⚠ Categoria inválida.'); return; }

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

document.addEventListener('DOMContentLoaded', () => {
  setupEventHandlers();
  initFirebase();
});
