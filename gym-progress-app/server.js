const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.FORGE_DATA_FILE || path.join(__dirname, 'data.json');
const authTokens = new Map();
const emptyDb = { users: [], workouts: [], sessions: [], weights: [], photos: [], lifts: [] };
const starterWorkouts = [
  ['Upper body strength', 'Push', '8 exercises · 45 min', '↑'],
  ['Pull & posture', 'Pull', '7 exercises · 40 min', '↗'],
  ['Lower body power', 'Legs', '9 exercises · 50 min', '↓'],
  ['Full body foundation', 'Full body', '10 exercises · 55 min', '✦']
];

function publicUser(user) {
  if (!user) return null;
  const { password, passwordHash, ...safe } = user;
  return safe;
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const [salt, expected] = storedHash.split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}
function issueToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  authTokens.set(token, userId);
  return token;
}
function userState(db, userId) {
  return {
    user: publicUser(db.users.find(item => item.id === userId)),
    workouts: db.workouts.filter(item => item.userId === userId),
    sessions: db.sessions.filter(item => item.userId === userId).map(item => item.name),
    weights: db.weights.filter(item => item.userId === userId),
    photos: db.photos.filter(item => item.userId === userId),
    lifts: db.lifts.filter(item => item.userId === userId)
  };
}

class FileStore {
  async init() {}
  read() {
    try { return { ...emptyDb, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }; }
    catch (_) { return { ...emptyDb }; }
  }
  async findUserByEmail(email) { return this.read().users.find(user => user.email.toLowerCase() === email.toLowerCase()); }
  async getState(userId) { return userState(this.read(), userId); }
  async createUser(user, workouts, weight) {
    const db = this.read();
    db.users.push(user); db.workouts.push(...workouts); db.weights.push(weight);
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  }
  async update(userId, change) {
    const db = this.read(); change(db, userId);
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    return userState(db, userId);
  }
}

