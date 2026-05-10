/* =====================================================
   Agenda+ — script.js  (Auth + Firestore por usuário)
   ===================================================== */

// ── Dados ─────────────────────────────────────────────

const SERVICES = [
  { id: 's1', icon: '💆', name: 'Massagem',         duration: '60 min' },
  { id: 's2', icon: '💇', name: 'Corte + Escova',   duration: '45 min' },
  { id: 's3', icon: '💅', name: 'Manicure',          duration: '30 min' },
  { id: 's4', icon: '🧖', name: 'Limpeza Facial',    duration: '50 min' },
  { id: 's5', icon: '🦷', name: 'Consulta Médica',   duration: '30 min' },
  { id: 's6', icon: '🏋️', name: 'Personal Trainer',  duration: '60 min' },
];

const ALL_SLOTS = [
  '08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
  '14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30',
];

const PT_MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

const PT_DAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

// ── Estado ────────────────────────────────────────────

let currentDate     = new Date();
let selectedDate    = new Date();
let selectedService = null;
let selectedSlot    = null;
let appointments    = [];
let currentUser     = null;
let db              = null;
let unsubscribe     = null; // cancela o listener anterior ao trocar de usuário

// ── Utilitários ───────────────────────────────────────

function fmt(d) {
  return [
    String(d.getDate()).padStart(2,'0'),
    String(d.getMonth()+1).padStart(2,'0'),
    d.getFullYear(),
  ].join('/');
}

function fmtKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// ══════════════════════════════════════════════════════
//  FIREBASE — INICIALIZAÇÃO
// ══════════════════════════════════════════════════════

function initFirebase() {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();

  db.enablePersistence({ synchronizeTabs: true })
    .catch(e => console.warn('Offline persistence:', e.code));

  // Observa mudanças de autenticação
  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      currentUser = user;
      showApp(user);
      startDataListener(user.uid);
    } else {
      currentUser = null;
      stopDataListener();
      showAuth();
    }
  });
}

// ── Listener de dados filtrado por usuário ────────────

function startDataListener(uid) {
  stopDataListener(); // garante que não duplica

  setDbStatus(true);

  // Cada usuário lê SOMENTE seus próprios agendamentos
  unsubscribe = db.collection('agendamentos')
    .where('uid', '==', uid)
    .orderBy('createdAt', 'desc')
    .onSnapshot(snapshot => {
      appointments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      refreshAll();
    }, err => {
      console.error('Listener error:', err);
      setDbStatus(false);
    });
}

function stopDataListener() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  appointments = [];
}

// ══════════════════════════════════════════════════════
//  AUTENTICAÇÃO
// ══════════════════════════════════════════════════════

function switchTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('form-login').style.display    = isLogin ? '' : 'none';
  document.getElementById('form-register').style.display = isLogin ? 'none' : '';
  document.getElementById('tab-login').classList.toggle('active', isLogin);
  document.getElementById('tab-register').classList.toggle('active', !isLogin);
  clearAuthErrors();
}

function clearAuthErrors() {
  document.getElementById('login-error').textContent = '';
  document.getElementById('reg-error').textContent   = '';
}

// Login com e-mail e senha
async function loginEmail() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.textContent = '';

  if (!email || !password) { errEl.textContent = 'Preencha e-mail e senha.'; return; }

  try {
    await firebase.auth().signInWithEmailAndPassword(email, password);
  } catch (e) {
    errEl.textContent = authErrorMsg(e.code);
  }
}

// Cadastro com e-mail e senha
async function registerEmail() {
  const name     = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl    = document.getElementById('reg-error');
  errEl.textContent = '';

  if (!name)               { errEl.textContent = 'Informe seu nome.';            return; }
  if (!email)              { errEl.textContent = 'Informe seu e-mail.';           return; }
  if (password.length < 6) { errEl.textContent = 'Senha mínima de 6 caracteres.'; return; }

  try {
    const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });
  } catch (e) {
    errEl.textContent = authErrorMsg(e.code);
  }
}

// Login com Google
async function loginGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await firebase.auth().signInWithPopup(provider);
  } catch (e) {
    document.getElementById('login-error').textContent = authErrorMsg(e.code);
  }
}

// Logout
async function logout() {
  await firebase.auth().signOut();
}

