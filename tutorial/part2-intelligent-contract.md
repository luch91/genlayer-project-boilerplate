# Zero to GenLayer: Build a Decentralized Fact-Checker with AI

## Part 2 — Writing Your First Intelligent Contract

*In this part, you'll write the TruthPost contract in Python — a smart contract that fetches data from the web, uses AI to analyze it, and reaches consensus through GenLayer's Equivalence Principle.*

---

### What We're Building

Our TruthPost contract will:

1. Let users **submit claims** to be fact-checked (e.g., *"The Great Wall of China is visible from space"*)
2. **Fetch real web sources** to verify the claim
3. Use an **LLM to analyze** the sources and produce a verdict
4. Use the **Equivalence Principle** so all validators agree on the verdict
5. Track **reputation points** for users who submit claims that get verified

By the end of this part, you'll have a working intelligent contract that does things **impossible on any other blockchain**.

---

### Intelligent Contracts 101

Before we write code, let's understand the anatomy of a GenLayer contract:

```python
# Every contract starts with this import
from genlayer import *

class MyContract(gl.Contract):
    # State variables — persisted on-chain
    my_data: TreeMap[Address, str]

    # Constructor — called once at deployment
    def __init__(self):
        pass

    # Read-only method — anyone can call, no gas cost
    @gl.public.view
    def get_data(self) -> str:
        return "hello"

    # Write method — modifies state, costs gas
    @gl.public.write
    def set_data(self, value: str) -> None:
        self.my_data[gl.message.sender_address] = value
```

**Key differences from Solidity:**
- Contracts are **Python classes** extending `gl.Contract`
- Only **one contract class** per file
- Storage uses **GenLayer types** (`TreeMap`, `DynArray`) instead of Python `dict`/`list`
- Methods are marked with **decorators**: `@gl.public.view` (read) or `@gl.public.write` (write)
- You can access the caller's address with `gl.message.sender_address`

---

### Step 1: Define the Data Model

Create the file `contracts/truth_post.py` and let's start with our data structures:

```python
# { "Depends": "py-genlayer:test" }

import json
from dataclasses import dataclass
from genlayer import *


@allow_storage
@dataclass
class Claim:
    id: str                  # Unique identifier
    text: str                # The claim to fact-check
    verdict: str             # "true", "false", "partially_true", or "pending"
    explanation: str         # AI-generated explanation
    source_url: str          # URL used for verification
    submitter: str           # Address of who submitted
    has_been_checked: bool   # Whether fact-check has run
```

Let's break this down:

- **`@allow_storage`** — This decorator tells GenLayer this dataclass can be stored on-chain. Without it, you can't persist custom objects.
- **`@dataclass`** — Standard Python dataclass for structured data.
- Each `Claim` tracks the original claim text, the AI's verdict, and metadata about the fact-check.

> **Storage types in GenLayer:**
>
> | Python Type | GenLayer Type | Why |
> |-------------|---------------|-----|
> | `dict` | `TreeMap[K, V]` | Blockchain-optimized key-value storage |
> | `list` | `DynArray[T]` | Blockchain-optimized dynamic arrays |
> | `int` | `u256`, `i64`, etc. | Fixed-size integers for deterministic behavior |
>
> You **must** use GenLayer types for state variables. Regular Python types work fine for local variables within methods.

---

### Step 2: Set Up the Contract Class

Now let's define the contract with its state variables:

```python
class TruthPost(gl.Contract):
    claims: TreeMap[str, Claim]          # claim_id -> Claim
    reputation: TreeMap[Address, u256]   # user address -> reputation points
    claim_count: u256                    # total claims submitted

    def __init__(self):
        self.claim_count = 0
```

Our contract stores:
- **`claims`** — A map from claim IDs to `Claim` objects
- **`reputation`** — A map from user addresses to their reputation score
- **`claim_count`** — A simple counter

The `__init__` method is the constructor, called once when the contract is deployed.

---

### Step 3: Submit a Claim (Write Method)

Let's add the method for users to submit claims for fact-checking:

```python
    @gl.public.write
    def submit_claim(self, claim_text: str, source_url: str) -> None:
        sender = gl.message.sender_address

        # Generate a unique claim ID
        self.claim_count += 1
        claim_id = f"claim_{self.claim_count}"

        # Create the claim in "pending" state
        claim = Claim(
            id=claim_id,
            text=claim_text,
            verdict="pending",
            explanation="",
            source_url=source_url,
            submitter=sender.as_hex,
            has_been_checked=False,
        )

        self.claims[claim_id] = claim
```

