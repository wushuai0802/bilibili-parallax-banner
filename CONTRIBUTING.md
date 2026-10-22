# Contributing

Use Node.js 22 or 24. Clone the repository, run `npm ci --ignore-scripts`, then `npm run check`.
`npm run dev` serves only public component/demo files on loopback, not work logs or repository metadata.

- Edit `src/`, not `dist/`. Run `npm run build` and commit the generated distribution with its source.
- `assets/demo/banner.json` is canonical. Its classic-script wrapper is generated for offline previews.
- Add regression coverage for changes to geometry, loading, lifecycle or the compatibility adapter.
- Keep the production bundle dependency-free. Image decoding and bundling are development tools.
- Do not submit third-party artwork without permission, private URLs, access tokens or production account data.
- Version API or manifest changes deliberately; document unsupported adapter behavior instead of silently ignoring it.
- New artwork themes follow `docs/WORKFLOW.md` and `docs/IMAGE-SPEC.md`. Use `theme:init`, edit source images and their regions, then run `theme:build`. Keep artwork-specific values in project.json, never in shared JavaScript.
- `npm run validate:theme -- path/to/theme.json` checks paired assets and declared geometry. `npm run check` validates the bundled template; register additional theme paths in the owning project's CI.
- `themes/catalog.json` registers source projects and generated examples. Commit the public outputs but keep model proofs, offline HTML and ZIPs in ignored artifacts directories; CI regenerates these for deployment.
- Browser CI installs Chromium and WebKit and runs the real preview and public theme API. Use `npm run test:browser` with local Playwright browsers when reproducing it.

For a release: run checks, update the version and changelog, commit, then tag `vX.Y.Z`.
CDN examples should pin a release tag. This repository does not automatically publish an npm package.
