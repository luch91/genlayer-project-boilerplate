# Zero to GenLayer: Build a Decentralized AI Fact-Checker from Scratch

## Part 1 — What Makes GenLayer Different (And How to Set Up Your Environment)

*This is Part 1 of a 4-part series where you'll build **TruthPost** — a decentralized app that uses AI to fact-check claims directly on-chain. No blockchain experience needed. If you can write basic Python and JavaScript, you're ready.*

---

Imagine a smart contract that can Google something.

Not through some third-party oracle. Not through an off-chain service you have to trust. The contract itself opens a browser, reads a web page, thinks about what it found, and writes a verdict to the blockchain.

That's what we're going to build.

**TruthPost** is a fact-checking platform where anyone can submit a claim — say, *"The Eiffel Tower is 330 meters tall"* — and the blockchain will:

1. Fetch a real source from the internet (like Wikipedia)
2. Send the content to an AI model for analysis
3. Have multiple independent validators verify the AI's verdict
4. Record the result on-chain — permanently, transparently, without trusting anyone

By the end of this 4-part series, you'll have a complete working dApp: a Python smart contract doing things that are literally impossible on Ethereum, plus a React frontend with wallet integration.

Let's start with *why* this is possible at all.

---

## The Problem With Every Other Blockchain

If you've touched Ethereum, Solana, or any other chain, you've hit the same walls:

**Smart contracts can't see the outside world.** They can't make HTTP requests. They can't read a news article. If they need real-world data — a stock price, a sports score, today's weather — they depend on oracles. Oracles are expensive, slow, and introduce exactly the kind of trusted third party that blockchain was supposed to eliminate.

**Smart contracts can't think.** They execute deterministic logic: math, conditionals, state updates. They can't parse natural language, summarize a document, or decide whether a statement is true or false. They're calculators, not reasoners.

**Every validator must get the exact same result.** This is the deepest constraint. Blockchain consensus requires determinism — run the same code, get the same output. But AI models are inherently non-deterministic. Ask GPT the same question twice, you'll get two different answers. Traditional blockchains have no way to handle this.

GenLayer breaks all three of these barriers. Not with workarounds — at the protocol level.

---

## What is GenLayer?

GenLayer is an **AI-native blockchain**. That phrase gets thrown around loosely in crypto, so let me be specific about what it means here.

Smart contracts on GenLayer — called **Intelligent Contracts** — are Python classes that run inside a custom virtual machine called GenVM. Inside GenVM, contracts have native access to two things no other blockchain offers:

- **The internet.** Contracts can fetch web pages, call APIs, take screenshots — directly, without oracles.
- **Large Language Models.** Contracts can run prompts through AI models and get back structured responses.

And GenLayer has a consensus mechanism specifically designed to handle the fact that AI outputs aren't deterministic.

This isn't a layer-2 solution or a plugin. It's a new blockchain architecture built from the ground up for AI-powered applications.

---

## The Two Big Ideas

Everything in GenLayer rests on two concepts. Once you understand these, the rest of the tutorial will click.

### 1. Optimistic Democracy

On Ethereum, consensus works by repetition: every validator runs the same code and checks that they all got the same answer. If you ask an LLM a question, that model breaks — two validators will get two different phrasings, and the chain rejects the transaction.

GenLayer replaces this with **Optimistic Democracy**:

1. A transaction comes in (e.g., "fact-check this claim")
2. A randomly selected **Leader** processes it first — fetching web data, running the AI, producing a result
3. A set of other **Validators** independently do the same work
4. Validators don't compare for *identical* outputs. They compare for **equivalent** outputs
5. If a majority agrees the results are equivalent, the transaction is **accepted**
6. A window opens where anyone can **appeal** the result
7. Each appeal brings in more validators (the number doubles), creating escalating security
8. Once appeals close (or none are filed), the result is **finalized** and permanent

The key insight: GenLayer doesn't demand that every validator produces the string `"true"`. It demands that every validator *agrees the claim is true*. That's the difference between determinism and equivalence — and it's what makes AI on-chain possible.

> This is grounded in Condorcet's Jury Theorem — the mathematical principle that a majority of independent decision-makers is more likely to be correct than any individual. More validators = more confidence.

### 2. The Equivalence Principle

If validators aren't checking for identical outputs, what *are* they checking? That's where the Equivalence Principle comes in. As a developer, **you** define what "equivalent" means for your use case.

GenLayer gives you three options:

| Type | What It Means | When to Use It |
|------|--------------|----------------|
| **Strict Equality** | Outputs must be byte-for-byte identical | Structured data: yes/no, categories, JSON with fixed keys |
| **Comparative** | An LLM judges whether two outputs are "close enough" | Numeric ranges, similar-but-not-identical text |
| **Non-Comparative** | An LLM checks whether the leader's output meets specified criteria | Subjective quality checks, summaries, creative outputs |

