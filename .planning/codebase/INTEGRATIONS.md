# External Integrations

**Analysis Date:** 2026-06-21

## APIs & External Services
- None. UltraGIT runs entirely as a desktop application and does not communicate with external SaaS products or API services directly.

## Data Storage

**Databases:**
- None. UltraGIT doesn't maintain an internal relational database. The repository database is the Git index/history stored in the `.git` directory of target folders.

**Caching:**
- In-memory cache (`gitInstances` Map) in `src/main/git.ts`.
  - Maps repository absolute paths to `SimpleGit` client instances.
  - Helps avoid re-initializing simple-git for consecutive operations on the same workspace tab.

## Authentication & Identity

**Git Authentication:**
- Relies on the host operating system's configuration.
- SSH connections run through the user's local SSH agent.
- HTTPS authentication is handled by the user's global `git credential-helper` configuration.

## Monitoring & Observability
- None. No telemetry, Sentry, or remote log integration. All error reporting is output to the main/renderer DevTools console logs.

## CI/CD & Deployment

**CI Pipeline:**
- GitHub Actions workflows in `.github/workflows/`:
  - `e2e.yml` - Triggered on pushes to `main` and all pull requests. Sets up Bun, installs dependencies, downloads Playwright OS dependencies, builds the app, and runs tests using `xvfb-run`.
  - `release.yml` - Triggered on version tags `v*` or manually. Runs a build matrix across `ubuntu-latest`, `macos-latest`, and `windows-latest` to compile and publish production installer files via `electron-builder` using the `GITHUB_TOKEN` secret.

**Hosting:**
- Desktop installation packages. Published releases compile and distribute installers (.exe, .dmg, .deb, etc.) to GitHub Releases.

## Environment Configuration

**Development:**
- No `.env` configuration file is required at runtime.
- Developers run `bun run dev` to start hot-reloading development servers.

---

*Integration audit: 2026-06-21*
*Update when adding/removing external services*
