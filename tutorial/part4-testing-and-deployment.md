# Zero to GenLayer: Build a Decentralized AI Fact-Checker from Scratch

## Part 4 — Testing, Deployment & What to Build Next

*In this final part, you'll test your contract with real AI execution, deploy to the GenLayer testnet, and explore the entirely new category of applications that GenLayer makes possible.*

---

You have a working dApp. A Python contract that browses the internet and uses AI. A React frontend that submits claims and displays verdicts. Now let's make sure it actually works — and then ship it.

---

## Testing with gltest

GenLayer provides `gltest`, a testing framework that deploys your contract to a real GenLayer instance and runs actual transactions. This isn't mocking or simulation — your tests exercise the **real web access and AI execution**.

> **Heads up:** Tests require GenLayer Studio to be running, because `gltest` sends real transactions to the network.

### Setup

Make sure you have the Python dependencies:

```bash
pip install -r requirements.txt
```

### Writing Tests

Create `test/test_truth_post.py`:

```python
from gltest import get_contract_factory, default_account
from gltest.helpers import load_fixture
from gltest.assertions import tx_execution_succeeded


def deploy_contract():
    """Deploy a fresh TruthPost contract and verify it starts empty."""
    factory = get_contract_factory("TruthPost")
    contract = factory.deploy()

    # Verify clean slate
    assert contract.get_claims(args=[]) == {}
    assert contract.get_reputation(args=[]) == {}

    return contract


def test_submit_claim():
    """Test that a user can submit a claim."""
    contract = load_fixture(deploy_contract)

    result = contract.submit_claim(
        args=[
            "Python was created by Guido van Rossum",
            "https://en.wikipedia.org/wiki/Python_(programming_language)",
        ]
    )
    assert tx_execution_succeeded(result)

    # Verify the claim was stored
    claims = contract.get_claims(args=[])
    assert "claim_1" in str(claims)


def test_resolve_claim_true():
    """Test that a true claim gets the correct verdict."""
    contract = load_fixture(deploy_contract)

    # Submit a factually true claim
    submit_result = contract.submit_claim(
        args=[
            "Python was created by Guido van Rossum",
            "https://en.wikipedia.org/wiki/Python_(programming_language)",
        ]
    )
    assert tx_execution_succeeded(submit_result)

    # Trigger the AI fact-check
    # This actually fetches Wikipedia and queries an LLM!
    resolve_result = contract.resolve_claim(
        args=["claim_1"],
        wait_interval=10000,  # 10s between checks
        wait_retries=15,      # up to 15 retries (2.5 min)
    )
    assert tx_execution_succeeded(resolve_result)

    # Verify the verdict
    claim = contract.get_claim(args=["claim_1"])
    assert claim["has_been_checked"] == True
    assert claim["verdict"] == "true"

    # Verify reputation was awarded
    reputation = contract.get_user_reputation(args=[default_account.address])
    assert reputation == 1


def test_resolve_claim_false():
    """Test that a false claim gets the correct verdict."""
    contract = load_fixture(deploy_contract)

    submit_result = contract.submit_claim(
        args=[
            "The Great Wall of China is visible from space with the naked eye",
            "https://en.wikipedia.org/wiki/Great_Wall_of_China",
        ]
    )
    assert tx_execution_succeeded(submit_result)

    resolve_result = contract.resolve_claim(
        args=["claim_1"],
        wait_interval=10000,
        wait_retries=15,
    )
    assert tx_execution_succeeded(resolve_result)

    claim = contract.get_claim(args=["claim_1"])
    assert claim["has_been_checked"] == True
    assert claim["verdict"] == "false"


def test_cannot_resolve_twice():
    """Test that a claim can't be fact-checked twice."""
    contract = load_fixture(deploy_contract)

    contract.submit_claim(
        args=[
            "Python was created by Guido van Rossum",
            "https://en.wikipedia.org/wiki/Python_(programming_language)",
        ]
    )
    contract.resolve_claim(
        args=["claim_1"],
        wait_interval=10000,
        wait_retries=15,
    )

    # Second resolve should fail
    try:
        contract.resolve_claim(
            args=["claim_1"],
            wait_interval=10000,
            wait_retries=15,
        )
        assert False, "Should have raised an exception"
    except Exception:
        pass  # Expected
```

