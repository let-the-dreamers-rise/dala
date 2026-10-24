import { PublicKey } from "@solana/web3.js";
import { route } from "../lib/http.js";
import { readSession } from "../lib/session.js";
import { conn, MINT, POOL, ataOf, PERIOD_SECS } from "../lib/relayer.js";
import * as dala from "../lib/dala.js";
import { CONFIG } from "../lib/config.js";
import { familyOwner } from "../lib/dala.js";

// GET: pool stats for everyone, plus the signed-in user's wallet and vault. One RPC round trip.
export default route(["GET"], async (_body, req) => {
  const s = readSession(req);
  const me = s ? new PublicKey(s.sub) : null;
  const vault = me ? dala.vaultPda(me, MINT) : null;
  const keys = [POOL, dala.poolTokensPda(POOL)];
  if (me) {
    keys.push(ataOf(me), vault, dala.vaultTokensPda(vault), dala.recordPda(POOL, vault), ataOf(familyOwner(me)));
  }
  const [poolAcc, poolTok, walletAcc, vaultAcc, vaultTok, recordAcc, familyAcc] = await conn.getMultipleAccountsInfo(keys);
  const pool = poolAcc ? dala.decodePool(poolAcc.data) : null;
  return {
    now: Math.floor(Date.now() / 1000),
    config: { programId: dala.PROGRAM_ID.toBase58(), mint: CONFIG.mint, pool: CONFIG.pool, periodSecs: PERIOD_SECS },
    pool: pool && { ...pool, available: poolTok ? dala.tokenAmount(poolTok.data) : 0 },
    me: me && {
      pubkey: s.sub,
      role: s.role,
      method: s.method,
      wallet: { address: ataOf(me).toBase58(), amount: walletAcc ? dala.tokenAmount(walletAcc.data) : null },
      vault: vaultAcc ? { address: vault.toBase58(), ...dala.decodeVault(vaultAcc.data), locked: vaultTok ? dala.tokenAmount(vaultTok.data) : 0 } : null,
      matched: recordAcc ? dala.decodeRecordMatched(recordAcc.data) : 0,
      family: s.role === "worker" ? { address: ataOf(familyOwner(me)).toBase58(), amount: familyAcc ? dala.tokenAmount(familyAcc.data) : 0 } : null,
    },
  };
});
