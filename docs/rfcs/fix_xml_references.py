#!/usr/bin/env python3
"""Fix XML reference formatting by combining multiple <dd> elements."""

import re
import sys

def fix_references(content):
    # Fix RFC2119
    content = re.sub(
        r'(<dt><xref target="RFC2119"></xref></dt>\s*)'
        r'(<dd>\s*<seriesInfo name="RFC" value="2119" />\s*</dd>\s*)'
        r'(<dt/>\s*<dd>\s*<title>Key words for use in RFCs to Indicate Requirement Levels</title>\s*</dd>)',
        r'\1<dd>\n    <seriesInfo name="RFC" value="2119" />\n    <title>Key words for use in RFCs to Indicate Requirement Levels</title>\n  </dd>',
        content,
        flags=re.DOTALL
    )
    
    # Fix RFC8785
    content = re.sub(
        r'(<dt><xref target="RFC8785"></xref></dt>\s*)'
        r'(<dd>\s*<seriesInfo name="RFC" value="8785" />\s*</dd>\s*)'
        r'(<dt/>\s*<dd>\s*<title>JSON Canonicalization Scheme \(JCS\)</title>\s*</dd>)',
        r'\1<dd>\n    <seriesInfo name="RFC" value="8785" />\n    <title>JSON Canonicalization Scheme (JCS)</title>\n  </dd>',
        content,
        flags=re.DOTALL
    )
    
    # Fix RFC8949
    content = re.sub(
        r'(<dt><xref target="RFC8949"></xref></dt>\s*)'
        r'(<dd>\s*<seriesInfo name="RFC" value="8949" />\s*</dd>\s*)'
        r'(<dt/>\s*<dd>\s*<title>Concise Binary Object Representation \(CBOR\)</title>\s*</dd>)',
        r'\1<dd>\n    <seriesInfo name="RFC" value="8949" />\n    <title>Concise Binary Object Representation (CBOR)</title>\n  </dd>',
        content,
        flags=re.DOTALL
    )
    
    # Fix W3C.DID - combine all <dd> elements into one
    pattern_w3c_did = (
        r'(<dt><xref target="W3C\.DID"></xref></dt>\s*)'
        r'(<dd>\s*<title>Decentralized Identifiers \(DIDs\) v1\.0</title>\s*</dd>\s*)'
        r'(<dt/>\s*<dd>\s*<author>\s*<organization>W3C</organization>\s*</author>\s*</dd>\s*)'
        r'(<dt/>\s*<dd>\s*<date year="2022" month="July" day="19" />\s*</dd>\s*)'
        r'(<dt/>\s*<dd>\s*<target>https://www\.w3\.org/TR/did-core/</target>\s*</dd>)'
    )
    replacement_w3c_did = (
        r'\1<dd>\n    <title>Decentralized Identifiers (DIDs) v1.0</title>\n    '
        r'<author><organization>W3C</organization></author>\n    '
        r'<date year="2022" month="July" day="19" />\n    '
        r'<target>https://www.w3.org/TR/did-core/</target>\n  </dd>'
    )
    content = re.sub(pattern_w3c_did, replacement_w3c_did, content, flags=re.DOTALL)
    
    # Fix W3C.VC
    pattern_w3c_vc = (
        r'(<dt><xref target="W3C\.VC"></xref></dt>\s*)'
        r'(<dd>\s*<title>Verifiable Credentials Data Model v1\.1</title>\s*</dd>\s*)'
        r'(<dt/>\s*<dd>\s*<author>\s*<organization>W3C</organization>\s*</author>\s*</dd>\s*)'
        r'(<dt/>\s*<dd>\s*<date year="2022" month="March" day="3" />\s*</dd>\s*)'
        r'(<dt/>\s*<dd>\s*<target>https://www\.w3\.org/TR/vc-data-model/</target>\s*</dd>)'
    )
    replacement_w3c_vc = (
        r'\1<dd>\n    <title>Verifiable Credentials Data Model v1.1</title>\n    '
        r'<author><organization>W3C</organization></author>\n    '
        r'<date year="2022" month="March" day="3" />\n    '
        r'<target>https://www.w3.org/TR/vc-data-model/</target>\n  </dd>'
    )
    content = re.sub(pattern_w3c_vc, replacement_w3c_vc, content, flags=re.DOTALL)
    
    # Fix Ed25519 - combine all authors and metadata
    pattern_ed25519 = (
        r'(<dt><xref target="Ed25519"></xref></dt>\s*)'
        r'(<dd>\s*<title>High-speed high-security signatures</title>\s*</dd>\s*)'
        r'(<dt/>\s*<dd>\s*<author initials="D\. J\." surname="Bernstein" />\s*</dd>\s*)'
        r'(<dt/>\s*<dd>\s*<author initials="N\." surname="Duif" />\s*</dd>\s*)'
        r'(<dt/>\s*<dd>\s*<author initials="T\." surname="Lange" />\s*</dd>\s*)'
        r'(<dt/>\s*<dd>\s*<author initials="P\." surname="Schwabe" />\s*</dd>\s*)'
        r'(<dt/>\s*<dd>\s*<author initials="B\." surname="Yang" />\s*</dd>\s*)'
        r'(<dt/>\s*<dd>\s*<date year="2011" month="September" day="26" />\s*</dd>\s*)'
        r'(<dt/>\s*<dd>\s*<target>https://ed25519\.cr\.yp\.to/</target>\s*</dd>)'
    )
    replacement_ed25519 = (
        r'\1<dd>\n    <title>High-speed high-security signatures</title>\n    '
        r'<author initials="D. J." surname="Bernstein" />\n    '
        r'<author initials="N." surname="Duif" />\n    '
        r'<author initials="T." surname="Lange" />\n    '
        r'<author initials="P." surname="Schwabe" />\n    '
        r'<author initials="B." surname="Yang" />\n    '
        r'<date year="2011" month="September" day="26" />\n    '
        r'<target>https://ed25519.cr.yp.to/</target>\n  </dd>'
    )
    content = re.sub(pattern_ed25519, replacement_ed25519, content, flags=re.DOTALL)
    
    return content

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: fix_xml_references.py <input.xml> <output.xml>")
        sys.exit(1)
    
    with open(sys.argv[1], 'r') as f:
        content = f.read()
    
    fixed = fix_references(content)
    
    with open(sys.argv[2], 'w') as f:
        f.write(fixed)
    
    print(f"✅ Fixed XML written to {sys.argv[2]}")

