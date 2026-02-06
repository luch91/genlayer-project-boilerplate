# Zero to GenLayer: Build a Decentralized Fact-Checker with AI

## Part 3 — Building the Frontend with Next.js & genlayer-js

*In this part, you'll connect a React frontend to your TruthPost intelligent contract using genlayer-js, MetaMask, and TanStack Query.*

---

### What We're Building

By the end of this part, you'll have a full frontend where users can:

- **Connect their MetaMask wallet** to the GenLayer network
- **Submit claims** to be fact-checked
- **Trigger AI fact-checks** and see verdicts in real-time
- **View a reputation leaderboard** of active fact-checkers

The boilerplate already gives us the project structure, wallet integration, and UI components. We'll adapt them for TruthPost.

---

### The Frontend Stack

The boilerplate uses a modern React stack:

| Library | Purpose |
|---------|---------|
| **Next.js 15** | React framework with App Router |
| **genlayer-js** | GenLayer SDK — reads/writes to intelligent contracts |
| **wagmi + viem** | Wallet management & Ethereum utilities |
| **TanStack Query** | Server state management (caching, refetching) |
| **Tailwind CSS** | Styling |
| **Radix UI** | Accessible component primitives |

---

### How genlayer-js Works

Before we code, let's understand the SDK. `genlayer-js` is the bridge between your frontend and GenLayer:

```typescript
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

// Create a client connected to the GenLayer network
const client = createClient({
  chain: studionet,              // Network: studionet, localnet, or testnetAsimov
  account: "0xYourAddress",      // Optional: for signing transactions
});

// Read from a contract (free, no gas)
const result = await client.readContract({
  address: "0xContractAddress",
  functionName: "get_claims",
  args: [],
});

// Write to a contract (costs gas, needs wallet)
const txHash = await client.writeContract({
  address: "0xContractAddress",
  functionName: "submit_claim",
  args: ["The sky is blue", "https://example.com"],
  value: BigInt(0),
});

// Wait for the transaction to be accepted
const receipt = await client.waitForTransactionReceipt({
  hash: txHash,
  status: "ACCEPTED",
});
```

**Key patterns:**
- `readContract` calls `@gl.public.view` methods — free, no wallet needed
- `writeContract` calls `@gl.public.write` methods — costs gas, needs a connected wallet
- `waitForTransactionReceipt` polls until the transaction reaches consensus
- When an `account` address is provided, genlayer-js uses MetaMask (`window.ethereum`) for signing

---

### Step 1: Configure the Environment

Copy the environment template and set your contract address:

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

Replace `0xYOUR_DEPLOYED_CONTRACT_ADDRESS` with the address from Part 2's deployment.

---

### Step 2: Create the Contract Interaction Layer

The boilerplate uses a **class-based pattern** to wrap genlayer-js calls with TypeScript types. Let's create one for TruthPost.

#### Define Types

Create `frontend/lib/contracts/types.ts`:

```typescript
export interface Claim {
  id: string;
  text: string;
  verdict: string;          // "pending" | "true" | "false" | "partially_true"
  explanation: string;
  source_url: string;
  submitter: string;         // hex address
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

#### Create the Contract Class

Create `frontend/lib/contracts/TruthPost.ts`:

```typescript
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { Claim, ReputationEntry, TransactionReceipt } from "./types";

class TruthPost {
  private contractAddress: `0x${string}`;
  private client: ReturnType<typeof createClient>;

  constructor(
    contractAddress: string,
    address?: string | null,
    studioUrl?: string
  ) {
    this.contractAddress = contractAddress as `0x${string}`;

    const config: any = {
      chain: studionet,
    };

    // If a wallet address is provided, the SDK uses MetaMask for signing
    if (address) {
      config.account = address as `0x${string}`;
    }

    if (studioUrl) {
      config.endpoint = studioUrl;
    }

    this.client = createClient(config);
  }

  /**
   * Recreate client when user switches wallet accounts
   */
  updateAccount(address: string): void {
    this.client = createClient({
      chain: studionet,
      account: address as `0x${string}`,
    });
  }

