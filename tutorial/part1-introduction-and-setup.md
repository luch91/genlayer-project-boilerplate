# Zero to GenLayer: Build a Decentralized Fact-Checker with AI

## Part 1 — What is GenLayer & Setting Up Your Environment

*A 4-part hands-on tutorial where you build "TruthPost" — a dApp that uses AI to fact-check claims on-chain. No blockchain experience required.*

---

### What You'll Build

**TruthPost** is a decentralized fact-checking platform where:

1. Anyone can submit a claim (e.g., *"The Eiffel Tower is 330 meters tall"*)
2. The smart contract **fetches real sources from the internet** and uses **AI to verify** whether the claim is true, false, or partially true
3. Multiple validators independently fact-check and reach **consensus** on the verdict
4. Correct fact-checkers earn reputation points

By the end of this tutorial series, you'll have a fully working dApp with a Python intelligent contract and a Next.js frontend — and you'll understand the revolutionary concepts that make GenLayer unlike any other blockchain.

---

### Why GenLayer?

If you've worked with Ethereum, Solana, or any other blockchain, you know the limitations:

- **No internet access.** Smart contracts can't fetch data from the web. You need oracles — expensive, centralized middlemen.
- **No AI reasoning.** Contracts can only do math and if/else logic. They can't understand language, parse web pages, or make judgment calls.
- **Determinism is king.** Every node must produce the exact same output. This means smart contracts can never handle anything subjective.

**GenLayer breaks all three barriers.**

GenLayer is the first **AI-native blockchain** where smart contracts — called **Intelligent Contracts** — can:

- **Access the internet** directly (no oracles needed)
- **Use LLMs** to reason about data, parse text, and make decisions
- **Handle non-deterministic outputs** through a novel consensus mechanism

This isn't a layer on top of existing blockchains. It's a fundamentally new architecture where AI is embedded at the protocol level.

---

### The Two Big Ideas

Before we touch any code, you need to understand two concepts that make GenLayer work. Everything else builds on these.

#### 1. Optimistic Democracy Consensus

On Ethereum, every validator runs the same code and must get the *exact same result*. That's why smart contracts can't use AI — two LLM calls never produce identical output.

GenLayer solves this with **Optimistic Democracy**:

1. A transaction is submitted (e.g., "fact-check this claim")
2. A randomly selected **Leader validator** processes it first — fetching web data, running AI, producing a result
3. Other **validators** independently do the same work
4. Validators don't check for *identical* results — they check for **equivalent** results (more on this below)
5. If a majority agrees the results are equivalent, the transaction is **accepted**
6. A **Finality Window** opens where anyone can appeal
7. Appeals bring in more validators (doubling each round), creating escalating security
8. Once appeals resolve, the transaction is **finalized** and irreversible

This is based on Condorcet's Jury Theorem — the "wisdom of the crowd." The more independent validators check a result, the more likely the consensus is correct.

> **Key insight:** GenLayer doesn't require identical outputs. It requires *equivalent* outputs. This is what makes AI-powered contracts possible.

#### 2. The Equivalence Principle

The Equivalence Principle is *how* validators decide if two different AI outputs are "close enough." As a developer, YOU define what "equivalent" means for your specific use case.

GenLayer provides three types:

| Type | When to Use | Example |
|------|-------------|---------|
| **Strict Equality** | Outputs must be identical | Hash comparisons, yes/no answers |
| **Comparative** | Outputs should be similar (both leader & validator do the work) | "Ratings should be within 0.1 points" |
| **Non-Comparative** | Only the leader's output is checked against criteria (validators don't redo work) | "Summary must be accurate and under 100 words" |

In our TruthPost app, we'll use **strict equality** — because our AI returns a structured verdict (`true` / `false` / `partially_true`), and we want all validators to agree on the same label.

> **Think of it this way:** Traditional blockchain = "Did everyone get 42?" GenLayer = "Did everyone agree this claim is false?"

---

### Prerequisites

You'll need:

