# Convert IETF Draft to xml2rfc Version 3

IETF prefers **xml2rfc version 3** format. The current draft is v2 XML needs to be converted.

## Option 1: Online Converter (Recommended - Easiest)

IETF provides a free online conversion service:

1. **Go to**: https://xml2rfc.tools.ietf.org/
2. **Upload**: `docs/rfcs/draft-ainp-protocol-00.xml`
3. **Select**: "Convert to v3 format"
4. **Download**: The converted v3 XML file
5. **Save as**: `draft-ainp-protocol-00-v3.xml`

**Advantages**:
- ✅ No installation needed
- ✅ Official IETF tool
- ✅ Handles all conversions automatically

## Option 2: Local Conversion (If Online Fails)

### Install xml2rfc v3

```bash
pip3 install xml2rfc
# or
pip install xml2rfc
```

### Convert

```bash
xml2rfc --v3 draft-ainp-protocol-00.xml --out draft-ainp-protocol-00-v3.xml
```

**Note**: If xml2rfc command not found, add to PATH:
```bash
export PATH="$HOME/Library/Python/3.9/bin:$PATH"
```

## Option 3: Manual Update (Advanced)

Convert v2 XML to v3 by updating:
- Remove `<!DOCTYPE rfc [...]>` 
- Change `<rfc>` attributes to v3 format
- Update namespace declarations
- Update element names (some changed in v3)

**Not recommended** - use Option 1 instead.

## Verification

After conversion, verify v3 format:

```bash
# Check for v3 indicators
grep -i "version.*3" draft-ainp-protocol-00-v3.xml
grep -i "xml2rfc" draft-ainp-protocol-00-v3.xml
```

v3 files should NOT have `<!DOCTYPE rfc` and should use different namespace.

## Submission

**Use the v3 XML file** (`draft-ainp-protocol-00-v3.xml`) when submitting to IETF Datatracker.

---

**Quick Link**: https://xml2rfc.tools.ietf.org/

