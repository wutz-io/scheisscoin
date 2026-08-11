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
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AuthorityType,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
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
  getScaledUiAmountConfig,
} from '@solana/spl-token';
import {
  createInitializeInstruction as createInitializeMetadataInstruction,
  createUpdateAuthorityInstruction as createUpdateMetadataAuthorityInstruction,
  pack as packTokenMetadata,
  unpack as unpackTokenMetadata,
} from '@solana/spl-token-metadata';

export const DEVNET_RPC = 'https://api.devnet.solana.com';
export const RAW_SUPPLY = 100_000_000_000_000n;
export const DECIMALS = 0;
export const UI_MULTIPLIER = 1_000_000_000;
export const DISPLAYED_SUPPLY = RAW_SUPPLY * BigInt(UI_MULTIPLIER);
export const METADATA_URI = 'https://wutz-io.github.io/wutzcoin/token-metadata.json';

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
  const rl = createInterface({ input, output });
  try {
    const confirmation = await rl.question(`\nNo transaction has been sent. To mint WUTZ on Solana Devnet, retype this owner address exactly:\n${owner}\n> `);
    if (confirmation.trim() !== owner) throw new Error('Owner address was not confirmed. No transaction was sent.');
  } finally {
    rl.close();
  }
}

async function ensureDevnetFunds(connection, owner) {
  const minimum = 0.02 * LAMPORTS_PER_SOL;
  const balance = await connection.getBalance(owner, 'confirmed');
  if (balance >= minimum) return balance;

  console.log('Requesting 1 free Devnet SOL only for rent and transaction fees…');
  const signature = await connection.requestAirdrop(owner, LAMPORTS_PER_SOL);
  const latest = await connection.getLatestBlockhash('confirmed');
  const result = await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
  if (result.value.err) throw new Error(`Devnet airdrop failed: ${JSON.stringify(result.value.err)}`);
  return connection.getBalance(owner, 'confirmed');
}

function assertDevnet(connection) {
  if (connection.rpcEndpoint !== DEVNET_RPC) throw new Error('Refusing to use a non-Devnet RPC endpoint.');
}

async function simulateOrThrow(connection, transaction, signers, label) {
  const simulation = await connection.simulateTransaction(transaction, signers);
  if (simulation.value.err) {
    throw new Error(`${label} simulation failed: ${JSON.stringify(simulation.value.err)}`);
  }
  console.log(`${label} simulation succeeded.`);
}

async function verifyMint(connection, mint, tokenAccount, owner) {
  const mintInfo = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
  const multiplier = getScaledUiAmountConfig(mintInfo);
  const tokenAccountInfo = await connection.getTokenAccountBalance(tokenAccount, 'confirmed');
  const metadataBytes = getExtensionData(ExtensionType.TokenMetadata, mintInfo.tlvData);
  const metadata = metadataBytes ? unpackTokenMetadata(metadataBytes) : null;

  if (mintInfo.supply !== RAW_SUPPLY) throw new Error(`Verification failed: raw supply is ${mintInfo.supply}.`);
  if (mintInfo.decimals !== DECIMALS) throw new Error(`Verification failed: decimals are ${mintInfo.decimals}.`);
  if (mintInfo.mintAuthority !== null) throw new Error('Verification failed: mint authority remains enabled.');
  if (mintInfo.freezeAuthority !== null) throw new Error('Verification failed: freeze authority is set.');
  if (!multiplier || multiplier.multiplier !== UI_MULTIPLIER || multiplier.newMultiplier !== UI_MULTIPLIER) throw new Error('Verification failed: ScaledUiAmountConfig multiplier mismatch.');
  if (tokenAccountInfo.value.amount !== RAW_SUPPLY.toString()) throw new Error('Verification failed: owner token account does not hold the full raw supply.');
  if (!metadata || metadata.name !== 'Wutzcoin' || metadata.symbol !== 'WUTZ') throw new Error('Verification failed: Token-2022 metadata is missing or incorrect.');

  return { mintInfo, multiplier, metadata, owner };
}

async function main() {
  const connection = new Connection(DEVNET_RPC, 'confirmed');
  assertDevnet(connection);
  const owner = await loadOwnerKeypair();
  const ownerAddress = owner.publicKey.toBase58();

  console.log('Wutzcoin Token-2022 Devnet mint');
  console.log(`RPC: ${DEVNET_RPC}`);
  console.log(`Owner address: ${ownerAddress}`);
  console.log(`Raw supply: ${RAW_SUPPLY}`);
  console.log(`Decimals: ${DECIMALS}`);
  console.log(`Scaled UI multiplier: ${UI_MULTIPLIER}`);
  console.log(`Displayed supply for compatible clients: ${DISPLAYED_SUPPLY} WUTZ`);
  console.log('The multiplier authority and metadata pointer authority will be disabled. No Freeze Authority is set.');

  await confirmOwner(ownerAddress);
  await ensureDevnetFunds(connection, owner.publicKey);

  const mint = Keypair.generate();
  const metadata = {
    updateAuthority: owner.publicKey,
    mint: mint.publicKey,
    name: 'Wutzcoin',
    symbol: 'WUTZ',
    uri: METADATA_URI,
    additionalMetadata: [['notice', 'Devnet only / no monetary value']],
  };
  const mintLength = getMintLen(
    [ExtensionType.MetadataPointer, ExtensionType.ScaledUiAmountConfig],
    { [ExtensionType.TokenMetadata]: packTokenMetadata(metadata).length },
  );
  const rent = await connection.getMinimumBalanceForRentExemption(mintLength, 'confirmed');
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
      space: mintLength,
      lamports: rent,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(mint.publicKey, null, mint.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializeScaledUiAmountConfigInstruction(mint.publicKey, null, UI_MULTIPLIER, TOKEN_2022_PROGRAM_ID),
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
  await simulateOrThrow(connection, createMint, [owner, mint], 'Mint creation');
  await sendAndConfirmTransaction(connection, createMint, [owner, mint], { commitment: 'confirmed' });

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
  );
  await simulateOrThrow(connection, issueAndLock, [owner], 'Issue and authority lock');
  await sendAndConfirmTransaction(connection, issueAndLock, [owner], { commitment: 'confirmed' });

  await verifyMint(connection, mint.publicKey, ownerTokenAccount, owner.publicKey);
  const explorer = `https://explorer.solana.com/address/${mint.publicKey.toBase58()}?cluster=devnet`;
  console.log(`\nMint address: ${mint.publicKey.toBase58()}`);
  console.log(`Owner address: ${ownerAddress}`);
  console.log(`Token account: ${ownerTokenAccount.toBase58()}`);
  console.log(`Devnet Explorer: ${explorer}`);
  console.log('Verified: Token-2022, exact raw supply, 0 decimals, multiplier 1000000000, mint authority null, freeze authority null, immutable metadata.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`Wutzcoin mint stopped: ${error.message}`);
    process.exitCode = 1;
  });
}
