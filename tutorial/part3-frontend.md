# Zero to GenLayer: Build a Decentralized AI Fact-Checker from Scratch

## Part 3 — Building the Frontend with Next.js & genlayer-js

*Your contract can fetch web pages and run AI prompts. Now let's build the interface — a React app where users can submit claims, trigger on-chain fact-checks, and watch AI verdicts appear in real time.*

---

In Part 2, we wrote a Python contract that does things no Ethereum contract could ever do. But a contract without a frontend is like an API without a client — technically impressive, practically useless.

In this part, we'll build a full UI where users can:

- **Connect their MetaMask wallet** to the GenLayer network
- **Submit claims** for fact-checking
- **Trigger AI-powered fact-checks** and watch verdicts come back
- **View a reputation leaderboard** of active contributors

The boilerplate already provides the project structure, wallet integration, and base UI components. We'll adapt them for TruthPost.

---

## The Stack

The boilerplate uses a modern React setup:

| Library | Role |
|---------|------|
| **Next.js 15** | React framework with App Router |
| **genlayer-js** | GenLayer SDK — reads/writes to intelligent contracts |
| **wagmi + viem** | Wallet management and Ethereum utilities |
| **TanStack Query** | Server state management: caching, loading states, auto-refetch |
| **Tailwind CSS** | Styling |
| **Radix UI** | Accessible component primitives (dialogs, buttons, etc.) |

---

## How genlayer-js Works

Before we start coding, let's understand the SDK that connects your frontend to GenLayer.

```typescript
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

// Create a client for the GenLayer network
const client = createClient({
  chain: studionet,
  account: "0xYourAddress",  // optional — needed for write calls
});

// READ from a contract (free, no gas, no wallet needed)
const claims = await client.readContract({
  address: "0xContractAddress",
  functionName: "get_claims",
  args: [],
});

// WRITE to a contract (costs gas, wallet must be connected)
const txHash = await client.writeContract({
  address: "0xContractAddress",
  functionName: "submit_claim",
  args: ["The sky is blue", "https://example.com"],
  value: BigInt(0),
});

// Wait for validators to reach consensus
const receipt = await client.waitForTransactionReceipt({
  hash: txHash,
  status: "ACCEPTED",
});
```

The pattern is straightforward:
- **`readContract`** calls `@gl.public.view` methods — free, instant, no wallet required
- **`writeContract`** calls `@gl.public.write` methods — costs gas, MetaMask signs the transaction
- **`waitForTransactionReceipt`** blocks until the network reaches consensus (Optimistic Democracy happens here)

When you provide an `account` address, genlayer-js uses MetaMask (`window.ethereum`) under the hood for transaction signing.

---

## Step 1: Configure the Environment

Copy the environment template and set your deployed contract address from Part 2:

```bash
cd frontend
cp .env.example .env
```

Edit `frontend/.env`:

```env
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999
NEXT_PUBLIC_GENLAYER_CHAIN_NAME=GenLayer Studio
NEXT_PUBLIC_GENLAYER_SYMBOL=GEN
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYOUR_DEPLOYED_CONTRACT_ADDRESS
```

Replace `0xYOUR_DEPLOYED_CONTRACT_ADDRESS` with the address you got when deploying in Part 2.

---

## Step 2: The Contract Interaction Layer

The boilerplate uses a pattern where we wrap genlayer-js in a TypeScript class. This gives us type safety, error handling, and a clean API for React hooks to call.

### Define Types

First, create `frontend/lib/contracts/types.ts`:

```typescript
export interface Claim {
  id: string;
  text: string;
  verdict: string;          // "pending" | "true" | "false" | "partially_true"
  explanation: string;
  source_url: string;
  submitter: string;
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
```

### Create the Contract Class

Create `frontend/lib/contracts/TruthPost.ts`:

