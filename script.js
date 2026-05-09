/* =====================================================
   Agenda+ — script.js
   ===================================================== */

// ── Dados ─────────────────────────────────────────────

const SERVICES = [
  { id: 's1', icon: '💆', name: 'Massagem',       duration: '60 min' },
  { id: 's2', icon: '💇', name: 'Corte + Escova', duration: '45 min' },
  { id: 's3', icon: '💅', name: 'Manicure',       duration: '30 min' },
  { id: 's4', icon: '🧖', name: 'Limpeza Facial', duration: '50 min' },
  { id: 's5', icon: '🦷', name: 'Consulta Médica',duration: '30 min' },
  { id: 's6', icon: '🏋️', name: 'Personal Trainer',duration: '60 min' },
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

// ── Utilitários ───────────────────────────────────────

/**
 * Formata uma data como "DD/MM/AAAA".
 * @param {Date} d
 * @returns {string}
 */
function fmt(d) {
  return [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    d.getFullYear(),
  ].join('/');
}

/**
 * Chave única de um dia: "AAAA-MM-DD".
 * @param {Date} d
 * @returns {string}
 */
function fmtKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// ── Mini Calendário ───────────────────────────────────

function renderMiniCal() {
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth();

  document.getElementById('mini-month-year').textContent = `${PT_MONTHS[m]} ${y}`;

  const firstWeekday  = new Date(y, m, 1).getDay();
  const daysInMonth   = new Date(y, m + 1, 0).getDate();
  const daysInPrev    = new Date(y, m, 0).getDate();
  const today         = new Date();

  let html        = '';
  let totalCells  = 0;

  // Dias do mês anterior
  for (let i = firstWeekday - 1; i >= 0; i--) {
    html += `<div class="day-cell other-month">${daysInPrev - i}</div>`;
    totalCells++;
  }

  // Dias do mês atual
  for (let d = 1; d <= daysInMonth; d++) {
    const thisDate   = new Date(y, m, d);
    const isToday    = today.getDate() === d && today.getMonth() === m && today.getFullYear() === y;
    const isSelected = selectedDate.getDate() === d && selectedDate.getMonth() === m && selectedDate.getFullYear() === y;
    const hasEvent   = appointments.some(a => a.dateKey === fmtKey(thisDate));

    let cls = 'day-cell';
    if (isToday)    cls += ' today';
    if (isSelected) cls += ' selected';
    if (hasEvent)   cls += ' has-event';

    html += `<div class="${cls}" onclick="selectDay(${y},${m},${d})">${d}</div>`;
    totalCells++;
  }

  // Completar última linha
  let next = 1;
  while (totalCells % 7 !== 0) {
    html += `<div class="day-cell other-month">${next++}</div>`;
    totalCells++;
  }

  document.getElementById('mini-days').innerHTML = html;
}

/**
 * Avança ou retrocede o mês exibido no mini calendário.
 * @param {number} dir  +1 próximo / -1 anterior
 */
function changeMonth(dir) {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + dir, 1);
  renderMiniCal();
}

/**
 * Seleciona um dia no calendário.
 */
function selectDay(y, m, d) {
  selectedDate  = new Date(y, m, d);
  currentDate   = new Date(y, m, 1);
  selectedSlot  = null;

  renderMiniCal();
  renderMainDate();
  renderSlots();
  renderAppointments();
}

// ── Área Principal ────────────────────────────────────

function renderMainDate() {
  const d = selectedDate;
  document.getElementById('main-date-title').textContent =
    `${PT_DAYS[d.getDay()]}, ${d.getDate()} de ${PT_MONTHS[d.getMonth()]}`;
  document.getElementById('main-date-sub').textContent =
    `${PT_MONTHS[d.getMonth()]} ${d.getFullYear()} — Selecione um horário`;
}

// ── Serviços ──────────────────────────────────────────

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

// ── Horários ──────────────────────────────────────────

function renderSlots() {
  const dateKey = fmtKey(selectedDate);
  const booked  = appointments
    .filter(a => a.dateKey === dateKey)
    .map(a => a.time);

  document.getElementById('time-slots').innerHTML = ALL_SLOTS.map(t => {
    const isBooked = booked.includes(t);
    const isSel    = selectedSlot === t;

    let cls = 'slot';
    if (isBooked) cls += ' booked';
    else if (isSel) cls += ' selected-slot';

    const clickHandler = isBooked ? '' : `onclick="selectSlot('${t}')"`;
    return `<div class="${cls}" ${clickHandler}>${t}</div>`;
  }).join('');
}

function selectSlot(t) {
  selectedSlot = t;
  renderSlots();
}

// ── Confirmação ───────────────────────────────────────