  // ─── READ METHODS (View Functions) ─────────────────────────

  /**
   * Fetch all claims from the contract
   */
  async getClaims(): Promise<Claim[]> {
    const result: any = await this.client.readContract({
      address: this.contractAddress,
      functionName: "get_claims",
      args: [],
    });

    // genlayer-js returns Maps for TreeMap data — convert to array
    if (result instanceof Map) {
      return Array.from(result.entries()).map(([id, claimData]: any) => {
        // Each claim value is also a Map of field -> value
        const obj = claimData instanceof Map
          ? Object.fromEntries(claimData.entries())
          : claimData;
        return { id, ...obj } as Claim;
      });
    }

    return [];
  }

  /**
   * Get a specific claim by ID
   */
  async getClaim(claimId: string): Promise<Claim> {
    const result: any = await this.client.readContract({
      address: this.contractAddress,
      functionName: "get_claim",
      args: [claimId],
    });

    if (result instanceof Map) {
      return Object.fromEntries(result.entries()) as Claim;
    }
    return result as Claim;
  }

  /**
   * Get reputation for a specific user
   */
  async getUserReputation(address: string | null): Promise<number> {
    if (!address) return 0;

    const result = await this.client.readContract({
      address: this.contractAddress,
      functionName: "get_user_reputation",
      args: [address],
    });

    return Number(result) || 0;
  }

  /**
   * Get the reputation leaderboard
   */
  async getLeaderboard(): Promise<ReputationEntry[]> {
    const result: any = await this.client.readContract({
      address: this.contractAddress,
      functionName: "get_reputation",
      args: [],
    });

    if (result instanceof Map) {
      return Array.from(result.entries())
        .map(([address, rep]: any) => ({
          address,
          reputation: Number(rep),
        }))
        .sort((a, b) => b.reputation - a.reputation);
    }

    return [];
  }

  // ─── WRITE METHODS (State-Changing Functions) ──────────────

  /**
   * Submit a new claim to be fact-checked
   */
  async submitClaim(
    claimText: string,
    sourceUrl: string
  ): Promise<TransactionReceipt> {
    // writeContract sends a transaction signed by MetaMask
    const txHash = await this.client.writeContract({
      address: this.contractAddress,
      functionName: "submit_claim",
      args: [claimText, sourceUrl],
      value: BigInt(0),
    });

    // Wait for validators to reach consensus
    const receipt = await this.client.waitForTransactionReceipt({
      hash: txHash,
      status: "ACCEPTED" as any,
      retries: 24,        // Check up to 24 times
      interval: 5000,     // Every 5 seconds (2 min total)
    });

    return receipt as TransactionReceipt;
  }

