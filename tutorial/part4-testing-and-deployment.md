# Zero to GenLayer: Build a Decentralized Fact-Checker with AI

## Part 4 — Testing, Deployment & What to Build Next

*In this final part, you'll test your contract with gltest, deploy to the testnet, and explore what you can build next on GenLayer.*

---

### What We'll Cover

1. Writing integration tests for TruthPost using `gltest`
2. Updating the deployment script for our contract
3. Deploying to the GenLayer testnet
4. Ideas for extending TruthPost
5. What to build next on GenLayer

---

### Testing Intelligent Contracts with gltest

GenLayer provides `gltest` — a testing framework that deploys your contract to a local GenLayer instance and runs actual transactions against it. This means your tests exercise the **real AI and web access**, not mocks.

> **Important:** Tests require GenLayer Studio to be running, because `gltest` sends real transactions to the local network.

#### Setting Up Tests

Make sure you have the Python dependencies:

```bash
pip install -r requirements.txt
```

#### Writing Test Fixtures

First, let's define the expected data structures our tests will check against.

Create `test/truth_post_fixtures.py`:

```python
# Expected claim state after submission (before fact-check)
test_claim_pending = {
    "claim_1": {
        "id": "claim_1",
        "text": "Python was created by Guido van Rossum",
        "verdict": "pending",
        "explanation": "",
        "source_url": "https://en.wikipedia.org/wiki/Python_(programming_language)",
        "submitter": None,  # Will be set to default_account.address
        "has_been_checked": False,
    }
}
```

#### Writing the Test Suite

Create `test/test_truth_post.py`:

```python
from gltest import get_contract_factory, default_account
from gltest.helpers import load_fixture
from gltest.assertions import tx_execution_succeeded


def deploy_contract():
    """Deploy a fresh TruthPost contract and verify initial state."""
    factory = get_contract_factory("TruthPost")
    contract = factory.deploy()

    # Verify initial state is empty
    all_claims = contract.get_claims(args=[])
    assert all_claims == {}

    all_reputation = contract.get_reputation(args=[])
    assert all_reputation == {}

    return contract


def test_submit_claim():
    """Test that a user can submit a claim."""
    contract = load_fixture(deploy_contract)

    # Submit a claim
    result = contract.submit_claim(
        args=[
            "Python was created by Guido van Rossum",
            "https://en.wikipedia.org/wiki/Python_(programming_language)",
        ]
    )
    assert tx_execution_succeeded(result)

    # Verify claim was stored
    claims = contract.get_claims(args=[])
    assert "claim_1" in str(claims)


def test_resolve_claim_true():
    """Test that a factually true claim is correctly verified."""
    contract = load_fixture(deploy_contract)

    # Submit a claim that should be TRUE
    submit_result = contract.submit_claim(
        args=[
            "Python was created by Guido van Rossum",
            "https://en.wikipedia.org/wiki/Python_(programming_language)",
        ]
    )
    assert tx_execution_succeeded(submit_result)

    # Resolve (fact-check) the claim
    # This triggers web fetching + AI analysis + validator consensus!
    resolve_result = contract.resolve_claim(
        args=["claim_1"],
        wait_interval=10000,  # 10 seconds between checks
        wait_retries=15,      # Up to 15 retries (2.5 min total)
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
    """Test that a factually false claim is correctly identified."""
    contract = load_fixture(deploy_contract)

    # Submit a claim that should be FALSE
    submit_result = contract.submit_claim(
        args=[
            "The Great Wall of China is visible from space with the naked eye",
            "https://en.wikipedia.org/wiki/Great_Wall_of_China",
        ]
    )
    assert tx_execution_succeeded(submit_result)

    # Resolve the claim
    resolve_result = contract.resolve_claim(
        args=["claim_1"],
        wait_interval=10000,
        wait_retries=15,
    )
    assert tx_execution_succeeded(resolve_result)

    # Verify it was marked as false
    claim = contract.get_claim(args=["claim_1"])
    assert claim["has_been_checked"] == True
    assert claim["verdict"] == "false"


def test_cannot_resolve_twice():
    """Test that a claim cannot be fact-checked twice."""
    contract = load_fixture(deploy_contract)

    # Submit and resolve
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

    # Try to resolve again — should fail
    try:
        contract.resolve_claim(
            args=["claim_1"],
            wait_interval=10000,
            wait_retries=15,
        )
        assert False, "Should have raised an exception"
    except Exception:
        pass  # Expected — claim already resolved
```

#### Running Tests

```bash
gltest
```

> **Note:** Tests that involve `resolve_claim` will take longer because GenLayer is actually:
> 1. Fetching a web page
> 2. Running an LLM prompt
> 3. Having validators reach consensus
>
> This is real AI execution, not a mock! Allow ~30-60 seconds per resolve test.

#### Understanding gltest Patterns