- **Python 3.11+** — for writing intelligent contracts
- **Node.js 18+** — for the frontend and deployment tools
- **Git** — for cloning the boilerplate
- **A modern browser with MetaMask** — for interacting with the dApp
- **GenLayer Studio** — the development environment (we'll set this up below)

No prior blockchain, Solidity, or Web3 experience required. If you know basic Python and JavaScript/TypeScript, you're good.

---

### Step 1: Set Up GenLayer Studio

GenLayer Studio is your development environment. It runs a local GenLayer network with validators, so you can deploy and test contracts.

You have two options:

**Option A: Use the hosted Studio (Recommended for beginners)**

Go to [https://studio.genlayer.com](https://studio.genlayer.com) — it's ready to use, no installation needed.

**Option B: Run Studio locally**

Follow the instructions at [https://docs.genlayer.com](https://docs.genlayer.com) to install GenLayer Studio on your machine.

---

### Step 2: Install the GenLayer CLI

The GenLayer CLI (`genlayer`) is used to select networks and deploy contracts.

```bash
npm install -g genlayer
```

Verify the installation:

```bash
genlayer --version
```

---

### Step 3: Clone and Set Up the Boilerplate

We'll fork the official GenLayer boilerplate so we don't start from scratch. It includes a working project structure, deployment scripts, and a Next.js frontend template.

```bash
git clone https://github.com/genlayerlabs/genlayer-project-boilerplate.git truthpost
cd truthpost
```

Install dependencies:

```bash
# Root project dependencies (deployment tools)
npm install

# Frontend dependencies
cd frontend
npm install
cd ..

# Python dependencies (for testing)
pip install -r requirements.txt
```

---

### Step 4: Select Your Network

GenLayer has three networks:

| Network | Use Case | RPC URL |
|---------|----------|---------|
| **studionet** | Development with hosted Studio | `https://studio.genlayer.com/api` |
| **localnet** | Local Studio instance | `http://localhost:8545` |
| **testnet** | Public testnet (Asimov) | Provided by GenLayer |

For this tutorial, we'll use **studionet**:

```bash
genlayer network
# Select "studionet" from the menu
```

---

### Step 5: Understand the Project Structure

Take a look at what the boilerplate gives us:

```
truthpost/
├── contracts/           # Python intelligent contracts (we'll write ours here)
│   └── football_bets.py # Example contract (we'll replace this)
├── frontend/            # Next.js 15 app
│   ├── app/             # Pages and layouts
│   ├── components/      # React components
│   ├── lib/             # Hooks, utilities, contract interactions
│   └── .env.example     # Environment config template
├── deploy/              # TypeScript deployment script
│   └── deployScript.ts  # Deploys contract to GenLayer
├── test/                # Python integration tests
├── package.json         # Root dependencies
└── requirements.txt     # Python dependencies
```

The boilerplate comes with a football betting dApp. In Parts 2 and 3, we'll replace the contract and adapt the frontend for our TruthPost fact-checker.

---

### Step 6: Quick Sanity Check

Let's verify everything is working by deploying the example contract:

```bash
npm run deploy
```

You should see output like:

```
Deploying contract...
Contract deployed at address: 0x...
```

If you see a contract address, your environment is set up correctly!

> **Troubleshooting:**
> - If deployment fails, make sure GenLayer Studio is running (or you're connected to studionet)
> - Check that `genlayer network` is set to the right network
> - Ensure `npm install` completed successfully at the root level

---

### What's Coming Next

Now that your environment is ready, here's the roadmap:

| Part | What You'll Learn |
|------|-------------------|
| **Part 1** (this one) | What GenLayer is, Optimistic Democracy, Equivalence Principle, environment setup |
| **Part 2** | Writing the TruthPost intelligent contract in Python — web access, LLM calls, storage |
| **Part 3** | Building the frontend with Next.js, genlayer-js, and MetaMask wallet integration |
| **Part 4** | Testing, deployment to testnet, and what to build next |

---

### Key Takeaways

- GenLayer is an **AI-native blockchain** where contracts can access the internet and use LLMs
- **Optimistic Democracy** lets validators reach consensus on non-deterministic outputs through equivalence checking, not exact matching
- The **Equivalence Principle** is how developers define what "close enough" means for AI outputs
- **Intelligent Contracts** are written in Python, not Solidity — making them accessible to millions more developers
- The GenLayer ecosystem includes **Studio** (dev environment), **CLI** (deployment), and **genlayer-js** (frontend SDK)

**Next up: [Part 2 — Writing Your First Intelligent Contract →](part2-intelligent-contract.md)**

---

*This tutorial is part of the GenLayer Builder Program. The complete source code is available in the [TruthPost repository](https://github.com/genlayerlabs/genlayer-project-boilerplate).*
