# Skills for claude.ai

`deus-deal-followup/` is the deal follow-up skill with its Step 5, "Add to Deus Team Tasks", which uses the app's
connector (`app/api/mcp/[secret]/route.ts`). Its `references/` files are unchanged copies of the synced skill's.
`deus-deal-followup.zip` is the same folder, ready to upload.

## Rebuild the zip after editing the skill

From this folder (`docs/skills/`):

```sh
rm -f deus-deal-followup.zip && python3 -m zipfile -c deus-deal-followup.zip deus-deal-followup/
```

(On a Mac, `zip -r deus-deal-followup.zip deus-deal-followup -x '*.DS_Store'` does the same.) The zip must hold the
folder itself, so `SKILL.md` sits at `deus-deal-followup/SKILL.md` inside it. Check with
`python3 -m zipfile -l deus-deal-followup.zip`.

## Upload it to claude.ai

1. claude.ai → Settings → Capabilities → Skills (where `deus-deal-followup` is listed).
2. Remove or turn off the old `deus-deal-followup`, so two copies don't compete.
3. Upload skill → pick `docs/skills/deus-deal-followup.zip`, and make sure it's turned on.

## Add the connector in claude.ai

Needs `MCP_SECRET` set in Vercel (Production) and a redeploy first; without it the connector URL answers 404.

1. claude.ai → Settings → Connectors → Add custom connector.
2. Name: `Deus Team Tasks`. URL: `https://<app domain>/api/mcp/<MCP_SECRET>` (the secret is part of the path; there is
   no separate sign-in, so treat the URL like a password and don't paste it in chats or docs).
3. Add. In a chat, turn the connector on from the tools menu; its three tools are `find_company`,
   `preview_followup_plan` and `add_followup_plan`.

The skill only offers Step 5 when those three tools are present, so it works as before in chats without the connector.
To check the connector without claude.ai, run `npm run mcp:smoke` (emulator only, never live data).
