# Vision2036 — Redesign Plan (A → Z)

**Status:** proposal only. No code has been changed.
**Context:** a private savings + investment fund for 11 friends, running to 2036.
**Author's note:** every number below uses your real policy — Tk 3,000/month,
Tk 14,000/year flexible, deadline day 20, 11 members.

---

## 0. How to read this document

| Part | Sections | Read if you want… |
|---|---|---|
| **Why** | 1–2 | The case for changing anything at all |
| **What** | 3–8 | The new domain model, money math, roles, approvals |
| **Look** | 9–12 | Navigation, screen-by-screen design, visual system |
| **Build** | 13–17 | API, security, stack, migration |
| **Decide** | 18–19 | Timeline and the choices only you can make |

If you read only three sections, read **§3 (one ledger)**, **§6 (roles)**, and
**§10 (screens)**.

---

## 1. Executive summary

### The single biggest change

Today the app has **two disconnected money collections** — `Transfer` (money in)
and `Cost` (money out) — and every total is recomputed by hand in three different
places. That is why the audit found totals that cannot reconcile, and it is why
there is nowhere to put **interest**, **investment returns**, or **a correction**.

The redesign replaces both with **one immutable ledger**. Every movement of money
— a contribution, a bank charge, interest earned, capital deployed into an
investment, a correction — is one `LedgerEntry` row with a direction and a type.

Everything else in this document follows from that one decision.

### Proof you already wanted this

`src/lib/summary-engine.ts` currently reads:

```ts
const totalCosts = totalOperationalCosts + totalInvestmentAmount; // kept for reference
// netAmount = collected minus operational costs only; investment is NOT deducted
netAmount: totalCollected - totalOperationalCosts,
```

You correctly refused to treat an investment as an expense — because it isn't
one. Investing Tk 100,000 doesn't make the group Tk 100,000 poorer; it converts
cash into a different asset. But the `Cost` schema has no way to say that, so the
truth lives in a comment and a filter. The new model says it in the type system.

### What you get

1. **One number everyone trusts.** Fund value = cash + invested + returns, derived
   from one table, never recomputed twice.
2. **Room for the money you actually have.** Interest, investment returns,
   maturities, corrections — all first-class, none of them today.
3. **A Co-Admin role** that can approve payments and post charges, interest, and
   investments — with a second pair of eyes on the big ones.
4. **Total transparency.** All 11 members can see every entry, every proof, every
   approval, and the full audit log. Restrict *actions*, never *visibility*.
5. **A design that fits 11 people** — the whole group on one screen, no
   pagination, no search-to-find-your-friend.
6. **Nothing is ever deleted.** Mistakes are reversed with a visible counter-entry.
   Friendships survive audits.

### Scale reality check

| Metric | Value |
|---|---|
| Members | 11 |
| Contributions per year | 11 × 12 = **132 rows** |
| Flex contributions per year | ~11–22 rows |
| Costs / interest / investments per year | ~30–60 rows |
| **Total ledger rows per year** | **~200** |
| **Total rows by 2036** | **~2,000** |

Two thousand rows. Ever. This is the most important design constraint in the
document, and the current app ignores it completely — it has pagination, server-side
search, regex filters, and index tuning for a dataset that fits in a phone's
memory a hundred times over. **Design for 11 people and 2,000 rows**, and most of
the complexity disappears.

---

## 2. What's wrong today

