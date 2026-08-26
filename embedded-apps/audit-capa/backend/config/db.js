const { Pool } = require("pg");

require("dotenv").config();

const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD
});

pool.on("error", (err) => {
    console.error("Unexpected PostgreSQL error:", err);
});

pool.query("SELECT current_database(), current_schema()")
    .then((result) => {
        console.log("PostgreSQL connected:");
        console.log(result.rows[0]);
    })
    .catch((error) => {
        console.error("PostgreSQL connection failed:");
        console.error(error);
    });

module.exports = pool;