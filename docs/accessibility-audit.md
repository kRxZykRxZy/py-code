# Accessibility audit — GitFolio

**Scope:** landing, authenticated workspace, portfolio editor, analytics, settings, and the public `/:username` portfolio. The audit was performed as a focused source, interaction-contract, and responsive visual review on 16 August 2026.

| Surface | Review outcome | Evidence |
| --- | --- | --- |
| Landing and sign-in | Primary GitHub sign-in actions are semantic buttons with visible focus treatment. | Global focus contract and GitHub-only auth controls. |
| Dashboard and editor | Sidebar actions, controls, and status feedback retain button semantics and use pending labels. | Existing typed interaction components and mutation feedback. |
| Analytics and settings | Query loading, zero-data, and error paths communicate state rather than relying on empty visuals. | Live query-state components and aria-live feedback. |
| Public portfolio | Keyboard users can skip to work, operate section navigation, change language filters, and reach external project links. | `.skip-link`, focusable landmarks, semantic buttons, `aria-live` filter results, and labelled project links. |
| Motion and responsive layout | Motion-sensitive users receive near-instant transitions and auto scroll; the public portfolio was reviewed at 375×812. | `prefers-reduced-motion` CSS and responsive screenshot review. |

## Regression contract

The automated contract test verifies that global focus visibility, reduced-motion handling, a skip link, focusable portfolio section landmarks, live filter feedback, and labelled project links remain present. This test supplements—not replaces—future manual assistive-technology testing with a screen reader before a public launch.

## Follow-up before public release

Conduct a manual screen-reader pass using the deployed domain, verify GitHub OAuth error messages are announced in the final browser environment, and test keyboard navigation in current Chromium, Firefox, and Safari.
