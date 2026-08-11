# Scheisscoin ($KACK)

Scheisscoin is a deliberately valueless fun token project for **Solana Mainnet**. It is not a product, investment, sale, presale, pool, listing, or promise of value. Mainnet SOL is required only to pay the one-time on-chain account rent and transaction fees; do not send SOL or money to anyone offering $KACK.

## Website

The static Astro site is published through GitHub Pages at <https://kack.wutz.io/>. It uses the root base path for the custom subdomain. The site is English-first with a client-side EN/DE switch, contains no wallet connection or purchase path, and uses a custom pixel favicon.

## Token design

| Property | Value |
| --- | --- |
| Network | Solana Mainnet |
| Program | Token-2022 |
| Name / symbol | Scheisscoin / `$KACK` (on-chain symbol: `KACK`) |
| Raw supply | `100000000000000` |
| Decimals | `0` |
| Scaled UI multiplier | `1000000000` |
| Compatible-client display | `100000000000000000000000 $KACK` |
| Freeze authority | Never set |
| Mint authority | Disabled after the one-time mint |

The `ScaledUiAmountConfig` multiplier changes only what compatible clients display; it does not create more tokens or alter token-account balances. Incompatible clients may display only the raw supply. The script initializes the multiplier without an update authority, making it immutable.

## Live Mainnet record

- Mint: [`ahDiwHso63aS6iubQBfjrvdqgZKDeqmN8dCwYjiNJQU`](https://explorer.solana.com/address/ahDiwHso63aS6iubQBfjrvdqgZKDeqmN8dCwYjiNJQU)
- Owner: `F3SgMhCTz4y9fLq45Wxw6V4C5RoyHhp9qJFJzfgZETmB`
- Owner token account: `DUgVqBKiv8xMmzknQCvvBC2E8JupLdNkCbDERfrZVUto`
- Verified: Token-2022; raw supply `100000000000000`; decimals `0`; scaled UI multiplier `1000000000`; mint authority `null`; freeze authority `null`; immutable metadata and pointer.

## Architecture

- `src/pages/index.astro` — static, responsive public site and EN/DE switch
- `public/` — favicon-derived 1024×1024 token image and off-chain metadata JSON
- `token/create-scheiss.mjs` — explicit, Mainnet-only Token-2022 mint workflow
- `.github/workflows/deploy-pages.yml` — GitHub Pages build and deployment
- `docs/TOKEN.md` — token and mint procedure

## Local setup

```bash
npm ci
npm run dev
```

Run checks with:

```bash
npm run build
npm test
git diff --check
```

## Minting on Mainnet

`npm run token:create` uses only `https://api.mainnet-beta.solana.com`. It reads an existing owner keypair from `SOLANA_KEYPAIR` or `~/.config/solana/id.json`; it will never silently generate an owner wallet or print secret material. It displays the public owner address and requires that exact address to be retyped immediately before any transaction. It never requests a faucet airdrop; the existing owner must hold enough Mainnet SOL for rent and fees.

Before running it, confirm that GitHub Pages has deployed and that `public/token-metadata.json` is publicly reachable. Run `npm run token:simulate` for a no-send Mainnet simulation. The script creates the Token-2022 mint, MetadataPointer and official in-mint metadata, immutable `ScaledUiAmountConfig`, owner ATA, raw supply, and all authority locks in one atomic transaction. It verifies the result through Mainnet RPC.

See [docs/TOKEN.md](docs/TOKEN.md) for the exact constraints and post-mint record.
