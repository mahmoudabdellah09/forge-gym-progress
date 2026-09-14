const defaultWorkouts = [
  { name: 'Upper body strength', focus: 'Push', detail: '8 exercises · 45 min', icon: '↑' },
  { name: 'Pull & posture', focus: 'Pull', detail: '7 exercises · 40 min', icon: '↗' },
  { name: 'Lower body power', focus: 'Legs', detail: '9 exercises · 50 min', icon: '↓' },
  { name: 'Full body foundation', focus: 'Full body', detail: '10 exercises · 55 min', icon: '✦' }
];
const state = JSON.parse(localStorage.getItem('forge-state') || 'null') || { user: null, workouts: defaultWorkouts, sessions: [], weights: [], photos: [] };
let apiOnline = false;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const save = () => localStorage.setItem('forge-state', JSON.stringify(state));
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
let authMode = 'signup';
function toast(message) { const element = $('#toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2400); }
function showView(name) { $$('.view').forEach(view => view.classList.toggle('active', view.id === name)); $$('[data-view]').forEach(tab => tab.classList.toggle('active', tab.dataset.view === name)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function initials(name) { return name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(); }
function formatDate(date = new Date()) { return date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase(); }
function applyData(data) { if (!data) return; Object.assign(state, data); if (state.user) state.user.password = state.user.password || ''; save(); }
async function api(path, options = {}) {
  if (!state.user?.id && !['/api/auth/signup', '/api/auth/login'].includes(path)) throw new Error('offline');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.user?.id) headers['x-user-id'] = state.user.id;
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) throw new Error((await response.json()).error || 'Request failed');
  apiOnline = true; return response.json();
}
async function sync(action, message) {
  try { applyData(await action()); toast(message); }
  catch (_) { apiOnline = false; save(); toast(`${message} (saved on this device)`); }
  render();
}
function render() {
  if (!state.user) return;
  const name = state.user.name.trim();
  $('[data-name]').textContent = name.split(/\s+/)[0] + '.';
  $('[data-avatar]').textContent = initials(name);
  $('[data-date]').textContent = formatDate();
  $('[data-weight]').textContent = (state.weights.at(-1)?.value || 0).toFixed(1);
  $('[data-chart-weight]').textContent = (state.weights.at(-1)?.value || 0).toFixed(1);
  $('[data-workouts]').textContent = state.sessions.length;
  $('[data-streak]').textContent = state.sessions.length;
  $('[data-best-lift]').textContent = '0.0';
  $('[data-consistency]').textContent = Math.min(100, Math.round(state.sessions.length / 5 * 100));
  $('[data-week-count]').textContent = `${Math.min(5, state.sessions.length)} / 5 sessions`;
  $('[data-week-progress]').style.width = `${Math.min(100, state.sessions.length / 5 * 100)}%`;
  $('[data-week-message]').textContent = state.sessions.length ? 'Keep the rhythm going — your consistency is building.' : 'Complete a workout to start your week.';
  $('[data-plan-status]').textContent = state.sessions.includes('Upper body strength') ? 'COMPLETED' : 'READY';
  $('[data-weight-change]').textContent = state.weights.length > 1 ? `${(state.weights.at(-1).value - state.weights[0].value).toFixed(1)} kg since start` : 'Starting point';
  renderWorkouts(); renderChart(); renderPhotos();
}
function renderWorkouts() {
  $('#workout-list').innerHTML = state.workouts.map(workout => `<article class="workout-row" data-focus="${escapeHtml(workout.focus)}"><div class="row-icon">${workout.icon || '✦'}</div><div><h3>${escapeHtml(workout.name)}</h3><p>${escapeHtml(workout.focus)} · ${escapeHtml(workout.detail || 'Custom session')}</p></div><button class="row-start" data-workout="${escapeHtml(workout.name)}">Start</button></article>`).join('');
  $$('.row-start').forEach(button => button.addEventListener('click', () => completeWorkout(button.dataset.workout)));
}
function completeWorkout(name) {
  if (state.sessions.includes(name)) return toast('Already completed this workout');
  state.sessions.push(name); save(); render(); toast(`${name} completed — great work`);
  if (apiOnline) api('/api/sessions', { method: 'POST', body: JSON.stringify({ name }) }).then(applyData).catch(() => { apiOnline = false; });
}
function renderChart() {
  if (state.weights.length < 2) { $('[data-chart-change]').innerHTML = 'Start your first log<small>today</small>'; return; }
  const first = state.weights[0].value, last = state.weights.at(-1).value, delta = (last - first).toFixed(1);
  $('[data-chart-change]').innerHTML = `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta)} kg<small>since start</small>`;
  const min = Math.min(...state.weights.map(item => item.value)), max = Math.max(...state.weights.map(item => item.value)), range = max - min || 1;
  const points = state.weights.map((item, index) => `${Math.round(index / (state.weights.length - 1) * 340)},${110 - Math.round((item.value - min) / range * 80)}`);
  $('[data-chart-line]').setAttribute('d', `M${points.join(' L')}`); $('[data-chart-area]').setAttribute('d', `M${points.join(' L')} V130 H0Z`);
}
function renderPhotos() {
  $('#photo-grid').innerHTML = state.photos.length ? state.photos.map(photo => `<button class="photo-card uploaded-photo" style="background-image:url('${photo.url}')"><span>${photo.date}</span><b>Check-in</b></button>`).join('') : '<button class="photo-card photo-one" data-add-photo><span>START HERE</span><b>Add your first photo</b></button><div class="photo-card empty-photo"><span>YOUR TIMELINE</span><b>Photos will appear here</b></div>';
  $$('[data-add-photo]').forEach(button => button.addEventListener('click', () => $('#photo-input').click()));
}
async function authenticate(form) {
  const values = Object.fromEntries(new FormData(form));
  try {
    const data = await api(`/api/auth/${authMode}`, { method: 'POST', body: JSON.stringify(values) });
    applyData(data); state.user.password = values.password; save(); apiOnline = true;
  } catch (error) {
    if (authMode === 'login' && (!state.user || values.email !== state.user.email || values.password !== state.user.password)) return toast(error.message === 'Failed to fetch' ? 'Server unavailable — create an account first' : error.message);
    if (authMode === 'signup') { state.user = { ...values, id: crypto.randomUUID(), height: Number(values.height) }; state.weights = [{ value: Number(values.weight), date: formatDate() }]; save(); }
  }
  $('#auth-screen').classList.add('hidden'); $('#app').classList.remove('hidden'); $('#bottom-nav').classList.remove('hidden'); render(); toast(`Welcome back, ${state.user.name}`);
}
$$('[data-view]').forEach(tab => tab.addEventListener('click', () => showView(tab.dataset.view)));
$$('[data-view-link]').forEach(button => button.addEventListener('click', () => showView(button.dataset.viewLink)));
$$('.filter').forEach(filter => filter.addEventListener('click', () => { $$('.filter').forEach(item => item.classList.remove('active')); filter.classList.add('active'); const value = filter.textContent; $$('.workout-row').forEach(row => row.hidden = value !== 'All' && row.dataset.focus !== value); }));
$('[data-start]').addEventListener('click', () => completeWorkout('Upper body strength'));
$('[data-open-workout]').addEventListener('click', () => $('#workout-modal').showModal());
$('[data-open-log]').addEventListener('click', () => $('#log-modal').showModal());
$('[data-open-profile]').addEventListener('click', () => { const form = $('#profile-form-edit'); form.name.value = state.user.name; form.height.value = state.user.height; form.goal.value = state.user.goal; $('#profile-modal').showModal(); });
$('#profile-form').addEventListener('submit', event => { event.preventDefault(); authenticate(event.currentTarget); });
$('#add-form').addEventListener('submit', event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const workout = { name: values.name, focus: values.focus, detail: `${values.duration} min`, icon: '+' }; state.workouts.push(workout); save(); $('#workout-modal').close(); event.currentTarget.reset(); if (apiOnline) sync(() => api('/api/workouts', { method: 'POST', body: JSON.stringify(workout) }), 'Workout added to your library'); else { render(); toast('Workout added to your library (saved on this device)'); } });
$('#log-form').addEventListener('submit', event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const weight = { value: Number(values.weight), date: formatDate() }; state.weights.push(weight); save(); $('#log-modal').close(); event.currentTarget.reset(); if (apiOnline) sync(() => api('/api/weights', { method: 'POST', body: JSON.stringify(weight) }), 'Progress saved'); else { render(); toast('Progress saved on this device'); } });
$('#profile-form-edit').addEventListener('submit', event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); Object.assign(state.user, { name: values.name, height: Number(values.height), goal: values.goal }); save(); $('#profile-modal').close(); if (apiOnline) sync(() => api('/api/profile', { method: 'PUT', body: JSON.stringify(values) }), 'Profile updated'); else { render(); toast('Profile updated on this device'); } });
$('[data-sign-out]').addEventListener('click', () => { state.user = null; save(); $('#profile-modal').close(); $('#app').classList.add('hidden'); $('#bottom-nav').classList.add('hidden'); $('#auth-screen').classList.remove('hidden'); });
$('#photo-input').addEventListener('change', event => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { const photo = { url: reader.result, date: formatDate() }; state.photos.push(photo); save(); if (apiOnline) sync(() => api('/api/photos', { method: 'POST', body: JSON.stringify(photo) }), 'Progress photo added'); else { render(); toast('Progress photo added on this device'); } }; reader.readAsDataURL(file); });
$('#profile-form').querySelector('[data-auth-toggle]').addEventListener('click', () => { authMode = authMode === 'signup' ? 'login' : 'signup'; const form = $('#profile-form'); form.querySelector('h2').textContent = authMode === 'login' ? 'Welcome back' : 'Set up your profile'; form.querySelector('.muted').textContent = authMode === 'login' ? 'Sign in to continue your journey.' : 'Everything starts at zero. Your numbers will grow with you.'; form.querySelector('[data-auth-toggle]').textContent = authMode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'; form.querySelector('.primary-button').firstChild.textContent = authMode === 'login' ? 'Sign in ' : 'Create my account '; form.querySelectorAll('.form-row, label:has(select)').forEach(element => element.hidden = authMode === 'login'); form.querySelector('input[name="name"]').required = authMode !== 'login'; form.querySelector('input[name="height"]').required = authMode !== 'login'; form.querySelector('input[name="weight"]').required = authMode !== 'login'; });

if (state.user) { $('#auth-screen').classList.add('hidden'); $('#app').classList.remove('hidden'); $('#bottom-nav').classList.remove('hidden'); render(); api('/api/state').then(applyData).then(render).catch(() => {}); }
