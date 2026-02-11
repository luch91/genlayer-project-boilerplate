# GenLayer Cheat Sheet

> Everything you need to build Intelligent Contracts and dApps on GenLayer — on a single page.

---

## CLI Commands

```bash
genlayer network              # Select network (studionet / localnet / testnet)
npm run deploy                # Deploy contract to selected network
npm run dev                   # Start frontend dev server
gltest                        # Run contract tests (requires GenLayer Studio)
```

---

## Contract Skeleton

Every GenLayer contract follows this structure:

```python
from genlayer import *

@allow_storage            # Required for any custom type stored on-chain
@dataclass
class MyData:
    name: str
    value: u256

class MyContract(gl.Contract):
    # State — persisted on-chain between calls
    data: TreeMap[Address, MyData]
    count: u256

    def __init__(self):                    # Runs once, at deploy time
        self.count = 0

    @gl.public.view                        # Read-only — free, no gas
    def get_count(self) -> int:
        return self.count

    @gl.public.write                       # Modifies state — costs gas
    def increment(self) -> None:
        self.count += 1

    @gl.public.write.payable               # Accepts GEN tokens
    def pay(self) -> None:
        amount = gl.message.value
```

---

## Storage Types

| Python | GenLayer Equivalent | Notes |
|--------|---------------------|-------|
| `dict` | `TreeMap[K, V]` | Keys must support `<` operator |
| `list` | `DynArray[T]` | Dynamic-length array |
| `int` | `u256`, `i64`, etc. | Fixed-size integers |
| custom class | `@allow_storage @dataclass` | Decorator required for on-chain storage |

### TreeMap Operations

```python
self.data[key] = value                # Set
val = self.data[key]                  # Get (raises KeyError if missing)
val = self.data.get(key, default)     # Get with default
del self.data[key]                    # Delete
for k, v in self.data.items():        # Iterate
self.data.get_or_insert_default(key)  # Get or create with type default
```

### DynArray Operations

```python
self.arr.append(item)                 # Add to end
self.arr.pop()                        # Remove last
self.arr[0]                           # Index access
len(self.arr)                         # Length
```

---

## Web Access

Contracts can fetch live data from the internet — no oracles needed.

```python
# Rendered page as plain text (best for content extraction)
text = gl.nondet.web.render(url, mode="text")

# Raw HTML
html = gl.nondet.web.render(url, mode="html")

# Screenshot (returns Image object — can be passed to LLM)
img = gl.nondet.web.render(url, mode="screenshot")

# HTTP GET with headers
resp = gl.nondet.web.get(url, headers={"Authorization": "Bearer ..."})
# resp.status, resp.headers, resp.body

# HTTP POST
resp = gl.nondet.web.post(url, body="payload", headers={})
```

---

## LLM / AI Access

Contracts can run prompts through AI models and get structured responses.

```python
# Free-form text response
answer = gl.nondet.exec_prompt("Summarize this article: ...")

# Structured JSON response (use this for reliable parsing)
result = gl.nondet.exec_prompt(
    "Classify this claim as true or false. "
    "Return ONLY JSON: {\"verdict\": \"<true|false>\"}",
    response_format="json"
)
# result is a Python dict — e.g., result["verdict"]

# With images (e.g., from a screenshot)
result = gl.nondet.exec_prompt(
    "Describe what you see in this image",
    images=[screenshot]
)
```

---

## Equivalence Principle

The mechanism that lets validators agree on non-deterministic outputs.

```python
# STRICT — outputs must be byte-for-byte identical
def check():
    data = gl.nondet.web.render(url, mode="text")
    result = gl.nondet.exec_prompt(f"Analyze: {data}", response_format="json")
    return json.dumps(result, sort_keys=True)   # sort_keys is critical!
consensus_result = json.loads(gl.eq_principle.strict_eq(check))

# COMPARATIVE — an LLM judges whether two outputs are "close enough"
result = gl.eq_principle.prompt_comparative(
    my_fn,
    "Results are equivalent if ratings differ by less than 0.1"
)

# NON-COMPARATIVE — an LLM checks the leader's output against criteria
result = gl.eq_principle.prompt_non_comparative(
    task="Summarize the article",
    criteria="Summary must be accurate, concise, and under 100 words"
)
```

### Which one should I use?

| Type | Best For | Validator Cost | Agreement Rate |
|------|----------|----------------|----------------|
| `strict_eq` | Yes/no, categories, constrained JSON | Lowest | Highest |
| `prompt_comparative` | Numeric ranges, similar-but-not-identical text | Medium | High |
| `prompt_non_comparative` | Subjective quality, creative output | Lowest | Medium |

**Rule of thumb:** Start with `strict_eq`. Only reach for the others when your output space is too wide for exact matching.

---

## Common Patterns

### Sender Address

```python
sender = gl.message.sender_address          # Address object
sender_hex = gl.message.sender_address.as_hex  # "0x..." string
```

### Address Conversion

```python
addr = Address("0x1234...")                 # From hex string
addr.as_hex                                 # To checksummed hex
addr.as_bytes                               # To bytes
```

### Contract Balance

