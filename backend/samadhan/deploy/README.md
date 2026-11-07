# Deploying Samadhan to the dev backend server

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

3. It should end with `Samadhan /api/samadhan/me -> 401` and `Another app ... -> 401`, and print the one-line undo
   command. Database changes run by themselves at start-up (each has a down step).

4. One-time nginx route for `/dev-api/api/samadhan/` (needs root - the server admin):

   ```powershell
   scp samadhan/deploy/add-samadhan-nginx-route.sh emamiadmin@172.17.2.21:~/
   ssh -t emamiadmin@172.17.2.21 "bash ~/add-samadhan-nginx-route.sh"
   ```

   It backs up the nginx config, puts the `/dev-api/api/samadhan/` -> `localhost:4001/api/samadhan/` block in place of
   the older Samadhan block, runs `nginx -t`, and only then reloads gracefully; on a failed test it restores the backup
   and does not reload. Until it has run, the app uses the route that is forwarded today by itself (nobody sees it).
   Afterwards set `TRANSPORT_PATH` to `null` in `backend/samadhan/index.js` and `FALLBACK_ROUTE` in the frontend `api.ts`.

Later Samadhan updates need only steps 1-3. All scripts print a one-line undo command.

On first start on a new database Samadhan creates its `samadhan` schema and tables. If the log shows
`[samadhan] schema init failed`, the database user may not create schemas: ask the DBA to run
`backend/samadhan/db/install.sql` once, then `pm2 restart emami-hub-backend-dev`.

Demo and sample data: `deploy/demo` -> `~/samadhan-demo` (`bash ~/samadhan-demo/run.sh load|load-pulsedesk|load-v7|remove`;
`load-v7` adds the last 14 days of tickets for the dashboards / reports / insights, 4 groups with their categories, and
Authorization cockpit examples for demo agents only; `load-v7-apps` (after `load-v7`, Phase 3) puts those tickets in their
service desk's application and adds mail-classification examples, sender rules and keyword suggestions),
`deploy/mock` -> `~/samadhan-mock`. `remove` deletes exactly the demo data.
