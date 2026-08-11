import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ACCOUNT_SIZE,
  AuthorityType,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  TYPE_SIZE,
  LENGTH_SIZE,
  createAssociatedTokenAccountInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createInitializeScaledUiAmountConfigInstruction,
  createMintToCheckedInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddressSync,
  getExtensionData,
  getMint,
  getMintLen,
  getMetadataPointerState,
  getScaledUiAmountConfig,
} from '@solana/spl-token';
import {
  createInitializeInstruction as createInitializeMetadataInstruction,
  createUpdateAuthorityInstruction as createUpdateMetadataAuthorityInstruction,
  pack as packTokenMetadata,
  unpack as unpackTokenMetadata,
} from '@solana/spl-token-metadata';

export const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';
export const RAW_SUPPLY = 100_000_000_000_000n;
export const DECIMALS = 0;
export const UI_MULTIPLIER = 1_000_000_000;
export const DISPLAYED_SUPPLY = RAW_SUPPLY * BigInt(UI_MULTIPLIER);
export const METADATA_URI = 'https://kack.wutz.io/token-metadata.json';

function keypairPath() {
  return process.env.SOLANA_KEYPAIR || join(homedir(), '.config', 'solana', 'id.json');
}

async function loadOwnerKeypair() {
  const path = keypairPath();
  let contents;
  try {
    contents = await readFile(path, 'utf8');
  } catch {
    throw new Error(`No local Solana keypair found at ${path}. Set SOLANA_KEYPAIR to an existing keypair path or create one yourself with solana-keygen. No wallet was created.`);
  }

  try {
    const secret = Uint8Array.from(JSON.parse(contents));
    return Keypair.fromSecretKey(secret);
  } catch {
    throw new Error(`The configured Solana keypair at ${path} could not be read. No wallet was created.`);
  }
}

async function confirmOwner(owner) {
  const automatedConfirmation = process.env.KACK_OWNER_CONFIRM;
  if (automatedConfirmation !== undefined) {
    if (automatedConfirmation.trim() !== owner) throw new Error('Owner address was not confirmed. No transaction was sent.');
    console.log('Owner address confirmed through the explicit automation confirmation.');
    return;
  }
  const rl = createInterface({ input, output });
  try {
    const confirmation = await rl.question(`\nNo transaction has been sent. To mint $KACK on Solana Mainnet, retype this owner address exactly:\n${owner}\n> `);
    if (confirmation.trim() !== owner) throw new Error('Owner address was not confirmed. No transaction was sent.');
  } finally {
    rl.close();
  }
}

async function ensureMainnetFunds(connection, owner, minimum) {
  const balance = await connection.getBalance(owner, 'confirmed');
  if (balance >= minimum) return balance;
  throw new Error(`Insufficient Mainnet SOL. The owner has ${balance / LAMPORTS_PER_SOL} SOL; at least ${minimum / LAMPORTS_PER_SOL} SOL is required for mint and ATA rent plus transaction-fee buffer. Send Mainnet SOL to the printed public owner address, then rerun. No transaction was sent.`);
}

async function assertPublishedMetadata() {
  let response;
  try {
    response = await fetch(METADATA_URI, { redirect: 'error' });
  } catch {
    throw new Error(`Token metadata is not reachable at ${METADATA_URI}. Fix the public website before minting. No transaction was sent.`);
  }
  if (!response.ok) throw new Error(`Token metadata returned HTTP ${response.status} at ${METADATA_URI}. No transaction was sent.`);

  let metadata;
  try {
    metadata = await response.json();
  } catch {
    throw new Error(`Token metadata at ${METADATA_URI} is not valid JSON. No transaction was sent.`);
  }
  if (metadata.name !== 'Scheisscoin' || metadata.symbol !== 'KACK') {
    throw new Error('Token metadata does not identify Scheisscoin / KACK. No transaction was sent.');
  }
}

function assertMainnet(connection) {
  if (connection.rpcEndpoint !== MAINNET_RPC) throw new Error('Refusing to use a non-Mainnet RPC endpoint.');
}

async function simulateOrThrow(connection, transaction, signers, label) {
  const simulation = await connection.simulateTransaction(transaction, signers);
  if (simulation.value.err) {
    const logs = simulation.value.logs?.join('\n') || 'No program logs were returned.';
    throw new Error(`${label} simulation failed: ${JSON.stringify(simulation.value.err)}\n${logs}`);
  }
  console.log(`${label} simulation succeeded.`);
}

async function verifyMint(connection, mint, tokenAccount, owner) {
  const mintInfo = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
  const multiplier = getScaledUiAmountConfig(mintInfo);
  const metadataPointer = getMetadataPointerState(mintInfo);
  const tokenAccountInfo = await connection.getTokenAccountBalance(tokenAccount, 'confirmed');
  const metadataBytes = getExtensionData(ExtensionType.TokenMetadata, mintInfo.tlvData);
  const metadata = metadataBytes ? unpackTokenMetadata(metadataBytes) : null;

  if (mintInfo.supply !== RAW_SUPPLY) throw new Error(`Verification failed: raw supply is ${mintInfo.supply}.`);
  if (mintInfo.decimals !== DECIMALS) throw new Error(`Verification failed: decimals are ${mintInfo.decimals}.`);
  if (mintInfo.mintAuthority !== null) throw new Error('Verification failed: mint authority remains enabled.');
  if (mintInfo.freezeAuthority !== null) throw new Error('Verification failed: freeze authority is set.');
  if (!multiplier || multiplier.multiplier !== UI_MULTIPLIER || multiplier.newMultiplier !== UI_MULTIPLIER) throw new Error('Verification failed: ScaledUiAmountConfig multiplier mismatch.');
  if (!multiplier.authority.equals(PublicKey.default)) throw new Error('Verification failed: ScaledUiAmountConfig authority remains enabled.');
  if (!metadataPointer || metadataPointer.authority !== null || !metadataPointer.metadataAddress?.equals(mint)) throw new Error('Verification failed: MetadataPointer is not immutable or does not point to the mint.');
  if (tokenAccountInfo.value.amount !== RAW_SUPPLY.toString()) throw new Error('Verification failed: owner token account does not hold the full raw supply.');
  if (!metadata || metadata.name !== 'Scheisscoin' || metadata.symbol !== 'KACK' || metadata.updateAuthority !== undefined) throw new Error('Verification failed: Token-2022 metadata is missing, mutable, or incorrect.');

  return { mintInfo, multiplier, metadata, owner };
}

