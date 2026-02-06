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
    assert len(claims) > 0

    # Verify specific claim data
    claim = contract.get_claim(args=["claim_1"])
    assert claim["text"] == "Python was created by Guido van Rossum"
    assert claim["verdict"] == "pending"
    assert claim["has_been_checked"] == False
    assert claim["submitter"] == default_account.address


def test_resolve_claim_true():
    """Test that a factually true claim is correctly verified by AI."""
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
    # This triggers web fetching + AI analysis + validator consensus
    resolve_result = contract.resolve_claim(
        args=["claim_1"],
        wait_interval=10000,  # 10 seconds between checks
        wait_retries=15,  # Up to 15 retries (2.5 min total)
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
    """Test that a factually false claim is correctly identified by AI."""
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

    # Reputation still awarded for submitting
    reputation = contract.get_user_reputation(args=[default_account.address])
    assert reputation == 1
