from typing import Tuple
from base64 import b64encode, b64decode
from nacl.signing import SigningKey, VerifyKey
from nacl.exceptions import BadSignatureError
from .envelope import canonicalize_envelope
from .types import AINPEnvelope


def generate_keypair() -> Tuple[bytes, bytes]:
    """
    Generate an Ed25519 keypair.
    Returns (private_key_seed_32_bytes, public_key_32_bytes)
    """
    sk = SigningKey.generate()
    vk = sk.verify_key
    # Return seed (32 bytes) for storage and raw 32-byte public key
    return bytes(sk._seed), bytes(vk)


def sign_envelope(env: AINPEnvelope, private_key: bytes) -> str:
    """
    Sign canonicalized envelope with Ed25519 and return base64 signature string.
    """
    sk = SigningKey(private_key)
    msg = canonicalize_envelope(env).encode('utf-8')
    sig = sk.sign(msg).signature
    return b64encode(sig).decode('ascii')


def verify_envelope_signature(env: AINPEnvelope, signature: str, public_key: bytes) -> bool:
    """
    Verify base64 signature against canonicalized envelope using Ed25519.
    """
    try:
        vk = VerifyKey(public_key)
        msg = canonicalize_envelope(env).encode('utf-8')
        sig = b64decode(signature)
        vk.verify(msg, sig)
        return True
    except (BadSignatureError, ValueError, TypeError):
        return False
