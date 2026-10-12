# Global Claude rules: Mac against batcave

Compared on 2026-10-12: `~/.claude/CLAUDE.md` on the Mac (76 lines) with `/root/.claude/CLAUDE.md` on batcave, container 114 (38 lines). Nothing was changed on either side.

## Status

Done on 2026-10-12: Markus gave the word, and the Mac's file was copied over the one on batcave. Both are now identical (76 lines, same checksum). The old file is kept next to it as `/root/.claude/CLAUDE.md.bak-2026-10-12`. What follows is the state before the copy.

## Result

The file on batcave is an older copy of the one on the Mac. Everything it contains is identical to the Mac, word for word. Three sections of the Mac are missing on batcave; batcave has nothing the Mac lacks.

| Section | Mac | batcave |
|---|---|---|
| No emojis, ever | yes | yes, identical |
| No border-left accents, ever | yes | **missing** |
| Resource structure for WordPress and web apps (SCSS files, property names, rules) | yes | yes, identical |
| Infrastructure: where things run (Synology only a file server, services on batcave, "robin" is the n8n, coordinates only in `CLAUDE.local.md`) | yes | **missing** |
| Domains, identifiers, contact (`markus-freise.de` public, `croeso.de` development only, `support@markus-freise.de`, bundle IDs `de.markusfreise.<slug>`) | yes | **missing** |

## What that means for agents on batcave

An agent started on batcave does not know these rules unless the project repeats them:

- **Border-left accents:** it may build cards or callouts with a coloured left border.
- **croeso.de:** it may put the development address into public texts, or treat it as a live address. For this project the rule is repeated in the project `CLAUDE.md` ("On batcave"), for other projects it is not.
- **Support address and bundle IDs:** it may invent another support address or use `de.croeso.*` identifiers.
- **Coordinates:** it does not know that addresses and access data belong in `CLAUDE.local.md` and never in tracked files.

## Also different

- **Project memory:** the Mac has two notes for this project (native apps are SwiftUI, never a web view wrapper; paint libraries: generic free, vendor libraries paid). batcave has no memory folder for `/var/www/watercolourlove`; memory is per machine and per folder.
- **Project `CLAUDE.md`:** the same on both, it comes with the repo.
- **`CLAUDE.local.md`:** exists only on the Mac (coordinates of batcave and Mittwald). It is not committed, so batcave has none.
- **Settings:** `/root/.claude/settings.json` on batcave sets only display options and notifications; no permission mode is set there.

## Recommendation

Copy the Mac's `~/.claude/CLAUDE.md` over the one on batcave. As the batcave file has nothing of its own, nothing is lost. One command from the Mac:

```
scp ~/.claude/CLAUDE.md root@batcave:/tmp/CLAUDE.md && ssh root@batcave 'pct push 114 /tmp/CLAUDE.md /root/.claude/CLAUDE.md && rm /tmp/CLAUDE.md'
```

The file is used by every project on container 114 (KaaChink, Hamlet, Vicky and the others), which is why it was left alone here. To keep the two from drifting apart again, keep the file in a small repo of its own and pull it on both machines.
