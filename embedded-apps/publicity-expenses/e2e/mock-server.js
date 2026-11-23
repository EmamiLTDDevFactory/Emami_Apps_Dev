/*
   Local backend for the e2e tests and for running the app on this PC without a database or SAP: the real
   backend/publicityExpenses router (mock data source, in-memory store for rules / budget / mapping) with the Manage
   Access check stubbed: e2e.user@ = Admin, e2e.viewer@ = User. Never used on a server.
   Usage: node e2e/mock-server.js [port]  (default 4195; prints TOKEN= (admin) and VIEWER_TOKEN= for the browser)
*/
process.env.HUB_AUTH_JWT_SECRET = process.env.HUB_AUTH_JWT_SECRET || 'local-e2e-secret';
process.env.PUBEXP_SOURCE = 'mock';
process.env.PUBEXP_STORE = 'memory';
const path = require('path');
const backend = path.join(__dirname, '..', '..', '..', 'backend');
const express = require(path.join(backend, 'node_modules', 'express'));
const jwt = require(path.join(backend, 'node_modules', 'jsonwebtoken'));
const db = require(path.join(backend, 'db'));
const ROLES = { 'e2e.user@emamigroup.com': 'Admin', 'e2e.viewer@emamigroup.com': 'User' };
db.pool.query = async (sql, args) => (sql.includes('authorized_user_apps') ? { rows: ROLES[args[0]] ? [{ role: ROLES[args[0]] }] : [] } : { rows: [{ is_active: true }] });
const router = require(path.join(backend, 'publicityExpenses'));

const app = express();
app.use((req, res, next) => {
    res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS' });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});
app.use(express.json({ limit: '6mb' }));
app.use('/api/me/publicity-expenses', router);
const port = Number(process.argv[2]) || 4195;
app.listen(port, '127.0.0.1', () => {
    const sign = (email) => jwt.sign({ email }, process.env.HUB_AUTH_JWT_SECRET, { expiresIn: '12h' });
    console.log(`publicity-expenses mock backend on http://127.0.0.1:${port}/api/me/publicity-expenses`);
    console.log(`TOKEN=${sign('e2e.user@emamigroup.com')}`);
    console.log(`VIEWER_TOKEN=${sign('e2e.viewer@emamigroup.com')}`);
});