### Running Tests

```bash
gltest
```

> **Expect these tests to be slow.** Each `resolve_claim` call triggers a real web fetch + LLM analysis + validator consensus. Allow 30-60 seconds per resolve test. This is the real thing — not a mock.

### gltest Patterns

| Pattern | What It Does |
|---------|-------------|
| `get_contract_factory("Name")` | Gets a factory for deploying by contract class name |
| `factory.deploy()` | Deploys a fresh instance, returns a proxy object |
| `contract.method(args=[...])` | Calls a contract method |
| `load_fixture(fn)` | Caches deploy results across tests (avoids re-deploying) |
| `tx_execution_succeeded(result)` | Checks the transaction reached consensus |
| `default_account` | Test account with `.address` property |
| `wait_interval` / `wait_retries` | Polling config for slow non-deterministic calls |

---

## Deploying to Testnet

So far we've been using studionet (the development environment). Let's deploy to the real GenLayer testnet.

### Step 1: Switch Network

```bash
genlayer network
# Select "testnet" from the menu
```

### Step 2: Get Test Tokens

You'll need test GEN tokens for gas. Visit the GenLayer faucet to get some for your MetaMask address.

### Step 3: Deploy

```bash
npm run deploy
```

### Step 4: Update Frontend

Edit `frontend/.env` with the new testnet address:

```env
NEXT_PUBLIC_GENLAYER_RPC_URL=<testnet RPC URL>
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYOUR_NEW_TESTNET_ADDRESS
```

### Step 5: Run

```bash
cd frontend
npm run dev
```

Your dApp is now live on the public testnet.

---

## What You've Built

Let's take a step back and appreciate the full picture.

Across four parts, you've built **an AI-powered decentralized fact-checker** that:

- Runs on a blockchain — trustless, censorship-resistant, permanent
- Fetches real web data from inside a smart contract — no oracles
- Uses AI to analyze claims — on-chain LLM access
- Reaches consensus on subjective AI outputs — Equivalence Principle
- Has a modern React frontend with wallet integration

**None of this is possible on Ethereum, Solana, or any other existing blockchain.** GenLayer is the first platform where this category of application can exist.

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (Next.js)                 │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Claims   │  │ Submit   │  │  Wallet Provider  │  │
│  │ List     │  │ Modal    │  │  (MetaMask)       │  │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘  │
│       │              │                 │              │
│  ┌────┴──────────────┴─────────────────┴──────────┐  │
│  │         TanStack Query + React Hooks            │  │
│  └────────────────────┬────────────────────────────┘  │
│                       │                               │
│  ┌────────────────────┴────────────────────────────┐  │
│  │     TruthPost Contract Class (genlayer-js)       │  │
│  └────────────────────┬────────────────────────────┘  │
└───────────────────────┼──────────────────────────────┘
                        │ RPC
┌───────────────────────┼──────────────────────────────┐
│              GenLayer Network                         │
│                       │                               │
│  ┌────────────────────┴────────────────────────────┐  │
│  │        TruthPost Contract (Python)               │  │
│  │                                                   │  │
│  │  submit_claim()  ──→  Store on-chain             │  │
│  │  resolve_claim() ──→  _fact_check()              │  │
│  │                       ├─ web.render() → Internet  │  │
│  │                       ├─ exec_prompt() → LLM     │  │
│  │                       └─ strict_eq() → Consensus │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Leader   │  │Validator │  │Validator │  ...          │
│  └──────────┘  └──────────┘  └──────────┘              │
└─────────────────────────────────────────────────────────┘
```

---

## Where to Go From Here

Now that you understand the fundamentals, here are ways to extend TruthPost — and entirely new applications that GenLayer makes possible.

### Extend TruthPost

**Add staking.** Require users to put GEN tokens behind their claims. If a claim is intentionally misleading, they lose their stake:

```python
@gl.public.write.payable
def submit_claim(self, claim_text: str, source_url: str) -> None:
    if gl.message.value < 100:
        raise Exception("Minimum stake: 100 GEN")
    # ... rest of logic
