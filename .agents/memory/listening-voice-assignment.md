---
name: Listening voice assignment
description: The product rule for assigning ElevenLabs voices to listening-dialog speakers.
---

Each listening channel must save two different ElevenLabs voice IDs: one for the male speaker role and one for the female speaker role. Audio generation must use those exact IDs or stop before delivery.

**Why:** A silent fallback to environment defaults made admin voice selections appear ineffective and broke trust in preview-based configuration.

**How to apply:** Let an administrator preview and assign any available voice directly to either role. Allow incomplete setup to be saved while configuring, but block manual and scheduled delivery with a clear message until both distinct voices are selected. Log the two IDs used when synthesizing audio.