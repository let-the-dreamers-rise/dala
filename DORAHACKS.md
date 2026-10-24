# DoraHacks build form: paste-ready

Fill the "Create a new Build" form from top to bottom with the blocks below.

## Logo

Upload `app/brand/dala-logo.png` (512 x 512). A 1024 version is next to it.

## Name

```
Dala
```

## Brief description

```
A worker-owned pension for migrant workers: matched, locked by code, paid monthly at home.
```

## Tags

```
Social Good
Financial Inclusion
Solana
Stablecoin
Pension
Migrant Workers
```

## Links

| Field | Value |
|---|---|
| Website | `https://dala-puce.vercel.app/` |
| GitHub Repo | `https://github.com/let-the-dreamers-rise/dala` |
| Other (live app) | `https://dala-puce.vercel.app/app.html` |

## Description (paste into the editor)

Everything between the two lines below.

---

**Track:** Idea Track, with a working prototype on Solana devnet

**Try it in three minutes:** https://dala-puce.vercel.app/app.html  
Sign in with a passkey, open a vault, get matched, try to withdraw early, and watch a payout arrive. No wallet app and no SOL needed.

**Website:** https://dala-puce.vercel.app · **Code:** https://github.com/let-the-dreamers-rise/dala

## Dala: the pension that travels with the worker

Dala is a retirement account for migrant workers. The worker owns it. Employers, family and funders can top it up in public. It keeps paying her after she goes home, whatever country she worked in next. *Dala* means "to carry" in Tagalog.

## The problem

About **169 million** people work outside their country of birth (ILO). They pay into host economies for decades and usually retire with nothing.

- **Shut out where they work.** Singapore's CPF has been closed to foreign workers since 2003. Hong Kong's MPF exempts domestic employees. Most countries exclude migrant workers from national pensions, and defined-contribution schemes are not portable across borders.
- **Weak at home.** In 2018 only about 550,000 of 1.14 million registered overseas Filipino workers were paying into the Philippine SSS.
- **The lump sum disappears.** Gulf states pay a one-time gratuity instead of a pension. Returning workers' savings are usually spent soon after they get home.
- **The patch stops at the border.** The UAE's 2023 voluntary end-of-service savings scheme does not follow a worker who moves to another country.

## Who it is for

- **First:** the estimated 300,000+ migrant domestic workers in Singapore, mostly women from the Philippines, Indonesia and Myanmar, with no access to CPF.
- **Next:** domestic and construction workers in Hong Kong and the Gulf, and the 2.19 million overseas Filipino workers (2024, 57% women).
- **Also:** the families at home who receive the payouts, and the employers and foundations who want their help to be provable.

## How it works

1. **She opens a vault** with a passkey on her phone, and picks when payouts start and for how long. Nobody can change that later, including Dala.
2. **Anyone can top it up.** Each employer, family or NGO payment is public and tagged with who sent it.
3. **Her saving unlocks a match.** A foundation pool matches her own deposits up to a cap, in the same transaction. Only her deposit triggers it.
4. **The lock holds.** Before her date, every withdrawal is refused by the program itself.
5. **It pays her at home.** One share a month, to her wallet or her family's, in whatever country she ends up.

## Why Web3

| Need | Bank or pension app | Dala |
|---|---|---|
| She moves to another country | Account closed or frozen | Same vault, same key |
| Check an employer's match | A promise inside a closed app | Public, tagged transaction |
| Funder proves a match was earned | Trust the operator's report | Paid only against her deposit |
| Pressure to cash out early | A custodian can be pressured | Lock enforced by code |
| No bank account in any country | KYC and an account per country | A phone and a passkey |

The closest existing product, pinBox's "gift a pension", proves employers and families will pay into a worker's retirement. It is custodial and tied to one country's pension system. Dala takes that behaviour across borders.

## What is built

- **Solana program** (Anchor), deployed to devnet at `J4NigtmbyxjPXkrLz77ZFpkQ3JXfVuBpzEyYWuGykoMY`, with eight instructions: open vault, contribute, create, fund and join a match pool, save, save with match, and claim.
- **10 passing tests:** payout and matching math, plus attacks such as an employer trying to farm the match or withdraw her balance.
- **Live web app:** passkey sign-in that derives a Solana wallet from the passkey, so there's no seed phrase. A relayer pays every fee and co-signs only Dala instructions for the signed-in user. Worker and employer views.
- **Recorded devnet run** with every transaction linked: https://dala-puce.vercel.app/story.html

## Tech stack

- Solana, Anchor 1.2, Rust, SPL Token, LiteSVM for tests
- Vercel serverless functions in Node.js, with `@solana/web3.js` and `@solana/spl-token`
- WebAuthn passkeys with the PRF extension, Ed25519 sign-in, HMAC session cookies
- Static front end with GSAP for the landing page

## Impact and sustainability

**What we will measure:** workers enrolled and still saving after 6 and 12 months, median balance and how much came from matches, payouts reaching families, and match dollars each provable on-chain.

**Illustrative model, not traction:** 10,000 workers saving $50 a month with a $50 match puts $12 million a year into workers' own retirement balances.

**Revenue:** a small capped yearly fee on balances, employer plans for payroll deduction and matching, paid matching pilots for foundations, and later a share of Treasury-bill yield through a licensed partner.

**Regulatory path:** version 1 is non-custodial and non-pooled. Each worker holds her own assets, and Dala only runs the rules. Pooled yield products come later through a MAS-licensed partner.

**Pilot (next 8 weeks):** one Singapore migrant-worker NGO, 50 Filipino and Indonesian domestic workers, a funded 1:1 match up to $100 each. We measure who is still saving after 90 days.

## Status

Devnet prototype with a demo stablecoin. In the demo, one month lasts 30 seconds. Not audited and not a licensed financial product.

## Sources

ILO labour migration estimates; UN social protection briefs on migrant pension exclusion and portability; CPF Board and MOM; MPFA; SSS 2018 OFW data; Philippine Statistics Authority 2024; PwC, EY and Lockton on UAE Cabinet Resolution 96 of 2023; pinBox Solutions / Universal Pensions.

---

## Not filled here

- **Video:** none recorded. The form does not require one for the Idea Track.
- **Contact info:** your own details. Only organizers see them.
