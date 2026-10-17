# Deploying Setu to the dev backend server

Dev backend: `emami-hub-backend-dev` (PM2) on 172.17.2.21, folder `/home/emamiadmin/apps/emami-apps-hub-backend-dev`,
port 4001, exposed as `https://audit-capa-api.emamiapps.in/dev-api/`. Production (`emami-hub-backend`) is not touched.

## Steps (Windows PowerShell on your PC)

1. Copy the Setu backend folder and the script to the server (enter the server password when asked):

   ```powershell
   cd "D:\OneDrive - Emami Limited\Desktop\Emami Apps Dev\Emami_Apps_Dev\backend"
   ssh emamiadmin@172.17.2.21 "rm -rf ~/setu-upload"
   scp -r setu emamiadmin@172.17.2.21:~/setu-upload
   scp setu/deploy/deploy-dev-server.sh emamiadmin@172.17.2.21:~/
   ```

2. Run it on the server:

   ```powershell
   ssh emamiadmin@172.17.2.21 "bash ~/deploy-dev-server.sh"
   ```

3. It should end with `Setu /api/setu/me -> 401` and `Another app ... -> 401`, and print the one-line undo command.

4. One-time nginx route (needs sudo; already done on 17 Oct 2026 - the script skips itself if the route exists):

   ```powershell
   scp setu/deploy/add-setu-nginx-route.sh emamiadmin@172.17.2.21:~/
   ssh -t emamiadmin@172.17.2.21 "bash ~/add-setu-nginx-route.sh"
   ```

   It backs up the nginx config, adds `/dev-api/api/setu/` -> `localhost:4001/api/setu/` (a copy of the change-control
   block), runs `nginx -t`, and only then reloads gracefully; on a failed test it restores the backup and does not reload.

Later Setu updates need only steps 1-3. Both scripts print a one-line undo command.

On first start Setu creates its `setu` schema and tables. If the log shows `[setu] schema init failed`, the database
user may not create schemas: ask the DBA to run `backend/setu/db/install.sql` once, then `pm2 restart emami-hub-backend-dev`.
