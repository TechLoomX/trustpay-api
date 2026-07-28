import 'dotenv/config';
import { createSupabaseStoreFromEnv, type Store } from './store.js';
import { fetchContractEvents } from './stellarEvents.js';
import { processEvent } from './eventHandlers.js';

const RPC_URL = process.env.SOROBAN_RPC_URL;
const CONTRACT_ID = process.env.CONTRACT_ID;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 10_000);

async function pollOnce(store: Store): Promise<void> {
  if (!RPC_URL || !CONTRACT_ID) {
    throw new Error('SOROBAN_RPC_URL and CONTRACT_ID must be set');
  }

  const startLedger = (await store.getLastProcessedLedger()) + 1;
  const events = await fetchContractEvents({ rpcUrl: RPC_URL, contractId: CONTRACT_ID, startLedger });

  if (events.length === 0) return;

  for (const event of events) {
    try {
      await processEvent(store, event);
    } catch (err) {
      // Log and keep going — one bad event shouldn't wedge the whole batch.
      // A skipped event (e.g. project not found yet) will be retried on the
      // next pass only if last_processed_ledger hasn't moved past it, so we
      // still advance the ledger cursor per-event below to avoid infinite
      // reprocessing of a persistently failing event.
      console.error(`failed to process event ${event.id} (ledger ${event.ledger}):`, err);
    }
  }

  const maxLedger = Math.max(...events.map((e) => e.ledger));
  await store.setLastProcessedLedger(maxLedger);
}

async function main(): Promise<void> {
  const store = createSupabaseStoreFromEnv();
  console.log('trustpay indexer starting, polling every', POLL_INTERVAL_MS, 'ms');

  for (;;) {
    try {
      await pollOnce(store);
    } catch (err) {
      console.error('indexer poll failed:', err);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main();
