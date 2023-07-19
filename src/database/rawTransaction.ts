import { pool, isServerConnected, waitForConnection } from '.';
import { profileBatchStatements, runProfiler } from '../logger';
import { CFXParameters, TransactionQuery } from '../types';
import { parseTransaction } from '../utils/parseTransaction';
import { scheduleTick } from '../utils/scheduleTick';

const transactionError = (queries: { query: string; params?: CFXParameters }[], parameters: CFXParameters) => {
  `${queries.map((query) => `${query.query} ${JSON.stringify(query.params || [])}`).join('\n')}\n${JSON.stringify(
    parameters
  )}`;
};

export const rawTransaction = async (
  invokingResource: string,
  queries: TransactionQuery,
  parameters: CFXParameters,
  callback?: (result: boolean) => void
) => {
  if (!isServerConnected) await waitForConnection();

  scheduleTick();

  const { transactions, cb } = parseTransaction(invokingResource, queries, parameters, callback);
  const connection = await pool.getConnection();
  const hasProfiler = await runProfiler(connection, invokingResource);
  let response = false;

  try {
    await connection.beginTransaction();
    const transactionsLength = transactions.length;

    for (let i = 0; i < transactionsLength; i++) {
      const transaction = transactions[i];

      await connection.query(transaction.query, transaction.params);

      if (hasProfiler && ((i > 0 && i % 100 === 0) || i === transactionsLength - 1)) {
        await profileBatchStatements(connection, invokingResource, transactions, null, i < 100 ? 0 : i);
      }
    }

    await connection.commit();

    response = true;
  } catch (e) {
    await connection.rollback().catch(() => {});

    const transactionErrorMessage = (e as any).sql || transactionError(transactions, parameters);
    console.error(
      `${invokingResource} was unable to execute a transaction!\n${(e as Error).message}\n${transactionErrorMessage}^0`
    );

    TriggerEvent('oxmysql:transaction-error', {
      query: transactionErrorMessage,
      parameters: parameters,
      message: (e as Error).message,
      err: e,
      resource: invokingResource,
    });
  } finally {
    connection.release();
  }

  if (cb)
    try {
      cb(response);
    } catch (err) {
      if (typeof err === 'string') {
        if (err.includes('SCRIPT ERROR:')) return console.log(err);
        console.log(`^1SCRIPT ERROR in invoking resource ${invokingResource}: ${err}^0`);
      }
    }
};
