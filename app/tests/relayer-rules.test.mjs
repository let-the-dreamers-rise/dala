// Unit test for the relayer's co-sign rules. No network.
import { Keypair, Transaction, SystemProgram } from "@solana/web3.js";
import { createTransferCheckedInstruction } from "@solana/spl-token";
import { checkTransaction } from "../api/submit.js";
import * as dala from "../lib/dala.js";
import { MINT, POOL, ataOf } from "../lib/relayer.js";

const relayer = Keypair.generate().publicKey;
const worker = Keypair.generate().publicKey;
const employer = Keypair.generate().publicKey;
const foundation = Keypair.generate().publicKey;
const stranger = Keypair.generate().publicKey;
const vault = dala.vaultPda(worker, MINT);
const tx = (...ixs) => { const t = new Transaction().add(...ixs); t.feePayer = relayer; return t; };
const S = (sub, role) => ({ sub: sub.toBase58(), role });

const cases = [
  ["worker open vault", true, tx(dala.openVault({ payer: relayer, worker, mint: MINT, payoutStart: 1, periodSecs: 30, periods: 4 })), S(worker, "worker")],
  ["worker join+save", true, tx(dala.joinPool({ payer: relayer, worker, vault, pool: POOL }), dala.saveWithMatch({ worker, from: ataOf(worker), mint: MINT, vault, pool: POOL, amount: 1 })), S(worker, "worker")],
  ["worker send home", true, tx(createTransferCheckedInstruction(ataOf(worker), MINT, ataOf(dala.familyOwner(worker)), worker, 5, 6)), S(worker, "worker")],
  ["worker send to stranger", false, tx(createTransferCheckedInstruction(ataOf(worker), MINT, ataOf(stranger), worker, 5, 6)), S(worker, "worker")],
  ["worker drains relayer SOL", false, tx(SystemProgram.transfer({ fromPubkey: relayer, toPubkey: worker, lamports: 1 })), S(worker, "worker")],
  ["worker claims someone else's vault", false, tx(dala.claim({ worker: stranger, mint: MINT, vault: dala.vaultPda(stranger, MINT), to: ataOf(stranger) })), S(worker, "worker")],
  ["employer payroll x3", true, tx(...[1, 2, 3].map(() => dala.contribute({ contributor: employer, from: ataOf(employer), mint: MINT, vault, amount: 1, kind: 0 }))), S(employer, "employer")],
  ["employer pays from relayer treasury", false, tx(dala.contribute({ contributor: relayer, from: ataOf(relayer), mint: MINT, vault, amount: 1, kind: 0 })), S(employer, "employer")],
  ["employer tries to claim", false, tx(dala.claim({ worker: employer, mint: MINT, vault, to: ataOf(employer) })), S(employer, "employer")],
  ["foundation create pool", true, tx(dala.createMatchPool({ sponsor: foundation, mint: MINT, matchBps: 10000, capPerWorker: 1 })), S(foundation, "foundation")],
  ["foundation fund pool", true, tx(dala.fundPool({ funder: foundation, from: ataOf(foundation), mint: MINT, pool: dala.poolPda(foundation, MINT), amount: 1 })), S(foundation, "foundation")],
  ["foundation pool paid by relayer", false, tx(dala.createMatchPool({ sponsor: relayer, mint: MINT, matchBps: 10000, capPerWorker: 1 })), S(foundation, "foundation")],
  ["wrong fee payer", false, (() => { const t = new Transaction().add(dala.claim({ worker, mint: MINT, vault, to: ataOf(worker) })); t.feePayer = worker; return t; })(), S(worker, "worker")],
];

let fails = 0;
for (const [name, expectOk, t, s] of cases) {
  let ok = true; let why = "";
  try { checkTransaction(t, s, relayer); } catch (e) { ok = false; why = e.message; }
  const pass = ok === expectOk;
  if (!pass) fails++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (refused: ${why})`}`);
}
console.log(fails ? `${fails} failing` : "all relayer rules behave");
process.exit(fails ? 1 : 0);
