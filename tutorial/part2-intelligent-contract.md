# Zero to GenLayer: Build a Decentralized AI Fact-Checker from Scratch

## Part 2 — Writing Your First Intelligent Contract

*In this part, you'll write the TruthPost contract in Python — a smart contract that reaches out to the internet, asks an AI to analyze what it finds, and uses GenLayer's consensus mechanism to agree on the result. In 95 lines of code.*

---

In Part 1, we talked about what makes GenLayer different. Now we're going to prove it — by writing a smart contract that would be impossible on any other blockchain.

Our TruthPost contract will:

1. Let users **submit factual claims** (e.g., *"The Great Wall of China is visible from space"*)
2. **Fetch a real web page** to find evidence
3. **Ask an LLM** to analyze the evidence and return a verdict
4. Use the **Equivalence Principle** so multiple validators independently agree
5. **Track reputation** for users who contribute claims

Let's build it.

---

## Anatomy of an Intelligent Contract

Before we write TruthPost, here's the minimal structure of a GenLayer contract:

```python
from genlayer import *

class MyContract(gl.Contract):
    # State variables — persisted on-chain between calls
    my_data: TreeMap[Address, str]

    # Constructor — runs once at deployment
    def __init__(self):
        pass

    # Read-only method — free to call, can't change state
    @gl.public.view
    def get_data(self) -> str:
        return "hello"

    # Write method — modifies state, costs gas
    @gl.public.write
    def set_data(self, value: str) -> None:
        self.my_data[gl.message.sender_address] = value
```

If you know Python, this should already feel familiar. A few things to note:

- Contracts are **Python classes** that extend `gl.Contract`
- Storage uses **GenLayer-specific types** (`TreeMap`, `DynArray`) instead of regular Python `dict` and `list` — these are optimized for blockchain storage
- Methods are tagged with **decorators**: `@gl.public.view` for reads, `@gl.public.write` for state changes
- `gl.message.sender_address` gives you the caller's wallet address (like Solidity's `msg.sender`)

---

## Step 1: Define the Data Model

Create the file `contracts/truth_post.py` and start with the data structure for a claim:

```python
# { "Depends": "py-genlayer:test" }

import json
from dataclasses import dataclass
from genlayer import *


@allow_storage
@dataclass
class Claim:
    id: str                  # Unique identifier
    text: str                # The claim to verify
    verdict: str             # "true", "false", "partially_true", or "pending"
    explanation: str         # AI-generated explanation of the verdict
    source_url: str          # URL used for verification
    submitter: str           # Wallet address of who submitted it
    has_been_checked: bool   # Whether the AI has analyzed it yet
```

Two things worth explaining:

**`@allow_storage`** tells GenLayer this dataclass can be persisted on-chain. Without it, you can't store custom objects in contract state. Regular Python objects only live in memory during a single method call — `@allow_storage` objects survive between transactions.

**Why GenLayer types?** Blockchain state must be serializable and gas-efficient. Here's the mapping:

| Python | GenLayer | Why |
|--------|----------|-----|
| `dict` | `TreeMap[K, V]` | Ordered, gas-efficient key-value storage |
| `list` | `DynArray[T]` | Dynamic array optimized for on-chain use |
| `int` | `u256`, `i64`, etc. | Fixed-size integers for deterministic arithmetic |

Use GenLayer types for state variables. Regular Python types are fine for local variables inside methods.

---

## Step 2: Set Up the Contract

Now define the contract class with its state:

```python
class TruthPost(gl.Contract):
    claims: TreeMap[str, Claim]          # claim_id -> Claim
    reputation: TreeMap[Address, u256]   # wallet address -> reputation score
    claim_count: u256                    # auto-incrementing counter

    def __init__(self):
        self.claim_count = 0
```

Three state variables:
- **`claims`** — every submitted claim, keyed by ID
- **`reputation`** — how many claims each user has contributed
- **`claim_count`** — used to generate unique IDs

The `__init__` constructor runs once when the contract is deployed. After that, state persists forever on-chain.

---

## Step 3: Submitting Claims

Let's let users submit claims for fact-checking:

```python
    @gl.public.write
    def submit_claim(self, claim_text: str, source_url: str) -> None:
        sender = gl.message.sender_address

        # Generate a unique claim ID
        self.claim_count += 1
        claim_id = f"claim_{self.claim_count}"

        # Store with verdict="pending" — AI hasn't checked it yet
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

Nothing exotic here. A user provides the claim text and a URL for verification. We store it with `verdict="pending"` — the AI analysis happens separately, in the next method.

---

## Step 4: The Core — AI-Powered Fact-Checking

This is where GenLayer earns its name. We're going to write a method that:

1. Opens a web page from inside a smart contract
2. Sends the content to an LLM for analysis
3. Gets validator consensus on the AI's verdict

```python
    def _fact_check(self, claim_text: str, source_url: str) -> dict:
        def check_claim() -> str:
            # 1. Fetch real data from the internet
            web_data = gl.nondet.web.render(source_url, mode="text")

            # 2. Ask an LLM to analyze the claim against the source
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

        # 3. Validators compare results using strict equality
        result_json = json.loads(gl.eq_principle.strict_eq(check_claim))
        return result_json
```

Let's break down the three key API calls:

### `gl.nondet.web.render(url, mode="text")`

This fetches a web page *from inside the smart contract*. No oracles. No off-chain services. The contract itself reaches out to the internet.

- `mode="text"` — returns the page as plain text (HTML stripped)
- `mode="html"` — returns raw HTML
- `mode="screenshot"` — returns a screenshot as an image

On Ethereum or Solana, this is **impossible**. Smart contracts are sandboxed with zero network access. GenLayer gives contracts first-class internet access.

### `gl.nondet.exec_prompt(prompt, response_format="json")`

This runs a prompt through an LLM, inside the contract. The `response_format="json"` parameter tells the model to return structured data (a Python dict).

Again — impossible on any other blockchain. GenLayer validators each have access to LLM providers, making AI a native capability.

### `gl.eq_principle.strict_eq(check_claim)`

This is the Equivalence Principle in action. Here's exactly what happens when this line executes:

1. The **Leader validator** calls `check_claim()` — fetching the web page, running the LLM, getting a result
2. Each **other validator** independently calls `check_claim()` — doing the same work
3. `strict_eq` compares all the results byte-for-byte
4. If they match: consensus is reached, the result is accepted
5. If they don't match: the transaction may be appealed

We use `strict_eq` because our output is constrained — a small JSON object with a verdict from a fixed set (`true`/`false`/`partially_true`). This makes agreement very likely even across different LLM calls.

### Why Is `check_claim` a Nested Function?

Notice the pattern: we define `check_claim()` inside `_fact_check()` and pass it to `strict_eq()`. This is how GenLayer's non-deterministic execution works — the inner function is the "unit of consensus." Each validator runs it independently, and the equivalence principle compares their outputs.

Think of it as wrapping the non-deterministic work in a box, then asking all validators: "Did you get the same thing?"

---

## Step 5: Triggering the Fact-Check

Now let's expose a public method that triggers the AI analysis:

```python
    @gl.public.write
    def resolve_claim(self, claim_id: str) -> None:
        if claim_id not in self.claims:
            raise Exception("Claim not found")

        claim = self.claims[claim_id]

        if claim.has_been_checked:
            raise Exception("Claim already fact-checked")

        # This is where the magic happens
        result = self._fact_check(claim.text, claim.source_url)

        # Update the claim with the AI's verdict
        claim.verdict = result["verdict"]
        claim.explanation = result.get("explanation", "")
        claim.has_been_checked = True

        # Award reputation to the claim submitter
        submitter_addr = Address(claim.submitter)
        if submitter_addr not in self.reputation:
            self.reputation[submitter_addr] = 0
        self.reputation[submitter_addr] += 1