Not a re-run of the security audit (that's in `SECURITY_AUDIT.md`). These are the
*design* problems that survive even after every bug is fixed.

### 2.1 The model can't hold your money

| Real-world event | Where it goes today | Result |
|---|---|---|
| Member pays Tk 3,000 | `Transfer` | ✅ works |
| Bank charges Tk 115 | `Cost{category:'bank_charge'}` | ✅ works |
| Bank pays Tk 400 interest | **nowhere** | ❌ impossible |
| Group invests Tk 200,000 | `Cost{category:'investment'}` | ⚠️ modelled as an expense, then filtered back out |
| Investment returns Tk 240,000 | **nowhere** | ❌ impossible |
| Someone paid twice by mistake | edit or delete the row | ❌ history destroyed |
| Member leaves, takes their share | **nowhere** | ❌ impossible |

Four of seven real events have no home. Interest and returns are *the entire point*
of a savings fund, and the schema can't express either.

### 2.2 Totals are computed in three places

`summary-engine.ts`, `api/dashboard/admin/route.ts`, and several client components
each recompute collected / costs / balance with slightly different filters — some
on `transferDate`, some on `selectMonth`, some including inactive members, some
not. There is no single definition of "the fund is worth X".

### 2.3 Money is stored as floating point

`amount: { type: Number }` everywhere. Tk 0.1 + Tk 0.2 ≠ Tk 0.3 in binary floating
point. Over 2,000 rows and 10 years of interest, the ledger will drift by paisa
and nobody will be able to explain why. **Money must be integers.**

### 2.4 The app is built for a company, not for 11 friends

- Pagination on lists that will never exceed 132 rows/year
- Server-side regex search to find one of 11 people
- A `moderator` role whose powers are an arbitrary subset of `admin`
- Members are *blocked* from the audit log — in a group whose stated purpose is
  transparency between friends
- 13 navigation items
- Dead pages (`/admin/policies`, `/admin/statements`, `/statements`) whose APIs
  were never built

### 2.5 The policy is hardcoded

`DEFAULT_CONTRIBUTION_POLICY` is a frozen constant, `getContributionPolicy(_year)`
ignores its argument, and there is a fully-built `/admin/policies` UI calling an API
that does not exist. If the group ever votes to raise the monthly amount to Tk 4,000
in 2028, that is a code deploy — and it silently rewrites history for 2026–27, because
every past month is recalculated with today's constant.

### 2.6 The spreadsheet is a second source of truth

Google Sheets sync appends rows and never updates them, so edits and retries create
duplicates. You now have two ledgers that disagree, and no rule for which wins.

---

## 3. The core idea: one ledger

### 3.1 The shape

Every movement of money is one row:

```
LedgerEntry
├── direction : CREDIT (money into the fund) | DEBIT (money out)
├── type      : what kind of movement (see table)
├── amount    : integer paisa, always positive
├── member    : who it belongs to (null for fund-level entries)
├── period    : which accounting month it belongs to
├── status    : DRAFT → PENDING → POSTED (→ REVERSED)
└── proof     : screenshots / receipts
```

### 3.2 The types

| Type | Direction | Member? | Affects cash | Affects fund value | Example |
|---|---|---|---|---|---|
| `CONTRIBUTION_MONTHLY` | CREDIT | yes | +| + | Your Tk 3,000 |
| `CONTRIBUTION_FLEX` | CREDIT | yes | + | + | Yearly Tk 14,000 |
| `INTEREST_BANK` | CREDIT | no | + | + | Bank pays Tk 400 |
| `INVESTMENT_RETURN` | CREDIT | no | + | + | Profit on an investment |
| `INVESTMENT_PRINCIPAL_BACK` | CREDIT | no | + | **0** | Capital returns to cash |
| `BANK_CHARGE` | DEBIT | no | − | − | Tk 115 maintenance fee |
| `OPERATIONAL_COST` | DEBIT | no | − | − | Stamp paper, notary |
| `INVESTMENT_OUT` | DEBIT | no | − | **0** | Deploy Tk 200,000 |
| `WITHDRAWAL` | DEBIT | yes | − | − | A member exits |
| `ADJUSTMENT` | either | optional | ± | ± | Correction, always paired |

**The "affects fund value = 0" column is the whole insight.** Moving cash into an
investment changes *where* the money is, not *how much* there is. Today's schema
cannot express that, which is exactly why the code has to filter investments back
out of costs by hand.

### 3.3 The three numbers, defined once

```ts
cash          = Σ CREDIT.amount − Σ DEBIT.amount        // over POSTED entries
investedAtCost= Σ INVESTMENT_OUT − Σ INVESTMENT_PRINCIPAL_BACK
fundValue     = cash + investedAtCost + unrealisedGain
```

Computed in **one** function, `getFundPosition()`, used by every screen, every
export, every notification. No other code is allowed to sum money.

### 3.4 Immutability

A `POSTED` entry is never edited and never deleted. To fix a mistake you post a
**reversal**: an equal-and-opposite entry linked by `reversalOf`, with a required
reason. The original stays visible, struck through, with "Reversed by Rahim on
12 Mar — wrong amount" underneath.

This is not bureaucracy. In a group of friends handling each other's money, *"I
can see exactly what happened and who fixed it"* is worth more than a tidy list.
It also kills three findings from the security audit at once (deletable audit logs,
cost edits overwriting the approver, silent proof overwrites).

---

## 4. Domain model

Full schemas. Field names are final suggestions; types are TypeScript/Mongoose.

### 4.1 `LedgerEntry` — the heart

```ts
type Direction = 'CREDIT' | 'DEBIT';

type EntryType =
  | 'CONTRIBUTION_MONTHLY' | 'CONTRIBUTION_FLEX'
  | 'INTEREST_BANK' | 'INVESTMENT_RETURN' | 'INVESTMENT_PRINCIPAL_BACK'
  | 'BANK_CHARGE' | 'OPERATIONAL_COST' | 'INVESTMENT_OUT'
  | 'WITHDRAWAL' | 'ADJUSTMENT';

type EntryStatus = 'DRAFT' | 'PENDING' | 'POSTED' | 'REJECTED' | 'REVERSED';

interface LedgerEntry {
  _id: ObjectId;

  // --- classification ---
  direction: Direction;
  type: EntryType;
  status: EntryStatus;

  // --- money (integer paisa, ALWAYS positive; direction carries the sign) ---
  amount: number;          // 300000 === Tk 3,000.00
  currency: 'BDT';

  // --- attribution ---
  memberId?: ObjectId;     // set for contributions & withdrawals, null for fund-level
  period: string;          // 'YYYY-MM' — the accounting month
  valueDate: Date;         // when the money actually moved

  // --- narrative ---
  title: string;           // "March contribution" / "Account maintenance fee"
  note?: string;
  channel?: 'BANK' | 'BKASH' | 'NAGAD' | 'ROCKET' | 'CASH' | 'INTERNAL';

  // --- evidence ---
  attachments: Array<{
    url: string; publicId: string;
    kind: 'SCREENSHOT' | 'RECEIPT' | 'STATEMENT';
    uploadedAt: Date; uploadedBy: ObjectId;
  }>;

  // --- links ---
  investmentId?: ObjectId;   // for INVESTMENT_* types
  reversalOf?: ObjectId;     // this entry reverses that one
  reversedBy?: ObjectId;     // that entry reverses this one

  // --- workflow ---
  createdBy: ObjectId;
  createdAt: Date;
  approvals: Array<{ by: ObjectId; at: Date; note?: string }>;
  postedAt?: Date;
  rejectedBy?: ObjectId; rejectedAt?: Date; rejectionReason?: string;

  // --- integrity ---
  lockedByPeriodClose: boolean;
}
```

**Indexes** (small data, so few are needed):
```ts
{ period: 1, status: 1 }
{ memberId: 1, period: 1 }
{ status: 1, createdAt: -1 }          // the approvals queue
{ type: 1, valueDate: -1 }
// Prevent the duplicate-contribution race the audit found:
{ memberId: 1, period: 1, type: 1 },
  { unique: true, partialFilterExpression: {
      type: { $in: ['CONTRIBUTION_MONTHLY','CONTRIBUTION_FLEX'] },
      status: { $in: ['PENDING','POSTED'] } } }
```

That partial unique index is the fix for audit finding #9 — the database, not a
`findOne` check, guarantees one monthly + one flex contribution per member per month.

### 4.2 `Member` (replaces `User`)

```ts
interface Member {
  _id: ObjectId;
  name: string;
  email: string;               // unique, lowercase
  password: string;            // bcrypt, select:false
  phone?: string;
  avatar?: string;             // Cloudinary URL
  role: 'MEMBER' | 'CO_ADMIN' | 'ADMIN';
  status: 'ACTIVE' | 'INACTIVE' | 'EXITED';

  joinedAt: Date;
  exitedAt?: Date;

  // --- session security (fixes audit #1, #5, #8) ---
  passwordChangedAt: Date;
  sessionsValidFrom: Date;     // bump to force logout everywhere
  resetTokenHash?: string;     // select:false
  resetTokenExpiry?: Date;

  notificationPrefs: {
    deadlineReminder: boolean;
    approvalResult: boolean;
    monthlyStatement: boolean;
    fundEvents: boolean;       // interest posted, investment made
  };
}
```

`role` is read **from the database on every session refresh**, never from a
client-supplied session update. That single change closes the critical privilege
escalation in the audit.

### 4.3 `Policy` — versioned, not hardcoded

```ts
interface Policy {
  _id: ObjectId;
  effectiveFrom: string;        // 'YYYY-MM' — applies from this month onward
  effectiveTo?: string;         // null = still current

  monthlyAmount: number;        // paisa: 300000
  yearlyFlexAmount: number;     // paisa: 1400000
  flexHalfDeadlineMonth: number;// 6
  flexHalfMinimum: number;      // paisa: 700000
  deadlineDay: number;          // 20
  graceDays: number;            // 3

  // approval thresholds (paisa)
  dualApprovalAbove: number;    // 100000 (Tk 1,000)
  investmentRequiresAdmin: boolean;

  createdBy: ObjectId;
  approvedBy: ObjectId;         // policy changes need two people
  createdAt: Date;
}
```

**Time-ranged, not global.** `getPolicyFor('2027-03')` returns the policy that was
in force in March 2027. Raising the monthly amount in 2028 no longer rewrites 2026.
This is what the existing dead `/admin/policies` UI was always trying to be.

### 4.4 `Investment`

```ts
interface Investment {
  _id: ObjectId;
  name: string;                 // "DPS — City Bank" / "Land, Savar"
  kind: 'FDR' | 'DPS' | 'SHARE' | 'BOND' | 'PROPERTY' | 'BUSINESS' | 'OTHER';
  status: 'PROPOSED' | 'ACTIVE' | 'MATURED' | 'EXITED' | 'WRITTEN_OFF';

  principal: number;            // paisa, = Σ INVESTMENT_OUT entries
  expectedRatePct?: number;
  startDate: Date;
  maturityDate?: Date;

  currentValue?: number;        // paisa — manual mark, with asOf date
  valuedAt?: Date;
  valuedBy?: ObjectId;

  realisedReturn: number;       // Σ INVESTMENT_RETURN entries
  documents: Array<{ url: string; publicId: string; label: string }>;

  proposedBy: ObjectId;
  approvals: Array<{ by: ObjectId; at: Date }>;
  notes?: string;
}
```

`unrealisedGain` in the fund position = `Σ(currentValue − principal)` over ACTIVE
investments that have a manual valuation. If nobody has valued it, it counts at
cost — conservative and honest.

### 4.5 `Period` — the month close

```ts
interface Period {
  _id: ObjectId;
  month: string;                // 'YYYY-MM', unique
  status: 'OPEN' | 'CLOSED' | 'REOPENED';

  closedBy?: ObjectId; closedAt?: Date;
  reopenedBy?: ObjectId; reopenedAt?: Date; reopenReason?: string;

  // frozen snapshot at close — never recomputed
  snapshot?: {
    openingCash: number; closingCash: number;
    contributionsMonthly: number; contributionsFlex: number;
    interest: number; charges: number; operational: number;
    investedOut: number; investmentReturns: number;
    fundValue: number; investedAtCost: number;
    membersPaid: number; membersPartial: number; membersUnpaid: number;
    unitPrice: number; totalUnits: number;
  };
  statementPdfUrl?: string;
}
```

This is the fix for the "totals drift" problem. A closed month's numbers are
**frozen facts**, not a query re-run against today's data. Today's
`rebuildMonthlySummaryForMonth` recomputes every month on every page load — so
last January's reported total can silently change in 2029.

### 4.6 `MemberLedger` (derived, cached)

Per member per period: contributed, units held, ownership %, on-time flag, running
balance. Rebuilt on post/reverse/close only — never on read.

### 4.7 `AuditLog` — append-only

Same shape as today, plus: **no DELETE endpoint exists**, and it is
**readable by every member**. Actions logged: entry created/approved/rejected/
reversed, period closed/reopened, role changed, policy changed, member
activated/deactivated, password reset by admin, login, failed login.

### 4.8 What gets retired

| Today | Becomes |
|---|---|
| `Transfer` | `LedgerEntry` type `CONTRIBUTION_*` |
| `Cost` | `LedgerEntry` types `BANK_CHARGE` / `OPERATIONAL_COST` / `INVESTMENT_OUT` |
| `MonthlySummary` | `Period.snapshot` |
| `BankAccount` | kept, but **only** for the fund's own receiving accounts (see §19 Q4) |
| `policies.ts` constants | `Policy` collection |
| Google Sheets as truth | export-only mirror (§16.5) |

---

## 5. Money rules and the ownership math

### 5.1 Integers only

Store **paisa** as integers. Tk 3,000.00 → `300000`. Never `Number` with decimals,
never `parseFloat`. One formatter at the edge:

```ts
export const toPaisa = (taka: number) => Math.round(taka * 100);
export const fromPaisa = (paisa: number) => paisa / 100;

// Bangladeshi lakh/crore grouping — 5,50,000 not 550,000
export const formatTk = (paisa: number) =>
  '৳ ' + new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(paisa / 100);
```

`formatTk(55000000)` → `৳ 5,50,000`. Verify the grouping renders as you expect on
your devices before committing to `en-IN`; a hand-rolled grouper is the fallback.

**Every money value on every screen goes through `formatTk`.** No exceptions, no
inline `.toLocaleString()` — the current code has 40+ of those and they disagree.

### 5.2 The ownership question

By 2036 the fund holds contributions *and* earnings. **Who owns what?** You must
answer this before you earn your first taka of interest, not after.

Three options:

#### Option A — Equal shares
Everyone owns 1/11. Dead simple. **Breaks** the moment someone misses a month, pays
flex differently, or joins late. Not recommended, but honest if the group genuinely
wants "we're equal partners regardless".

#### Option B — Proportional to contributions
`ownership_i = contributed_i / Σ contributed`. Simple and fair-ish. **Ignores
timing** — Tk 50,000 contributed in 2026 earned ten years of returns; Tk 50,000
contributed in 2035 earned none. Option B treats them identically.

#### Option C — Unitisation (recommended)
Exactly how a mutual fund works, and it settles every argument automatically.

```
Start:          unitPrice = ৳1.00
Contribute A:   unitsIssued = A / currentUnitPrice
Earnings:       fundValue rises → unitPrice rises → everyone's units gain
Withdraw:       units redeemed at current unitPrice
unitPrice     = fundValue / totalUnits
ownership_i   = units_i / totalUnits
```

**Worked example with your numbers:**

| Event | Fund value | Total units | Unit price | Note |
|---|---|---|---|---|
| Month 1: 11 × ৳3,000 | ৳33,000 | 33,000 | ৳1.0000 | each member holds 3,000 units |
| Months 2–6 contributions | ৳198,000 | 198,000 | ৳1.0000 | no earnings yet |
| Bank posts ৳500 interest | ৳198,500 | 198,000 | ৳1.00253 | **price rises, units don't** |
| Month 7: Karim pays ৳3,000 | ৳201,500 | 200,992.4 | ৳1.00253 | he gets 2,992.4 units, not 3,000 |

Karim's Tk 3,000 buys *fewer* units because it arrives after the interest was
earned — which is precisely correct, and nobody has to argue about it. The rule is
mechanical, visible, and identical for all 11 people.

**Recommendation:** implement C. It is ~60 lines of code, it is the only option
that stays fair for ten years, and its fairness is *self-evident* — which matters
more in a friend group than in a company.

Store `unitsIssued` on each contribution entry, and `unitPrice` on each
`Period.snapshot`. Recompute nothing; append only.

### 5.3 Rounding rule

Units to **4 decimal places**, held as integers ×10,000. When a rounding remainder
appears, it goes to the fund (never to a member), and the difference is visible in
the period snapshot. Document the rule once and never revisit it.

### 5.4 What "on time" means

A contribution is **on time** if `valueDate` ≤ `deadlineDay` of its period, using
**Asia/Dhaka**, not server time. The current code computes the "current month" in
server-local time (UTC on Vercel) while all its ranges are UTC — so for the first
6 hours of every month, Bangladeshi members see the wrong month. Fix once, in one
helper, and use it everywhere.

---

## 6. Roles, capabilities, and the new Co-Admin

### 6.1 The governing principle

> **Everyone can see everything. Only actions are restricted.**

This is the single most important role decision for an 11-person friend group, and
it inverts today's model (which hides the audit log and the member list from
members). The purpose of the fund is transparency between friends. Read access is
therefore **universal** — every member sees every entry, every proof, every
approval, every audit line, and every other member's contribution history.

