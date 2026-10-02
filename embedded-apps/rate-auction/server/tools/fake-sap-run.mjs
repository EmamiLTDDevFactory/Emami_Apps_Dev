// Starts the fake SAP on a fixed port for local testing:  npm run fake-sap
import { startFakeSap } from './fake-sap.mjs';
const { url } = await startFakeSap(Number(process.env.PORT) || 4004);
console.log('Fake SAP running at ' + url + '  (user: sapuser, password: secret)');
