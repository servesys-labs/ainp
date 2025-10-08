import json
from .types import AINPEnvelope


def canonicalize_envelope(env: AINPEnvelope) -> str:
    """
    Create canonical JSON for signing: sort keys and exclude 'sig'.
    """
    d = env.__dict__.copy()
    d.pop('sig', None)
    # Ensure stable ordering
    return json.dumps(d, separators=(',', ':'), sort_keys=True)