```

When anyone calls `resolve_claim`, the contract:

1. Validates the claim exists and hasn't been checked yet
2. Runs `_fact_check()` — the web fetch, LLM analysis, and validator consensus all happen here
3. Stores the verdict and explanation on-chain
4. Awards 1 reputation point to the original submitter

---

## Step 6: Reading Data

Finally, the view methods that let the frontend read contract state:

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

View methods are:
- **Read-only** — they can't change state
- **Free** — no gas cost
- **Decorated** with `@gl.public.view`

Note how `get_reputation` converts `Address` keys to hex strings with `.as_hex`. The frontend works with string addresses, so we do the conversion here.

---

## The Complete Contract

Here's the full `contracts/truth_post.py` — 95 lines of Python:

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

**95 lines. A smart contract that browses the internet and thinks about what it finds.**

---

## Tracing Through an Execution

Let's follow what happens when a user fact-checks a claim end to end:

```
1. User calls submit_claim("The Eiffel Tower is 330m tall", "https://en.wikipedia.org/wiki/Eiffel_Tower")
   -> Claim stored on-chain with verdict="pending"

2. Anyone calls resolve_claim("claim_1")
   -> Contract enters _fact_check()

3. Inside _fact_check(), the Leader validator runs check_claim():
   a. gl.nondet.web.render() fetches the Wikipedia page
   b. gl.nondet.exec_prompt() sends the content + claim to the LLM
   c. LLM returns: {"verdict": "true", "explanation": "The Eiffel Tower is 330m tall including its antenna"}

4. Other validators independently run check_claim()
   -> They each fetch Wikipedia and query the LLM

5. gl.eq_principle.strict_eq() compares all results
   -> All validators returned {"verdict": "true", ...}
   -> Consensus reached!

6. Claim updated: verdict="true", has_been_checked=True
7. Submitter receives +1 reputation point
```

---

## Deploy It

Update the deployment script to point to our contract. In `deploy/deployScript.ts`, change the file path:

```typescript
const filePath = path.resolve(process.cwd(), "contracts/truth_post.py");
```

Then deploy:

```bash
npm run deploy
```

Copy the contract address — you'll need it for the frontend in Part 3.

---

## Prompt Engineering for On-Chain AI

Writing prompts for on-chain LLMs is different from chatting with ChatGPT. Your prompts need to produce **consistent, structured output** across multiple independent validators. Here are the rules:

1. **Always request JSON.** Use `response_format="json"` and specify the exact schema.
2. **Constrain the output space.** Don't ask for free-form text. Give the LLM a small set of valid labels: `true`, `false`, `partially_true`.
3. **Be ruthlessly explicit about format.** "Respond ONLY with JSON, no extra text" prevents the LLM from adding commentary.
4. **Sort your keys.** `json.dumps(result, sort_keys=True)` ensures key ordering is deterministic across validators.
5. **Simpler is better.** Fewer output fields = higher chance all validators produce identical output = easier consensus.

> **Bad:** "Tell me about this claim and whether you think it's true"
>
> **Good:** "Respond ONLY with JSON: {\"verdict\": \"<true|false>\", \"explanation\": \"<1 sentence>\"}"

---

## Concepts You've Learned

| Concept | What It Does | Code |
|---------|-------------|------|
| State variables | Persistent on-chain storage | `claims: TreeMap[str, Claim]` |
| Custom storage types | Complex objects on-chain | `@allow_storage @dataclass class Claim` |
| Write methods | Modify state, cost gas | `@gl.public.write` |
| View methods | Read state, free | `@gl.public.view` |
| Web access | Fetch internet data from a contract | `gl.nondet.web.render(url, mode="text")` |
| LLM calls | Run AI prompts on-chain | `gl.nondet.exec_prompt(prompt, response_format="json")` |
| Equivalence Principle | Validators agree on AI outputs | `gl.eq_principle.strict_eq(fn)` |
| Sender address | Who called the method | `gl.message.sender_address` |

In the next part, we'll build a React frontend that connects to this contract — submitting claims, triggering fact-checks, and displaying verdicts in real time.

**Next up: [Part 3 — Building the Frontend with Next.js & genlayer-js](part3-frontend.md)**

---

*This tutorial is part of the GenLayer Builder Program. The complete source code is available in the [TruthPost repository](https://github.com/genlayerlabs/genlayer-project-boilerplate).*