What varies is only who may **write**.

### 6.2 The three roles

| Role | Count | Who |
|---|---|---|
| `MEMBER` | 8 | Everyone |
| `CO_ADMIN` | 2 | The treasurers — approve payments, post fund entries |
| `ADMIN` | 1 | The owner — everything, plus people and policy |

`MODERATOR` is retired; existing moderators migrate to `CO_ADMIN`.

### 6.3 Capability matrix

| Capability | MEMBER | CO_ADMIN | ADMIN |
|---|:---:|:---:|:---:|
| **See** everything (ledger, proofs, members, audit, fund) | ✅ | ✅ | ✅ |
| Submit own contribution | ✅ | ✅ | ✅ |
| Edit own profile / bank details | ✅ | ✅ | ✅ |
| Export statements | ✅ | ✅ | ✅ |
| — | | | |
| **Approve/reject a contribution** | ❌ | ✅ | ✅ |
| **Post `BANK_CHARGE`** (debit) | ❌ | ✅ | ✅ |
| **Post `OPERATIONAL_COST`** (debit) | ❌ | ✅ | ✅ |
| **Post `INTEREST_BANK`** (credit) | ❌ | ✅ | ✅ |
| **Post `INVESTMENT_RETURN`** (credit) | ❌ | ✅ | ✅ |
| **Post `INVESTMENT_OUT`** (debit-invest) | ❌ | ✅¹ | ✅ |
| Propose an investment | ✅² | ✅ | ✅ |
| Value an investment (mark to market) | ❌ | ✅ | ✅ |
| Close a month | ❌ | ✅ | ✅ |
| Reverse a posted entry | ❌ | ✅¹ | ✅ |
| — | | | |
| Reopen a closed month | ❌ | ❌ | ✅¹ |
| Add / deactivate a member | ❌ | ❌ | ✅ |
| Change a role | ❌ | ❌ | ✅¹ |
| Change policy | ❌ | ❌ | ✅¹ |
| Reset another member's password | ❌ | ❌ | ✅ |
| Delete anything | ❌ | ❌ | ❌ |

¹ requires a second approver (see §7)
² a member may *propose*; only CO_ADMIN/ADMIN may fund it

**Your Co-Admin ask, mapped:** approve payment submissions ✅, post debit like bank
charge ✅, post credit like interest ✅, post debit-invest ✅ — the last one gated by
a second approver because it is the largest movement the fund ever makes.

### 6.4 The two rules that protect friendships

1. **No self-approval.** You can never approve your own contribution, your own
   expense, or your own investment — regardless of role. Today an admin can verify
   their own transfer, and this is the one power that, if ever questioned, is
   impossible to defend socially. Enforce it in code, not in etiquette.

2. **Two eyes on big money.** Above the configured threshold, a second person must
   confirm. This is not distrust; it is what lets a treasurer say *"the system
   required it"* instead of *"I didn't trust you"*.

### 6.5 Implementation

```ts
// src/lib/permissions.ts — one file, the only place roles are interpreted
export const CAPABILITIES = {
  'entry.submit.own':      ['MEMBER','CO_ADMIN','ADMIN'],
  'entry.approve':         ['CO_ADMIN','ADMIN'],
  'entry.post.expense':    ['CO_ADMIN','ADMIN'],
  'entry.post.income':     ['CO_ADMIN','ADMIN'],
  'entry.post.investment': ['CO_ADMIN','ADMIN'],
  'entry.reverse':         ['CO_ADMIN','ADMIN'],
  'period.close':          ['CO_ADMIN','ADMIN'],
  'period.reopen':         ['ADMIN'],
  'member.manage':         ['ADMIN'],
  'role.assign':           ['ADMIN'],
  'policy.edit':           ['ADMIN'],
} as const;

export function can(role: Role, cap: keyof typeof CAPABILITIES) {
  return CAPABILITIES[cap].includes(role);
}
```

