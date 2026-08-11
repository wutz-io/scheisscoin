import assert from 'node:assert/strict';
import test from 'node:test';
import { DECIMALS, DISPLAYED_SUPPLY, MAINNET_RPC, RAW_SUPPLY, UI_MULTIPLIER } from '../token/create-scheiss.mjs';

test('Scheisscoin uses the specified Mainnet supply configuration', () => {
  assert.equal(MAINNET_RPC, 'https://api.mainnet-beta.solana.com');
  assert.equal(RAW_SUPPLY, 100_000_000_000_000n);
  assert.equal(DECIMALS, 0);
  assert.equal(UI_MULTIPLIER, 1_000_000_000);
  assert.equal(DISPLAYED_SUPPLY, 100_000_000_000_000_000_000_000n);
});
