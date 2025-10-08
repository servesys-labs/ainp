# Contributing to AINP

Thanks for your interest in contributing! This document outlines how to propose changes.

## Getting Started
- Fork the repo and create a topic branch.
- Use Node 18+ and Docker Desktop.
- Copy `.env.example` to `.env` and configure local settings.
- Run infra with `docker-compose -f docker-compose.dev.yml up -d`.
- Run migrations as per `docs/db/MIGRATIONS.md`.

## Development
- TypeScript: `npm run typecheck`
- Tests: `npm test`
- Linting/formatting: follow existing code style (TS strict, no any unless necessary).

## Pull Requests
- Describe the problem and solution.
- Add/adjust tests when changing behavior.
- Update docs when APIs/flags/schemas change.
- Keep changes focused and scoped.

## Commit Messages
- Use conventional style where possible (feat:, fix:, docs:, refactor:, chore:).

## Code of Conduct
- See CODE_OF_CONDUCT.md. Be respectful and constructive.

## Security Issues
- Do not open public issues for vulnerabilities. See SECURITY.md.

## Release Process
- Maintainers update CHANGELOG.md and tag releases.