Every API route becomes:

```ts
export const POST = withAuth(
  { capability: 'entry.post.income' },
  async ({ member, body }) => { /* … */ }
);
```

One wrapper replaces the ~25 hand-copied `if (!session?.user?.id || !['admin',
'moderator'].includes(...))` blocks — which today are inconsistent (some return
401 where they mean 403, some check `role !== 'admin'`, some check the array).

---

## 7. Approval flows (maker–checker)

### 7.1 The rules

| Action | Approvers needed | Constraint |
|---|---|---|
| Contribution (any amount) | 1 | not the submitter |
| Expense < Tk 1,000 | 1 | not the creator |
| Expense ≥ Tk 1,000 | 2 | neither is the creator |
| Interest / investment return | 1 | + statement screenshot required |
| **Investment out (any amount)** | 2 | one **must** be ADMIN |
| Reversal of a posted entry | 2 | reason required, min 10 chars |
| Reopen a closed month | 1 ADMIN + 1 other | reason required |
| Role change | 2 | target cannot approve |
| Policy change | 2 | takes effect next period only |

Thresholds live in `Policy`, so the group can vote to change them.

### 7.2 Entry lifecycle

```
                  ┌──────────┐
                  │  DRAFT   │  creator is still editing
                  └────┬─────┘
                       │ submit
                  ┌────▼─────┐
        reject ◄──┤ PENDING  ├──► needs N approvals
                  └────┬─────┘
                       │ Nth approval
                  ┌────▼─────┐
                  │  POSTED  │  immutable; counts toward fund
                  └────┬─────┘
                       │ reverse (2 approvals + reason)
                  ┌────▼─────┐
                  │ REVERSED │  visible, struck through, linked
                  └──────────┘
```

Only `POSTED` entries affect any number anywhere.

### 7.3 What a member sees while waiting

Today a submitted payment shows a bare "Pending" chip. Replace with a live status
strip that names the humans:

```
  ⏳ Waiting for approval
     Submitted 12 Mar, 9:41 PM · needs 1 of 2 treasurers
     Rahim and Karim were notified
     [ View my screenshot ]  [ Withdraw submission ]
```

"Withdraw submission" (allowed only while PENDING) lets someone fix their own
mistake without asking a treasurer to reject them — a small thing that removes a
surprising amount of social friction.

---

## 8. The month cycle

The app should have a **rhythm** that matches how the group actually behaves. One
month is one loop:

```
 Day 1     Period opens. Everyone's card resets to "unpaid".
 Day 1-20  Members transfer money, submit form + screenshot.
 Day 15    Reminder #1 to anyone unpaid.  (push + email)
 Day 18    Reminder #2 — "2 days left".
 Day 20    Deadline. Anything later is flagged "late" (not blocked).
 Day 21-25 Treasurers approve. Bank charges & interest posted from
           the month's bank statement.
 Day 25    Treasurer runs MONTH CLOSE:
             ├── all contributions approved or rejected?
             ├── bank statement uploaded & reconciled?
             ├── charges + interest posted?
             ├── snapshot frozen (unit price computed)
             └── PDF statement generated → sent to all 11
 Day 26+   Period is CLOSED. Immutable unless an ADMIN reopens with a reason.
```

**Month close is the single most valuable new feature in this document.** It turns
a continuously-mutating pile of rows into a series of signed-off, permanent facts —
and it gives the group a monthly ritual that makes the fund feel real.

### 8.1 The close screen

```
 ┌──────────────────────────────────────────────────────────┐
 │  Close March 2026                                        │
 ├──────────────────────────────────────────────────────────┤
 │  ✅  Contributions      11 of 11 settled                  │
 │      9 approved · 1 late-approved · 1 rejected           │
 │                                                          │
 │  ✅  Bank statement     uploaded 24 Mar by Rahim          │
 │                                                          │
 │  ⚠️   Reconciliation     ৳ 115 unexplained                │
 │      Statement closing ৳ 2,48,885                        │
 │      Ledger closing    ৳ 2,49,000                        │
 │      → likely an unposted bank charge                    │
 │      [ Post a bank charge ]  [ Explain & continue ]      │
 │                                                          │
 │  ✅  Interest           ৳ 412 posted 24 Mar               │
 │                                                          │
 │  ──────────────────────────────────────────────────────  │
 │  After close:   Fund ৳ 2,49,297   Unit ৳ 1.0043          │
 │                                                          │
 │              [ Cancel ]     [ Close March ]              │
 └──────────────────────────────────────────────────────────┘
```

The **reconciliation check** — ledger closing balance vs the bank statement's
closing balance — is what makes the whole system trustworthy. If they match, the
ledger is provably complete. If they don't, the app tells you the gap before you
sign off. Nothing in the current design does this.

---

## 9. Information architecture

### 9.1 From 13 destinations to 5

| Today (13) | Tomorrow (5) |
|---|---|
| Dashboard, My Payments, Bank Accounts, My Summary, Global Summary, Admin Dashboard, Pending Payments, All Payments, Costs, Monthly Summaries, Admin Tools, Members, Audit Logs | **Home**, **Ledger**, **Members**, **Fund**, **More** |

Nothing is lost — the admin screens become *filters and actions inside* the same
five surfaces, gated by capability rather than living on separate pages.

```
 Home      Your status + group board + what needs you
 Ledger    Every movement of money, ever. Filter, drill, prove.
 Members   The 11. Progress, history, share of the fund.
 Fund      Cash vs invested, investments, interest, 2036 projection.
 More      Profile, bank accounts, statements, audit log, admin, settings.
```

### 9.2 Navigation

- **Mobile (primary):** bottom tab bar, 5 items, thumb-reachable.
  A badge on Home when something needs your approval.
- **Desktop:** left rail, same 5 items, plus a persistent fund-value header.
- **The approvals queue is not a nav item.** It surfaces as a banner on Home for
  the 3 people who can act on it. Menu items that are empty for 8 of 11 people are
  clutter.

### 9.3 The drill-down promise

Every money number anywhere in the app is tappable and leads, in at most three
taps, to the screenshot that proves it.

```
  ৳ 2,49,297 fund value
     └─ ৳ 2,05,000 contributions
          └─ March: ৳ 33,000
               └─ Karim ৳ 3,000  ✅ approved by Rahim, 22 Mar
                    └─ [ the bKash screenshot ]
```

This is the product. Everything else is packaging.

---

## 10. Screen-by-screen design

Wireframes are mobile-width (the primary device — people submit right after making
the transfer on their phone).

### 10.1 Home

```
 ┌────────────────────────────────────────────┐
 │  Vision 2036              🔔        ⚙️      │
 ├────────────────────────────────────────────┤
 │                                            │
 │   FUND VALUE                               │
 │   ৳ 2,49,297                               │
 │   ▲ ৳ 33,412 this month                    │
 │                                            │
 │   ┌──────────────────────────────────────┐ │
 │   │ ▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░  4%  │ │
 │   └──────────────────────────────────────┘ │
 │   Year 1 of 10  ·  ৳ 55,00,000 by 2036     │
 │                                            │
 ├────────────────────────────────────────────┤
 │  MARCH 2026                     8 days left│
 │                                            │
 │   ┌──────────────────────────────────────┐ │
 │   │  You haven't paid this month         │ │
 │   │  ৳ 3,000 due by 20 March             │ │
 │   │                                      │ │
 │   │         [  Pay now  →  ]             │ │
 │   └──────────────────────────────────────┘ │
 │                                            │
 ├────────────────────────────────────────────┤
 │  THE GROUP                        7 of 11  │
 │                                            │
 │   🟢  🟢  🟢  🟢  🟢  🟢                     │
 │   Ra  Ka  Su  Mi  Ta  Na                   │
 │                                            │
 │   🟡  🟡  ⚪  ⚪  ⚪                          │
 │   Ji  Ru  Sa  Fa  YOU                      │
 │                                            │
 │   🟢 paid   🟡 pending   ⚪ not yet          │
 │                                            │
 ├────────────────────────────────────────────┤
 │  ACTIVITY                                  │
 │   ✅  Rahim approved Karim's ৳3,000   2h   │
 │   💰  Interest ৳412 posted            1d   │
 │   📤  Sadia submitted ৳3,000          1d   │
 │   🏦  Bank charge ৳115                3d   │
 │                          [ See all → ]     │
 └────────────────────────────────────────────┘
```