For TruthPost, we'll use **strict equality**. Our AI returns a structured verdict — `"true"`, `"false"`, or `"partially_true"` — and we want every validator to land on the same label. Because the output space is small and constrained, strict equality works perfectly.

> **Mental model:** Traditional blockchain consensus asks "Did everyone compute 42?" GenLayer consensus asks "Does everyone agree this claim is false?" Same security guarantee, radically more flexibility.

---

## What You'll Need

Before we set up the project, make sure you have:

- **Python 3.11+** — for writing the intelligent contract
- **Node.js 18+** — for the frontend and deployment tools
- **Git** — for cloning the starter project
- **MetaMask** browser extension — for connecting your wallet to the dApp
- **GenLayer Studio** — the development environment (we'll set it up in a moment)

You don't need any blockchain experience. No Solidity, no Rust, no prior Web3 knowledge. If you're comfortable with Python and TypeScript/JavaScript, you're ready.

---

## Setting Up Your Environment

### Step 1: GenLayer Studio

GenLayer Studio is your local development environment. It spins up a GenLayer network with validators so you can deploy and test contracts.

**Option A (recommended): Use the hosted version**

Head to [studio.genlayer.com](https://studio.genlayer.com). It works out of the box — no installation, no Docker, no configuration.

**Option B: Run it locally**

Follow the setup instructions at [docs.genlayer.com](https://docs.genlayer.com).

### Step 2: Install the GenLayer CLI

The CLI handles network selection and contract deployment.

```bash
npm install -g genlayer
```

Verify it installed:

```bash
genlayer --version
```

### Step 3: Clone the Boilerplate

We'll use the official GenLayer project boilerplate as our starting point. It includes a working project structure, deployment scripts, and a complete Next.js frontend template.

```bash
git clone https://github.com/genlayerlabs/genlayer-project-boilerplate.git truthpost
cd truthpost
```

Install everything:

```bash
# Root dependencies (deployment tools)
npm install

# Frontend dependencies
cd frontend
npm install
cd ..

# Python dependencies (for contract testing)
pip install -r requirements.txt
```

### Step 4: Pick Your Network

GenLayer supports three networks:

| Network | What It's For | RPC URL |
|---------|--------------|---------|
| **studionet** | Development with hosted Studio | `https://studio.genlayer.com/api` |
| **localnet** | Your own local Studio instance | `http://localhost:8545` |
| **testnet (Asimov)** | Public testnet | Provided by GenLayer |

For this tutorial, use **studionet**:

```bash
genlayer network
# Select "studionet" from the menu
```

### Step 5: Understand What You're Working With

Here's the boilerplate structure:

```
truthpost/
├── contracts/           # Python intelligent contracts (our code goes here)
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

The boilerplate ships with a football betting dApp as an example. Over the next two parts, we'll replace the contract and adapt the frontend into TruthPost.

### Step 6: Sanity Check

Let's make sure everything works by deploying the example contract:

```bash
npm run deploy
```

You should see:

```
Deploying contract...
Contract deployed at address: 0x...
```

If you see a contract address, you're good to go.

> **If deployment fails:**
> - Make sure GenLayer Studio is running (or you're connected to studionet)
> - Double-check `genlayer network` is set correctly
> - Verify `npm install` completed at the root level

---

## The Road Ahead

Here's what we'll cover across the full series:

| Part | What You'll Build |
|------|-------------------|
| **Part 1** (you are here) | GenLayer concepts, environment setup, project structure |
| **Part 2** | The TruthPost intelligent contract — web access, LLM calls, consensus |
| **Part 3** | React frontend with genlayer-js, MetaMask, and TanStack Query |
| **Part 4** | Testing with gltest, testnet deployment, and ideas for what's next |

---

## Key Takeaways

Let's recap what makes GenLayer different from every other blockchain:

- **Intelligent Contracts** are written in Python, not Solidity — if you know Python, you can build on GenLayer
- Contracts can **access the internet** and **call AI models** natively — no oracles, no off-chain services
- **Optimistic Democracy** allows validators to reach consensus on non-deterministic outputs — the breakthrough that makes AI on-chain possible
- The **Equivalence Principle** lets you define what "agreement" means for your specific use case — strict matching, similarity comparison, or criteria-based evaluation
- The GenLayer ecosystem includes **Studio** (dev environment), **CLI** (deployment), and **genlayer-js** (frontend SDK)

In the next part, we'll write a Python smart contract that does something no Ethereum contract could ever do: fetch a web page, ask an AI to analyze it, and record the verdict on-chain.

**Next up: [Part 2 — Writing Your First Intelligent Contract](part2-intelligent-contract.md)**

---

*This tutorial is part of the GenLayer Builder Program. The complete source code is available in the [TruthPost repository](https://github.com/genlayerlabs/genlayer-project-boilerplate).*