```typescript
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { Claim, ReputationEntry, TransactionReceipt } from "./types";

class TruthPost {
  private contractAddress: `0x${string}`;
  private client: ReturnType<typeof createClient>;

  constructor(contractAddress: string, address?: string | null, studioUrl?: string) {
    this.contractAddress = contractAddress as `0x${string}`;
    const config: any = { chain: studionet };
    if (address) config.account = address as `0x${string}`;
    if (studioUrl) config.endpoint = studioUrl;
    this.client = createClient(config);
  }

  updateAccount(address: string): void {
    this.client = createClient({
      chain: studionet,
      account: address as `0x${string}`,
    });
  }

  // ─── READ METHODS ─────────────────────────────────────────

  async getClaims(): Promise<Claim[]> {
    const result: any = await this.client.readContract({
      address: this.contractAddress,
      functionName: "get_claims",
      args: [],
    });

    // genlayer-js returns Maps for TreeMap data — convert to arrays
    if (result instanceof Map) {
      return Array.from(result.entries()).map(([id, claimData]: any) => {
        const obj = claimData instanceof Map
          ? Object.fromEntries(claimData.entries())
          : claimData;
        return { id, ...obj } as Claim;
      });
    }
    return [];
  }

  async getUserReputation(address: string | null): Promise<number> {
    if (!address) return 0;
    const result = await this.client.readContract({
      address: this.contractAddress,
      functionName: "get_user_reputation",
      args: [address],
    });
    return Number(result) || 0;
  }

  async getLeaderboard(): Promise<ReputationEntry[]> {
    const result: any = await this.client.readContract({
      address: this.contractAddress,
      functionName: "get_reputation",
      args: [],
    });

    if (result instanceof Map) {
      return Array.from(result.entries())
        .map(([address, rep]: any) => ({ address, reputation: Number(rep) }))
        .sort((a, b) => b.reputation - a.reputation);
    }
    return [];
  }

  // ─── WRITE METHODS ────────────────────────────────────────

  async submitClaim(claimText: string, sourceUrl: string): Promise<TransactionReceipt> {
    const txHash = await this.client.writeContract({
      address: this.contractAddress,
      functionName: "submit_claim",
      args: [claimText, sourceUrl],
      value: BigInt(0),
    });

    const receipt = await this.client.waitForTransactionReceipt({
      hash: txHash,
      status: "ACCEPTED" as any,
      retries: 24,
      interval: 5000,
    });
    return receipt as TransactionReceipt;
  }

  async resolveClaim(claimId: string): Promise<TransactionReceipt> {
    const txHash = await this.client.writeContract({
      address: this.contractAddress,
      functionName: "resolve_claim",
      args: [claimId],
      value: BigInt(0),
    });

    const receipt = await this.client.waitForTransactionReceipt({
      hash: txHash,
      status: "ACCEPTED" as any,
      retries: 24,
      interval: 5000,
    });
    return receipt as TransactionReceipt;
  }
}

export default TruthPost;
```

### The Map Conversion Pattern

This is the one "gotcha" you'll hit with genlayer-js. GenLayer contracts use `TreeMap` for storage, and the SDK returns JavaScript `Map` objects — not plain objects. You need to convert them:

```typescript
// TreeMap data comes back as Map
if (result instanceof Map) {
  return Array.from(result.entries()).map(([key, value]) => ...);
}
```

This pattern appears in every `read` method. Once you know to look for it, it's straightforward.

---

## Step 3: React Hooks with TanStack Query

Now we wrap the contract class in React hooks. TanStack Query gives us caching, loading states, error handling, and automatic cache invalidation — all for free.

Create `frontend/lib/hooks/useTruthPost.ts`:

