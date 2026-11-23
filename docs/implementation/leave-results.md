# Leave implementation results

## L1 — Leave rules

The worked example matches Calista’s −3, −2 and −1 balances, Audrey’s 2.5-day lapse and 3 days left, and Gregory’s 3-day lapse and 1 day left. Each month’s deduction starts on its first working day. Recounting a holiday updates both the request count and the balance.

- `npx tsc --noEmit` passed after `npx next typegen` generated the missing `LayoutProps` types and the hours fixture was corrected. `npx eslint` passed on all four changed TypeScript files.
- `npm run test:unit -- --maxWorkers=2` passed 1,768 of 1,769 tests. The existing notification-key test hit `spawnSync /opt/node-v26.10.0-linux-arm64/bin/node EPERM` and passed on a focused rerun with local process access. A focused run passed all 50 Leave cases, including request refusals, year and leap-day boundaries, waiting and upcoming leave, and repeat calculation.
- The special leave catalogue follows the listed statutory day counts. The two-day employee cap for childbirth stays paired with the admin override for longer leave, including the extension allowed by the 2024 law. [Law 13/2003, Article 93(4)](https://peraturan.bpk.go.id/Download/31128/UU%20Nomor%2013%20Tahun%202003.pdf), [Law 4/2024, Article 6](https://peraturan.go.id/files/uu-no-4-tahun-2024.pdf)
