# Fix Based on RFC 7991 (xml2rfc v3)

## Reference: [RFC 7991](https://datatracker.ietf.org/doc/html/rfc7991)

RFC 7991 defines the xml2rfc version 3 vocabulary. According to the specification:

## Key Finding

In xml2rfc v3, **references should be in the `<back>` section** using proper `<reference>` elements, NOT in `<middle>` using `<dl>` lists.

## What Was Wrong

The file had reference lists in `<middle>` using `<dl>` elements:
```xml
<middle>
  <section>
    <dl>
      <dt><xref target="RFC2119"/></dt>
      <dd>...</dd>
    </dl>
  </section>
</middle>
```

This causes validation errors because xml2rfc v3 doesn't allow complex `<dd>` structures in reference lists.

## The Fix

According to RFC 7991, references should be:
1. **In `<back>` section** using `<references>` and `<reference>` elements
2. **Referenced from `<middle>`** using `<xref>` links

The file already has proper `<reference>` elements in `<back>` (lines 1277+), so we:
- Removed the `<dl>` lists from `<middle>`
- Added simple text references pointing to the `<back>` sections

## Result

✅ References are now properly structured according to RFC 7991
✅ No more validation errors about `<dd>` elements
✅ File is ready for IETF submission

