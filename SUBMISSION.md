# Dala: the pension that travels with the worker

**Track:** Idea Track (working prototype on Solana devnet attached)

**One line:** Dala is a retirement account for migrant workers that the worker owns, that employers and funders can top up in public, and that keeps paying her when she goes home, whatever country she works in next.

*Dala* means "to carry" in Tagalog. A Dala balance goes wherever the worker goes.

---

## 1. The social challenge

About **169 million people** work outside their country of birth (ILO estimate). They pay into host economies for decades and usually retire with nothing.

- **They are shut out of pensions where they work.** Singapore's CPF has been closed to foreign workers since 2003. Hong Kong's MPF exempts domestic employees by law. Most countries exclude migrant workers from national pension schemes, and defined-contribution schemes are not internationally portable (UN/ILO social protection briefs).
- **Home-country schemes are weak.** The Philippines made overseas workers' SSS coverage compulsory, but the rules are still unsettled. In 2018 only about 550,000 of 1.14 million registered overseas Filipino workers were actually paying in.
- **The lump sum disappears.** Gulf states pay a one-time end-of-service gratuity instead of a pension. A Philippine policy review finds that a returning worker's savings are usually spent on one-time purchases and gone within a short period.
- **The patch stops at the border.** The UAE's 2023 voluntary end-of-service savings scheme moves contributions into funds. Analysts still flag cross-border portability as unsolved, so a worker who moves from Dubai to Riyadh starts again at zero.

The result is a woman who spends 20 years caring for other people's parents in Singapore, Hong Kong and Dubai, then goes home to the Philippines or Indonesia with no income in old age.

## 2. Who benefits

- **First cohort:** an estimated 300,000+ migrant domestic workers in Singapore, mostly women from the Philippines, Indonesia and Myanmar. They live in the hosts' own city and have no access to CPF.
- **Next:** domestic and construction workers in Hong Kong and the Gulf, and the 2.19 million overseas Filipino workers (2024, 57% women).
- **Their families:** parents and children at home, who receive the monthly payout instead of a lump sum that runs out.
- **Employers and funders:** employers who want to do right by a helper, and foundations and NGOs that want every matching dollar to be provable.

## 3. The solution

Dala gives each worker a personal retirement vault on a public blockchain, controlled by a passkey on her phone. No seed phrase is needed.

1. **She saves a little each month.** She uses a payday deposit in a dollar stablecoin, starting from S$20.
2. **Others can top up, and it's public.** An employer, a family member or an NGO scans a QR code to contribute. Every contribution is recorded with who sent it, so a promised match can be checked by anyone, including the worker and her NGO.
3. **Funders match her savings automatically.** A foundation or employer funds a matching pool, for example 1:1 up to S$100 per worker. The pool pays out only when the worker herself deposits, and the program enforces this. Nobody can claim matches that didn't happen.
4. **The lock is real.** The worker picks her retirement date and the length of the payout, for example 10 years of monthly payments. Before that date, no employer, recruiter, family member or Dala itself can take the money out.
5. **She gets paid monthly, from anywhere.** After the start date she claims each month's share to her own wallet or to a family member's, and cashes it out through a local licensed partner such as Coins.ph or GCash.
6. **It moves with her.** Changing employer or country changes nothing. The vault belongs to her key, not to a job, a fund house or a government.

In later versions the balance earns yield from tokenised short-term US Treasury bills through a licensed partner. Ondo USDY is live on Solana, and OpenEden TBILL is managed by a MAS-regulated firm in Singapore. Recovery uses guardians, such as her NGO plus one family member, so a lost or confiscated phone does not mean lost savings.

## 4. Why Web3, and why it fails without it

Take the blockchain away and Dala becomes a custodial savings app in one country. That is what exists today, and it does not solve the problem.