// Mensagens de erro amigáveis
function authErrorMsg(code) {
  const msgs = {
    'auth/user-not-found':       'Usuário não encontrado.',
    'auth/wrong-password':       'Senha incorreta.',
    'auth/email-already-in-use': 'E-mail já cadastrado.',
    'auth/invalid-email':        'E-mail inválido.',
    'auth/weak-password':        'Senha muito fraca.',
    'auth/popup-closed-by-user': 'Login cancelado.',
    'auth/invalid-credential':   'E-mail ou senha incorretos.',
  };
  return msgs[code] || 'Erro ao autenticar. Tente novamente.';
}

// ── Mostrar / ocultar telas ───────────────────────────

function showAuth() {
  document.getElementById('auth-overlay').style.display = 'flex';
  document.getElementById('app').style.display          = 'none';
}

function showApp(user) {
  document.getElementById('auth-overlay').style.display = 'none';
  document.getElementById('app').style.display          = 'grid';

  // Preenche info do usuário na sidebar
  const name   = user.displayName || user.email.split('@')[0];
  const letter = name.charAt(0).toUpperCase();
  document.getElementById('user-name').textContent   = name;
  document.getElementById('user-email').textContent  = user.email;
  document.getElementById('user-avatar').textContent = letter;

  renderMiniCal();
  renderMainDate();
  renderServices();
}

// ── Status do banco ───────────────────────────────────

function setDbStatus(online) {
  const dot   = document.getElementById('db-dot');
  const label = document.getElementById('db-label');
  dot.style.background = online ? '#2ecc71' : '#f39c12';
  label.textContent    = online ? 'Firebase conectado' : 'Modo offline';
}

// ── Atualização geral ─────────────────────────────────

function refreshAll() {
  renderMiniCal();
  renderSlots();
  renderAppointments();
  renderUpcoming();
  updateCounts();
}

// ══════════════════════════════════════════════════════
//  CALENDÁRIO
// ══════════════════════════════════════════════════════

function renderMiniCal() {
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth();

  document.getElementById('mini-month-year').textContent = `${PT_MONTHS[m]} ${y}`;

  const firstWeekday = new Date(y, m, 1).getDay();
  const daysInMonth  = new Date(y, m + 1, 0).getDate();
  const daysInPrev   = new Date(y, m, 0).getDate();
  const today        = new Date();

  let html = '', totalCells = 0;

  for (let i = firstWeekday - 1; i >= 0; i--) {
    html += `<div class="day-cell other-month">${daysInPrev - i}</div>`;
    totalCells++;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const thisDate   = new Date(y, m, d);
    const isToday    = today.getDate()===d && today.getMonth()===m && today.getFullYear()===y;
    const isSelected = selectedDate.getDate()===d && selectedDate.getMonth()===m && selectedDate.getFullYear()===y;
    const hasEvent   = appointments.some(a => a.dateKey === fmtKey(thisDate));

    let cls = 'day-cell';
    if (isToday)    cls += ' today';
    if (isSelected) cls += ' selected';
    if (hasEvent)   cls += ' has-event';

    html += `<div class="${cls}" onclick="selectDay(${y},${m},${d})">${d}</div>`;
    totalCells++;
  }

  let next = 1;
  while (totalCells % 7 !== 0) {
    html += `<div class="day-cell other-month">${next++}</div>`;
    totalCells++;
  }

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
  document.getElementById('main-date-title').textContent =
    `${PT_DAYS[d.getDay()]}, ${d.getDate()} de ${PT_MONTHS[d.getMonth()]}`;
  document.getElementById('main-date-sub').textContent =
    `${PT_MONTHS[d.getMonth()]} ${d.getFullYear()} — Selecione um horário`;
}

// ══════════════════════════════════════════════════════
//  SERVIÇOS
// ══════════════════════════════════════════════════════

