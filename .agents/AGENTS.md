# Agent Behavior Customizations

- Do not perform automatic visual reviews, screenshots, UI validations, or design reviews after implementing code changes.
- Do not scroll, capture, or compare UI layouts unless explicitly requested.
- Focus strictly on code modifications requested.
- Run `npm run build` to verify compilation.
- Only run `npm run test` when backend logic or critical functionality is affected.
- After each implementation, output:
  - Files modified
  - Summary of changes
  - Build status
  - Test status (if applicable)
  - Any known risks or limitations