```

**Use comparative equivalence.** Instead of requiring identical output, let validators agree on "close enough":

```python
result = gl.eq_principle.prompt_comparative(
    check_claim,
    "Results are equivalent if they agree on the same verdict "
    "and the explanations convey the same core reasoning."
)
```

**Multi-source verification.** Fetch multiple URLs and cross-reference:

```python
def _multi_source_check(self, claim_text, urls):
    def check():
        sources = [gl.nondet.web.render(url, mode="text") for url in urls]
        combined = "\n---\n".join(sources)
        prompt = f"Based on {len(urls)} sources, fact-check: {claim_text}\n{combined}"
        result = gl.nondet.exec_prompt(prompt, response_format="json")
        return json.dumps(result, sort_keys=True)
    return json.loads(gl.eq_principle.strict_eq(check))
```

**Visual verification.** Use screenshots as evidence:

```python
screenshot = gl.nondet.web.render(url, mode="screenshot")
result = gl.nondet.exec_prompt(
    "Analyze this screenshot for evidence about the claim",
    images=[screenshot]
)
```

**Dispute system.** Let users challenge verdicts, triggering re-checks with different sources.

### Build Something New

GenLayer opens up application categories that were previously impossible:

| Category | Example | What GenLayer Provides |
|----------|---------|----------------------|
| **Dispute Resolution** | On-chain arbitration | LLM analyzes evidence, validators vote on outcomes |
| **Prediction Markets** | Markets on real-world events | Web access settles outcomes from actual sources |
| **Insurance** | Parametric policies | Web access auto-verifies claims (weather, flights, etc.) |
| **Content Moderation** | Decentralized policy enforcement | LLM evaluates content against community rules |
| **Reputation Systems** | On-chain skill scoring | AI evaluates contributions and work quality |
| **Dynamic NFTs** | NFTs that evolve with real data | Web access feeds dynamic metadata |
| **Oracle Replacement** | Any data from any website | `gl.nondet.web` replaces Chainlink for many use cases |

---

## GenLayer vs. Traditional Blockchains

| Feature | Ethereum / Solana | GenLayer |
|---------|-------------------|----------|
| Contract language | Solidity / Rust | **Python** |
| Internet access | No (need oracles) | **Native** |
| AI / LLM access | No | **Native** |
| Non-deterministic logic | Impossible | **Equivalence Principle** |
| Consensus on subjective data | Impossible | **Optimistic Democracy** |
| Cost of real-world data | High (oracle fees) | **Included in gas** |

---

## Resources

| Resource | Link |
|----------|------|
| GenLayer Documentation | [docs.genlayer.com](https://docs.genlayer.com) |
| SDK API Reference | [sdk.genlayer.com](https://sdk.genlayer.com/main/_static/ai/api.txt) |
| genlayer-js SDK | [docs.genlayer.com/api-references/genlayer-js](https://docs.genlayer.com/api-references/genlayer-js) |
| GenLayer Studio | [studio.genlayer.com](https://studio.genlayer.com) |
| Contract Examples | [docs.genlayer.com/developers/intelligent-contracts/examples](https://docs.genlayer.com/developers/intelligent-contracts/examples/storage) |

---

## What You've Learned

Across this series, you went from zero to a working GenLayer dApp:

1. **Part 1:** GenLayer's core concepts — Optimistic Democracy and the Equivalence Principle
2. **Part 2:** A Python intelligent contract with web access, LLM calls, and consensus
3. **Part 3:** A React frontend connected via genlayer-js and MetaMask
4. **Part 4:** Testing with real AI execution and deployment to testnet

GenLayer represents a fundamental shift. Smart contracts can now think, read the internet, and make nuanced decisions — while maintaining the trust guarantees that blockchain provides. The applications this enables — fact-checking, dispute resolution, prediction markets, dynamic content, autonomous agents — are categories that simply couldn't exist on-chain before.

The question isn't *"what can I build?"* anymore. It's *"what couldn't I build before?"*

Welcome to GenLayer. Go build something impossible.

---

*This tutorial is part of the GenLayer Builder Program. The complete source code is available in the [TruthPost repository](https://github.com/genlayerlabs/genlayer-project-boilerplate).*
