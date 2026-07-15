## What does this change?

<!-- One or two sentences. -->

## Which platform(s) does this touch?

<!-- copilot-cli / claude-code / core / a new platform / none (docs, CI, etc.) -->

## Checklist

- [ ] `npm test` passes locally
- [ ] If this adds/changes a **reader or writer**: I ran a manual live smoke test
      against the real CLI's own `--resume` command (fixtures can't prove this —
      see CONTRIBUTING.md's Testing section)
- [ ] If this adds a **new platform**: `core/contract-tests.js`'s shared suite passes
      for it, via a `test/platforms/<name>.test.js` wired into `test/contract.test.js`
- [ ] If this changes user-facing behavior: `README.md` is updated to match
