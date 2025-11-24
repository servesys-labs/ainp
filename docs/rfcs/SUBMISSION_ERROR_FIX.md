# XML Validation Error Fix

## Error Message
```
Error during xml2rfc prep: ['**/draft-ainp-protocol-00.xml(17): Error: Invalid document before running preptool.']
```

## Root Causes Identified

1. **Section inside Abstract**: The appendix section was incorrectly placed inside the `<abstract>` tag. Sections cannot be inside abstract.

2. **Malformed References**: Multiple `<dd>` elements per reference that should be combined into single `<dd>` elements.

3. **Duplicate Closing Tags**: Duplicate `</abstract>` closing tags causing tag mismatch errors.

## Solution

The XML file needs manual fixes. The easiest approach is to:

1. **Use IETF's online converter** at https://xml2rfc.tools.ietf.org/ which handles these issues automatically
2. **Or manually fix** the XML structure

## Manual Fix Steps

1. Remove warning lines from top (lines 1-5)
2. Close abstract before sections start
3. Combine multiple `<dd>` elements into single ones for each reference
4. Remove duplicate closing tags

## Current Status

The XML file has been partially fixed but still needs the abstract structure corrected. The references have been fixed using the `fix_xml_references.py` script.

**Recommendation**: Use IETF's online converter to convert to v3 format, which will handle all these issues automatically.

