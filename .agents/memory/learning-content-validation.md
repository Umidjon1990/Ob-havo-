---
name: Learning content validation
description: How to keep Arabic listening and reading delivery reliable without accepting incomplete tests.
---

Keep the final completeness checks (full passage plus all three quizzes), but validate generated Arabic content with realistic tolerances and explicit rejection reasons. When a generation is near-valid, retry the supported model rather than sending a partial test.

**Why:** Model responses can be structurally complete yet vary in individual dialog-line and total-word length. Treating these normal variations as a blanket failure made the admin panel report only a generic delivery error. Models may also insert person names despite the prompt; neutralize known name references and retain the separate audit for unknown names.

**How to apply:** After changing prompts or validator requirements, run an actual generation smoke test for both levels and verify each passage produces exactly three quizzes before deployment. Keep logs specific about why a response was rejected so production failures can be diagnosed without exposing content or credentials.