```typescript
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import TruthPost from "../contracts/TruthPost";
import { getContractAddress, getStudioUrl } from "../genlayer/client";
import { useWallet } from "../genlayer/wallet";

// Get a contract instance (recreated when wallet changes)
export function useTruthPostContract(): TruthPost | null {
  const { address } = useWallet();
  const contractAddress = getContractAddress();
  const studioUrl = getStudioUrl();

  return useMemo(() => {
    if (!contractAddress) return null;
    return new TruthPost(contractAddress, address, studioUrl);
  }, [contractAddress, address, studioUrl]);
}

// Fetch all claims
export function useClaims() {
  const contract = useTruthPostContract();
  return useQuery({
    queryKey: ["claims"],
    queryFn: () => contract?.getClaims() ?? Promise.resolve([]),
    refetchOnWindowFocus: true,
    staleTime: 2000,
    enabled: !!contract,
  });
}

// Fetch user reputation
export function useUserReputation(address: string | null) {
  const contract = useTruthPostContract();
  return useQuery({
    queryKey: ["reputation", address],
    queryFn: () => contract?.getUserReputation(address) ?? Promise.resolve(0),
    enabled: !!address && !!contract,
    staleTime: 2000,
  });
}

// Fetch leaderboard
export function useLeaderboard() {
  const contract = useTruthPostContract();
  return useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => contract?.getLeaderboard() ?? Promise.resolve([]),
    refetchOnWindowFocus: true,
    staleTime: 2000,
    enabled: !!contract,
  });
}

// Submit a new claim
export function useSubmitClaim() {
  const contract = useTruthPostContract();
  const { address } = useWallet();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ claimText, sourceUrl }: { claimText: string; sourceUrl: string }) => {
      if (!contract) throw new Error("Contract not configured");
      if (!address) throw new Error("Wallet not connected");
      return contract.submitClaim(claimText, sourceUrl);
    },
    onSuccess: () => {
      // Refresh everything after a successful write
      queryClient.invalidateQueries({ queryKey: ["claims"] });
      queryClient.invalidateQueries({ queryKey: ["reputation"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });

  return { ...mutation, submitClaim: mutation.mutate };
}

// Resolve (fact-check) a claim
export function useResolveClaim() {
  const contract = useTruthPostContract();
  const { address } = useWallet();
  const queryClient = useQueryClient();
  const [resolvingClaimId, setResolvingClaimId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (claimId: string) => {
      if (!contract) throw new Error("Contract not configured");
      if (!address) throw new Error("Wallet not connected");
      setResolvingClaimId(claimId);
      return contract.resolveClaim(claimId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claims"] });
      queryClient.invalidateQueries({ queryKey: ["reputation"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      setResolvingClaimId(null);
    },
    onError: () => setResolvingClaimId(null),
  });

  return { ...mutation, resolvingClaimId, resolveClaim: mutation.mutate };
}
```

**Why TanStack Query for blockchain?** Blockchain reads are just async data fetching — like API calls. TanStack Query gives us:

- **Caching** — don't re-fetch when the data hasn't changed
- **Loading/error states** — `isLoading`, `isError` on every query
- **Cache invalidation** — after a `write`, we invalidate queries so the UI refreshes instantly
- **Refetch on focus** — data updates when the user switches back to the tab

---

## Step 4: The Wallet (Already Handled)

The boilerplate includes a complete MetaMask integration. You don't need to modify it. It provides a `useWallet()` hook:

```typescript
const {
  address,              // Current wallet address (or null)
  isConnected,          // Is a wallet connected?
  isMetaMaskInstalled,  // Is MetaMask available?
  isOnCorrectNetwork,   // On the GenLayer network?
  connectWallet,        // Trigger MetaMask popup
  disconnectWallet,     // Clear wallet state
} = useWallet();
```

The wallet provider handles all the edge cases: account switching, network switching, auto-reconnect on page refresh. It works with any GenLayer contract out of the box.

---

## Step 5: Building the Claims List

Now the UI. Let's build the component that displays all claims with their verdicts:

