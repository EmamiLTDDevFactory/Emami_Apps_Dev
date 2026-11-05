# Deploying Samadhan (formerly Setu) to the dev backend server

Dev backend: `emami-hub-backend-dev` (PM2) on 172.17.2.21, folder `/home/emamiadmin/apps/emami-apps-hub-backend-dev`,
port 4001, exposed as `https://audit-capa-api.emamiapps.in/dev-api/`. Production (`emami-hub-backend`) is not touched.

## Steps (Windows PowerShell on your PC)

1. Copy the Samadhan backend folder and the script to the server (enter the server password when asked):

   ```powershell
   cd "D:\OneDrive - Emami Limited\Desktop\Emami Apps Dev\Emami_Apps_Dev\backend"
   ssh emamiadmin@172.17.2.21 "rm -rf ~/samadhan-upload"
   scp -r samadhan emamiadmin@172.17.2.21:~/samadhan-upload
   scp samadhan/deploy/deploy-dev-server.sh emamiadmin@172.17.2.21:~/
   ```

2. Run it on the server:

   ```powershell
   ssh emamiadmin@172.17.2.21 "bash ~/deploy-dev-server.sh"
   ```

3. It should end with `Samadhan /api/samadhan/me -> 401`, `Old path /api/setu/me -> 401` and `Another app ... -> 401`,
   and print the one-line undo command. The first deploy after v7 replaces the old `setu/` folder (kept as
   `setu.bak-preSamadhan-<ts>`) and the old Setu mount in the server's `server.js`.

4. One-time nginx route for the new path (needs sudo; the old `/dev-api/api/setu/` route stays):

   ```powershell
   scp samadhan/deploy/add-samadhan-nginx-route.sh emamiadmin@172.17.2.21:~/
   ssh -t emamiadmin@172.17.2.21 "bash ~/add-samadhan-nginx-route.sh"
   ```

   It backs up the nginx config, adds `/dev-api/api/samadhan/` -> `localhost:4001/api/samadhan/` (a copy of the
   change-control block), runs `nginx -t`, and only then reloads gracefully; on a failed test it restores the backup
   and does not reload. Until it has run, the frontend falls back to `/api/setu` by itself.

5. **Schema rename (once per database, needs approval).** Samadhan keeps working on the existing `setu` schema (it logs a
   warning at start) until this is run on the server:

   ```bash
   cd /home/emamiadmin/apps/emami-apps-hub-backend-dev
   node samadhan/db/migrate.js status
   node samadhan/db/migrate.js up 7.0-rename --yes && pm2 restart emami-hub-backend-dev
   # undo: node samadhan/db/migrate.js down 7.0-rename --yes && pm2 restart emami-hub-backend-dev
   ```

   It is one `ALTER SCHEMA` in a transaction (seconds). Check first that no other process on another copy of the
   code still uses the old schema name (for example a production backend on the same database).

Later Samadhan updates need only steps 1-3. All scripts print a one-line undo command.

On first start on a new database Samadhan creates its `samadhan` schema and tables. If the log shows
`[samadhan] schema init failed`, the database user may not create schemas: ask the DBA to run
`backend/samadhan/db/install.sql` once, then `pm2 restart emami-hub-backend-dev`.

Demo and sample data: `deploy/demo` -> `~/samadhan-demo` (`bash ~/samadhan-demo/run.sh load|load-pulsedesk|remove`),
`deploy/mock` -> `~/samadhan-mock`. Both work before and after the schema rename; `remove` also removes demo data
loaded before v7 (`@demo.setu.local`).
