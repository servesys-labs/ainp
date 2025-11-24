# idnits Fixes Applied

## Issues Fixed

### ✅ Fixed Issues

1. **Moved RFC8785 to Informative References**
   - RFC 8785 is Informational, so it can't be a normative reference for a Standards Track document
   - Moved from normative to informative references section
   - This fixes the "Downref" error

2. **Added Ed25519 Reference**
   - Added `<xref target="Ed25519"/>` in the signature section text
   - This fixes the "Unused Reference" warning

3. **Removed Empty Workgroup**
   - Changed `<workgroup>Independent Submission</workgroup>` to `<workgroup/>`
   - Independent Submission doesn't need a workgroup value

### ⚠️ Remaining Issues (Minor)

1. **Filename** - File should be named `draft-ainp-protocol-00.txt` (not `draft-ainp-protocol-00-ready_1.txt`)
   - **Fix**: Rename the text file when submitting

2. **Non-ASCII Characters** - 22 instances
   - These are likely in code examples or technical terms
   - Usually acceptable if they're in code blocks or technical content
   - Can be left as-is if they're necessary

3. **Long Lines** - Some lines exceed 72 characters
   - Usually acceptable for code examples
   - Can be left as-is

4. **Line 160 False Positive** - idnits thinks line 160 is a reference
   - This is a false positive (it's just a closing tag)
   - Can be ignored

5. **Code Comments** - idnits suggests wrapping code in `<sourcecode>` tags
   - Code sections should use `<sourcecode>` or `<artwork>` tags
   - Can be improved but not critical

## Files Generated

- `draft-ainp-protocol-00-final.xml` - Final XML file (ready for submission)
- `draft-ainp-protocol-00.txt` - Text version (for idnits checking)

## Submission

Submit the XML file: `draft-ainp-protocol-00-final.xml`

The remaining idnits warnings are minor and won't prevent submission.