```tsx
// frontend/components/ClaimsList.tsx
"use client";

import { useClaims, useResolveClaim } from "../lib/hooks/useTruthPost";
import { useWallet } from "../lib/genlayer/wallet";

function VerdictBadge({ verdict }: { verdict: string }) {
  const styles: Record<string, string> = {
    true: "bg-green-500/20 text-green-400 border-green-500/30",
    false: "bg-red-500/20 text-red-400 border-red-500/30",
    partially_true: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    pending: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };

  const labels: Record<string, string> = {
    true: "True", false: "False",
    partially_true: "Partially True", pending: "Pending",
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs border ${styles[verdict] || styles.pending}`}>
      {labels[verdict] || verdict}
    </span>
  );
}

export default function ClaimsList() {
  const { data: claims, isLoading, error } = useClaims();
  const { resolveClaim, isPending, resolvingClaimId } = useResolveClaim();
  const { isConnected } = useWallet();

  if (isLoading) return <div className="text-center p-8">Loading claims...</div>;
  if (error) return <div className="text-red-400 p-8">Error: {error.message}</div>;
  if (!claims?.length) return <div className="text-center p-8">No claims yet. Be the first!</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Submitted Claims</h2>
      {claims.map((claim) => (
        <div key={claim.id} className="border border-white/10 rounded-lg p-4 space-y-2">
          <p className="text-lg font-medium">{claim.text}</p>

          <div className="flex items-center gap-3 text-sm text-gray-400">
            <VerdictBadge verdict={claim.verdict} />
            <span>Source: {new URL(claim.source_url).hostname}</span>
            <span>By: {claim.submitter.slice(0, 6)}...{claim.submitter.slice(-4)}</span>
          </div>

          {claim.has_been_checked && claim.explanation && (
            <p className="text-sm text-gray-300 bg-white/5 rounded p-3">
              AI Analysis: {claim.explanation}
            </p>
          )}

          {!claim.has_been_checked && isConnected && (
            <button
              onClick={() => resolveClaim(claim.id)}
              disabled={isPending}
              className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm disabled:opacity-50"
            >
              {isPending && resolvingClaimId === claim.id
                ? "Fact-checking with AI..."
                : "Fact-Check This Claim"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
```

When a user clicks "Fact-Check This Claim," the button label changes to "Fact-checking with AI..." while the blockchain is literally fetching a web page and querying an LLM. That's not a loading spinner for a database query — it's AI consensus happening on-chain.

---

## Step 6: The Submit Form

```tsx
// frontend/components/SubmitClaimModal.tsx
"use client";

import { useState } from "react";
import { useSubmitClaim } from "../lib/hooks/useTruthPost";
import { useWallet } from "../lib/genlayer/wallet";

export default function SubmitClaimModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [claimText, setClaimText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const { submitClaim, isPending } = useSubmitClaim();
  const { isConnected } = useWallet();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimText.trim() || !sourceUrl.trim()) return;

    submitClaim(
      { claimText: claimText.trim(), sourceUrl: sourceUrl.trim() },
      {
        onSuccess: () => {
          setClaimText("");
          setSourceUrl("");
          setIsOpen(false);
        },
      }
    );
  };

  if (!isConnected) return null;

  return (
    <>
      <button onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium">
        Submit a Claim
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-white/10 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Submit a Claim for Fact-Checking</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Claim</label>
                <textarea value={claimText} onChange={(e) => setClaimText(e.target.value)}
                  placeholder='"The Great Wall of China is visible from space"'
                  className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm"
                  rows={3} required />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Source URL</label>
                <input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://en.wikipedia.org/wiki/Great_Wall_of_China"
                  className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm" required />
                <p className="text-xs text-gray-500 mt-1">
                  The AI will fetch this URL to verify the claim
                </p>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                <button type="submit" disabled={isPending || !claimText.trim() || !sourceUrl.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50">
                  {isPending ? "Submitting..." : "Submit Claim"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
```

---

## Step 7: Wire It Together

Update `frontend/app/page.tsx` to use the TruthPost components:

```tsx
import ClaimsList from "../components/ClaimsList";
import SubmitClaimModal from "../components/SubmitClaimModal";

export default function Home() {
  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">TruthPost</h1>
        <p className="text-gray-400 text-lg">
          Decentralized fact-checking powered by AI on GenLayer
        </p>
      </div>

      <div className="mb-6 flex justify-end">
        <SubmitClaimModal />
      </div>

      <ClaimsList />

      <div className="mt-16 border-t border-white/10 pt-8">
        <h2 className="text-2xl font-bold mb-6 text-center">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-4">
            <div className="text-3xl mb-2">1</div>
            <h3 className="font-bold mb-1">Submit a Claim</h3>
            <p className="text-sm text-gray-400">
              Enter any factual claim and a source URL for verification
            </p>
          </div>
          <div className="text-center p-4">
            <div className="text-3xl mb-2">2</div>
            <h3 className="font-bold mb-1">AI Fact-Checks It</h3>
            <p className="text-sm text-gray-400">
              GenLayer fetches the source and uses AI to analyze the claim on-chain
            </p>
          </div>
          <div className="text-center p-4">
            <div className="text-3xl mb-2">3</div>
            <h3 className="font-bold mb-1">Validators Agree</h3>
            <p className="text-sm text-gray-400">
              Multiple validators independently verify through Optimistic Democracy
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
```

---

## Step 8: Run It

```bash
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Try it out:**

1. Click **"Connect Wallet"** — MetaMask will prompt you to connect and switch to GenLayer
2. Click **"Submit a Claim"** — try *"Python was created by Guido van Rossum"* with source `https://en.wikipedia.org/wiki/Python_(programming_language)`
3. After the claim appears, click **"Fact-Check This Claim"**
4. Wait ~30 seconds while GenLayer fetches Wikipedia, runs the LLM, and reaches consensus
5. Watch the verdict appear: **True**, with an AI-generated explanation

That loading spinner isn't waiting on a database. It's waiting on a smart contract to browse the internet, think about what it found, and get multiple independent validators to agree. All on-chain.

---

## The Full Data Flow

```
User clicks "Submit Claim"
  -> SubmitClaimModal calls submitClaim()
    -> Hook calls contract.submitClaim()
      -> genlayer-js calls writeContract()
        -> MetaMask signs the transaction
          -> GenLayer validators execute submit_claim()
            -> Claim stored on-chain with verdict="pending"
              -> waitForTransactionReceipt() resolves
                -> TanStack Query invalidates cache
                  -> ClaimsList re-renders with the new claim

User clicks "Fact-Check This Claim"
  -> ClaimsList calls resolveClaim()
    -> genlayer-js sends resolve_claim transaction
      -> Leader validator runs _fact_check():
        -> gl.nondet.web.render() fetches the URL
        -> gl.nondet.exec_prompt() queries the AI
        -> Returns {"verdict": "true", "explanation": "..."}
      -> Other validators do the same independently
      -> gl.eq_principle.strict_eq() checks consensus
        -> All agree -> transaction accepted
          -> UI refreshes with verdict and explanation
```

---

## Frontend Patterns Recap

| Pattern | Purpose | Where |
|---------|---------|-------|
| Contract class | Typed wrapper around genlayer-js | `lib/contracts/TruthPost.ts` |
| Map conversion | `TreeMap` -> JavaScript arrays | `getClaims()`, `getLeaderboard()` |
| TanStack Query hooks | Caching, loading states, auto-refetch | `lib/hooks/useTruthPost.ts` |
| Cache invalidation | Refresh UI after writes | `onSuccess` in mutations |
| Wallet context | Global wallet state | `lib/genlayer/WalletProvider.tsx` |
| Conditional rendering | Show/hide based on wallet connection | `isConnected` checks |

In the final part, we'll test the contract, deploy to testnet, and explore where to go from here.

**Next up: [Part 4 — Testing, Deployment & What's Next](part4-testing-and-deployment.md)**

---

*This tutorial is part of the GenLayer Builder Program. The complete source code is available in the [TruthPost repository](https://github.com/genlayerlabs/genlayer-project-boilerplate).*
