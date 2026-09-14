const defaultWorkouts = [
  { name: 'Upper body strength', focus: 'Push', detail: '8 exercises · 45 min', icon: '↑', exercises: [{ name: 'Barbell bench press', sets: 4, reps: 8 }, { name: 'Incline dumbbell press', sets: 3, reps: 10 }, { name: 'Overhead press', sets: 3, reps: 8 }] },
  { name: 'Pull & posture', focus: 'Pull', detail: '7 exercises · 40 min', icon: '↗', exercises: [{ name: 'Lat pulldown', sets: 4, reps: 10 }, { name: 'Seated cable row', sets: 3, reps: 10 }, { name: 'Face pull', sets: 3, reps: 15 }] },
  { name: 'Lower body power', focus: 'Legs', detail: '9 exercises · 50 min', icon: '↓', exercises: [{ name: 'Back squat', sets: 4, reps: 6 }, { name: 'Romanian deadlift', sets: 3, reps: 8 }, { name: 'Walking lunges', sets: 3, reps: 12 }] },
  { name: 'Full body foundation', focus: 'Full body', detail: '10 exercises · 55 min', icon: '✦', exercises: [{ name: 'Goblet squat', sets: 3, reps: 12 }, { name: 'Push-ups', sets: 3, reps: 10 }, { name: 'Dumbbell row', sets: 3, reps: 10 }] }
];
const state = JSON.parse(localStorage.getItem('forge-state') || 'null') || { user: null, workouts: defaultWorkouts, sessions: [], weights: [], photos: [], lifts: [] };
const persistedAccount = state.localAccount || (state.user ? { name: state.user.name, email: state.user.email, height: state.user.height, goal: state.user.goal } : null);
state.user = null;
delete state.user;
state.workouts = Array.isArray(state.workouts) ? state.workouts : defaultWorkouts;
state.sessions = Array.isArray(state.sessions) ? state.sessions : [];
state.weights = Array.isArray(state.weights) ? state.weights : [];
state.photos = Array.isArray(state.photos) ? state.photos : [];
state.lifts = Array.isArray(state.lifts) ? state.lifts : [];
let apiOnline = false;
const API_BASE = window.FORGE_API_URL || (window.location.port === '4173' ? 'http://localhost:3000' : '');
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const save = () => localStorage.setItem('forge-state', JSON.stringify(state));
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
let authMode = 'signup';
function setAuthMode(mode) {
  authMode = mode;
  const form = $('#profile-form');
  const login = mode === 'login';
  form.classList.toggle('auth-login', login);
  form.querySelector('h2').textContent = login ? 'Welcome back' : 'Set up your profile';
  form.querySelector('.muted').textContent = login ? 'Sign in with the account you already created.' : 'Everything starts at zero. Your numbers will grow with you.';
  form.querySelector('[data-auth-toggle]').textContent = login ? 'New here? Create an account' : 'Already have an account? Sign in';
  form.querySelector('.primary-button').firstChild.textContent = login ? 'Sign in ' : 'Create my account ';
  form.querySelectorAll('[data-signup-only]').forEach(element => { element.hidden = login; });
  form.querySelector('input[name="name"]').required = !login;
  form.querySelector('input[name="height"]').required = !login;
  form.querySelector('input[name="weight"]').required = !login;
}
function toast(message) { const element = $('#toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2400); }
function showView(name) { $$('.view').forEach(view => view.classList.toggle('active', view.id === name)); $$('[data-view]').forEach(tab => tab.classList.toggle('active', tab.dataset.view === name)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function initials(name) { return name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(); }
function formatDate(date = new Date()) { return date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase(); }
function applyData(data) { if (!data) return; Object.assign(state, data); save(); }
async function api(path, options = {}) {
  if (!state.authToken && !['/api/auth/signup', '/api/auth/login'].includes(path)) throw new Error('offline');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.authToken) headers.Authorization = `Bearer ${state.authToken}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    let message = 'Request failed';
    try { message = (await response.json()).error || message; } catch (_) { /* non-JSON server response */ }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  apiOnline = true; return response.json();
}
async function checkServer() {
  const status = $('[data-server-status]');
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    if (!response.ok) throw new Error('Server returned an error');
    status.textContent = `Server connected: ${API_BASE || window.location.origin}`;
    status.classList.add('online');
  } catch (_) {
    status.textContent = `Server unavailable at ${API_BASE || window.location.origin}`;
    status.classList.add('offline');
  }
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
  $('[data-best-lift]').textContent = (Math.max(0, ...state.lifts.map(item => item.weight || 0))).toFixed(1);
  $('[data-consistency]').textContent = Math.min(100, Math.round(state.sessions.length / 5 * 100));
  $('[data-week-count]').textContent = `${Math.min(5, state.sessions.length)} / 5 sessions`;
  $('[data-week-progress]').style.width = `${Math.min(100, state.sessions.length / 5 * 100)}%`;
  $('[data-week-message]').textContent = state.sessions.length ? 'Keep the rhythm going — your consistency is building.' : 'Complete a workout to start your week.';
  $('[data-plan-status]').textContent = state.sessions.includes('Upper body strength') ? 'COMPLETED' : 'READY';
  $('[data-weight-change]').textContent = state.weights.length > 1 ? `${(state.weights.at(-1).value - state.weights[0].value).toFixed(1)} kg since start` : 'Starting point';
  renderWorkouts(); renderChart(); renderPhotos();
}
function renderWorkouts() {
  $('#workout-list').innerHTML = state.workouts.map((workout, index) => `<article class="workout-row" data-focus="${escapeHtml(workout.focus)}"><div class="row-icon">${workout.icon || '✦'}</div><div><h3>${escapeHtml(workout.name)}</h3><p>${escapeHtml(workout.focus)} · ${escapeHtml(workout.detail || 'Custom session')}</p></div><button class="row-edit" data-edit-workout="${index}" aria-label="Edit ${escapeHtml(workout.name)}">Edit</button><button class="row-start" data-workout-index="${index}">Open</button></article>`).join('');
  $$('.row-start').forEach(button => button.addEventListener('click', () => openSession(Number(button.dataset.workoutIndex))));
  $$('[data-edit-workout]').forEach(button => button.addEventListener('click', () => openWorkoutEditor(Number(button.dataset.editWorkout))));
}
function completeWorkout(name) {
  if (state.sessions.includes(name)) return toast('Already completed this workout');
  state.sessions.push(name); save(); render(); toast(`${name} completed — great work`);
  if (apiOnline) api('/api/sessions', { method: 'POST', body: JSON.stringify({ name }) }).then(applyData).catch(() => { apiOnline = false; });
}
function openSession(index) {
  const workout = state.workouts[index];
  if (!workout) return;
  $('#session-form').dataset.workoutName = workout.name;
  $('[data-session-title]').textContent = workout.name;
  const exercisePlans = {
    Push: [{ name: 'Barbell bench press', sets: 4, reps: 8 }, { name: 'Incline dumbbell press', sets: 3, reps: 10 }, { name: 'Overhead press', sets: 3, reps: 8 }],
    Pull: [{ name: 'Lat pulldown', sets: 4, reps: 10 }, { name: 'Seated cable row', sets: 3, reps: 10 }, { name: 'Face pull', sets: 3, reps: 15 }],
    Legs: [{ name: 'Back squat', sets: 4, reps: 6 }, { name: 'Romanian deadlift', sets: 3, reps: 8 }, { name: 'Walking lunges', sets: 3, reps: 12 }]
  };
  const exercises = workout.exercises || exercisePlans[workout.focus] || [{ name: 'Main movement', sets: 3, reps: 10 }];
  $('#exercise-list').innerHTML = exercises.map((exercise, exerciseIndex) => `<div class="exercise-row"><div><strong>${escapeHtml(exercise.name)}</strong><span>${exercise.sets} sets × ${exercise.reps} reps</span></div><label>kg<input type="number" min="0" step=".5" name="lift-${exerciseIndex}" placeholder="0"></label></div>`).join('');
  $('#session-modal').showModal();
}
function defaultExercises(focus) {
  return { Push: [{ name: 'Barbell bench press', sets: 4, reps: 8 }, { name: 'Incline dumbbell press', sets: 3, reps: 10 }, { name: 'Overhead press', sets: 3, reps: 8 }], Pull: [{ name: 'Lat pulldown', sets: 4, reps: 10 }, { name: 'Seated cable row', sets: 3, reps: 10 }, { name: 'Face pull', sets: 3, reps: 15 }], Legs: [{ name: 'Back squat', sets: 4, reps: 6 }, { name: 'Romanian deadlift', sets: 3, reps: 8 }, { name: 'Walking lunges', sets: 3, reps: 12 }] }[focus] || [{ name: 'Main movement', sets: 3, reps: 10 }];
}
function renderExerciseBuilder(exercises) {
  $('#exercise-builder').innerHTML = exercises.map((exercise, index) => `<div class="builder-row"><input name="exercise-name" value="${escapeHtml(exercise.name)}" required placeholder="Exercise name"><input name="exercise-sets" type="number" min="1" value="${exercise.sets || 3}" required aria-label="Sets"><input name="exercise-reps" type="number" min="1" value="${exercise.reps || 10}" required aria-label="Reps"><button type="button" class="remove-exercise" data-remove-exercise="${index}" aria-label="Remove exercise">×</button></div>`).join('');
  $$('[data-remove-exercise]').forEach(button => button.addEventListener('click', () => { button.closest('.builder-row').remove(); }));
}
function openWorkoutEditor(index = null) {
  const form = $('#add-form');
  form.dataset.editIndex = index === null ? '' : String(index);
  const workout = index === null ? { name: '', focus: 'Push', detail: '45 min', exercises: defaultExercises('Push') } : state.workouts[index];
  $('[data-workout-form-eyebrow]').textContent = index === null ? 'NEW ENTRY' : 'EDIT ROUTINE';
  $('[data-workout-form-title]').textContent = index === null ? 'Add a workout' : 'Customize your workout';
  $('[data-workout-submit]').innerHTML = `${index === null ? 'Add to library' : 'Save changes'} <b>→</b>`;
  form.name.value = workout.name; form.focus.value = workout.focus; form.duration.value = Number(String(workout.detail || '45').match(/(\d+)\s*min/i)?.[1] || 45);
  renderExerciseBuilder(workout.exercises?.length ? workout.exercises : defaultExercises(workout.focus));
  $('#workout-modal').showModal();
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
    applyData(data); state.authToken = data.token; state.localAccount = { name: data.user.name, email: values.email, height: data.user.height, goal: data.user.goal }; save(); apiOnline = true;
  } catch (error) {
    return toast(error.message === 'Failed to fetch' ? `Server unavailable at ${API_BASE || window.location.origin}. Start Forge backend or set FORGE_API_URL.` : error.message);
  }
  $('#auth-screen').classList.add('hidden'); $('#app').classList.remove('hidden'); $('#bottom-nav').classList.remove('hidden'); render(); toast(`Welcome back, ${state.user.name}`);
}
$$('[data-view]').forEach(tab => tab.addEventListener('click', () => showView(tab.dataset.view)));
$$('[data-view-link]').forEach(button => button.addEventListener('click', () => showView(button.dataset.viewLink)));
$$('.filter').forEach(filter => filter.addEventListener('click', () => { $$('.filter').forEach(item => item.classList.remove('active')); filter.classList.add('active'); const value = filter.textContent; $$('.workout-row').forEach(row => row.hidden = value !== 'All' && row.dataset.focus !== value); }));
$('[data-library-search]').addEventListener('input', event => { const query = event.target.value.toLowerCase(); $$('.workout-row').forEach(row => row.hidden = !row.textContent.toLowerCase().includes(query)); });
$('[data-start]').addEventListener('click', () => completeWorkout('Upper body strength'));
$('[data-open-workout]').addEventListener('click', () => openWorkoutEditor());
$('[data-add-exercise]').addEventListener('click', () => { const current = [...document.querySelectorAll('#exercise-builder .builder-row')].map(row => ({ name: row.querySelector('[name="exercise-name"]').value, sets: row.querySelector('[name="exercise-sets"]').value, reps: row.querySelector('[name="exercise-reps"]').value })); current.push({ name: '', sets: 3, reps: 10 }); renderExerciseBuilder(current); });
$('[data-open-log]').addEventListener('click', () => $('#log-modal').showModal());
$('[data-open-profile]').addEventListener('click', () => { const form = $('#profile-form-edit'); form.name.value = state.user.name; form.height.value = state.user.height; form.goal.value = state.user.goal; $('#profile-modal').showModal(); });
$('#profile-form').addEventListener('submit', event => { event.preventDefault(); authenticate(event.currentTarget); });
$('#add-form').addEventListener('submit', event => { event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); const names = [...form.querySelectorAll('[name="exercise-name"]')]; const sets = [...form.querySelectorAll('[name="exercise-sets"]')]; const reps = [...form.querySelectorAll('[name="exercise-reps"]')]; const exercises = names.map((input, index) => ({ name: input.value.trim(), sets: Number(sets[index].value), reps: Number(reps[index].value) })).filter(exercise => exercise.name); if (!exercises.length) return toast('Add at least one exercise'); const editIndex = form.dataset.editIndex; const previous = editIndex === '' ? null : state.workouts[Number(editIndex)]; const workout = { name: values.name, focus: values.focus, detail: `${exercises.length} exercises · ${values.duration} min`, icon: previous?.icon || '+', exercises }; if (editIndex === '') state.workouts.push(workout); else state.workouts[Number(editIndex)] = { ...previous, ...workout }; save(); $('#workout-modal').close(); form.reset(); render(); if (apiOnline && editIndex === '') sync(() => api('/api/workouts', { method: 'POST', body: JSON.stringify(workout) }), 'Workout added to your library'); else if (apiOnline && previous?.id) sync(() => api(`/api/workouts/${previous.id}`, { method: 'PUT', body: JSON.stringify(workout) }), 'Workout changes saved'); else toast(editIndex === '' ? 'Workout added to your library' : 'Workout changes saved'); });
$('#session-form').addEventListener('submit', event => { event.preventDefault(); const values = Object.entries(Object.fromEntries(new FormData(event.currentTarget))).filter(([key, value]) => key.startsWith('lift-') && Number(value) > 0); values.forEach(([, value]) => { const lift = { weight: Number(value), date: formatDate() }; state.lifts.push(lift); if (apiOnline) api('/api/lifts', { method: 'POST', body: JSON.stringify({ value: lift.weight, date: lift.date }) }).then(applyData).catch(() => { apiOnline = false; }); }); const name = event.currentTarget.dataset.workoutName; if (!state.sessions.includes(name)) state.sessions.push(name); save(); render(); $('#session-modal').close(); toast(`${name} logged — keep building`); });
$('#log-form').addEventListener('submit', event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const weight = { value: Number(values.weight), date: formatDate() }; state.weights.push(weight); save(); $('#log-modal').close(); event.currentTarget.reset(); if (apiOnline) sync(() => api('/api/weights', { method: 'POST', body: JSON.stringify(weight) }), 'Progress saved'); else { render(); toast('Progress saved on this device'); } });
$('#profile-form-edit').addEventListener('submit', event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); Object.assign(state.user, { name: values.name, height: Number(values.height), goal: values.goal }); save(); $('#profile-modal').close(); if (apiOnline) sync(() => api('/api/profile', { method: 'PUT', body: JSON.stringify(values) }), 'Profile updated'); else { render(); toast('Profile updated on this device'); } });
$('[data-sign-out]').addEventListener('click', () => { state.user = null; state.authToken = null; save(); $('#profile-modal').close(); $('#app').classList.add('hidden'); $('#bottom-nav').classList.add('hidden'); $('#auth-screen').classList.remove('hidden'); setAuthMode('login'); });
$('#photo-input').addEventListener('change', event => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { const photo = { url: reader.result, date: formatDate() }; state.photos.push(photo); save(); if (apiOnline) sync(() => api('/api/photos', { method: 'POST', body: JSON.stringify(photo) }), 'Progress photo added'); else { render(); toast('Progress photo added on this device'); } }; reader.readAsDataURL(file); });
$('[data-rest-start]').addEventListener('click', event => { let remaining = 90; event.currentTarget.disabled = true; const timer = setInterval(() => { remaining -= 1; $('[data-rest-timer]').textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`; if (remaining <= 0) { clearInterval(timer); event.currentTarget.disabled = false; event.currentTarget.textContent = 'Start rest timer'; toast('Rest complete — next set'); } }, 1000); event.currentTarget.textContent = 'Resting...'; });
$('[data-export]').addEventListener('click', () => { const rows = [['type', 'name', 'value', 'date'], ...state.weights.map(item => ['weight', '', item.value, item.date]), ...state.lifts.map(item => ['lift', '', item.weight, item.date]), ...state.sessions.map(name => ['workout', name, '', ''])]; const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = 'forge-progress.csv'; link.click(); URL.revokeObjectURL(link.href); toast('Progress export downloaded'); });
$('#profile-form').querySelector('[data-auth-toggle]').addEventListener('click', () => setAuthMode(authMode === 'signup' ? 'login' : 'signup'));

if (persistedAccount) {
  setAuthMode('login');
  $('#profile-form').querySelector('input[name="email"]').value = persistedAccount.email || '';
}
checkServer();
