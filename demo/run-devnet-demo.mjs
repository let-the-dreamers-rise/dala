// Runs one migrant worker's Dala story on Solana devnet and writes every signature to demo.json.
//
// Cast: Maria (domestic worker in Singapore), her employer, a foundation sponsor, her mother at home.
// Time is compressed: 1 "month" = 30 seconds, payouts start 90 seconds after opening.
//
// Usage: WALLET=~/.config/solana/id.json OUT=../app/demo.json node run-devnet-demo.mjs

import fs from "node:fs";
import os from "node:os";
import {
  Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createMint, createAccount, mintTo, getAccount } from "@solana/spl-token";
import * as dala from "./dala-client.mjs";

const RPC = process.env.RPC ?? "https://api.devnet.solana.com";
const WALLET = (process.env.WALLET ?? "~/.config/solana/id.json").replace("~", os.homedir());
const OUT = process.env.OUT ?? "demo.json";
const USDC = 1_000_000; // 6 decimals
const PERIOD_SECS = 30;
const PERIODS = 4;
const START_DELAY = 90;

const conn = new Connection(RPC, "confirmed");
const relayer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(WALLET, "utf8"))));
const maria = Keypair.generate();
const employer = Keypair.generate();
const foundation = Keypair.generate();
const mother = Keypair.generate();

