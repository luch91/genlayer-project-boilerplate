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