| Pattern | Description |
|---------|-------------|
| `get_contract_factory("Name")` | Gets a factory for deploying a contract by class name |
| `factory.deploy()` | Deploys a fresh instance and returns a contract proxy |
| `contract.method_name(args=[...])` | Calls a contract method |
| `load_fixture(fn)` | Caches the result of a deploy function across tests |
| `tx_execution_succeeded(result)` | Asserts the transaction reached consensus |
| `default_account` | The test account with `.address` property |
| `wait_interval` / `wait_retries` | For non-deterministic calls that take time |

---

### Updating the Deployment Script

Update `deploy/deployScript.ts` to deploy TruthPost instead of FootballBets:

```typescript
import { readFileSync } from "fs";
import path from "path";
import {
  TransactionHash,
  TransactionStatus,
  GenLayerClient,
  DecodedDeployData,
  GenLayerChain,
} from "genlayer-js/types";
import { localnet } from "genlayer-js/chains";

export default async function main(client: GenLayerClient<any>) {
  // Point to our TruthPost contract
  const filePath = path.resolve(process.cwd(), "contracts/truth_post.py");

  try {
    const contractCode = new Uint8Array(readFileSync(filePath));

    await client.initializeConsensusSmartContract();

    const deployTransaction = await client.deployContract({
      code: contractCode,
      args: [],
    });

    const receipt = await client.waitForTransactionReceipt({
      hash: deployTransaction as TransactionHash,
      status: TransactionStatus.ACCEPTED,
      retries: 200,
    });

    if (
      receipt.status !== 5 &&
      receipt.status !== 6 &&
      receipt.statusName !== "ACCEPTED" &&
      receipt.statusName !== "FINALIZED"
    ) {
      throw new Error(`Deployment failed. Receipt: ${JSON.stringify(receipt)}`);
    }

    const deployedContractAddress =
      (client.chain as GenLayerChain).id === localnet.id
        ? receipt.data.contract_address
        : (receipt.txDataDecoded as DecodedDeployData)?.contractAddress;

    console.log(`Contract deployed at address: ${deployedContractAddress}`);
    console.log(`\nNext steps:`);
    console.log(`1. Copy the address above`);
    console.log(`2. Set NEXT_PUBLIC_CONTRACT_ADDRESS in frontend/.env`);
    console.log(`3. Run: cd frontend && npm run dev`);
  } catch (error) {
    throw new Error(`Error during deployment: ${error}`);
  }
}
```

---

### Deploying to Testnet

So far we've used studionet (the development environment). Let's deploy to the real GenLayer testnet.

#### Step 1: Switch Network

```bash
genlayer network
# Select "testnet" from the menu
```

#### Step 2: Get Test Tokens

You'll need test GEN tokens for gas. Visit the GenLayer faucet to get some for your MetaMask address.

#### Step 3: Deploy

```bash
npm run deploy
```

#### Step 4: Update Frontend Config

Edit `frontend/.env`:

```env
NEXT_PUBLIC_GENLAYER_RPC_URL=<testnet RPC URL>
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYOUR_NEW_TESTNET_ADDRESS
```

#### Step 5: Run & Share

```bash
cd frontend
npm run dev
```

Your dApp is now running against the public testnet!

---

### What You've Built — A Recap

Let's step back and appreciate what you've built across this tutorial:

**An AI-powered decentralized fact-checker that:**

- Runs on a blockchain (trustless, censorship-resistant)
- Fetches real web data from inside a smart contract (no oracles!)
- Uses AI to analyze claims (on-chain LLM access!)
- Reaches consensus on subjective AI outputs (Equivalence Principle!)
- Has a modern React frontend with wallet integration

**This would be impossible on Ethereum, Solana, or any other blockchain.** GenLayer is the first platform where this kind of application can exist.

---

### Architecture Diagram

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
│  │          TanStack Query Hooks                   │  │
│  │  useClaims() | useSubmitClaim() | useResolve()  │  │
│  └────────────────────┬────────────────────────────┘  │
│                       │                               │
│  ┌────────────────────┴────────────────────────────┐  │
│  │        TruthPost Contract Class                  │  │
│  │        (genlayer-js wrapper)                     │  │
│  └────────────────────┬────────────────────────────┘  │
└───────────────────────┼──────────────────────────────┘
                        │ RPC
┌───────────────────────┼──────────────────────────────┐
│              GenLayer Network                         │
│                       │                               │
│  ┌────────────────────┴────────────────────────────┐  │
│  │        TruthPost Contract (Python)               │  │
│  │                                                   │  │
│  │  submit_claim()  ──→  Store claim on-chain       │  │
│  │  resolve_claim() ──→  _fact_check()              │  │
│  │                       ├─ web.render() → Internet  │  │
│  │                       ├─ exec_prompt() → LLM     │  │
│  │                       └─ strict_eq() → Consensus │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Leader   │  │Validator │  │Validator │  ...          │
│  │ (runs    │  │ (verifies│  │ (verifies│              │
│  │  first)  │  │  result) │  │  result) │              │
│  └──────────┘  └──────────┘  └──────────┘              │
└─────────────────────────────────────────────────────────┘
```

---

### Ideas to Extend TruthPost

Now that you understand the fundamentals, here are some ways to make TruthPost more powerful:

#### 1. Add Staking
Make users stake GEN tokens when submitting claims. If the claim turns out to be intentionally misleading, they lose their stake:

```python
@gl.public.write.payable
def submit_claim(self, claim_text: str, source_url: str) -> None:
    if gl.message.value < 100:
        raise Exception("Minimum stake: 100 GEN")
    # ... rest of logic
