const { Pool } = require("pg");
require("dotenv").config();

// console.log("PostgreSQL configuration:");
// console.log("Host:", process.env.PGHOST);
// console.log("Port:", process.env.PGPORT);
// console.log("Database:", process.env.PGDATABASE);
// console.log("User:", process.env.PGUSER);
// console.log("Password loaded:", typeof process.env.PGPASSWORD);
// console.log("Password exists:", !!process.env.PGPASSWORD);

const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD
});

pool.on("connect", (client) => {
    client.query('SET search_path TO "audit-capa"')
        .catch((err) => {
            console.error("Unable to set PostgreSQL schema:", err);
        });
});

pool.on("error", (err) => {
    console.error("Unexpected PostgreSQL error:", err);
});

module.exports = pool;