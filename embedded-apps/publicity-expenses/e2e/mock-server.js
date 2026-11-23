/*
   Local backend for the e2e tests and for running the app on this PC without a database or SAP: the real
   backend/publicityExpenses router (mock data source) with the Manage Access check stubbed to "granted".
   Never used on a server. Usage: node e2e/mock-server.js [port]  (default 4195; prints a session token for the browser)
*/
process.env.HUB_AUTH_JWT_SECRET = process.env.HUB_AUTH_JWT_SECRET || 'local-e2e-secret';
process.env.PUBEXP_SOURCE = 'mock';
const path = require('path');
const backend = path.join(__dirname, '..', '..', '..', 'backend');
const express = require(path.join(backend, 'node_modules', 'express'));
const jwt = require(path.join(backend, 'node_modules', 'jsonwebtoken'));
const db = require(path.join(backend, 'db'));
db.pool.query = async (sql) => (sql.includes('authorized_user_apps') ? { rows: [{ role: 'User' }] } : { rows: [{ is_active: true }] });
const router = require(path.join(backend, 'publicityExpenses'));

const app = express();
app.use((req, res, next) => {
    res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});
app.use('/api/me/publicity-expenses', router);
const port = Number(process.argv[2]) || 4195;
app.listen(port, '127.0.0.1', () => {
    console.log(`publicity-expenses mock backend on http://127.0.0.1:${port}/api/me/publicity-expenses`);
    console.log(`TOKEN=${jwt.sign({ email: 'e2e.user@emamigroup.com' }, process.env.HUB_AUTH_JWT_SECRET, { expiresIn: '12h' })}`);
});