```python
self.balance                                # Contract's current GEN balance
gl.message.value                            # GEN sent with this transaction
```

### Reverting a Transaction

```python
raise Exception("Claim has already been resolved")   # Reverts all state changes
```

### The Non-Deterministic Block Pattern

This is the most important pattern in GenLayer. All web/AI calls must happen inside a function passed to an equivalence principle:

```python
def fetch_and_analyze():
    page = gl.nondet.web.render(url, mode="text")
    result = gl.nondet.exec_prompt(
        f"Analyze this: {page}",
        response_format="json"
    )
    return json.dumps(result, sort_keys=True)  # ALWAYS sort keys!

consensus_result = json.loads(gl.eq_principle.strict_eq(fetch_and_analyze))
```

---

## Frontend (genlayer-js)

### Client Setup

```typescript
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const client = createClient({
  chain: studionet,                       // or localnet, testnetAsimov
  account: "0xAddress" as `0x${string}`,  // required for write calls
});
```

### Read Contract (free, no gas)

```typescript
const result = await client.readContract({
  address: contractAddress,
  functionName: "get_claims",
  args: [],
});
```

### Write Contract (costs gas)

```typescript
const txHash = await client.writeContract({
  address: contractAddress,
  functionName: "submit_claim",
  args: ["The Earth is round", "https://en.wikipedia.org/wiki/Earth"],
  value: BigInt(0),
});

const receipt = await client.waitForTransactionReceipt({
  hash: txHash,
  status: "ACCEPTED",
  retries: 24,
  interval: 5000,
});
```

### Deploy Contract

```typescript
await client.initializeConsensusSmartContract();
const txHash = await client.deployContract({
  code: contractCodeAsUint8Array,
  args: [],
});
```

### Converting TreeMap Results

genlayer-js returns `Map` objects for `TreeMap` storage. Convert them to plain arrays:

```typescript
if (result instanceof Map) {
  const items = Array.from(result.entries()).map(([key, value]) => {
    const obj = value instanceof Map
      ? Object.fromEntries(value.entries())
      : value;
    return { id: key, ...obj };
  });
}
```

---

## Testing (gltest)

```python
from gltest import get_contract_factory, default_account
from gltest.helpers import load_fixture
from gltest.assertions import tx_execution_succeeded

def deploy():
    factory = get_contract_factory("MyContract")
    return factory.deploy()

def test_basic_write():
    contract = load_fixture(deploy)       # Caches deploy across tests

    result = contract.my_method(args=["arg1", "arg2"])
    assert tx_execution_succeeded(result)

def test_basic_read():
    contract = load_fixture(deploy)

    data = contract.my_view_method(args=[])
    assert data == expected_value

def test_ai_call():
    contract = load_fixture(deploy)

    # AI/web calls are slow — configure longer polling
    result = contract.resolve(
        args=["claim_1"],
        wait_interval=10000,              # 10s between polls
        wait_retries=15,                  # up to 2.5 minutes total
    )
    assert tx_execution_succeeded(result)
```

Run tests: `gltest` (GenLayer Studio must be running)

---

## Prompt Engineering Tips

1. **Always use `response_format="json"`** for machine-readable output
2. **Constrain the output space**: `"<true|false|partially_true>"` beats free-form text
3. **Sort JSON keys**: `json.dumps(result, sort_keys=True)` — essential for `strict_eq`
4. **Be explicit about format**: "Respond ONLY with valid JSON, no extra text"
5. **Fewer fields = higher agreement**: The smaller the output, the easier consensus

---

## Environment Variables

```env
# frontend/.env
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999
NEXT_PUBLIC_GENLAYER_CHAIN_NAME=GenLayer Studio
NEXT_PUBLIC_GENLAYER_SYMBOL=GEN
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYourDeployedContractAddress
```

---

## Networks

| Network | Chain ID | RPC URL | When to Use |
|---------|----------|---------|-------------|
| **studionet** | 61999 | `https://studio.genlayer.com/api` | Development (hosted Studio) |
| **localnet** | -- | `http://localhost:8545` | Development (local Studio) |
| **testnet** (Asimov) | -- | See docs | Public testing before mainnet |

---

## Transaction Lifecycle

```
Pending → Proposing → Committing → Revealing → Accepted → Finalized
                                                    ↓
                                                 Appeals (escalating validators)
                                                    ↓
                                                Finalized (permanent)
```

---

## Resources

| Resource | URL |
|----------|-----|
| SDK API Reference (complete) | [sdk.genlayer.com](https://sdk.genlayer.com/main/_static/ai/api.txt) |
| Full Documentation | [docs.genlayer.com](https://docs.genlayer.com) |
| genlayer-js SDK | [docs.genlayer.com/api-references/genlayer-js](https://docs.genlayer.com/api-references/genlayer-js) |
| GenLayer Studio | [studio.genlayer.com](https://studio.genlayer.com) |
| Contract Examples | [docs.genlayer.com/.../examples](https://docs.genlayer.com/developers/intelligent-contracts/examples/storage) |

---

*Companion to the [Zero to GenLayer](part1-introduction-and-setup.md) tutorial series.*