const log = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function send(step, ixs, signers) {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = relayer.publicKey; // Dala's relayer pays every fee: no one needs SOL.
  const sig = await sendAndConfirmTransaction(conn, tx, [relayer, ...signers], { commitment: "confirmed" });
  log.push({ step, sig, ok: true, at: Math.floor(Date.now() / 1000) });
  console.log(`ok   ${step}\n     https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  return sig;
}

async function expectFailure(step, ixs, signers, needle) {
  try {
    const tx = new Transaction().add(...ixs);
    tx.feePayer = relayer.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.sign(relayer, ...signers);
    const sim = await conn.simulateTransaction(tx);
    const logs = (sim.value.logs ?? []).join("\n");
    if (!sim.value.err) throw new Error(`${step}: expected failure but simulation succeeded`);
    const matched = logs.includes(needle);
    log.push({ step, ok: false, rejectedWith: matched ? needle : JSON.stringify(sim.value.err), at: Math.floor(Date.now() / 1000) });
    console.log(`blocked ${step} -> ${matched ? needle : JSON.stringify(sim.value.err)}`);
  } catch (e) {
    if (String(e.message).includes("expected failure")) throw e;
    log.push({ step, ok: false, rejectedWith: String(e.message).slice(0, 120), at: Math.floor(Date.now() / 1000) });
  }
}

async function main() {
  console.log(`relayer ${relayer.publicKey.toBase58()} balance ${(await conn.getBalance(relayer.publicKey)) / LAMPORTS_PER_SOL} SOL`);

  // Demo stablecoin standing in for USDC on devnet.
  const mint = await createMint(conn, relayer, relayer.publicKey, null, 6);
  const wallet = async (owner, amount) => {
    const acc = await createAccount(conn, relayer, mint, owner.publicKey, Keypair.generate());
    if (amount) await mintTo(conn, relayer, mint, acc, relayer, amount * USDC);
    return acc;
  };
  const mariaWallet = await wallet(maria, 300);
  const employerWallet = await wallet(employer, 1_000);
  const foundationWallet = await wallet(foundation, 5_000);
  const motherWallet = await wallet(mother, 0);
  // The family contribution comes from Maria's brother; reuse the employer flow with a second payer.
  const brother = Keypair.generate();
  const brotherWallet = await wallet(brother, 100);

  const vault = dala.vaultPda(maria.publicKey, mint);
  const pool = dala.poolPda(foundation.publicKey, mint);
  const payoutStart = Math.floor(Date.now() / 1000) + START_DELAY;

  await send("Maria opens her Dala vault (payouts: 4 monthly payments)", [
    dala.openVault({ payer: relayer.publicKey, worker: maria.publicKey, mint, payoutStart, periodSecs: PERIOD_SECS, periods: PERIODS }),
  ], [maria]);

  await send("Foundation creates a 1:1 matching pool, capped at 100 USDC per worker", [
    // The sponsor pays rent for its own pool accounts.
    SystemProgram.transfer({ fromPubkey: relayer.publicKey, toPubkey: foundation.publicKey, lamports: 0.01 * LAMPORTS_PER_SOL }),
    dala.createMatchPool({ sponsor: foundation.publicKey, mint, matchBps: 10_000, capPerWorker: 100 * USDC }),
  ], [foundation]);
  await send("Foundation funds the pool with 5,000 USDC", [
    dala.fundPool({ funder: foundation.publicKey, from: foundationWallet, mint, pool, amount: 5_000 * USDC }),
  ], [foundation]);
  await send("Maria joins the matching pool", [
    dala.joinPool({ payer: relayer.publicKey, worker: maria.publicKey, vault, pool }),
  ], [maria]);

  await send("Employer tops up 200 USDC (public, tagged as employer)", [
    dala.contribute({ contributor: employer.publicKey, from: employerWallet, mint, vault, amount: 200 * USDC, kind: dala.KIND.employer }),
  ], [employer]);
  await send("Her brother sends 50 USDC (tagged as family)", [
    dala.contribute({ contributor: brother.publicKey, from: brotherWallet, mint, vault, amount: 50 * USDC, kind: dala.KIND.family }),
  ], [brother]);

  await send("Payday: Maria saves 60 USDC, the pool matches 60", [
    dala.saveWithMatch({ worker: maria.publicKey, from: mariaWallet, mint, vault, pool, amount: 60 * USDC }),
  ], [maria]);
  await send("Next payday: Maria saves 60 USDC, the pool matches 40 (cap reached)", [
    dala.saveWithMatch({ worker: maria.publicKey, from: mariaWallet, mint, vault, pool, amount: 60 * USDC }),
  ], [maria]);

  await expectFailure("Employer tries to save into her vault to farm the match", [
    dala.saveWithMatch({ worker: employer.publicKey, from: employerWallet, mint, vault, pool, amount: 10 * USDC }),
  ], [employer], "ConstraintSeeds");
  await expectFailure("Early withdrawal before retirement date", [
    dala.claim({ worker: maria.publicKey, mint, vault, to: mariaWallet }),
  ], [maria], "PayoutNotStarted");
  await expectFailure("Employer tries to withdraw her balance", [
    dala.claim({ worker: employer.publicKey, mint, vault, to: employerWallet }),
  ], [employer], "ConstraintSeeds");

  const waitUntil = async (ts) => { while (Math.floor(Date.now() / 1000) < ts + 2) await sleep(2_000); };
  console.log(`waiting for payout start (${START_DELAY}s)...`);
  await waitUntil(payoutStart);
  await send("Retired: first monthly payout goes to her mother's wallet at home", [
    dala.claim({ worker: maria.publicKey, mint, vault, to: motherWallet }),
  ], [maria]);
  // Different destination so the attempt is not deduplicated against the first claim.
  await expectFailure("Second claim in the same month", [
    dala.claim({ worker: maria.publicKey, mint, vault, to: mariaWallet }),
  ], [maria], "NothingToClaim");
  await waitUntil(payoutStart + PERIOD_SECS);
  await send("Second monthly payout", [
    dala.claim({ worker: maria.publicKey, mint, vault, to: motherWallet }),
  ], [maria]);

  const v = dala.decodeVault((await conn.getAccountInfo(vault)).data);
  const vaultTokens = await getAccount(conn, dala.vaultTokensPda(vault));
  const motherBal = await getAccount(conn, motherWallet);
  const out = {
    cluster: "devnet",
    generatedAt: new Date().toISOString(),
    programId: dala.PROGRAM_ID.toBase58(),
    mint: mint.toBase58(),
    vault: vault.toBase58(),
    vaultTokens: dala.vaultTokensPda(vault).toBase58(),
    pool: pool.toBase58(),
    people: {
      maria: maria.publicKey.toBase58(),
      employer: employer.publicKey.toBase58(),
      brother: brother.publicKey.toBase58(),
      foundation: foundation.publicKey.toBase58(),
      motherWallet: motherWallet.toBase58(),
      relayer: relayer.publicKey.toBase58(),
    },
    schedule: { payoutStart, periodSecs: PERIOD_SECS, periods: PERIODS },
    vaultState: v,
    balances: { vault: Number(vaultTokens.amount), mother: Number(motherBal.amount) },
    steps: log,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`\nvault ${out.vault}\nwrote ${OUT}`);
  console.log(JSON.stringify({ vaultState: v, balances: out.balances }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
