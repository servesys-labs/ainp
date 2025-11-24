# idnits Issues Summary

## Critical Issues Fixed ✅

1. **Downref Fixed** - Moved RFC8785 from normative to informative references
   - RFC 8785 is Informational, cannot be normative for Standards Track
   - Now in Informative References section

2. **Unused Reference Fixed** - Added Ed25519 reference in text
   - Added `<xref target="Ed25519"/>` in signature section
   - Reference is now used

3. **prepTime Attribute Removed** - Removed from source XML
   - This attribute is added by preptool, shouldn't be in source

## Remaining Minor Issues (Non-blocking)

These are warnings/comments that won't prevent submission:

1. **Filename** - Should be `draft-ainp-protocol-00.txt` (not `draft-ainp-protocol-00-ready_1.txt`)
   - **Fix**: Rename when submitting or use the XML file directly

2. **Non-ASCII Characters** (22 instances)
   - Usually acceptable in technical content
   - Can be left as-is

3. **Long Lines** (8 instances)
   - Usually acceptable for code examples
   - Can be left as-is

4. **Line 160 False Positive** - idnits thinks it's a reference
   - It's just a closing tag, can be ignored

5. **Code Comments** - Suggestion to use `<sourcecode>` tags
   - Can be improved but not critical

6. **Missing Introduction** - False positive, Introduction section exists
   - Section is properly formatted at line 501
   - Can be ignored

## Files Ready

- **XML**: `draft-ainp-protocol-00-final.xml` ✅
- **TXT**: `draft-ainp-protocol-00-final.txt` ✅ (generated from XML)

## Submission

Submit the **XML file** (`draft-ainp-protocol-00-final.xml`) to IETF.

The remaining idnits warnings are minor and won't prevent submission. The critical errors (downref, unused reference) have been fixed.