**What's happening:**
- `@gl.public.write` means this method modifies blockchain state (costs gas)
- `gl.message.sender_address` gives us the caller's address (like `msg.sender` in Solidity)
- We create a `Claim` with verdict `"pending"` — the AI hasn't checked it yet
- The claim is stored in our `TreeMap`

---

### Step 4: The Magic — AI-Powered Fact-Checking

This is where GenLayer shines. We'll write a private helper method that:
1. Fetches a web page
2. Asks an LLM to analyze it
3. Returns a structured verdict

```python
    def _fact_check(self, claim_text: str, source_url: str) -> dict:
        def check_claim() -> str:
            # Step 1: Fetch real data from the internet
            web_data = gl.nondet.web.render(source_url, mode="text")

            # Step 2: Ask the LLM to fact-check the claim against the source
            prompt = f"""You are a fact-checker. Based on the web content provided,
determine whether the following claim is true, false, or partially true.

CLAIM: {claim_text}

WEB CONTENT:
{web_data}

Respond ONLY with this exact JSON format, nothing else:
{{
    "verdict": "<true|false|partially_true>",
    "explanation": "<brief 1-2 sentence explanation>"
}}

Rules:
- "true" = the claim is fully supported by the source
- "false" = the claim is contradicted by the source
- "partially_true" = some parts are correct but others are wrong or misleading
- Keep the explanation concise and factual
- Your response must be valid JSON only, no extra text
"""
            result = gl.nondet.exec_prompt(prompt, response_format="json")
            return json.dumps(result, sort_keys=True)

        # Step 3: Use Equivalence Principle for consensus
        result_json = json.loads(gl.eq_principle.strict_eq(check_claim))
        return result_json
```

**This is the heart of the tutorial. Let's unpack every line:**

#### `gl.nondet.web.render(url, mode="text")`

This fetches a web page directly from within the smart contract. No oracles. No off-chain services. The contract reaches out to the internet itself.

- `mode="text"` returns the page as plain text (HTML stripped)
- `mode="html"` returns raw HTML
- `mode="screenshot"` returns a screenshot image

> On Ethereum or Solana, this is **literally impossible**. Smart contracts are sandboxed with no network access. GenLayer contracts break this barrier at the protocol level.

#### `gl.nondet.exec_prompt(prompt, response_format="json")`

This runs a prompt through an LLM, right inside the contract. The `response_format="json"` parameter tells the model to return structured JSON.

> Again — impossible on any other blockchain. There's no native AI integration anywhere else. GenLayer validators each have access to LLM providers, so AI is a first-class citizen.

#### `gl.eq_principle.strict_eq(check_claim)`

This is the **Equivalence Principle** in action. Here's exactly what happens:

1. The **Leader validator** runs the `check_claim` function — fetching the web page, calling the LLM, getting a result
2. Each **other validator** independently runs the same function
3. `strict_eq` checks if all validators got the **exact same JSON output**
4. If they agree → consensus is reached, the result is accepted
5. If they disagree → the transaction might be appealed

We use `strict_eq` because our output is a structured verdict (`true`/`false`/`partially_true`). Since we ask the LLM to respond with a simple label from a small set, validators are very likely to agree.

> **When would you use other equivalence types?**
> - **`prompt_comparative`**: When outputs should be similar but not identical (e.g., two ratings within 0.1 of each other)
> - **`prompt_non_comparative`**: When you want validators to judge if the leader's output meets certain criteria without redoing the work

#### Why `check_claim` is a nested function

Notice the pattern: we define `check_claim()` as an inner function and pass it to `strict_eq`. This is how GenLayer's non-deterministic execution works — the function is executed by each validator independently, and the equivalence principle compares their outputs.

---

### Step 5: Resolve a Claim (Triggering the Fact-Check)

Now let's add the method that triggers the AI fact-check:

```python
    @gl.public.write
    def resolve_claim(self, claim_id: str) -> None:
        if claim_id not in self.claims:
            raise Exception("Claim not found")

        claim = self.claims[claim_id]

        if claim.has_been_checked:
            raise Exception("Claim already fact-checked")

        # Run the AI fact-check (this is where the magic happens!)
        result = self._fact_check(claim.text, claim.source_url)

        # Update the claim with the verdict
        claim.verdict = result["verdict"]
        claim.explanation = result.get("explanation", "")
        claim.has_been_checked = True

        # Award reputation to the submitter
        submitter_addr = Address(claim.submitter)
        if submitter_addr not in self.reputation:
            self.reputation[submitter_addr] = 0
        self.reputation[submitter_addr] += 1
```

