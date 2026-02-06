# GenLayer Cheat Sheet

> Quick reference for building Intelligent Contracts and dApps on GenLayer.

---

## CLI Commands

```bash
genlayer network              # Select network (studionet/localnet/testnet)
npm run deploy                # Deploy contract
npm run dev                   # Start frontend dev server
gltest                        # Run contract tests (Studio must be running)
```

---

## Contract Structure

```python
from genlayer import *

@allow_storage            # Required for custom types stored on-chain
@dataclass
class MyData:
    name: str
    value: u256

class MyContract(gl.Contract):
    # State variables (persisted on-chain)
    data: TreeMap[Address, MyData]
    count: u256

    def __init__(self):                    # Constructor (called on deploy)
        self.count = 0

    @gl.public.view                        # Read-only (free)
    def get_count(self) -> int:
        return self.count

    @gl.public.write                       # State-modifying (costs gas)
    def increment(self) -> None:
        self.count += 1

    @gl.public.write.payable               # Accepts GEN token value
    def pay(self) -> None:
        amount = gl.message.value
```

---

## Storage Types

| Python | GenLayer | Notes |
|--------|----------|-------|
| `dict` | `TreeMap[K, V]` | Keys must support `<` operator |
| `list` | `DynArray[T]` | Dynamic array |
| `int` | `u256`, `i64`, etc. | Fixed-size integers |
| custom class | `@allow_storage @dataclass` | Must decorate for storage |

### TreeMap Methods
```python
self.data[key] = value           # Set
val = self.data[key]             # Get (raises if missing)
val = self.data.get(key, default)# Get with default
del self.data[key]               # Delete
for k, v in self.data.items()    # Iterate
self.data.get_or_insert_default(key)  # Get or create empty
```

### DynArray Methods
```python
self.arr.append(item)            # Add to end
self.arr.pop()                   # Remove last
self.arr[0]                      # Index access
len(self.arr)                    # Length
```

---

## Web Access

```python
# Fetch page as plain text
text = gl.nondet.web.render(url, mode="text")

# Fetch raw HTML
html = gl.nondet.web.render(url, mode="html")

# Take screenshot (returns Image)
img = gl.nondet.web.render(url, mode="screenshot")

# HTTP GET
resp = gl.nondet.web.get(url, headers={})
# resp.status, resp.headers, resp.body

# HTTP POST
resp = gl.nondet.web.post(url, body="...", headers={})
```

---

## LLM / AI Access

```python
# Text response
answer = gl.nondet.exec_prompt("Summarize this: ...")

# JSON response (structured)
result = gl.nondet.exec_prompt(
    "Return JSON: {\"verdict\": \"true\"}",
    response_format="json"
)
# result is a dict

# With images
result = gl.nondet.exec_prompt(
    "Describe this image",
    images=[screenshot_bytes]
)
```

---

## Equivalence Principle

```python
# Strict: outputs must be identical
def my_fn() -> str:
    # ... non-deterministic work ...
    return json.dumps(result, sort_keys=True)
result = gl.eq_principle.strict_eq(my_fn)

# Comparative: outputs should be similar
result = gl.eq_principle.prompt_comparative(
    my_fn,
    "Results are equivalent if ratings differ by less than 0.1"
)

# Non-comparative: check leader's output against criteria
result = gl.eq_principle.prompt_non_comparative(
    task="Summarize the article",
    criteria="Summary must be accurate, concise, and under 100 words"
)
```

### When to use which?

| Type | Use Case | Cost | Accuracy |
|------|----------|------|----------|
| **strict_eq** | Yes/no, categories, exact JSON | Low | Highest |
| **prompt_comparative** | Numeric ranges, similar text | Medium | High |
| **prompt_non_comparative** | Subjective quality checks | Low | Medium |

---

## Common Patterns

### Sender address
```python
sender = gl.message.sender_address        # Address object
sender_hex = gl.message.sender_address.as_hex  # "0x..." string
```

### Address conversion
```python
addr = Address("0x1234...")               # From hex string
addr.as_hex                               # To hex (checksummed)
addr.as_bytes                             # To bytes
```

### Contract value/balance
```python
self.balance                              # Contract's GEN balance
gl.message.value                          # GEN sent with transaction
```

### Error handling
```python
raise Exception("Custom error message")   # Reverts transaction
```

### Non-deterministic block
```python
def get_data() -> str:
    web = gl.nondet.web.render(url, mode="text")
    result = gl.nondet.exec_prompt(f"Analyze: {web}", response_format="json")
    return json.dumps(result, sort_keys=True)  # MUST sort keys!

consensus_result = json.loads(gl.eq_principle.strict_eq(get_data))
```

---

## Frontend (genlayer-js)

### Client Setup
```typescript
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const client = createClient({
  chain: studionet,                    // or localnet, testnetAsimov
  account: "0xAddress" as `0x${string}`,  // optional, for writes
});
```

### Read Contract (free)
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
  args: ["claim text", "https://source.url"],
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

### Map Conversion (TreeMap → JS)
```typescript
if (result instanceof Map) {
  const array = Array.from(result.entries()).map(([key, value]) => ({
    key, ...Object.fromEntries(value.entries())
  }));
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

def test_something():
    contract = load_fixture(deploy)

    # Write call
    result = contract.my_write_method(args=["arg1", "arg2"])
    assert tx_execution_succeeded(result)

    # Read call
    data = contract.my_view_method(args=[])
    assert data == expected_value

    # For AI/web calls (take longer)
    result = contract.resolve(
        args=["id"],
        wait_interval=10000,   # ms between checks
        wait_retries=15,       # max retries
    )
```

---

## Prompt Engineering Tips

1. **Always use `response_format="json"`** for structured output
2. **Constrain labels**: `"<true|false|partially_true>"` not free-form
3. **Sort keys**: `json.dumps(result, sort_keys=True)` for determinism
4. **Be explicit**: "Respond ONLY with JSON, no extra text"
5. **Keep it simple**: Fewer output fields = higher validator agreement

---

## Environment Variables

```env
# Frontend (.env)
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999
NEXT_PUBLIC_GENLAYER_CHAIN_NAME=GenLayer Studio
NEXT_PUBLIC_GENLAYER_SYMBOL=GEN
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYourContractAddress
```

---

## Networks

| Network | Chain ID | RPC | Use Case |
|---------|----------|-----|----------|
| studionet | 61999 | `https://studio.genlayer.com/api` | Development |
| localnet | — | `http://localhost:8545` | Local Studio |
| testnet (Asimov) | — | See docs | Public testing |

---

## Transaction Lifecycle

```
Pending → Proposing → Committing → Revealing → Accepted → Finalized
                                                    ↓
                                                 Appeals
                                                    ↓
                                                Finalized
```

---

## Links

| Resource | URL |
|----------|-----|
| SDK API Reference | https://sdk.genlayer.com/main/_static/ai/api.txt |
| Full Docs | https://docs.genlayer.com |
| genlayer-js | https://docs.genlayer.com/api-references/genlayer-js |
| Studio | https://studio.genlayer.com |
| Examples | https://docs.genlayer.com/developers/intelligent-contracts/examples/storage |
