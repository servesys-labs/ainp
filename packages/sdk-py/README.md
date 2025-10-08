# AINP Python SDK (alpha)

This is a minimal Python SDK scaffold to integrate agents with AINP.

## Install (editable)
```
pip install -e packages/sdk-py
```

## Usage (scaffold)
```python
from ainp_sdk.envelope import AINPEnvelope, canonicalize_envelope
from ainp_sdk.did import did_from_public_key
from ainp_sdk.crypto import sign_envelope, verify_envelope_signature, generate_keypair

priv, pub = generate_keypair()
did = did_from_public_key(pub)

env = AINPEnvelope(
    id="env_123", trace_id="trace_123", from_did=did, to_did=did,
    msg_type="INTENT", ttl=60000, timestamp=1700000000000, sig="",
    payload={
        "@type": "MESSAGE",
        "@context": "https://schema.ainp.dev/message/v1",
        "version": "0.1.0",
        "embedding": "",
        "budget": {"max_credits": 1, "max_rounds": 1, "timeout_ms": 1000},
        "semantics": {"participants": [did, did], "content": "hello"}
    }
)

sig = sign_envelope(env, priv)
valid = verify_envelope_signature(env, sig, pub)
```

Note: Crypto uses PyNaCl (Ed25519) and a base58btc encoder for did:key derivation.