class PostgresStore {
  constructor() { this.pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }); }
  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS forge_users (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, height NUMERIC, goal TEXT
      );
      CREATE TABLE IF NOT EXISTS forge_state (
        user_id TEXT PRIMARY KEY REFERENCES forge_users(id) ON DELETE CASCADE,
        workouts JSONB NOT NULL DEFAULT '[]', sessions JSONB NOT NULL DEFAULT '[]',
        weights JSONB NOT NULL DEFAULT '[]', photos JSONB NOT NULL DEFAULT '[]',
        lifts JSONB NOT NULL DEFAULT '[]'
      );
    `);
  }
  async findUserByEmail(email) {
    const { rows } = await this.pool.query('SELECT * FROM forge_users WHERE lower(email) = lower($1)', [email]);
    return rows[0] && { id: rows[0].id, name: rows[0].name, email: rows[0].email, passwordHash: rows[0].password_hash, height: Number(rows[0].height), goal: rows[0].goal };
  }
  async getState(userId) {
    const result = await this.pool.query(`
      SELECT u.id, u.name, u.email, u.height, u.goal, s.workouts, s.sessions, s.weights, s.photos, s.lifts
      FROM forge_users u JOIN forge_state s ON s.user_id = u.id WHERE u.id = $1
    `, [userId]);
    const row = result.rows[0];
    return row ? { user: publicUser(row), workouts: row.workouts, sessions: row.sessions, weights: row.weights, photos: row.photos, lifts: row.lifts } : null;
  }
  async createUser(user, workouts, weight) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO forge_users (id, name, email, password_hash, height, goal) VALUES ($1,$2,$3,$4,$5,$6)', [user.id, user.name, user.email, user.passwordHash, user.height, user.goal]);
      await client.query('INSERT INTO forge_state (user_id, workouts, weights) VALUES ($1,$2,$3)', [user.id, JSON.stringify(workouts), JSON.stringify([weight])]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async update(userId, change) {
    const state = await this.getState(userId);
    const db = { users: [state.user], workouts: state.workouts, sessions: state.sessions.map(name => ({ name })), weights: state.weights, photos: state.photos, lifts: state.lifts };
    change(db, userId);
    const user = db.users[0];
    await this.pool.query('UPDATE forge_users SET name=$2,height=$3,goal=$4 WHERE id=$1', [userId, user.name, user.height, user.goal]);
    await this.pool.query('UPDATE forge_state SET workouts=$2,sessions=$3,weights=$4,photos=$5,lifts=$6 WHERE user_id=$1', [userId, JSON.stringify(db.workouts), JSON.stringify(db.sessions.map(item => item.name)), JSON.stringify(db.weights), JSON.stringify(db.photos), JSON.stringify(db.lifts)]);
    return this.getState(userId);
  }
}

const store = process.env.DATABASE_URL ? new PostgresStore() : new FileStore();
async function requireUser(req, res, next) {
  const bearer = req.get('authorization') || '';
  const userId = authTokens.get(bearer.startsWith('Bearer ') ? bearer.slice(7) : '');
  if (!userId || !(await store.getState(userId))) return res.status(401).json({ error: 'Sign in required' });
  req.userId = userId; next();
}

app.use(express.json({ limit: '12mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.static(__dirname));
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'forge-api', database: process.env.DATABASE_URL ? 'postgres' : 'file', time: new Date().toISOString() }));

app.post('/api/auth/signup', async (req, res, next) => {
  try {
    const { name, email, password, height, goal, weight } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
    if (await store.findUserByEmail(email)) return res.status(409).json({ error: 'An account with that email already exists' });
    const id = crypto.randomUUID();
    const user = { id, name, email, passwordHash: hashPassword(password), height: Number(height), goal };
    const workouts = starterWorkouts.map(([workoutName, focus, detail, icon]) => ({ id: crypto.randomUUID(), userId: id, name: workoutName, focus, detail, icon }));
    const weightEntry = { id: crypto.randomUUID(), userId: id, value: Number(weight), date: new Date().toISOString() };
    await store.createUser(user, workouts, weightEntry);
    res.status(201).json({ ...(await store.getState(id)), token: issueToken(id) });
  } catch (error) { next(error); }
});
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const user = await store.findUserByEmail(String(req.body.email || ''));
    if (!user || !verifyPassword(req.body.password, user.passwordHash)) return res.status(401).json({ error: 'Email or password does not match' });
    res.json({ ...(await store.getState(user.id)), token: issueToken(user.id) });
  } catch (error) { next(error); }
});
app.get('/api/state', requireUser, async (req, res) => res.json(await store.getState(req.userId)));
app.put('/api/profile', requireUser, async (req, res) => res.json(await store.update(req.userId, (db) => Object.assign(db.users[0], { name: req.body.name, height: Number(req.body.height), goal: req.body.goal }))));
app.post('/api/workouts', requireUser, async (req, res) => res.json(await store.update(req.userId, db => db.workouts.push({ ...req.body, id: crypto.randomUUID(), userId: req.userId }))));
app.put('/api/workouts/:id', requireUser, async (req, res) => res.json(await store.update(req.userId, db => { const workout = db.workouts.find(item => item.id === req.params.id); if (!workout) throw new Error('Workout not found'); Object.assign(workout, req.body); })));
app.post('/api/sessions', requireUser, async (req, res) => res.json(await store.update(req.userId, db => { if (!db.sessions.some(item => item.name === req.body.name)) db.sessions.push({ name: req.body.name }); })));
app.post('/api/weights', requireUser, async (req, res) => res.json(await store.update(req.userId, db => db.weights.push({ ...req.body, id: crypto.randomUUID(), userId: req.userId }))));
app.post('/api/lifts', requireUser, async (req, res) => {
  const value = Number(req.body.value);
  if (!Number.isFinite(value) || value <= 0) return res.status(400).json({ error: 'A valid lift weight is required' });
  res.json(await store.update(req.userId, db => db.lifts.push({ ...req.body, id: crypto.randomUUID(), userId: req.userId, weight: value })));
});
app.post('/api/photos', requireUser, async (req, res) => {
  if (!req.body.url) return res.status(400).json({ error: 'Photo data is required' });
  res.json(await store.update(req.userId, db => db.photos.push({ ...req.body, id: crypto.randomUUID(), userId: req.userId })));
});
app.use((error, req, res, next) => { console.error(error); res.status(500).json({ error: 'Server error' }); });
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

store.init().then(() => app.listen(PORT, () => console.log(`Forge server listening on port ${PORT} using ${process.env.DATABASE_URL ? 'PostgreSQL' : 'file storage'}`))).catch(error => { console.error('Database initialization failed', error); process.exit(1); });
