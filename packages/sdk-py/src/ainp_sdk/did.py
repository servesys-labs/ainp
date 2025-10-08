ED25519_MULTICODEC_PREFIX = bytes([0xED, 0x01])


_BASE58_ALPHABET = b'123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'


def _encode_base58btc(data: bytes) -> str:
    # Count leading zeros
    zeros = len(data) - len(data.lstrip(b'\x00'))
    num = int.from_bytes(data, 'big')
    enc = bytearray()
    while num > 0:
        num, rem = divmod(num, 58)
        enc.append(_BASE58_ALPHABET[rem])
    # Add leading '1's for zeros
    enc.extend(b'1' * zeros)
    enc.reverse()
    return 'z' + enc.decode('ascii')


def did_from_public_key(public_key: bytes) -> str:
    """
    Create did:key identifier using multicodec (0xed01) + base58btc with 'z' prefix.
    """
    if len(public_key) != 32:
        raise ValueError('Ed25519 public key must be 32 bytes')
    prefixed = ED25519_MULTICODEC_PREFIX + public_key
    return 'did:key:' + _encode_base58btc(prefixed)
