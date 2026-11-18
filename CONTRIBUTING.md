# Contributing

## Development setup

Use Node.js 20 or newer:

```bash
npm ci
npm run dev
npm test
npm run typecheck
```

The default test suite starts the built application and must not require
third-party network access. Keep tests deterministic and avoid real account,
credential, or media dependencies.

## Change guidelines

- Use strict TypeScript and existing project patterns.
- Keep changes small and focused.
- Add or update tests for behavior changes.
- Do not introduce copyright circumvention or unsafe public-access defaults.
- Redact secrets and private data from logs, commits, issues, and screenshots.

## Pull requests

Describe the problem, implementation, validation, and any deployment or
configuration impact. Pull requests should include the relevant issue number
when applicable.

## Repository metadata

Maintainers should keep these public repository settings accurate:

- description: short summary of the Node.js/TypeScript media API
- topics: `nodejs`, `typescript`, `express`, `media-api`, `streaming`
- website: leave empty or set only to a project-controlled URL
- Issues enabled
- Security policy and private vulnerability reporting enabled
- MIT license recognized from the repository root `LICENSE`
