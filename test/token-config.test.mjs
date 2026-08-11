import assert from 'node:assert/strict';
import test from 'node:test';
import { DECIMALS, DEVNET_RPC, DISPLAYED_SUPPLY, RAW_SUPPLY, UI_MULTIPLIER } from '../token/create-wutz.mjs';

test('Wutzcoin uses the specified Devnet-only supply configuration', () => {
  assert.equal(DEVNET_RPC, 'https://api.devnet.solana.com');
  assert.equal(RAW_SUPPLY, 100_000_000_000_000n);
  assert.equal(DECIMALS, 0);
  assert.equal(UI_MULTIPLIER, 1_000_000_000);
  assert.equal(DISPLAYED_SUPPLY, 100_000_000_000_000_000_000_000n);
});