When someone calls `resolve_claim`:

1. We validate the claim exists and hasn't been checked yet
2. We call `_fact_check()` which fetches the web, asks the AI, and gets validator consensus
3. We update the claim with the verdict and explanation
4. We award 1 reputation point to the submitter (for contributing a claim to the platform)

---

### Step 6: Read Methods (View Functions)

Let's add the methods to read data from the contract:

```python
    @gl.public.view
    def get_claims(self) -> dict:
        return {k: v for k, v in self.claims.items()}

    @gl.public.view
    def get_claim(self, claim_id: str) -> dict:
        if claim_id not in self.claims:
            raise Exception("Claim not found")
        claim = self.claims[claim_id]
        return {
            "id": claim.id,
            "text": claim.text,
            "verdict": claim.verdict,
            "explanation": claim.explanation,
            "source_url": claim.source_url,
            "submitter": claim.submitter,
            "has_been_checked": claim.has_been_checked,
        }

    @gl.public.view
    def get_reputation(self) -> dict:
        return {k.as_hex: v for k, v in self.reputation.items()}

    @gl.public.view
    def get_user_reputation(self, user_address: str) -> int:
        return self.reputation.get(Address(user_address), 0)
```

**View methods:**
- Are **read-only** — they can't modify state
- Are **free** — no gas cost to call
- Are decorated with `@gl.public.view`
- Return data to the frontend

Note how `get_reputation` converts `Address` keys to hex strings using `.as_hex` — this is needed because the frontend works with string addresses.

---

### The Complete Contract

Here's the full `contracts/truth_post.py`:

```python
# { "Depends": "py-genlayer:test" }

import json
from dataclasses import dataclass
from genlayer import *


@allow_storage
@dataclass
class Claim:
    id: str
    text: str
    verdict: str
    explanation: str
    source_url: str
    submitter: str
    has_been_checked: bool


class TruthPost(gl.Contract):
    claims: TreeMap[str, Claim]
    reputation: TreeMap[Address, u256]
    claim_count: u256

    def __init__(self):
        self.claim_count = 0

    def _fact_check(self, claim_text: str, source_url: str) -> dict:
        def check_claim() -> str:
            web_data = gl.nondet.web.render(source_url, mode="text")

            prompt = f"""You are a fact-checker. Based on the web content provided,
determine whether the following claim is true, false, or partially true.

CLAIM: {claim_text}

WEB CONTENT:
{web_data}

Respond ONLY with this exact JSON format, nothing else:
{{
    "verdict": "<true|false|partially_true>",
    "explanation": "<brief 1-2 sentence explanation>"
}}

Rules:
- "true" = the claim is fully supported by the source
- "false" = the claim is contradicted by the source
- "partially_true" = some parts are correct but others are wrong or misleading
- Keep the explanation concise and factual
- Your response must be valid JSON only, no extra text
"""
            result = gl.nondet.exec_prompt(prompt, response_format="json")
            return json.dumps(result, sort_keys=True)

        result_json = json.loads(gl.eq_principle.strict_eq(check_claim))
        return result_json

    @gl.public.write
    def submit_claim(self, claim_text: str, source_url: str) -> None:
        sender = gl.message.sender_address
        self.claim_count += 1
        claim_id = f"claim_{self.claim_count}"

        claim = Claim(
            id=claim_id,
            text=claim_text,
            verdict="pending",
            explanation="",
            source_url=source_url,
            submitter=sender.as_hex,
            has_been_checked=False,
        )
        self.claims[claim_id] = claim

    @gl.public.write
    def resolve_claim(self, claim_id: str) -> None:
        if claim_id not in self.claims:
            raise Exception("Claim not found")

        claim = self.claims[claim_id]
        if claim.has_been_checked:
            raise Exception("Claim already fact-checked")

        result = self._fact_check(claim.text, claim.source_url)

        claim.verdict = result["verdict"]
        claim.explanation = result.get("explanation", "")
        claim.has_been_checked = True

        submitter_addr = Address(claim.submitter)
        if submitter_addr not in self.reputation:
            self.reputation[submitter_addr] = 0
        self.reputation[submitter_addr] += 1

    @gl.public.view
    def get_claims(self) -> dict:
        return {k: v for k, v in self.claims.items()}

    @gl.public.view
    def get_claim(self, claim_id: str) -> dict:
        if claim_id not in self.claims:
            raise Exception("Claim not found")
        claim = self.claims[claim_id]
        return {
            "id": claim.id,
            "text": claim.text,
            "verdict": claim.verdict,
            "explanation": claim.explanation,
            "source_url": claim.source_url,
            "submitter": claim.submitter,
            "has_been_checked": claim.has_been_checked,
        }

    @gl.public.view
    def get_reputation(self) -> dict:
        return {k.as_hex: v for k, v in self.reputation.items()}

    @gl.public.view
    def get_user_reputation(self, user_address: str) -> int:
        return self.reputation.get(Address(user_address), 0)
```