function renderServices() {
  document.getElementById('services-grid').innerHTML = SERVICES.map(s => `
    <div class="service-card ${selectedService === s.id ? 'selected-service' : ''}"
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

// ══════════════════════════════════════════════════════
//  HORÁRIOS
// ══════════════════════════════════════════════════════

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

function selectSlot(t) {
  selectedSlot = t;
  renderSlots();
}

// ══════════════════════════════════════════════════════
//  CONFIRMAÇÃO
// ══════════════════════════════════════════════════════

async function confirmBooking() {
  const name  = document.getElementById('inp-name').value.trim();
  const phone = document.getElementById('inp-phone').value.trim();
  const email = document.getElementById('inp-email').value.trim();
  const obs   = document.getElementById('inp-obs').value.trim();

  if (!name)            { showToast('⚠ Informe o nome do cliente.');  return; }
  if (!selectedSlot)    { showToast('⚠ Selecione um horário.');        return; }
  if (!selectedService) { showToast('⚠ Selecione um serviço.');        return; }

  const svc  = SERVICES.find(s => s.id === selectedService);
  const btn  = document.querySelector('.btn-confirm');
  btn.disabled    = true;
  btn.textContent = 'Salvando...';

  try {
    await db.collection('agendamentos').add({
      uid:         currentUser.uid,   // ← chave de isolamento por usuário
      name, phone, email, obs,
      time:        selectedSlot,
      serviceName: svc.name,
      serviceId:   selectedService,
      dateKey:     fmtKey(selectedDate),
      year:        selectedDate.getFullYear(),
      month:       selectedDate.getMonth(),
      day:         selectedDate.getDate(),
      createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
    });

    ['inp-name','inp-phone','inp-email','inp-obs'].forEach(id => {
      document.getElementById(id).value = '';
    });
    selectedSlot = null;
    showToast('✓ Agendamento confirmado!');
  } catch (e) {
    console.error(e);
    showToast('❌ Erro ao salvar. Tente novamente.');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Confirmar Agendamento';
  }
}

// ══════════════════════════════════════════════════════
//  LISTA DE AGENDAMENTOS
// ══════════════════════════════════════════════════════

function renderAppointments() {
  const dateKey = fmtKey(selectedDate);
  const list    = appointments
    .filter(a => a.dateKey === dateKey)
    .sort((a, b) => a.time.localeCompare(b.time));

  document.getElementById('appts-label').textContent = `Agendamentos — ${fmt(selectedDate)}`;

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
    <div class="appt-card" id="appt-${a.id}">
      <div class="appt-time-badge">${a.time}</div>
      <div class="appt-info">
        <div class="appt-name">${a.name}</div>
        <div class="appt-service">${a.serviceName} · ${a.phone || '—'}</div>
      </div>
      <span class="appt-status status-confirmed">Confirmado</span>
      <button class="btn-cancel-appt" onclick="cancelAppt('${a.id}')">Cancelar</button>
    </div>
  `).join('');
}

async function cancelAppt(id) {
  try {
    await db.collection('agendamentos').doc(id).delete();
    showToast('Agendamento cancelado.');
  } catch (e) {
    console.error(e);
    showToast('❌ Erro ao cancelar.');
  }
}

// ══════════════════════════════════════════════════════
//  SIDEBAR — PRÓXIMOS
// ══════════════════════════════════════════════════════

function renderUpcoming() {
  const now = new Date();
  const upcoming = appointments
    .filter(a => {
      const [h, m] = a.time.split(':').map(Number);
      return new Date(a.year, a.month, a.day, h, m) >= now;
    })
    .sort((a, b) => {
      const da = new Date(a.year, a.month, a.day, ...a.time.split(':').map(Number));
      const db = new Date(b.year, b.month, b.day, ...b.time.split(':').map(Number));
      return da - db;
    })
    .slice(0, 4);

  document.getElementById('upcoming-list').innerHTML = upcoming.length
    ? upcoming.map(a => `
        <div class="upcoming-item">
          <div class="upcoming-dot"></div>
          <div class="upcoming-info">
            <div class="upcoming-title">${a.name}</div>
            <div class="upcoming-time">
              ${a.serviceName} · ${String(a.day).padStart(2,'0')}/${String(a.month+1).padStart(2,'0')} às ${a.time}
            </div>
          </div>
        </div>`).join('')
    : `<div style="font-size:0.75rem;color:rgba(255,255,255,0.3)">Sem agendamentos futuros.</div>`;
}

// ══════════════════════════════════════════════════════
//  CONTADORES
// ══════════════════════════════════════════════════════

function updateCounts() {
  const today     = new Date();
  const todayKey  = fmtKey(today);
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
  const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);

  document.getElementById('count-today').textContent =
    appointments.filter(a => a.dateKey === todayKey).length;
  document.getElementById('count-week').textContent =
    appointments.filter(a => {
      const d = new Date(a.year, a.month, a.day);
      return d >= weekStart && d <= weekEnd;
    }).length;
  document.getElementById('count-total').textContent = appointments.length;
}

// ══════════════════════════════════════════════════════
//  TOAST / AUX
// ══════════════════════════════════════════════════════

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function scrollToForm() {
  document.getElementById('booking-form').scrollIntoView({ behavior: 'smooth' });
}

// ── Inicialização ─────────────────────────────────────

document.addEventListener('DOMContentLoaded', initFirebase);