async function main() {
  const simulateOnly = process.argv.includes('--simulate-only');
  const connection = new Connection(MAINNET_RPC, 'confirmed');
  assertMainnet(connection);
  const owner = await loadOwnerKeypair();
  const ownerAddress = owner.publicKey.toBase58();
  const mint = Keypair.generate();
  const metadata = {
    updateAuthority: owner.publicKey,
    mint: mint.publicKey,
    name: 'Scheisscoin',
    symbol: 'KACK',
    uri: METADATA_URI,
    additionalMetadata: [['notice', 'Mainnet / no monetary value']],
  };
  const mintSpace = getMintLen([ExtensionType.MetadataPointer, ExtensionType.ScaledUiAmountConfig]);
  const metadataSpace = TYPE_SIZE + LENGTH_SIZE + packTokenMetadata(metadata).length;
  const mintRent = await connection.getMinimumBalanceForRentExemption(mintSpace + metadataSpace, 'confirmed');
  const tokenAccountRent = await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE, 'confirmed');
  const feeBuffer = 50_000;
  const requiredLamports = mintRent + tokenAccountRent + feeBuffer;

  console.log('Scheisscoin Token-2022 Mainnet mint');
  console.log(`RPC: ${MAINNET_RPC}`);
  console.log(`Owner address: ${ownerAddress}`);
  console.log(`Raw supply: ${RAW_SUPPLY}`);
  console.log(`Decimals: ${DECIMALS}`);
  console.log(`Scaled UI multiplier: ${UI_MULTIPLIER}`);
  console.log(`Displayed supply for compatible clients: ${DISPLAYED_SUPPLY} $KACK`);
  console.log('The multiplier authority and metadata pointer authority will be disabled. No Freeze Authority is set.');
  console.log(`Required Mainnet SOL (rent plus fee buffer): ${requiredLamports / LAMPORTS_PER_SOL}`);

  await assertPublishedMetadata();
  await ensureMainnetFunds(connection, owner.publicKey, requiredLamports);
  if (!simulateOnly) await confirmOwner(ownerAddress);

  const ownerTokenAccount = getAssociatedTokenAddressSync(
    mint.publicKey,
    owner.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const createMint = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: owner.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintSpace,
      lamports: mintRent,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(mint.publicKey, owner.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializeScaledUiAmountConfigInstruction(mint.publicKey, owner.publicKey, UI_MULTIPLIER, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(mint.publicKey, DECIMALS, owner.publicKey, null, TOKEN_2022_PROGRAM_ID),
    createInitializeMetadataInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      updateAuthority: owner.publicKey,
      mint: mint.publicKey,
      mintAuthority: owner.publicKey,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadata.uri,
    }),
  );
  const issueAndLock = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      owner.publicKey,
      ownerTokenAccount,
      owner.publicKey,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
    createMintToCheckedInstruction(
      mint.publicKey,
      ownerTokenAccount,
      owner.publicKey,
      RAW_SUPPLY,
      DECIMALS,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
    createUpdateMetadataAuthorityInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      oldAuthority: owner.publicKey,
      newAuthority: null,
    }),
    createSetAuthorityInstruction(
      mint.publicKey,
      owner.publicKey,
      AuthorityType.MintTokens,
      null,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
    createSetAuthorityInstruction(
      mint.publicKey,
      owner.publicKey,
      AuthorityType.MetadataPointer,
      null,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
    createSetAuthorityInstruction(
      mint.publicKey,
      owner.publicKey,
      AuthorityType.ScaledUiAmountConfig,
      null,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  );
  const mintAndLock = new Transaction().add(...createMint.instructions, ...issueAndLock.instructions);
  await simulateOrThrow(connection, mintAndLock, [owner, mint], 'Mint, issue, and authority lock');
  if (simulateOnly) {
    console.log('Full mint transaction simulation completed; no transaction was sent.');
    return;
  }
  await sendAndConfirmTransaction(connection, mintAndLock, [owner, mint], { commitment: 'confirmed' });

  await verifyMint(connection, mint.publicKey, ownerTokenAccount, owner.publicKey);
  const explorer = `https://explorer.solana.com/address/${mint.publicKey.toBase58()}`;
  console.log(`\nMint address: ${mint.publicKey.toBase58()}`);
  console.log(`Owner address: ${ownerAddress}`);
  console.log(`Token account: ${ownerTokenAccount.toBase58()}`);
  console.log(`Mainnet Explorer: ${explorer}`);
  console.log('Verified: Mainnet Token-2022, exact raw supply, 0 decimals, multiplier 1000000000, mint authority null, freeze authority null, immutable metadata.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`Scheisscoin mint stopped: ${error.message}`);
    process.exitCode = 1;
  });
}
