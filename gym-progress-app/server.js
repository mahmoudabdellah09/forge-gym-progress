const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.FORGE_DATA_FILE || path.join(__dirname, 'data.json');
const emptyDb = { users: [], workouts: [], sessions: [], weights: [], photos: [] };
const starterWorkouts = [
  ['Upper body strength', 'Push', '8 exercises · 45 min', '↑'],
  ['Pull & posture', 'Pull', '7 exercises · 40 min', '↗'],
  ['Lower body power', 'Legs', '9 exercises · 50 min', '↓'],
  ['Full body foundation', 'Full body', '10 exercises · 55 min', '✦']
];

function readDb() {
  try { return { ...emptyDb, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }; }
  catch (_) { return { ...emptyDb }; }
}
function writeDb(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}
function publicUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}
function userState(db, userId) {
  return {
    user: publicUser(db.users.find(item => item.id === userId)),
    workouts: db.workouts.filter(item => item.userId === userId),
    sessions: db.sessions.filter(item => item.userId === userId).map(item => item.name),
    weights: db.weights.filter(item => item.userId === userId),
    photos: db.photos.filter(item => item.userId === userId)
  };
}
function requireUser(req, res, next) {
  const userId = req.get('x-user-id') || (req.body || {}).userId;
  const db = readDb();
  if (!userId || !db.users.some(user => user.id === userId)) return res.status(401).json({ error: 'Sign in required' });
  req.userId = userId; req.db = db; next();
}

app.use(express.json({ limit: '12mb' }));
app.use(express.static(__dirname));

app.post('/api/auth/signup', (req, res) => {
  const { name, email, password, height, goal, weight } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  const db = readDb();
  if (db.users.some(user => user.email.toLowerCase() === email.toLowerCase())) return res.status(409).json({ error: 'An account with that email already exists' });
  const id = crypto.randomUUID();
  db.users.push({ id, name, email, password, height: Number(height), goal });
  starterWorkouts.forEach(([workoutName, focus, detail, icon]) => db.workouts.push({ id: crypto.randomUUID(), userId: id, name: workoutName, focus, detail, icon }));
  db.weights.push({ id: crypto.randomUUID(), userId: id, value: Number(weight), date: new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase() });
  writeDb(db);
  res.status(201).json(userState(db, id));
});

app.post('/api/auth/login', (req, res) => {
  const db = readDb();
  const user = db.users.find(item => item.email.toLowerCase() === String(req.body.email || '').toLowerCase() && item.password === req.body.password);
  if (!user) return res.status(401).json({ error: 'Email or password does not match' });
  res.json(userState(db, user.id));
});

app.get('/api/state', requireUser, (req, res) => res.json(userState(req.db, req.userId)));
app.put('/api/profile', requireUser, (req, res) => {
  const user = req.db.users.find(item => item.id === req.userId);
  Object.assign(user, { name: req.body.name, height: Number(req.body.height), goal: req.body.goal });
  writeDb(req.db); res.json(userState(req.db, req.userId));
});
app.post('/api/workouts', requireUser, (req, res) => {
  req.db.workouts.push({ id: crypto.randomUUID(), userId: req.userId, name: req.body.name, focus: req.body.focus, detail: req.body.detail, icon: req.body.icon || '+' });
  writeDb(req.db); res.json(userState(req.db, req.userId));
});
app.post('/api/sessions', requireUser, (req, res) => {
  if (!req.db.sessions.some(item => item.userId === req.userId && item.name === req.body.name)) req.db.sessions.push({ id: crypto.randomUUID(), userId: req.userId, name: req.body.name, date: new Date().toISOString() });
  writeDb(req.db); res.json(userState(req.db, req.userId));
});
app.post('/api/weights', requireUser, (req, res) => {
  req.db.weights.push({ id: crypto.randomUUID(), userId: req.userId, value: Number(req.body.value), date: req.body.date || new Date().toISOString() });
  writeDb(req.db); res.json(userState(req.db, req.userId));
});
app.post('/api/photos', requireUser, (req, res) => {
  if (!req.body.url) return res.status(400).json({ error: 'Photo data is required' });
  req.db.photos.push({ id: crypto.randomUUID(), userId: req.userId, url: req.body.url, date: req.body.date || new Date().toISOString() });
  writeDb(req.db); res.json(userState(req.db, req.userId));
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(PORT, () => console.log(`Forge server listening on http://localhost:${PORT}`));
