# Submit Clean XML to IETF

## Problem

The XML file had warning messages at the top (lines 1-5) from kramdown-rfc generation:
```
*** warning: explicit settings completely override canned bibxml...
*** warning: explicit settings completely override canned bibxml...
*** sections left [nil]!
---
- No link definition for link ID '0' found on line 120
```

These lines are **not valid XML** and cause IETF's submission system to reject the file with:
```
Error: Invalid document before running preptool. (line 13)
```

## Solution

**Remove the warning lines** - The XML file must start with `<?xml version="1.0" encoding="UTF-8"?>`

## Fixed File

The clean XML file is now: `docs/rfcs/draft-ainp-protocol-00.xml`

This file:
- ✅ Starts with proper XML declaration
- ✅ Has no warning messages
- ✅ Ready for IETF submission

## Submission Steps

1. **Go to**: https://datatracker.ietf.org/submit/
2. **Upload**: `docs/rfcs/draft-ainp-protocol-00.xml`
3. **Fill form**:
   - Title: "AI-Native Network Protocol (AINP) for Semantic Agent Communication"
   - Abstract: Copy from draft
   - Intended Status: "Standards Track" or "Informational"
   - Submission Stream: "Independent Submission"
   - Author: Eswara Prasad Nagulapalli, contact@servsys.com, Servesys Labs
4. **Submit**

## Note

If you used the online converter and it added warning lines back, make sure to remove them before submitting. The XML must start with `<?xml version="1.0" encoding="UTF-8"?>` with no preceding text.

