# IETF Author Information Guidance

## For Solo Developers

Since you're a solo developer, here are options for the author field:

### Option 1: Use Your Name (Recommended)
```yaml
author:
  -
    ins: E. Prasad
    name: E. Prasad
    org: Servesys Labs
    email: contact@servesys-labs.com
```

### Option 2: Use Full Name
```yaml
author:
  -
    ins: E. Prasad
    name: Your Full Name
    org: Servesys Labs
    email: your-email@example.com
```

### Option 3: Use Initials Format (IETF Standard)
```yaml
author:
  -
    ins: E. Prasad
    name: E. Prasad
    org: Independent
    email: your-email@example.com
```

## IETF Format Requirements

- **ins**: Initials and surname (e.g., "E. Prasad" or "E. P. Lastname")
- **name**: Full name or initials + surname
- **org**: Organization name (can be "Independent" if no org)
- **email**: Contact email (will be public)

## Current Draft Status

The draft currently uses:
- Name: E. Prasad
- Organization: Servesys Labs
- Email: contact@servesys-labs.com

**Update the author field in `draft-ainp-protocol-00.md` with your preferred information, then regenerate the XML.**