**That's 95 lines of Python — and it does something no Ethereum contract could ever do.**

---

### How It All Flows

Let's trace through what happens when someone fact-checks a claim:

```
1. User calls submit_claim("The Eiffel Tower is 330m tall", "https://en.wikipedia.org/wiki/Eiffel_Tower")
   → Claim stored with verdict="pending"

2. User (or anyone) calls resolve_claim("claim_1")
   → Contract calls _fact_check()

3. Inside _fact_check():
   a. Leader validator runs check_claim():
      - Fetches Wikipedia page via gl.nondet.web.render()
      - Sends content + claim to LLM via gl.nondet.exec_prompt()
      - LLM returns: {"verdict": "true", "explanation": "The Eiffel Tower is 330m tall including its antenna"}

   b. Other validators independently do the same thing

   c. gl.eq_principle.strict_eq() compares all results
      - All validators got "true" → consensus reached!

4. Claim updated: verdict="true", has_been_checked=True
5. Submitter gets +1 reputation point
```

---

### Deploy Your Contract

Let's update the deployment script to deploy our TruthPost contract instead of the football bets one.

Open `deploy/deployScript.ts` and change the contract file path:

```typescript
import path from "path";
import { GenLayerClient } from "genlayer-js";

export default async function main(client: GenLayerClient<any>) {
  // Change this line to point to our new contract
  const contractFilePath = path.resolve("contracts/truth_post.py");
  // ... rest stays the same
}
```

Then deploy:

```bash
npm run deploy
```

Copy the deployed contract address — you'll need it for the frontend in Part 3.

---

### Concepts Recap

| Concept | What It Does | Code |
|---------|-------------|------|
| **State variables** | Persistent on-chain storage | `claims: TreeMap[str, Claim]` |
| **Custom storage types** | Store complex objects on-chain | `@allow_storage @dataclass class Claim` |
| **Write methods** | Modify state (costs gas) | `@gl.public.write` |
| **View methods** | Read state (free) | `@gl.public.view` |
| **Web access** | Fetch data from the internet | `gl.nondet.web.render(url, mode="text")` |
| **LLM calls** | Run AI prompts on-chain | `gl.nondet.exec_prompt(prompt, response_format="json")` |
| **Equivalence Principle** | Validators agree on AI outputs | `gl.eq_principle.strict_eq(fn)` |
| **Sender address** | Who called the method | `gl.message.sender_address` |

---

### Prompt Engineering Tips for Intelligent Contracts

Writing prompts for on-chain LLMs is different from ChatGPT. Your prompts need to produce **consistent, structured output** that validators can agree on:

1. **Always request JSON output** — Use `response_format="json"` and specify the exact schema in your prompt
2. **Use constrained labels** — Instead of free-form answers, give the LLM specific options (`true`/`false`/`partially_true`)
3. **Be explicit about format** — Add "Respond ONLY with JSON, no extra text" to prevent verbose responses
4. **Sort keys** — Use `json.dumps(result, sort_keys=True)` so key ordering is deterministic
5. **Keep it simple** — The simpler the output, the more likely validators will agree

> **Bad prompt:** "Tell me about this claim and whether it's true"
>
> **Good prompt:** "Respond ONLY with JSON: {\"verdict\": \"<true|false>\", \"explanation\": \"<1 sentence>\"}"

---

**Next up: [Part 3 — Building the Frontend with Next.js & genlayer-js →](part3-frontend.md)**

---

*This tutorial is part of the GenLayer Builder Program. The complete source code is available in the [TruthPost repository](https://github.com/genlayerlabs/genlayer-project-boilerplate).*
