# Agent task: implement syntax-highlighted Code view for diffs

## Objective and authorization

Implement the agreed Code view design in UltraGIT. This task is implementation-ready; proceed through development and verification without another design approval. Read repository instructions first, preserve unrelated changes, and keep the Bun/Electron/React stack. Do not publish, push, or modify real user repositories for testing.

The user wants quick visual code review, with syntax colors and unobtrusive Git change markers. The viewer is already side by side. No annotations, comments, editor capabilities, or new layout mode are in scope.

## Existing integration points

- `src/renderer/src/components/details/DiffModal.tsx`: existing split rows, rawBefore/rawAfter, inline character diffs, search, file and hunk navigation, selection, and stage/unstage/discard actions. Both Chunks and Full rendering paths must receive the feature.
- Current `viewMode` combines `chunks | full | preview`; initialization and file-change effects automatically choose Preview for images, including SVG. Review these effects and all `initialViewMode` callers before changing state handling.
- `SearchHighlightContent` currently has separate search and inline-diff rendering paths. Compose syntax, search, and inline changes together rather than allowing one to erase another.
- `src/renderer/src/assets/main.css`: `.diff-row`, `.diff-col`, `.diff-line-number`, `.diff-line-content`, and `.diff-inline-highlight` currently apply red/green code backgrounds and foregrounds.
- `src/renderer/src/hooks/useTheme.ts`: light theme uses the root `.light-theme` class; support dark, light, and automatic theme switching.
- `MarkdownDiffView.tsx` and `ImageDiffView.tsx` in the same details directory provide rendered previews.
- Existing tests: `e2e/commit-diff.spec.ts`, `e2e/markdown-preview.spec.ts`, `e2e/image-diff.spec.ts`, `e2e/active-changes.spec.ts`, and renderer unit tests. Reuse `e2e/helpers/launcher` and `GitSandbox` conventions.
- No syntax-highlighting dependency exists in the inspected package.json. Choose a maintained tokenizer with the required grammars and structured token output; verify its current official documentation, license, and bundler compatibility before adding it. Avoid adding a full editor. Update the Bun lockfile if dependencies change.

## Behavior contract

1. Add a keyboard-accessible `Code view` toggle with a code icon immediately beside the existing `Preview` control. Keep it in that toolbar area when Preview is absent. Use `aria-pressed`, a useful tooltip, and a stable test ID.
2. Enable Code view on first use. Persist the last explicit on/off choice globally across files, repositories, modal reopen, and app restart. Missing, malformed, or unavailable storage falls back safely to enabled.
3. Separate the syntax preference, the remembered diff extent (`chunks` or `full`), and whether Preview is currently active. Avoid representing Code view as another extent value.
4. Clicking Preview enters rendered preview without overwriting the syntax preference or remembered extent. Clicking Preview again restores the prior diff presentation. Code view appears inactive while Preview is displayed; clicking it exits Preview, enables and persists Code view, and restores the previous extent. Clicking active Code view disables it and restores the legacy diff appearance. Chunks/Full selections exit Preview and retain the syntax preference.
5. Preserve explicit `initialViewMode` entry behavior, including requested Preview. File navigation must not reset the syntax preference or remembered extent. Non-previewable files exit Preview; raster images continue to open in Preview. Opening an image must not disable the preference for subsequent source files.
6. Offer Code view for text, including unknown extensions (plain text fallback). Hide it for raster images and other binary content. SVG is a text-source exception: offer both Code view and rendered Preview, keep initial image-preview behavior, and ensure image effects/render guards do not force Preview back after the user selects source.
7. Retain existing navigation, overview ruler, line selection, copy, search, and Git actions. Syntax is presentation only: never change source text, diff indices, hunk IDs, or patch construction.

## Visual and language contract

- Keep the existing split layout and typography. Code view uses neutral code backgrounds and token foreground colors.
- Red gutter and minus marker for deleted lines; green gutter and plus marker for additions. Modified pairs use red on the left and green on the right. Empty opposite cells have no fake line number, syntax, or change marker.
- Give the changed side of each row a subtle 1px inset outline that does not change row height or alignment. Keep markers outside copied code text.
- In Code view, show existing character-level changes with subtle colored underlines, preserving token foregrounds. Retain existing inline backgrounds when Code view is off.
- Search and active-search highlighting must remain distinguishable over syntax and inline changes. Selection must remain visible without erasing syntax. Use theme variables for both light and dark palettes; do not rely on red/green alone to communicate additions/removals.
- Resolve languages by case-insensitive extension, matching more specific suffixes first. Required mappings: Java `.java`; C# `.cs`; JavaScript `.js/.mjs/.cjs/.jsx`; TypeScript `.ts/.mts/.cts/.tsx`; Python `.py/.pyw`; Go `.go`; Rust `.rs`; C/C++ `.c/.h/.cc/.cpp/.cxx/.hh/.hpp/.hxx`; HTML `.html/.htm`; CSS `.css`; JSON `.json`; YAML `.yaml/.yml`; Markdown `.md/.markdown/.mdown/.mkdn/.mdx`; shell `.sh/.bash/.zsh`; SQL `.sql`; XML/SVG `.xml/.svg`. Document reasonable grammar fallbacks (for example Markdown for MDX).
- For renames, use the old filename for the before side and the new filename for the after side. Unknown extensions must not trigger speculative language detection.

