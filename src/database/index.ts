import { createPool, Pool } from 'mysql2/promise';
import { connectionOptions, mysql_transaction_isolation_level, setDebug } from '../config';
import { profilerStatements } from '../logger';

let pool: Pool;
let isServerConnected = false;

export async function waitForConnection() {
  if (!isServerConnected) {
    return await new Promise<boolean>((resolve) => {
      (function wait() {
        if (isServerConnected) {
          return resolve(true);
        }
        setTimeout(wait);
      })();
    });
  }
}

function setConnectionPool() {
  pool = createPool(connectionOptions);

  pool.on('connection', (connection) => {
    connection.query(mysql_transaction_isolation_level);
  });
}

setInterval(() => {
  setDebug();
}, 1000);

setTimeout(async () => {
  setDebug();
  setConnectionPool();

  try {
    (await pool.getConnection()).release();
    console.log(`^2Database server connection established!^0`);
    isServerConnected = true;
  } catch (err: any) {
    console.log(
      `^3Unable to establish a connection to the database (${err.code})!\n^1Error ${err.errno}: ${err.message}^0`
    );
  }
});

export { pool, isServerConnected };