**For a Co-Admin / Admin, one extra card sits directly under the fund value:**

```
 │   ┌──────────────────────────────────────┐ │
 │   │  ⏳  3 things need you               │ │
 │   │      2 contributions · 1 expense     │ │
 │   │                     [ Review → ]     │ │
 │   └──────────────────────────────────────┘ │
```

**Design notes**
- The 11 avatars (using the profile images now wired up) are the emotional core.
  You see your whole group's status in one glance — this is only possible *because*
  there are 11 of you, and it is the biggest UX advantage a small group has.
- Status uses **shape + colour + position**, never colour alone (colourblind-safe):
  paid = filled ring, pending = dashed ring, unpaid = hollow.
- The 2036 bar is always visible. Ten years is a long time; the app's job is to
  make month 7 of 120 feel like progress.

### 10.2 Pay — three steps, ~20 seconds

**Step 1 — what**
```
 ┌────────────────────────────────────────────┐
 │  ←   Pay for March 2026                    │
 ├────────────────────────────────────────────┤
 │                                            │
 │   ┌──────────────────────────────────────┐ │
 │   │  ●  Monthly                          │ │
 │   │     ৳ 3,000                    ✓     │ │
 │   └──────────────────────────────────────┘ │
 │   ┌──────────────────────────────────────┐ │
 │   │  ○  Yearly flex                      │ │
 │   │     ৳ 7,000 of ৳14,000 still due     │ │
 │   └──────────────────────────────────────┘ │
 │   ┌──────────────────────────────────────┐ │
 │   │  ○  Both together                    │ │
 │   └──────────────────────────────────────┘ │
 │                                            │
 │   Total                        ৳ 3,000     │
 │                     [ Continue → ]         │
 └────────────────────────────────────────────┘
```

**Step 2 — how + proof**
```
 ┌────────────────────────────────────────────┐
 │  ←   How did you send it?                  │
 ├────────────────────────────────────────────┤
 │   [ 🏦 Bank ] [ 📱 bKash ] [ Nagad ] [ … ] │
 │                                            │
 │   Sent on                                  │
 │   ┌──────────────────────────────────────┐ │
 │   │  12 March 2026              📅       │ │
 │   └──────────────────────────────────────┘ │
 │                                            │
 │   Screenshot                    required   │
 │   ┌──────────────────────────────────────┐ │
 │   │                                      │ │
 │   │        📷  Tap to add                │ │
 │   │     camera · gallery · paste         │ │
 │   │                                      │ │
 │   └──────────────────────────────────────┘ │
 │                                            │
 │   Note (optional)                          │
 │   ┌──────────────────────────────────────┐ │
 │   │                                      │ │
 │   └──────────────────────────────────────┘ │
 │                     [ Review → ]           │
 └────────────────────────────────────────────┘
```

**Step 3 — confirm**, then a success state that shows exactly who was notified and
lets them withdraw the submission if they got something wrong.

**What changes vs today**
- The fund's receiving account details are shown **on this screen, copyable**, so
  the member doesn't leave the app to find where to send money. Today
  `/api/bank-accounts/admin` exists to do this but no screen ever calls it.
- Amounts are **prefilled from policy** and from what's already paid — you should
  almost never type a number.
- Paste-from-clipboard for the screenshot (people screenshot then copy).
- Client-side image compression before upload (bank screenshots are 3–8 MB;
  compress to ~300 KB). Faster on Bangladeshi mobile data, and cheaper storage.

### 10.3 Ledger

```
 ┌────────────────────────────────────────────┐
 │  Ledger                          🔍  ⇅     │
 ├────────────────────────────────────────────┤
 │  [ All ] [ In ] [ Out ] [ Invest ] [ Mine ]│
 │  ── March 2026 ──────────────── ৳ +33,297 ─│
 ├────────────────────────────────────────────┤
 │  💰  Bank interest              +৳ 412     │
 │      24 Mar · posted by Rahim              │
 ├────────────────────────────────────────────┤
 │  🏦  Account maintenance         −৳ 115    │
 │      22 Mar · posted by Rahim   📎         │
 ├────────────────────────────────────────────┤
 │  (KA) Karim — monthly           +৳ 3,000   │
 │      12 Mar · ✅ approved · bKash  📎      │
 ├────────────────────────────────────────────┤
 │  (SA) Sadia — monthly           +৳ 3,000   │
 │      12 Mar · ⏳ pending · bank    📎      │
 ├────────────────────────────────────────────┤
 │  (MI) Mizan — monthly       ~~+৳ 3,000~~   │
 │      10 Mar · ↩️ reversed — duplicate       │
 ├────────────────────────────────────────────┤
 │  ── February 2026 ──── 🔒 closed ─ ৳+33,115│
 │  …                                         │
 └────────────────────────────────────────────┘
```

- One timeline for **everything** — replaces My Payments, All Payments, Costs, and
  Monthly Summaries.
- Grouped by month with a running total; closed months show a lock.
- Reversed entries stay visible, struck through, with the reason inline.
- 📎 means proof attached — tap the row for the full sheet with the image,
  the approval trail, and the audit history.
- No pagination. 200 rows/year loads instantly; infinite scroll by month.

### 10.4 Members

```
 ┌────────────────────────────────────────────┐
 │  Members                        11 active  │
 │  [ This year ▾ ]                           │
 ├────────────────────────────────────────────┤
 │  (RA) Rahim Uddin              CO-ADMIN    │
 │       ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░  62%            │
 │       ৳31,000 of ৳50,000 · 9/9 on time     │
 │       🔥 9-month streak                     │
 ├────────────────────────────────────────────┤
 │  (KA) Karim Hossain                        │
 │       ▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░  54%            │
 │       ৳27,000 of ৳50,000 · 8/9 on time     │
 ├────────────────────────────────────────────┤
 │  (SA) Sadia Rahman                         │
 │       ▓▓▓▓▓▓▓▓░░░░░░░░░░░░  40%   ⚠️        │
 │       ৳20,000 of ৳50,000 · flex behind     │
 └────────────────────────────────────────────┘
```

Tap a member → their full history, their units, their share of the fund, and their
proof screenshots. Visible to **all 11** — that is the point of the fund.

⚠️ appears when someone is behind on the half-year flex minimum (Tk 7,000 by
month 6) — the rule that already exists in your policy but is barely surfaced today.

### 10.5 Fund (new)

```
 ┌────────────────────────────────────────────┐
 │  Fund                                      │
 ├────────────────────────────────────────────┤
 │   ৳ 2,49,297         Unit ৳ 1.0043         │
 │                                            │
 │   ┌──────────────────────────────────────┐ │
 │   │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░  │ │
 │   └──────────────────────────────────────┘ │
 │    Cash ৳49,297 (20%)  Invested ৳2,00,000  │
 │                                            │
 ├────────────────────────────────────────────┤
 │  INVESTMENTS                               │
 │   📈  DPS — City Bank            ACTIVE    │
 │       ৳2,00,000 · 8.5% · matures Mar 2031  │
 │       Earned so far ৳ 4,250                │
 │                                            │
 │   [ + Propose an investment ]              │
 ├────────────────────────────────────────────┤
 │  EARNINGS THIS YEAR                        │
 │   Bank interest              ৳ 1,842       │
 │   Investment returns         ৳ 4,250       │
 │   Charges                    −৳ 460        │
 │   ────────────────────────────────────     │
 │   Net earned                 ৳ 5,632       │
 ├────────────────────────────────────────────┤
 │  PROJECTION TO 2036                        │
 │   At ৳5,50,000/yr + 8%   →  ৳ 86,00,000    │
 │   Contributions only      →  ৳ 55,00,000   │
 │   Earnings do the rest    →  ৳ 31,00,000   │
 └────────────────────────────────────────────┘
```

The projection card is the motivational heart of a ten-year fund: it shows that
**more than a third of the 2036 total comes from returns, not from your pockets**.
Nothing in the app communicates this today.

### 10.6 Approvals (Co-Admin / Admin)