function confirmBooking() {
  const name  = document.getElementById('inp-name').value.trim();
  const phone = document.getElementById('inp-phone').value.trim();
  const email = document.getElementById('inp-email').value.trim();
  const obs   = document.getElementById('inp-obs').value.trim();

  if (!name)            { showToast('⚠ Informe o nome do cliente.');  return; }
  if (!selectedSlot)    { showToast('⚠ Selecione um horário.');        return; }
  if (!selectedService) { showToast('⚠ Selecione um serviço.');        return; }

  const svc = SERVICES.find(s => s.id === selectedService);

  appointments.push({
    id:          Date.now().toString(),
    name,
    phone,
    email,
    obs,
    time:        selectedSlot,
    serviceName: svc.name,
    serviceId:   selectedService,
    dateKey:     fmtKey(selectedDate),
    year:        selectedDate.getFullYear(),
    month:       selectedDate.getMonth(),
    day:         selectedDate.getDate(),
  });

  // Limpar formulário
  ['inp-name','inp-phone','inp-email','inp-obs'].forEach(id => {
    document.getElementById(id).value = '';
  });
  selectedSlot = null;

  renderSlots();
  renderAppointments();
  renderMiniCal();
  renderUpcoming();
  updateCounts();
  showToast('✓ Agendamento confirmado com sucesso!');
}

// ── Lista de Agendamentos ─────────────────────────────

function renderAppointments() {
  const dateKey = fmtKey(selectedDate);
  const list    = appointments
    .filter(a => a.dateKey === dateKey)
    .sort((a, b) => a.time.localeCompare(b.time));

  document.getElementById('appts-label').textContent =
    `Agendamentos — ${fmt(selectedDate)}`;

  const container = document.getElementById('appointments-list');

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="ti ti-calendar-off" aria-hidden="true"
           style="font-size:2rem;display:block;margin-bottom:8px;opacity:0.35"></i>
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

function cancelAppt(id) {
  appointments = appointments.filter(a => a.id !== id);
  renderSlots();
  renderAppointments();
  renderMiniCal();
  renderUpcoming();
  updateCounts();
  showToast('Agendamento cancelado.');
}

// ── Próximos Agendamentos (sidebar) ──────────────────

function renderUpcoming() {
  const now = new Date();

  const upcoming = appointments
    .filter(a => {
      const [h, m] = a.time.split(':').map(Number);
      return new Date(a.year, a.month, a.day, h, m) >= now;
    })
    .sort((a, b) => {
      const [ah, am] = a.time.split(':').map(Number);
      const [bh, bm] = b.time.split(':').map(Number);
      const da = new Date(a.year, a.month, a.day, ah, am);
      const db = new Date(b.year, b.month, b.day, bh, bm);
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
              ${a.serviceName} ·
              ${String(a.day).padStart(2,'0')}/${String(a.month+1).padStart(2,'0')}
              às ${a.time}
            </div>
          </div>
        </div>`).join('')
    : `<div style="font-size:0.75rem;color:rgba(255,255,255,0.3)">Sem agendamentos futuros.</div>`;
}

// ── Contadores ────────────────────────────────────────

function updateCounts() {
  const today    = new Date();
  const todayKey = fmtKey(today);

  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  document.getElementById('count-today').textContent =
    appointments.filter(a => a.dateKey === todayKey).length;

  document.getElementById('count-week').textContent =
    appointments.filter(a => {
      const d = new Date(a.year, a.month, a.day);
      return d >= weekStart && d <= weekEnd;
    }).length;

  document.getElementById('count-total').textContent = appointments.length;
}

// ── Toast ─────────────────────────────────────────────

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Auxiliares ────────────────────────────────────────

function scrollToForm() {
  document.getElementById('booking-form').scrollIntoView({ behavior: 'smooth' });
}

// ── Inicialização ─────────────────────────────────────

function init() {
  // Dados demo
  const today = new Date();
  appointments.push(
    {
      id: 'demo1', name: 'Maria Oliveira', phone: '(84) 99887-6655', email: 'maria@email.com',
      time: '09:00', serviceName: 'Massagem', serviceId: 's1',
      dateKey: fmtKey(today), year: today.getFullYear(), month: today.getMonth(), day: today.getDate(), obs: '',
    },
    {
      id: 'demo2', name: 'Carlos Lima', phone: '(84) 98776-5544', email: '',
      time: '10:30', serviceName: 'Corte + Escova', serviceId: 's2',
      dateKey: fmtKey(today), year: today.getFullYear(), month: today.getMonth(), day: today.getDate(), obs: '',
    }
  );

  renderMiniCal();
  renderMainDate();
  renderServices();
  renderSlots();
  renderAppointments();
  renderUpcoming();
  updateCounts();
}

// Iniciar após o DOM estar pronto
document.addEventListener('DOMContentLoaded', init);
