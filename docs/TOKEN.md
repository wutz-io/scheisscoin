# Scheisscoin token specification

## Scope

Scheisscoin (`$KACK`; on-chain symbol `KACK`) is a Solana **Mainnet** Token-2022 fun token. It has no monetary value and is not sold, listed, pooled, traded, or connected to any wallet interface.

## Mint configuration

| Field | Value |
| --- | --- |
| RPC endpoint | `https://api.mainnet-beta.solana.com` only |
| Program | Token-2022 |
| Raw supply | `100000000000000` |
| Decimals | `0` |
| Scaled UI multiplier | `1000000000` |
| Displayed supply | `100000000000000000000000 $KACK` |
| Metadata | Token-2022 MetadataPointer plus in-mint Token Metadata |
| Freeze authority | `null` from mint creation |
| Mint authority | Set to `null` after the one-time issue |

The large displayed supply is intentional. The raw value is within Solana's `u64` limit; Token-2022's `ScaledUiAmountConfig` lets compatible clients apply a cosmetic multiplier. It does not mint, distribute, or create additional tokens. Clients without the extension can show the raw supply only. The configuration deliberately has no multiplier-update authority, so the multiplier cannot change.

## Controlled mint procedure

1. Publish the GitHub Pages site and check the metadata and token-image URLs.
2. Ensure an existing local owner keypair is available at `SOLANA_KEYPAIR` or `~/.config/solana/id.json`. Never put that keypair in the repository.
3. Run `npm run token:create`.
4. Inspect the printed Mainnet RPC endpoint and public owner address, then retype that address exactly to authorize the transaction sequence.
5. The existing owner wallet must hold enough Mainnet SOL for account rent and transaction fees. The script never requests an airdrop or sends SOL anywhere.
6. Optionally run `npm run token:simulate` first; it performs a no-send simulation of the complete Mainnet transaction.
7. The script atomically creates the extended mint and metadata, creates the owner ATA, mints the full raw supply, makes metadata immutable, and disables minting plus the MetadataPointer and scaled-UI update authorities.
8. Record the mint and ATA below only after RPC verification succeeds.

## Post-mint record

Not minted yet. This section is updated only with actual Mainnet RPC results.

- Mint address: pending
- Owner address: pending
- Owner token account: pending
- Explorer: pending
