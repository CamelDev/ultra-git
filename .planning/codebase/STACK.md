# Technology Stack

**Analysis Date:** 2026-06-21

## Languages

**Primary:**
- TypeScript 5.x - Used for all application code in main, preload, and renderer processes.

**Secondary:**
- HTML5 / CSS3 - Used for structure and style in the renderer process.
- JavaScript - Used for build configurations and scripts.

## Runtime

**Environment:**
- Electron 41.0.3 - Desktop application runtime containing Chrome (renderer) and Node.js (main process).
- Bun v1.3.11 - High-performance JavaScript/TypeScript runtime used for task execution, script running, and package management.

**Package Manager:**
- Bun v1.3.11
- Lockfile: `bun.lock` present.

## Frameworks

**Core:**
- React 19.2.4 - UI library for rendering application views.
- Electron 41.0.3 - Application framework for windowing, native menus, dialogs, and IPC.

**Testing:**
- Bun Test - Unit test runner (using Jest-compatible assertions/mocks).
- Playwright 1.58.2 - E2E browser and Electron app testing.

**Build/Dev:**
- electron-vite 5.0.0 - Build tool based on Vite designed for Electron apps (bundling main, preload, renderer).
- vite 8.0.1 - Frontend bundler.
- TypeScript compiler (via tsconfig) - Type validation.

## Key Dependencies

**Critical:**
- simple-git 3.33.0 - Spawns and interacts with Git CLI commands.
- zustand 5.0.12 - Lightweight reactive state management in the renderer.
- lucide-react 0.577.0 - UI icon set.

## Configuration

**Environment:**
- No environment variables are currently required for runtime, but default variables are set by Electron.

**Build:**
- `electron.vite.config.ts` - vite config for main, preload, and renderer.
- `tsconfig.json` & `tsconfig.node.json` - TypeScript compile rules.
- `electron-builder.yml` - Packaging/compilation configuration.

## Platform Requirements

**Development:**
- Windows, macOS, or Linux (any platform with Bun and Git CLI installed).

**Production:**
- Builds native installer executables for Windows, macOS, or Linux using `electron-builder`.

---

*Stack analysis: 2026-06-21*
*Update after major dependency changes*