  /**
   * Trigger AI fact-check for a pending claim
   * This is where the magic happens — the contract fetches web data
   * and uses AI to analyze the claim!
   */
  async resolveClaim(claimId: string): Promise<TransactionReceipt> {
    const txHash = await this.client.writeContract({
      address: this.contractAddress,
      functionName: "resolve_claim",
      args: [claimId],
      value: BigInt(0),
    });

    // This can take longer because the AI fact-check runs during consensus
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

**Important pattern: Map conversion**

GenLayer contracts use `TreeMap` for storage, which genlayer-js returns as JavaScript `Map` objects. You need to convert these to plain arrays/objects for React to work with them. The pattern is:

```typescript
// TreeMap comes back as Map
if (result instanceof Map) {
  return Array.from(result.entries()).map(([key, value]) => ...);
}
```

---

### Step 3: Create React Hooks with TanStack Query

TanStack Query handles caching, refetching, and loading states. Let's create hooks for our contract.

Create `frontend/lib/hooks/useTruthPost.ts`:

```typescript
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import TruthPost from "../contracts/TruthPost";
import { getContractAddress, getStudioUrl } from "../genlayer/client";
import { useWallet } from "../genlayer/wallet";
import type { Claim, ReputationEntry } from "../contracts/types";

/**
 * Hook to get the TruthPost contract instance
 * Recreated when wallet address changes
 */
export function useTruthPostContract(): TruthPost | null {
  const { address } = useWallet();
  const contractAddress = getContractAddress();
  const studioUrl = getStudioUrl();

  return useMemo(() => {
    if (!contractAddress) return null;
    return new TruthPost(contractAddress, address, studioUrl);
  }, [contractAddress, address, studioUrl]);
}

/**
 * Hook to fetch all claims
 */
export function useClaims() {
  const contract = useTruthPostContract();

  return useQuery<Claim[], Error>({
    queryKey: ["claims"],
    queryFn: () => contract?.getClaims() ?? Promise.resolve([]),
    refetchOnWindowFocus: true,
    staleTime: 2000,
    enabled: !!contract,
  });
}

/**
 * Hook to fetch user reputation
 */
export function useUserReputation(address: string | null) {
  const contract = useTruthPostContract();

  return useQuery<number, Error>({
    queryKey: ["reputation", address],
    queryFn: () => contract?.getUserReputation(address) ?? Promise.resolve(0),
    enabled: !!address && !!contract,
    staleTime: 2000,
  });
}

/**
 * Hook to fetch the reputation leaderboard
 */
export function useLeaderboard() {
  const contract = useTruthPostContract();

  return useQuery<ReputationEntry[], Error>({
    queryKey: ["leaderboard"],
    queryFn: () => contract?.getLeaderboard() ?? Promise.resolve([]),
    refetchOnWindowFocus: true,
    staleTime: 2000,
    enabled: !!contract,
  });
}

/**
 * Hook to submit a new claim
 */
export function useSubmitClaim() {
  const contract = useTruthPostContract();
  const { address } = useWallet();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mutation = useMutation({
    mutationFn: async ({
      claimText,
      sourceUrl,
    }: {
      claimText: string;
      sourceUrl: string;
    }) => {
      if (!contract) throw new Error("Contract not configured");
      if (!address) throw new Error("Wallet not connected");
      setIsSubmitting(true);
      return contract.submitClaim(claimText, sourceUrl);
    },
    onSuccess: () => {
      // Refresh all data after submitting a claim
      queryClient.invalidateQueries({ queryKey: ["claims"] });
      queryClient.invalidateQueries({ queryKey: ["reputation"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      setIsSubmitting(false);
    },
    onError: (err: any) => {
      console.error("Error submitting claim:", err);
      setIsSubmitting(false);
    },
  });

  return {
    ...mutation,
    isSubmitting,
    submitClaim: mutation.mutate,
  };
}

/**
 * Hook to resolve (fact-check) a claim
 */
export function useResolveClaim() {
  const contract = useTruthPostContract();
  const { address } = useWallet();
  const queryClient = useQueryClient();
  const [isResolving, setIsResolving] = useState(false);
  const [resolvingClaimId, setResolvingClaimId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (claimId: string) => {
      if (!contract) throw new Error("Contract not configured");
      if (!address) throw new Error("Wallet not connected");
      setIsResolving(true);
      setResolvingClaimId(claimId);
      return contract.resolveClaim(claimId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claims"] });
      queryClient.invalidateQueries({ queryKey: ["reputation"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      setIsResolving(false);
      setResolvingClaimId(null);
    },
    onError: (err: any) => {
      console.error("Error resolving claim:", err);
      setIsResolving(false);
      setResolvingClaimId(null);
    },
  });

  return {
    ...mutation,
    isResolving,
    resolvingClaimId,
    resolveClaim: mutation.mutate,
  };
}
```

**Why TanStack Query?**

Blockchain reads are like API calls — they're async, can fail, and the data goes stale. TanStack Query gives us:

- **Automatic caching** — don't re-fetch data unnecessarily
- **Loading/error states** — `isLoading`, `isError`, `error` for free
- **Cache invalidation** — after a write, we invalidate queries so the UI refreshes
- **Refetch on focus** — data updates when the user comes back to the tab

---

### Step 4: The Wallet Connection (Already Done!)

The boilerplate includes a complete wallet integration with MetaMask. Here's what it provides:

**`WalletProvider`** (context) manages:
- Connecting/disconnecting MetaMask
- Listening for account and network changes
- Auto-reconnecting on page refresh
- Network switching to GenLayer

**`useWallet()`** hook gives you:

```typescript
const {
  address,              // Current wallet address (or null)
  isConnected,          // Boolean: is wallet connected?
  isLoading,            // Boolean: connection in progress?
  isMetaMaskInstalled,  // Boolean: is MetaMask available?
  isOnCorrectNetwork,   // Boolean: on GenLayer network?
  connectWallet,        // Function: trigger MetaMask connection
  disconnectWallet,     // Function: clear wallet state
  switchWalletAccount,  // Function: show account picker
} = useWallet();
```

**You don't need to modify the wallet code.** It works with any GenLayer contract out of the box.

---

### Step 5: Build the Claims List Component

Now let's build the UI. Create a component that displays all claims:

```tsx
// frontend/components/ClaimsList.tsx
"use client";

import { useClaims, useResolveClaim } from "../lib/hooks/useTruthPost";
import { useWallet } from "../lib/genlayer/wallet";

function VerdictBadge({ verdict }: { verdict: string }) {
  const colors: Record<string, string> = {
    true: "bg-green-500/20 text-green-400 border-green-500/30",
    false: "bg-red-500/20 text-red-400 border-red-500/30",
    partially_true: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    pending: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };

  const labels: Record<string, string> = {
    true: "True",
    false: "False",
    partially_true: "Partially True",
    pending: "Pending",
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs border ${colors[verdict] || colors.pending}`}>
      {labels[verdict] || verdict}
    </span>
  );
}

