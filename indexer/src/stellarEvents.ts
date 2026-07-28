// Thin wrapper around Soroban RPC's getEvents, decoding raw ScVal topics/values
// into native JS values via scValToNative. Event *names* (topic[0]) and value
// shapes are assumed per types.ts — confirm against the deployed contract's
// events.rs before pointing this at anything but a scratch testnet contract.
import { rpc, scValToNative } from '@stellar/stellar-sdk';
import type { RawContractEvent } from './types.js';

export interface FetchEventsParams {
  rpcUrl: string;
  contractId: string;
  startLedger: number;
  limit?: number;
}

export async function fetchContractEvents(params: FetchEventsParams): Promise<RawContractEvent[]> {
  const server = new rpc.Server(params.rpcUrl);

  const response = await server.getEvents({
    startLedger: params.startLedger,
    filters: [{ type: 'contract', contractIds: [params.contractId] }],
    limit: params.limit ?? 100,
  });

  return response.events.map((event) => ({
    id: event.id,
    ledger: event.ledger,
    ledgerClosedAt: event.ledgerClosedAt,
    contractId: event.contractId?.toString() ?? params.contractId,
    topic: event.topic.map((scVal) => scValToNative(scVal)),
    value: scValToNative(event.value),
  }));
}