```
 ┌────────────────────────────────────────────┐
 │  ←  Needs review                    3      │
 ├────────────────────────────────────────────┤
 │  (SA) Sadia Rahman                         │
 │       Monthly · March · ৳ 3,000            │
 │       Bank · sent 12 Mar                   │
 │  ┌──────────────────────────────────────┐  │
 │  │                                      │  │
 │  │        [ the screenshot ]            │  │
 │  │                                      │  │
 │  └──────────────────────────────────────┘  │
 │       ✓ amount matches policy              │
 │       ✓ no duplicate this month            │
 │       ⚠ 2 days before your bank statement  │
 │                                            │
 │   [  ✗ Reject  ]      [  ✓ Approve  ]      │
 └────────────────────────────────────────────┘
```

The **screenshot is the screen**, not a thumbnail behind a modal — reviewing is the
one job here. The automated checks above the buttons ("amount matches policy", "no
duplicate") do the tedious verification so the human only judges the image.

Reject requires a reason, which is sent to the member with a one-tap resubmit.

### 10.7 Post an entry (Co-Admin / Admin)

One form, type-first — this is the screen that delivers your Co-Admin request:

```
 ┌────────────────────────────────────────────┐
 │  ←  New entry                              │
 ├────────────────────────────────────────────┤
 │  MONEY IN                                  │
 │   [ 💰 Bank interest    ]                  │
 │   [ 📈 Investment return]                  │
 │                                            │
 │  MONEY OUT                                 │
 │   [ 🏦 Bank charge      ]                  │
 │   [ 🧾 Operational cost ]                  │
 │   [ 📊 Invest capital   ]  needs 2 approvals│
 │                                            │
 │  FIX                                       │
 │   [ ↩️ Reverse an entry  ]  needs 2 approvals│
 └────────────────────────────────────────────┘
```

Choosing one opens a short form: amount, date, note, proof, and — for
`INVESTMENT_OUT` — which investment it funds. The approval requirement is shown
*before* the treasurer starts typing, never as a surprise at submit.

---

## 11. Visual design system

### 11.1 Identity

The current UI is stock shadcn zinc — competent, anonymous, and it looks like a
SaaS admin panel. This is 11 friends building something over ten years. It should
feel **calm, warm, and durable**, not like a CRM.

**Direction:** deep green as the primary (growth, money, and culturally positive in
Bangladesh), warm sand as the surface, amber for attention. Serious about money,
not cold about it.

### 11.2 Tokens

```css
:root {
  /* surfaces — warm, not blue-grey */
  --bg:            #FBFAF7;
  --surface:       #FFFFFF;
  --surface-sunk:  #F4F2ED;
  --border:        #E6E2D9;

  /* text */
  --text:          #1C1B18;
  --text-muted:    #6B6862;

  /* brand */
  --primary:       #0F5F4C;   /* deep green */
  --primary-hover: #0C4C3D;
  --primary-soft:  #E6F2EE;

  /* money semantics — never colour alone, always paired with sign + icon */
  --credit:        #157F52;   /* money in     ▲ + */
  --debit:         #B3261E;   /* money out    ▼ − */
  --invest:        #6B4FBB;   /* capital moved  → */
  --interest:      #B8860B;   /* earnings     ✦   */
  --pending:       #B26B00;   /* awaiting     ⏳  */
  --reversed:      #8A8780;   /* struck through   */
}

:root[data-theme="dark"], :root:not([data-theme="light"]) {
  @media (prefers-color-scheme: dark) {
    --bg:           #14161A;
    --surface:      #1B1E23;
    --surface-sunk: #101216;
    --border:       #2C3037;
    --text:         #F2F1ED;
    --text-muted:   #9B9A94;
    --primary:      #35C494;
    --primary-soft: #12312A;
    --credit:       #3DBE84;
    --debit:        #F2705F;
    --invest:       #A78BFA;
    --interest:     #E3B341;
  }
}
```

### 11.3 Typography

| Use | Font | Notes |
|---|---|---|
| UI | Inter / Geist | already in the stack |
| **Money** | same, `font-variant-numeric: tabular-nums` | **non-negotiable** |
| Numerals | Latin, lakh grouping | ৳ 5,50,000 |

Tabular numerals make columns of taka align vertically. Without it, every list of
money looks subtly broken. One CSS line, enormous effect:

```css
.money { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
```

### 11.4 The money component

Every amount in the app renders through one component, so a credit can never
accidentally look like a debit:

```tsx
<Money value={412_00} direction="CREDIT" />   →   ▲ ৳ 412      (green)
<Money value={115_00} direction="DEBIT"  />   →   ▼ ৳ 115      (red)
<Money value={200000_00} type="INVESTMENT_OUT" /> → → ৳ 2,00,000 (violet)
<Money value={3000_00} reversed />            →   ~~৳ 3,000~~   (grey)
```

### 11.5 Component inventory

**Keep** (already good): shadcn button, card, dialog, sheet, select, input, badge,
avatar, progress, dropdown, tooltip, skeleton.

**Build new:**

| Component | Purpose |
|---|---|
| `<Money>` | the only way money is ever displayed |
| `<MemberChip>` | avatar + name, one size everywhere |
| `<GroupBoard>` | the 11-avatar status grid |
| `<StatusRing>` | paid / pending / unpaid, shape-coded |
| `<EntryRow>` | one ledger line, used in every list |
| `<EntryDetailSheet>` | proof + approvals + audit trail |
| `<ProofViewer>` | pinch-zoom image viewer |
| `<ApprovalCard>` | the review screen |
| `<PeriodHeader>` | month divider with running total + lock |
| `<FundBar>` | cash vs invested split |
| `<ProgressToGoal>` | the 2036 arc |
| `<Timeline>` | activity feed |
| `<EmptyState>` | already exists, keep |

**Delete:** every bespoke inline avatar/initials block (already consolidated),
every one-off `.toLocaleString()` money render, the separate cost/payment/summary
table implementations that will collapse into `<EntryRow>`.

### 11.6 Motion

Restrained. Money apps should feel settled, not springy.
- Approve → the row settles green and slides out of the queue (240 ms)
- Fund value → count-up animation only on first paint of a session
- Month close → a single deliberate 600 ms "seal" animation. This is a ceremony.
- Respect `prefers-reduced-motion` everywhere.

### 11.7 Accessibility

- Contrast ≥ 4.5:1 for all text, ≥ 3:1 for the money colours against their surfaces
- Never colour alone: sign (+/−), icon, and position all carry the same meaning
- Touch targets ≥ 44 px
- Full keyboard path through submit and approve
- The proof viewer needs alt text: "Payment screenshot from Karim, 12 March"

---

## 12. Rituals and notifications

A ten-year project needs rhythm, or it becomes a chore by month 8. Every
notification below is opt-out per member.

| When | Who | Channel | Message |
|---|---|---|---|
| Day 15 | unpaid members | push + email | "৳3,000 due in 5 days" |
| Day 18 | unpaid members | push | "2 days left for March" |
| Day 20, 9pm | unpaid members | push | "Today is the deadline" |
| On submit | treasurers | push | "Sadia submitted ৳3,000" |
| On approve/reject | the member | push + email | "Your March payment was approved ✅" |
| Interest posted | everyone | push | "The fund earned ৳412 this month ✦" |
| Investment made | everyone | push + email | "৳2,00,000 invested in DPS — City Bank" |
| Month closed | everyone | email + PDF | "March statement — fund now ৳2,49,297" |
| Milestone | everyone | push | "🎉 The fund crossed ৳5,00,000" |
| Year close | everyone | email + PDF | annual statement |

**Milestones worth celebrating:** first ৳1,00,000 · every ৳5,00,000 · first ৳10,00,000
· a month where all 11 paid on time · each anniversary · halfway to 2036.

The "all 11 paid on time" celebration is deliberate social engineering, and it
works: it makes on-time payment a *group* achievement rather than an individual
obligation.

You already have the PWA service worker and nodemailer wired — this needs Web Push
subscriptions and a scheduled job (Vercel Cron, one entry per day).

---

## 13. Feature list, prioritised

### Must (the redesign is incomplete without these)
1. Unified immutable ledger
2. Integer money everywhere
3. Co-Admin role + capability system
4. No self-approval, anywhere
5. Interest and investment-return entry types
6. Investment as an asset transfer, not an expense
7. Reversals instead of edit/delete
8. Month close with frozen snapshots
9. Bank statement reconciliation at close
10. Versioned policy (retire the hardcoded constants)
11. Read-everything transparency (audit log open to all 11)
12. The security fixes from `SECURITY_AUDIT.md` §Critical + §High

### Should
13. Unitisation / ownership %
14. Investment register with valuations
15. The Group Board (11 avatars)
16. Three-step submit flow with compression + paste
17. Deadline reminders + approval notifications
18. Monthly PDF statement, emailed to all
19. 2036 projection
20. Withdraw-my-own-submission
21. Dual approval above threshold

### Could
22. Milestones and streaks
23. Annual statement (a keepsake PDF)
24. Member exit / settlement flow
25. In-app comments on an entry ("this was the notary fee")
26. Loan-from-fund tracking, if the group ever allows it
27. Multi-year comparison charts
28. CSV import of a bank statement to speed reconciliation

### Won't (deliberately)
- Public/marketing pages · multi-tenancy · multi-currency
- Automated bank API integration (no realistic BD retail option)
- Real-time collaboration · mobile native apps (PWA is enough)
- Pagination and server-side search — **the dataset is 2,000 rows**

---

## 14. API surface

### 14.1 Principles

- **RSC-first.** For 11 users, most reads should be React Server Components hitting
  Mongo directly. The current `services/*.ts` + axios + react-query stack is three
  layers of indirection for data that could be rendered on the server. Keep
  react-query only for the genuinely interactive lists.
- **Server Actions for mutations** — submit, approve, post, close.
- **One response envelope**, always `{ ok, data, error }`. Today some routes return
  `{success, data}`, `/api/users` returns a bare `{users, pagination}`, and the
  client unwraps each differently.
- **Zod schema shared** between client form and server handler — one definition.
- **Correct status codes.** Today authorisation failures return `401` where they
  mean `403`, in ~25 places.

### 14.2 Routes

```
POST   /api/entries                    submit or post (type decides the flow)
GET    /api/entries?period&type&member  the ledger
GET    /api/entries/:id                 detail + approvals + audit
POST   /api/entries/:id/approve
POST   /api/entries/:id/reject          { reason }
POST   /api/entries/:id/reverse         { reason }   ← never DELETE
DELETE /api/entries/:id                 only while DRAFT, by the creator

GET    /api/fund                        position: cash, invested, value, unit price
GET    /api/fund/projection?to=2036

GET    /api/investments
POST   /api/investments                 propose
POST   /api/investments/:id/approve
POST   /api/investments/:id/value       { amount, asOf }

GET    /api/periods
GET    /api/periods/:month              snapshot or live preview
POST   /api/periods/:month/close        preflight checks then freeze
POST   /api/periods/:month/reopen       ADMIN + reason

GET    /api/members                     all 11, visible to all 11
GET    /api/members/:id                 history, units, ownership
PATCH  /api/members/:id/role            ADMIN, dual-approved
PATCH  /api/members/:id/status          ADMIN

GET    /api/policy?month=YYYY-MM
POST   /api/policy                      ADMIN, dual-approved, future-effective only

GET    /api/audit                       open to every member
GET    /api/statements/:month.pdf
GET    /api/export?scope&format
```

### 14.3 The auth wrapper

```ts
// replaces ~25 copies of an inconsistent inline check
export function withAuth<T>(
  opts: { capability?: Capability; allowSelf?: boolean },
  handler: (ctx: { member: Member; body: T; req: Request }) => Promise<Response>
) { /* … */ }
```

---

## 15. Security and correctness, folded in

Every Critical and High finding from `SECURITY_AUDIT.md` is structurally resolved
by this redesign rather than patched:

| Audit finding | How the redesign resolves it |
|---|---|
| #1 Role escalation via session update | Role read from DB on every refresh; `update()` accepts only name/avatar/phone |
| #2 Bank-account mass assignment | Zod whitelist; `userId` never accepted from the body |
| #3 Sheets formula injection | Sheets demoted to export-only mirror, `valueInputOption: 'RAW'`, cells sanitised |
| #4 Payment proof overwrite | `public_id` includes member id + UUID; `overwrite:false`; attachments are append-only |
| #5 Stale role/deactivation for 30 days | `sessionsValidFrom` + revalidation on refresh |
| #6 In-memory rate limiter | Mongo TTL collection (or Upstash); shared across instances |
| #7 Duplicate sheet rows | Entries carry a sheet row id; sync updates in place |
| #8 Reset doesn't invalidate sessions | `passwordChangedAt` invalidates older tokens |
| #9 Racy duplicate payments | Partial unique index (§4.1) |
| #11 Verify wipes remarks | Entries are immutable; approval never mutates member fields |
| #12/#13 Reconciliation mismatch | Single `period` basis; one `getFundPosition()` |
| #14 No server-side file validation | Central upload handler: type, size, magic-byte check |
| #19 Admins can delete audit logs | No delete endpoint exists; log is append-only |
| #21/#22 Weak temp passwords, asymmetric guards | Email reset link instead of a temp password; last-admin guard; role changes dual-approved |
| #23 SW caches authenticated pages | Cache static assets only |

Additional hardening: CSP headers, `sameSite: 'strict'` cookies, signed Cloudinary
upload presets, and Mongo transactions around post/close (Atlas replica set gives
you these for free).

---

## 16. Tech stack changes

### 16.1 Keep
Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · shadcn/ui ·
MongoDB Atlas · Mongoose · Auth.js v5 · Cloudinary · Vercel · PWA · nodemailer

The foundation is right. The problems are modelling and architecture, not stack.

### 16.2 Change

| Area | From | To | Why |
|---|---|---|---|
| Data fetching | axios + react-query + `services/*` | RSC + Server Actions | 3 layers → 1 for 11 users |
| Money | `Number` (float) | integer paisa | correctness |
| Validation | zod in some routes | zod everywhere, shared client/server | one definition |
| Auth checks | 25 inline copies | `withAuth()` + capability map | consistency |
| Rate limiting | in-process `Map` | Mongo TTL / Upstash | actually works on serverless |
| Policy | hardcoded constant | `Policy` collection, time-ranged | history stays correct |
| Sheets | source of truth, append-only | export mirror, idempotent | one ledger |
| Dates | mixed local/UTC | one `Asia/Dhaka` helper | month boundaries |

### 16.3 Add

| Package | Purpose |
|---|---|
| `web-push` | deadline + approval notifications |
| `browser-image-compression` | shrink screenshots before upload |
| `@react-pdf/renderer` | real statements (pdf-lib is too low-level for these) |
| `recharts` | fund growth + projection charts |
| `date-fns-tz` | Asia/Dhaka correctness |
| `vitest` | tests for the money math — see below |

### 16.4 Testing (currently zero)

You do not need broad test coverage. You need tests on **exactly one thing**: the
money. Non-negotiable suites:

```
ledger.test.ts       cash / fundValue / invested across every entry type
units.test.ts        unit price, issuance, ownership sums to 100%
close.test.ts        snapshot is frozen; reopen path
policy.test.ts       correct policy resolves for a historical month
permissions.test.ts  every capability × role, and no-self-approval
```

If the fund math is right and everything else is ugly, the app works. If the math
is wrong, nothing else matters.

### 16.5 Google Sheets

Demote it. The app becomes the ledger; the sheet becomes a **read-only mirror**
regenerated nightly (full rewrite of a sheet per year, not appends). This removes
the duplicate-row bug and the formula-injection vector in one move, and keeps the
comfort of a spreadsheet for anyone who wants to poke at the numbers.

---

## 17. Migration plan

### 17.1 Strategy

**Rebuild the model, keep the deployment.** Do not start a new repo — you would
lose the working auth, upload, and PWA plumbing. Run the new collections alongside
the old ones, backfill, verify, then cut over.

### 17.2 Backfill

```
Transfer                         → LedgerEntry
  status VERIFIED                  → POSTED
  status PENDING                   → PENDING
  status REJECTED                  → REJECTED
  monthlyAmount > 0                → CONTRIBUTION_MONTHLY, direction CREDIT
  flexAmount    > 0                → CONTRIBUTION_FLEX (split into a 2nd entry
                                     when a row has both)
  selectMonth                      → period
  transferDate                     → valueDate
  paymentProofUrl                  → attachments[0]
  verifiedById/verifiedAt          → approvals[0]
  amount × 100                     → amount (paisa)

Cost                             → LedgerEntry, direction DEBIT, status POSTED
  category 'bank_charge'           → BANK_CHARGE
  category 'operational' | 'other' → OPERATIONAL_COST
  category 'investment'            → INVESTMENT_OUT  ⚠️ + create an Investment
  date                             → valueDate; period = date's month
  receiptImage                     → attachments[0]

MonthlySummary  → discard; recompute Period.snapshot from the migrated ledger
policies.ts     → seed one Policy row, effectiveFrom = your first month
User            → Member (moderator → CO_ADMIN; add passwordChangedAt,
                  sessionsValidFrom = now)
```

**The one place needing human judgement:** every existing
`Cost{category:'investment'}` row must be mapped to a real `Investment`. Sit down
with your treasurer and name each one. This is a handful of rows and a 20-minute
conversation.

### 17.3 Verification gate

The migration is only accepted when, **for every month**, the old and new systems
agree:

```
Σ old verified transfers        === Σ new CONTRIBUTION_* POSTED
Σ old operational costs         === Σ new BANK_CHARGE + OPERATIONAL_COST
old netAmount                   === new (cash + investedAtCost)
count(old transfers)            === count(new contribution entries)
```

Write this as a script that prints a per-month diff table and exits non-zero on any
mismatch. Do not cut over on a green light from a human eyeball.

### 17.4 Rollback

Keep `transfers` and `costs` collections **read-only, untouched, for 6 months**
after cutover. Rollback = point the old build at them. Also export a full DB dump
before migration (you already have a `db-backups/` habit — keep it, keep it
gitignored).

---

## 18. Delivery phases

Sized for one developer working part-time. Each phase ships something usable.

### Phase 0 — Stop the bleeding · ~1 week
Critical + High security fixes from `SECURITY_AUDIT.md`. **Do this regardless of
whether you proceed with the redesign.** Finding #1 lets any member become admin.

### Phase 1 — The ledger · ~2 weeks
`LedgerEntry`, integer money, `getFundPosition()`, backfill script, verification
gate. No UI change yet — old screens read from the new model via an adapter.
*Ships:* numbers that finally reconcile.

### Phase 2 — Roles and approvals · ~1.5 weeks
Capability map, `withAuth()`, `CO_ADMIN`, no-self-approval, dual approval,
approvals queue, post-an-entry form.
*Ships:* **your Co-Admin feature.**

### Phase 3 — The new shell · ~2 weeks
5-tab navigation, design tokens, `<Money>`, `<GroupBoard>`, new Home, three-step
Pay flow, Ledger screen.
*Ships:* the app people actually enjoy opening.

### Phase 4 — Fund and close · ~2 weeks
Investments, interest, unitisation, Fund screen, month close with reconciliation,
PDF statements.
*Ships:* the reason the fund exists.

### Phase 5 — Rhythm · ~1 week
Push notifications, reminders, milestones, annual statement, projections.
*Ships:* the thing that keeps 11 people engaged for ten years.

**Total ≈ 9–10 weeks part-time.** Phases 0–2 alone (≈4.5 weeks) fix every serious
problem and deliver the Co-Admin role; 3–5 are the experience.

---

## 19. Decisions only you can make

I've recommended an answer for each. These are the forks where the group's
preference matters more than engineering.

**Q1 — Ownership model?**
Equal shares / proportional / **unitisation**.
→ *Recommend unitisation.* It's the only one that stays fair for ten years, and its
fairness is self-evident, which matters more among friends than in a company.
**This must be decided before you post your first interest entry.**

**Q2 — How many Co-Admins?**
→ *Recommend 2.* One is a single point of failure (holiday, illness, a dead phone);
three out of eleven starts to feel like a hierarchy.

**Q3 — Dual-approval threshold?**
→ *Recommend Tk 1,000* for expenses, and **any amount** for investments. Tune after
six months of real usage.

**Q4 — Whose bank account holds the money?**
Today `BankAccount` models *members'* accounts, but what the group actually needs is
**the fund's** receiving account. Is it one member's personal account, a joint
account, or a formal one? This changes the reconciliation design and, more
importantly, it is the biggest real-world risk in the whole arrangement.
→ *Recommend* a dedicated account with at least two signatories, and monthly
statement uploads regardless.

**Q5 — Can a member exit before 2036?**
→ *Recommend deciding now and writing it into the Policy.* With unitisation the
mechanics are easy (redeem units at current price); the hard part is the social
agreement, and it is far easier to agree while nobody wants to leave.

**Q6 — What happens when someone misses a month?**
Today: nothing, it's just marked unpaid. Options: catch-up allowed, a late fee, or
reduced units. → *Recommend catch-up allowed, visible, no penalty* — the streak
display and group visibility are pressure enough for 11 friends.

**Q7 — Keep Google Sheets at all?**
→ *Recommend yes, as a nightly read-only mirror.* Zero risk, and it keeps anyone who
prefers a spreadsheet comfortable.

**Q8 — Is the audit log really open to everyone?**
→ *Recommend yes.* This is the philosophical core of the redesign. If the group
disagrees, that disagreement is worth surfacing early — it says something about
what the fund is.

---

## 20. Appendix — worked example, one full month

March 2026. Policy: Tk 3,000/month, deadline day 20. Opening cash Tk 2,15,000.
Two Co-Admins: Rahim, Karim. Fund holds Tk 2,00,000 in a DPS.

| Date | Event | Entry | Status |
|---|---|---|---|
| 3 Mar | Sadia sends ৳3,000 via bKash, uploads screenshot | `CONTRIBUTION_MONTHLY` +৳3,000 | PENDING |
| 4 Mar | Rahim approves | — | **POSTED** |
| 5–19 Mar | 9 more members pay and are approved | 9 × `CONTRIBUTION_MONTHLY` | POSTED |
| 15 Mar | Auto-reminder to the 1 unpaid member | — | — |
| 21 Mar | Last member pays, 1 day late | `CONTRIBUTION_MONTHLY`, `late: true` | POSTED |
| 22 Mar | Karim uploads the bank statement | attachment on the period | — |
| 22 Mar | Karim posts the maintenance fee | `BANK_CHARGE` −৳115 | POSTED (1 approval, Rahim) |
| 23 Mar | Karim posts quarterly interest | `INTEREST_BANK` +৳412 | POSTED (1 approval, Rahim) |
| 24 Mar | Mizan is found to have paid twice in Feb | `ADJUSTMENT` reversal, reason logged | POSTED (2 approvals) |
| 25 Mar | **Rahim runs Month Close** | | |
| | ✓ 11 of 11 settled | | |
| | ✓ statement reconciles to the paisa | | |
| | ✓ snapshot frozen, unit price ৳1.0043 | | |
| | ✓ PDF emailed to all 11 | | |
| 26 Mar | March is `CLOSED` 🔒 | | |

**March result**

```
Opening cash                        ৳ 2,15,000
  + contributions  11 × ৳3,000      ৳   33,000
  + bank interest                   ৳      412
  − bank charge                     ৳      115
                                    ───────────
Closing cash                        ৳ 2,48,297
  + invested at cost                ৳ 2,00,000
                                    ───────────
FUND VALUE                          ৳ 4,48,297
Unit price  ৳1.0043   ·   Units 4,46,377
```

Every one of those lines is one row in one table, provable in three taps, frozen
forever, and identical on all 11 phones.

---

## Summary

| | Today | Proposed |
|---|---|---|
| Money model | 2 disconnected collections | 1 immutable ledger |
| Interest / returns | impossible | first-class |
| Investment | an expense, filtered back out | an asset transfer |
| Money type | float | integer paisa |
| Mistakes | edit or delete | reversal with reason |
| Roles | member / moderator / admin | member / **co-admin** / admin |
| Self-approval | allowed | blocked |
| Big spends | one person | two people |
| Month totals | recomputed forever | frozen at close |
| Bank reconciliation | none | required to close |
| Transparency | audit log hidden from members | everything visible to all 11 |
| Policy | hardcoded constant | versioned, time-ranged |
| Navigation | 13 items, 3 dead | 5 items |
| Designed for | a company | **11 friends and 2,000 rows** |

The current app tracks payments. The proposed app **runs a fund** — and, more
importantly, it makes the fund legible to all eleven of you without anyone having
to take anyone else's word for anything.

---

*Proposal only — no code changed. Next step: answer §19, then Phase 0 starts
regardless.*