```

#### 2. Use Comparative Equivalence
Instead of strict equality, use comparative equivalence for more nuanced verdicts:

```python
result = gl.eq_principle.prompt_comparative(
    check_claim,
    "Results are equivalent if they agree on the same verdict (true/false/partially_true) "
    "and the explanations convey the same core reasoning, even if worded differently."
)
```

#### 3. Multi-Source Verification
Fetch multiple sources and cross-reference:

```python
def _multi_source_check(self, claim_text, urls):
    def check():
        results = []
        for url in urls:
            web_data = gl.nondet.web.render(url, mode="text")
            results.append(web_data)

        combined = "\n---\n".join(results)
        prompt = f"Based on these {len(urls)} sources, fact-check: {claim_text}\n{combined}"
        result = gl.nondet.exec_prompt(prompt, response_format="json")
        return json.dumps(result, sort_keys=True)

    return json.loads(gl.eq_principle.strict_eq(check))
```

#### 4. Dispute System
Let users challenge verdicts, triggering a re-check with different sources.

#### 5. Screenshot Verification
Use `gl.nondet.web.render(url, mode="screenshot")` to capture visual evidence and analyze it with `gl.nondet.exec_prompt()` using image support.

---

### What Else Can You Build on GenLayer?

GenLayer opens up entire categories of applications that were **impossible** before:

| Category | Example | GenLayer Feature Used |
|----------|---------|---------------------|
| **Dispute Resolution** | Arbitration between trustless parties | LLM analyzes evidence, validators vote |
| **P2P Betting** | Friends bet on subjective outcomes | Web scraping for results, AI determines winners |
| **Insurance** | Parametric insurance based on real events | Web access verifies claims automatically |
| **Content Moderation** | Decentralized content policy enforcement | LLM evaluates content against community rules |
| **Prediction Markets** | Markets on real-world events | Web + AI settle outcomes objectively |
| **Reputation Systems** | On-chain skill/trust scoring | AI evaluates contributions and work |
| **Dynamic NFTs** | NFTs that evolve based on real-world data | Web access feeds dynamic metadata |
| **Oracle Replacement** | Any data from any website | `gl.nondet.web` replaces Chainlink for many use cases |

---

### GenLayer vs. Traditional Blockchain

| Feature | Ethereum/Solana | GenLayer |
|---------|-----------------|----------|
| Smart contract language | Solidity/Rust | **Python** |
| Internet access | No (need oracles) | **Yes, native** |
| AI/LLM access | No | **Yes, native** |
| Non-deterministic logic | Impossible | **Yes, via Equivalence Principle** |
| Consensus on subjective data | Impossible | **Yes, via Optimistic Democracy** |
| Cost of web data | High (oracle fees) | **Included in gas** |

---

### Resources

| Resource | Link |
|----------|------|
| GenLayer Docs | [docs.genlayer.com](https://docs.genlayer.com) |
| SDK API Reference | [sdk.genlayer.com](https://sdk.genlayer.com/main/_static/ai/api.txt) |
| genlayer-js SDK | [docs.genlayer.com/api-references/genlayer-js](https://docs.genlayer.com/api-references/genlayer-js) |
| GenLayer Studio | [studio.genlayer.com](https://studio.genlayer.com) |
| Contract Examples | [docs.genlayer.com/developers/intelligent-contracts/examples](https://docs.genlayer.com/developers/intelligent-contracts/examples/storage) |
| Community Discord | Check docs for invite link |

---

### Conclusion

You've gone from zero to a working GenLayer dApp in four parts:

1. **Part 1:** Understood GenLayer's breakthrough concepts — Optimistic Democracy and the Equivalence Principle
2. **Part 2:** Wrote a Python intelligent contract that fetches web data and uses AI on-chain
3. **Part 3:** Built a React frontend connected via genlayer-js and MetaMask
4. **Part 4:** Tested, deployed, and explored what's next

GenLayer represents a fundamental shift in what's possible on blockchains. Smart contracts can now **think**, **read the internet**, and **make subjective decisions** — all while maintaining the security and trustlessness that blockchain promises.

**The question isn't "what can I build?" anymore. It's "what couldn't I build before?"**

Welcome to GenLayer. Go build something impossible.

---

*This tutorial is part of the GenLayer Builder Program. The complete source code is available in the [TruthPost repository](https://github.com/genlayerlabs/genlayer-project-boilerplate).*
