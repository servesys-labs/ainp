# IETF Submission Guide for AINP Internet-Draft

## Files Created

- **Markdown Source**: `draft-ainp-protocol-00.md` (kramdown-rfc format)
- **XML Output**: `draft-ainp-protocol-00.xml` (IETF XML format)

## Conversion

The draft has been converted to IETF XML format using `kramdown-rfc2629`:

```bash
kramdown-rfc2629 docs/rfcs/draft-ainp-protocol-00.md > docs/rfcs/draft-ainp-protocol-00.xml
```

## Submission Steps

### 1. Review the Draft

- Review `draft-ainp-protocol-00.xml` for formatting issues
- Check all references are correct
- Verify examples are complete

### 2. Get Official Draft Name

The draft name `draft-ainp-protocol-00` is a placeholder. When submitting to IETF, you'll get an official name like:

- `draft-smith-ainp-protocol-00` (if your last name is Smith)
- `draft-servesys-ainp-protocol-00` (organization-based)

### 3. Submit to IETF

1. **Create IETF Datatracker Account**: https://datatracker.ietf.org/accounts/create/
2. **Upload Draft**: https://datatracker.ietf.org/submit/
3. **Choose Submission Stream**:
   - **Independent Submission** (recommended if no working group)
   - **IETF Working Group** (if applicable)
4. **Upload XML file**: `draft-ainp-protocol-00.xml`
5. **Fill metadata**: Title, abstract, authors, etc.

### 4. After Submission

- Draft will be available at: `https://datatracker.ietf.org/doc/draft-{name}-{version}/`
- Community can review and comment
- You can update with new versions (`-01`, `-02`, etc.)

## Draft Status

**Current Version**: `draft-ainp-protocol-00`

**Status**: Ready for submission

**Sections Included**:

- ✅ Abstract and Introduction
- ✅ Architecture Overview
- ✅ Wire Format (JSON-LD + CBOR)
- ✅ Message Envelope Structure
- ✅ All 6 Intent Schemas (detailed)
- ✅ Negotiation Protocol (including multi-party)
- ✅ Complete Handshake Sequence
- ✅ Security Considerations (comprehensive)
- ✅ Discovery Scalability
- ✅ CBOR Encoding
- ✅ Extensibility
- ✅ Appendices (examples, embedding generation, credit system)

## Next Steps

1. **Review XML output** for any formatting issues
2. **Update author information** with real names/emails
3. **Choose submission stream** (Independent vs Working Group)
4. **Submit to IETF Datatracker**
5. **Share for community review**

## Resources

- **IETF Datatracker**: https://datatracker.ietf.org/
- **Submission Guidelines**: https://www.ietf.org/standards/ids/guidelines/
- **RFC Editor**: https://www.rfc-editor.org/
- **kramdown-rfc**: https://github.com/cabo/kramdown-rfc2629

## Notes

- Draft expires 6 months after submission (must update or resubmit)
- Can submit multiple versions (`-00`, `-01`, `-02`, etc.)
- Independent Submission Stream is faster but less community review
- Working Group path provides more review but requires WG adoption
