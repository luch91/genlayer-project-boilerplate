/**
 * TypeScript types for the TruthPost fact-checking contract
 */

export interface Claim {
  id: string;
  text: string;
  verdict: string; // "pending" | "true" | "false" | "partially_true"
  explanation: string;
  source_url: string;
  submitter: string; // hex address
  has_been_checked: boolean;
}

export interface ReputationEntry {
  address: string;
  reputation: number;
}

export interface TransactionReceipt {
  status: string;
  hash: string;
  blockNumber?: number;
  [key: string]: any;
}
