# Contributing

This repository is currently private development work. Use the existing private
repository for issues and pull requests; public package identity/licensing and
external contribution policy will be decided before a public release.

## Local workflow

Use Node 22.12+ and npm. Run `npm ci`, then `npm run dev` for the independent demo
at http://127.0.0.1:18120/. No account, backend service or production data is needed.

Before changing behavior, review [architecture](docs/ARCHITECTURE.md),
[React integration](docs/COMPONENTS.md), [streams](docs/STREAMS.md) and the
[walkthrough](docs/WALKTHROUGH.md). Keep the terminal as the only command-execution
surface. Host UI adapters register normal callbacks rather than new domain logic.

## Checks

Run heavy jobs sequentially. The npm scripts apply the local shared build lock,
CPU/heap limits and one test worker:

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run test:package
```

The package check uses the npm cache in offline mode for its disposable consumer;
run `npm ci` first to populate the fixture's React dependencies. It removes the
temporary consumer after checking core-only and React/panel imports.

Use `npm run format` to format edited code/docs. Review the diff afterwards; do
not include build output, node_modules, traces, local state or unrelated changes.
New regressions should exercise user-visible behavior or real failure boundaries.

## Change review

- Keep public command and stream semantics documented and version intentional.
- Add focused engine/browser tests for target identity, session/layer changes,
  action results, redaction or completion behavior that the change affects.
- Review watched sources and expected outcomes in the walkthrough. Dispatch or a
  re-render is not proof of a successful durable save.
- Update screenshots when visible behavior changes. Use fixture data only; follow
  [screenshot maintenance](docs/images/README.md).
- Record actual platform evidence. Browser tests do not establish Android, iOS or
  packaged desktop support.
- Describe the problem, resulting behavior, tests and material limits in the PR.

## Sensitive reports

Do not include tokens, credentials, raw private command arguments, customer data
or private application screenshots in issues. Report sensitive findings privately
to the repository owner. The library's UI checks do not replace host permissions.
