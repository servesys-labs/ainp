from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class AINPEnvelope:
    id: str
    trace_id: str
    from_did: str
    to_did: Optional[str]
    msg_type: str  # 'INTENT' | 'RESULT' | 'ERROR' | 'NEGOTIATE' | 'ACK'
    ttl: int
    timestamp: int
    sig: str
    payload: Dict[str, Any]