## Implementation sequence

1. Inspect current tests, callers, data loading, and CSS; establish the behavior of Preview, SVG, and modal initialization. Keep this change localized to diff presentation.
2. Add a small language resolver and tokenizer adapter outside DiffModal. Tokenize each complete before/after source independently, then split token ranges into line-indexed data. Preserve multiline comments/strings across collapsed context. Preserve tabs, Unicode, blank lines, trailing newlines, and the existing line-number convention. Never tokenize individual displayed lines in isolation.
3. Return structured token text/ranges and render escaped React text. Do not inject source-derived HTML. Bundle grammar assets locally with no runtime network requests.
4. Add bounded caching keyed by content and language. Avoid re-tokenizing on search, scrolling, selection, or extent changes. Load only needed grammar code where practical. Prevent stale asynchronous results from appearing after switching files. Keep plain text visible while highlighting loads. Add explicit, documented size/line-length limits and a non-blocking fallback when highlighting fails or files exceed them; retain Code view markers and the stored preference.
5. Introduce preference/state handling with the transitions above. Reconcile all preview guards, file-change effects, and initialViewMode handling, especially SVG.
6. Extract a reusable line renderer that composes token boundaries, inline-diff ranges, and search ranges using offsets into the original line. Share it between Chunks and Full. Ensure matches crossing token boundaries retain correct active-match identity/navigation and original text.
7. Add scoped Code view CSS and toolbar control. Preserve legacy styling when disabled. Ensure toggling presentation does not unnecessarily reset selection, active hunk, or scroll position.
8. Add unit and Electron Playwright tests; run the relevant regression checks and inspect actual rendered light/dark views. Fix regressions before handoff.

## Verification and acceptance

Unit coverage must verify:

- Required extension aliases, case handling, unknown extensions, and old/new rename language resolution.
- Representative tokens for every required language; multiline comments/strings remain correctly classified when displayed from a later line.
- Token splitting and overlay composition preserve exact text, including tabs, CRLF as handled by the existing diff pipeline, Unicode, empty lines, and matches crossing token boundaries.
- Preference defaults, both saved values, malformed/unavailable storage, and Preview/Code/extent transitions.
- Failure/oversize fallback, bounded caching, and stale-result handling if asynchronous.

Playwright coverage must verify:

- A clean profile opens a source diff with Code view active and visibly distinct syntax tokens on both sides.
- Add/delete/modified rows use neutral code backgrounds, appropriate gutter markers, and stable row alignment. Inspect computed styles as well as screenshots; token DOM alone is insufficient.
- Turning Code view off restores legacy appearance; the off state survives reopen and relaunch with the same isolated test profile. Turning it back on is also remembered.
- Chunks and Full retain syntax; hunk navigation and search work, including a match spanning multiple tokens.
- Markdown Preview and Code view are mutually exclusive, restoring the previous extent; raster image navigation preserves the code preference; SVG can switch between source and preview; binary and unknown-extension fallbacks work.
- Existing selection and staging behavior is intact using only disposable sandbox repositories. Include a staging regression with syntax enabled.
- Rapid file navigation does not display stale syntax. Large/long-line fixtures remain usable through the documented fallback.

Run relevant new unit tests using Bun, the build (`bun run build`), and focused Playwright coverage after building (`bunx playwright test e2e/code-view.spec.ts e2e/commit-diff.spec.ts e2e/markdown-preview.spec.ts e2e/image-diff.spec.ts e2e/active-changes.spec.ts`). Follow current repository test setup if commands or filenames have changed. Run applicable type checks using repository configuration. Report pre-existing failures separately; do not claim unrun checks passed.

## Handoff

Deliver working implementation, tests, dependency/lockfile changes if needed, and a concise summary of verification and remaining limitations. Document architecture/primary-logic changes in the walkthrough required by AGENTS.md; resolve the actual conversation path rather than inventing an ID, and report any filesystem permission blocker. No implementation is included in this planning task itself.