| Need | Bank or pension-app version | Dala on-chain |
|---|---|---|
| Survives a move to another country | Closed or frozen when she leaves | The vault is hers, unchanged across borders |
| Employer match can be checked | A promise inside a closed app | Every contribution is public, with who sent it |
| Funder knows the match was earned | Trust the operator's report | Pool releases only against the worker's own deposit |
| No one can force an early lump sum | A custodian can be pressured | The lock is enforced by code, with no override |
| No bank account needed in any country | Requires local KYC and an account per country | A phone and a passkey |

The closest existing product, pinBox's "gift a pension", proves the demand: employers and families paying into a worker's retirement. It is still custodial and tied to India's national pension system. Dala takes the same behaviour across borders.

## 5. Impact and sustainability

**Impact we will measure:**

- Workers enrolled, and the share still saving after 6 and 12 months.
- Median balance per worker, and how much of it came from her versus from employer or funder matches.
- Monthly payouts received by retirees and their families.
- Matching dollars disbursed, each provable on-chain against a worker deposit.

**Illustrative model, not traction:** if 10,000 workers save S$50 a month and an employer or funder matches S$50, that is S$12 million a year into workers' own retirement balances.

**How Dala sustains itself:**

- **Assets-under-management fee:** about 0.5% a year, capped, shown to the worker in plain numbers.
- **Yield share:** a small spread on the Treasury-bill yield once the licensed partner is live.
- **Employer plan:** a few dollars a month for payroll auto-deduction and matching, sold through employment agencies that already onboard every worker and employer.
- **Funded matching pools:** foundations and NGOs pay to run measurable matching pilots, a natural fit for Blockchain for Good grant programmes.

**Regulatory path:** version 1 is non-custodial and non-pooled. Each worker holds her own assets, and Dala only runs the rules for contributions, locking, matching and payouts. Pooled yield products come in version 2 through a MAS-licensed partner.

**Pilot plan (next 8 weeks):**

1. Partner with one Singapore migrant-worker NGO for 50 Filipino and Indonesian domestic workers.
2. Fund a 1:1 match of up to S$100 per worker.
3. Measure who is still saving after 90 days.

---

## Prototype (Solana devnet)

The working on-chain program covers the core rules described above:

- `open_vault`: the worker sets her retirement date and payout schedule.
- `contribute`: anyone tops up, and the contribution is recorded with its sender and type (employer, family or other).
- `create_match_pool` / `fund_pool`: a sponsor sets the match rate and the cap per worker.
- `save`: the worker deposits, and the pool's match is paid into her vault in the same transaction.
- `claim`: after the start date, she claims only the share that has unlocked. Earlier withdrawals are rejected.

The program has 10 passing tests: 5 for the payout and matching maths, and 5 on-chain flow tests that include an employer trying to farm the match and trying to withdraw her balance.

A full worker story ran on devnet: open vault, employer and family top-ups, two matched savings, three refused attacks, and two monthly payouts to her mother's wallet.

- **Demo page with every transaction:** https://claude.ai/artifact/K5MKNQSXZw5z9Qc3AEYaSd (share it from the page's Share menu first)
- **Program:** https://explorer.solana.com/address/J4NigtmbyxjPXkrLz77ZFpkQ3JXfVuBpzEyYWuGykoMY?cluster=devnet
- **Maria's vault:** https://explorer.solana.com/address/ZGsTYQvDKvCJ8dBXcBUKU7PkHmaUmGnHmYBFZFGLwf5?cluster=devnet

## Sources

- ILO, labour migration and social protection for migrant workers (about 169 million migrant workers).
- UN Social Protection briefs: most countries exclude foreign migrant workers from national pensions, and defined-contribution schemes are not internationally portable.
- CPF Board and MOM: CPF coverage is not extended to foreigners.
- MPFA: domestic employees are exempt from MPF.
- SSS 2018 data, via Gulf News and Philippine reporting: 1.14 million registered OFWs, about 550,000 paying.
- Philippine Statistics Authority: 2.19 million OFWs in 2024, 57% women.
- PwC, EY and Lockton on UAE Cabinet Resolution 96 of 2023, the voluntary end-of-service scheme.
- pinBox Solutions / Universal Pensions: "gift a pension" in India; Singapore plans for 300,000 to 400,000 domestic helpers.
