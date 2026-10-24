# Dala

A portable, worker-owned stablecoin pension vault for migrant workers, built on Solana.
Submission for the SMU "From Vision to Impact: Building Web3 for Social Good 2026" hackathon (Idea Track).

- Submission text: [SUBMISSION.md](SUBMISSION.md)
- Program (devnet): `J4NigtmbyxjPXkrLz77ZFpkQ3JXfVuBpzEyYWuGykoMY`
- Demo run with every transaction: [app/demo.json](app/demo.json), rendered by [app/index.html](app/index.html)

## Layout

| Path | What it is |
|---|---|
| `onchain/` | Anchor 1.2 workspace. Program in `onchain/programs/dala/src`, LiteSVM tests in `onchain/programs/dala/tests`. |
| `demo/` | Node script that runs one worker's story on devnet and writes `app/demo.json`. |
| `app/` | Static demo page. `build-page.mjs` inlines `demo.json` into `template.html`. |
| `scripts/wsl-build.sh` | Syncs `onchain/` into WSL and builds, tests or deploys there. |

## Program

| Instruction | Who signs | What it does |
|---|---|---|
| `open_vault` | worker (+ fee payer) | Creates her vault for one mint with a fixed payout start and schedule. |
| `contribute` | anyone | Tops up a vault, tagged employer, family or other. Emits `Contributed`. |
| `create_match_pool` | sponsor | Sets a match rate (basis points, up to 3:1) and a cap per worker. |
| `fund_pool` | anyone | Adds tokens to a pool. |
| `join_pool` | worker (+ fee payer) | Creates her match record for a pool. |
| `save` | worker | Deposits her own savings. |
| `save_with_match` | worker | Deposits and receives the pool match in the same transaction. |
| `claim` | worker | After the start date, withdraws only the unlocked share to any account of the mint. |

There is no other way to move tokens out of a vault. Unlocked amount is
`total_in * periods_unlocked / periods`, with the first period unlocking at `payout_start`.

## Build and test

Built inside WSL Ubuntu with Anchor 1.2.0 and Solana CLI 4.1. The SBF target is pinned to v0
because Anchor 1.2 defaults to v3, which LiteSVM 0.10 cannot load.

```bash
bash scripts/wsl-build.sh test
```

```bash
cd demo && npm install && WALLET=~/.config/solana/id.json OUT=../app/demo.json node run-devnet-demo.mjs
```

```bash
node app/build-page.mjs
```

## Status

Devnet prototype. Not audited. Not a licensed financial product. The demo uses a devnet stand-in
for USDC and compresses one month to 30 seconds.
