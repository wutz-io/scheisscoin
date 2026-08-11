# Wutzcoin ($WUTZ)

Wutzcoin is a deliberately valueless fun and learning token project for **Solana Devnet only**. It is not a product, investment, sale, presale, pool, listing, or promise of value. Do not send real SOL or money for WUTZ.

## Website

The static Astro site is published through GitHub Pages at <https://coin.wutz.io>. It is English-first with a client-side EN/DE switch, contains no wallet connection or purchase path, and uses the real `wutz.io` favicon as its logo. The public reserve label is **Schlonk**; the actual owner remains the public Devnet wallet recorded after minting.

## Token design

| Property | Value |
| --- | --- |
| Network | Solana Devnet only |
| Program | Token-2022 |
| Name / symbol | Wutzcoin / WUTZ |
| Raw supply | `100000000000000` |
| Decimals | `0` |
| Scaled UI multiplier | `1000000000` |
| Compatible-client display | `100000000000000000000000 WUTZ` |
| Freeze authority | Never set |
| Mint authority | Disabled after the one-time mint |

The `ScaledUiAmountConfig` multiplier changes only what compatible clients display; it does not create more tokens or alter token-account balances. Incompatible clients may display only the raw supply. The script initializes the multiplier without an update authority, making it immutable.

## Architecture

- `src/pages/index.astro` — static, responsive public site and EN/DE switch
- `public/` — favicon-derived 1024×1024 token image and off-chain metadata JSON
- `token/create-wutz.mjs` — explicit, Devnet-only Token-2022 mint workflow
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

## Minting on Devnet

`npm run token:create` uses only `https://api.devnet.solana.com`. It reads an existing owner keypair from `SOLANA_KEYPAIR` or `~/.config/solana/id.json`; it will never silently generate an owner wallet or print secret material. It displays the public owner address and requires that exact address to be retyped immediately before any transaction. If necessary, it asks the Devnet faucet for free Devnet SOL only.

Before running it, confirm that GitHub Pages has deployed and that `public/token-metadata.json` is publicly reachable. The script creates the Token-2022 mint, MetadataPointer and official in-mint metadata, immutable `ScaledUiAmountConfig`, owner ATA, raw supply, and then disables the mint authority. It verifies the result through Devnet RPC.

See [docs/TOKEN.md](docs/TOKEN.md) for the exact constraints and post-mint record.