export default function ClaimsList() {
  const { data: claims, isLoading, error } = useClaims();
  const { resolveClaim, isResolving, resolvingClaimId } = useResolveClaim();
  const { address, isConnected } = useWallet();

  if (isLoading) return <div className="text-center p-8">Loading claims...</div>;
  if (error) return <div className="text-red-400 p-8">Error: {error.message}</div>;
  if (!claims?.length) return <div className="text-center p-8">No claims yet. Be the first!</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Submitted Claims</h2>

      {claims.map((claim) => (
        <div key={claim.id} className="border border-white/10 rounded-lg p-4 space-y-2">
          {/* Claim text */}
          <p className="text-lg font-medium">{claim.text}</p>

          {/* Metadata row */}
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <VerdictBadge verdict={claim.verdict} />
            <span>Source: {new URL(claim.source_url).hostname}</span>
            <span>By: {claim.submitter.slice(0, 6)}...{claim.submitter.slice(-4)}</span>
          </div>

          {/* AI explanation (shown after fact-check) */}
          {claim.has_been_checked && claim.explanation && (
            <p className="text-sm text-gray-300 bg-white/5 rounded p-3 mt-2">
              AI Analysis: {claim.explanation}
            </p>
          )}

          {/* Resolve button (only for pending claims) */}
          {!claim.has_been_checked && isConnected && (
            <button
              onClick={() => resolveClaim(claim.id)}
              disabled={isResolving}
              className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm disabled:opacity-50"
            >
              {isResolving && resolvingClaimId === claim.id
                ? "Fact-checking with AI..."
                : "Fact-Check This Claim"
              }
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
```

**What's happening here:**

1. `useClaims()` fetches all claims from the contract
2. `useResolveClaim()` gives us the mutation to trigger a fact-check
3. Each claim shows its text, verdict badge, source, and submitter
4. Pending claims show a "Fact-Check This Claim" button
5. When clicked, the button triggers the on-chain AI fact-check
6. While resolving, it shows "Fact-checking with AI..." — because GenLayer is actually fetching the web and running an LLM!

---

### Step 6: Build the Submit Claim Form

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
  const { submitClaim, isSubmitting } = useSubmitClaim();
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
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium"
      >
        Submit a Claim
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-white/10 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Submit a Claim for Fact-Checking</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Claim</label>
                <textarea
                  value={claimText}
                  onChange={(e) => setClaimText(e.target.value)}
                  placeholder='e.g., "The Great Wall of China is visible from space"'
                  className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm"
                  rows={3}
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Source URL</label>
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://en.wikipedia.org/wiki/Great_Wall_of_China"
                  className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  The AI will fetch this URL to verify the claim
                </p>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !claimText.trim() || !sourceUrl.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
                >
                  {isSubmitting ? "Submitting..." : "Submit Claim"}
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

### Step 7: Wire It All Together

Update the main page to use our TruthPost components.

Edit `frontend/app/page.tsx`:

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

      {/* Submit button + Claims list */}
      <div className="mb-6 flex justify-end">
        <SubmitClaimModal />
      </div>

      <ClaimsList />

      {/* How it works */}
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

### Step 8: Run It!

```bash
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and you should see TruthPost!

**Try it out:**

1. Click **"Connect Wallet"** in the navbar — MetaMask will prompt you to connect and switch to the GenLayer network
2. Click **"Submit a Claim"** — enter a claim like *"Python was created by Guido van Rossum"* with source URL `https://en.wikipedia.org/wiki/Python_(programming_language)`
3. After the claim appears, click **"Fact-Check This Claim"**
4. Wait ~30 seconds while GenLayer:
   - Fetches the Wikipedia page
   - Sends it to an LLM for analysis
   - Validators reach consensus on the verdict
5. See the verdict appear: **True** with an AI-generated explanation!

---

### Understanding the Data Flow

```
User clicks "Submit Claim"
  → SubmitClaimModal calls submitClaim()
    → useTruthPost hook calls contract.submitClaim()
      → genlayer-js calls writeContract()
        → MetaMask signs the transaction
          → Transaction sent to GenLayer network
            → Validators execute submit_claim() in the Python contract
              → Claim stored on-chain
                → waitForTransactionReceipt() resolves
                  → TanStack Query invalidates cache
                    → ClaimsList re-renders with new claim

User clicks "Fact-Check This Claim"
  → ClaimsList calls resolveClaim()
    → genlayer-js sends resolve_claim transaction
      → Leader validator runs _fact_check():
        → gl.nondet.web.render() fetches the URL
        → gl.nondet.exec_prompt() asks AI to analyze
        → Result: {"verdict": "true", "explanation": "..."}
      → Other validators do the same independently
      → gl.eq_principle.strict_eq() checks consensus
        → All agree → transaction accepted!
          → UI updates with verdict and explanation
```

---

### The Wallet Flow Explained

The boilerplate's wallet integration handles several important flows:

**Connecting:**
1. User clicks "Connect Wallet"
2. MetaMask popup asks for permission
3. App checks if user is on GenLayer network
4. If not, prompts to add/switch to GenLayer
5. Connection persisted (auto-reconnects on refresh)

**Account switching:**
- MetaMask fires `accountsChanged` event
- WalletProvider updates state automatically
- Contract hooks recreate the genlayer-js client with new address
- All queries refetch with new account context

**Network validation:**
- App checks `chainId` matches GenLayer's (61999)
- Shows warning if on wrong network
- Prompts to switch automatically

---

### Key Frontend Patterns Recap

| Pattern | What It Does | File |
|---------|-------------|------|
| **Contract class** | Typed wrapper around genlayer-js | `lib/contracts/TruthPost.ts` |
| **Map conversion** | TreeMap → JavaScript arrays | `getClaims()` method |
| **TanStack Query hooks** | Caching, loading states, auto-refetch | `lib/hooks/useTruthPost.ts` |
| **Cache invalidation** | Refresh UI after writes | `onSuccess` in mutations |
| **Wallet context** | Global wallet state for all components | `lib/genlayer/WalletProvider.tsx` |
| **Conditional rendering** | Show/hide based on wallet state | `isConnected` checks |

---

**Next up: [Part 4 — Testing, Deployment & What's Next →](part4-testing-and-deployment.md)**

---

*This tutorial is part of the GenLayer Builder Program. The complete source code is available in the [TruthPost repository](https://github.com/genlayerlabs/genlayer-project-boilerplate).*
