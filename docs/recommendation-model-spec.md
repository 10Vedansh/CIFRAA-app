# Recommendation Model — Technical Reverse-Engineering Specification

**Scope.** This document reverse-engineers the mutual-fund recommendation methodology as actually implemented in this repository. It is source material for the paper *"Recommendation Model for Mutual Funds"*. It is not a product description.

**Conventions.**
- Every factual claim about the implemented system carries a `file:line` citation.
- Sections marked **[IMPLEMENTED]** describe code that exists. Sections marked **[PROPOSED]** describe methodology designed here for the paper and **not present in the system**. The two are never mixed.
- Where the code does not settle a question, the text says *Not determinable from the current implementation.*
- No formula, weight, threshold, metric or result below is invented; all constants are transcribed from source.

---

## 0. Executive summary of findings

The implemented system is a **deterministic, knowledge-based, constraint-then-utility recommender**. It is **not** a trained machine-learning model: there is no training set, no labels, no fitted parameters, no train/test split, no validation, and no feedback loop. All weights, thresholds and multipliers are hand-authored constants.

Three recommendation-related implementations exist in the tree; two are live:

| Engine | Files | Status |
|---|---|---|
| V1 (legacy additive scoring) | `src/utils/recommendationEngine.ts` | **Dead code** — not imported by any page or hook |
| V2/V3 (constraint filter + weighted composite) | `intersectionEngine.ts`, `scoringEngineV3.ts`, `categoryMappings.ts` | **Live** — dashboard personalized funds (`src/pages/Index.tsx:125`) |
| Strategy portfolio engine | `strategyPortfolioEngine.ts`, `riskCapacity.ts` | **Live** — `BuildPortfolio.tsx` |

`src/utils/recommendation/portfolioConstruction.ts` is **dead code**: repository search finds no import or call site. Its allocation table and 40% concentration cap are not part of the deployed builder behavior. The live builder allocates using `strategyPortfolioEngine.ts::selectFundsForTemplate` (§5.3).

The investor's **existing holdings are never read by any recommendation path**. The system is prospective and stateless with respect to the portfolio.

---

## 1. Problem formulation **[IMPLEMENTED]**

### 1.1 Entities

- **User / investor** $u$: a registered profile carrying five categorical preference variables persisted at onboarding (`src/pages/Onboarding.tsx:95-99`) and, in the portfolio-builder flow only, six additional financial-capacity variables (`BuildPortfolio.tsx:757-788`).
- **Item** $f$: a single mutual fund scheme, an element of a universe $\mathcal{F}$ of roughly 2,000 Indian schemes sourced from an Excel workbook and enriched with AMFI NAVs.
- **Recommended object**: an ordered set of at most **nine** schemes for the dashboard (`intersectionEngine.ts:266`, `Index.tsx:126`), or a set of named strategy portfolios with percentage allocations summing to 100 for the builder (`strategyPortfolioEngine.ts:356-363`).

### 1.2 Objective

The system solves a **constrained personalized ranking** problem, not a rating-prediction problem. Formally, let $\mathcal{C}(u)$ be the feasible set induced by the investor's hard constraints and $S(f,u)$ a scalar utility. The dashboard output is

$$
\mathcal{R}(u) \;=\; \operatorname*{arg\,top-}_{f \in \mathcal{C}(u)}{}^{\,K}\; S(f,u), \qquad K = 9,
$$

subject to post-hoc **diversification constraints** applied greedily over the ranked list: at most $m_b$ funds from each category bucket $b$ of an allocation model $M(u)$, and at most two funds per AMC (`intersectionEngine.ts:146-195`). The full output is therefore not the unconstrained top-$K$ but a bucket-feasible subsequence of the ranked list.

### 1.3 Why this is not return-sorting

Ranking by trailing return would be $S(f,u)=r_{3Y}(f)$, independent of $u$. The implemented objective differs in four structural ways:

1. **Feasibility precedes utility.** Five independent hard-constraint filters can eliminate a fund with the highest return outright (`intersectionEngine.ts:227-231`).
2. **Risk-adjusted dominance.** Raw return contributes zero weight; only *category-relative* CAGR enters, at 20%, while downside-risk-adjusted return (Sortino) carries 30% (`scoringEngineV3.ts:255-263`).
3. **Peer-relative normalization.** Return is standardized within its own category, so a debt fund is never compared to a small-cap fund on absolute return (`scoringEngineV3.ts:226-230`).
4. **Set-level, not item-level, output.** Diversification caps make the recommendation a function of the whole selected set, not nine independent decisions.

### 1.4 Formal statement

Let $x_u \in \mathcal{U}$ be the investor's categorical profile, $z_f \in \mathbb{R}^d \cup \{\text{NA}\}^d$ the fund's feature vector, and $c$ the category label. Define:

- a **feasibility predicate** $\phi(f, x_u) \in \{0,1\}$, the conjunction of five constraint tables;
- a **utility** $S: \mathcal{F} \times \mathcal{U} \to [0,100]$, a fixed-weight linear combination of seven normalized sub-scores, multiplied by penalty factors;
- a **set constraint** $\Gamma$ (bucket caps, AMC cap, category cap).

Then

$$
\mathcal{R}(u) = \operatorname*{arg\,max}_{R \subseteq \{f : \phi(f,x_u)=1\},\; |R| \le 9,\; R \models \Gamma} \sum_{f \in R} S(f,u),
$$

solved **greedily**, not optimally: the implementation sorts once by $S$ and fills buckets in fixed order (`intersectionEngine.ts:156-172`). The greedy solution is not guaranteed to be the argmax of the sum.

---

## 2. Model inputs **[IMPLEMENTED]**

### 2.1 Investor-level features

| Feature | Domain | Source | Role |
|---|---|---|---|
| `risk_tolerance` | `conservative`, `moderate`, `aggressive` | `Onboarding.tsx:18-45` | Hard filter (`RISK_CONSTRAINTS`), allocation model selection, `DT-CR` suppression, suitability badge |
| `investment_goal` | `wealth`, `income`, `preservation`, `tax` | ibid. | Hard filter (`GOAL_ELIGIBILITY`), allocation model selection |
| `investment_horizon` | `short`, `medium`, `long` | ibid. | Hard filter (`HORIZON_RULES`), `DT-CR` suppression gate |
| `experience_level` | `beginner`, `intermediate`, `advanced` | ibid. | Sectoral hard filter; beginner score penalties |
| `investment_amount` | `small`, `medium`, `large` | ibid. | Hard filter on AUM floor and expense ceiling |

Read into the engine at `src/pages/Index.tsx:117-123`, with defaults `moderate / wealth / long / beginner / medium` when the profile field is null.

**Risk-capacity features** — collected only in the portfolio builder (`BuildPortfolio.tsx:757-788`), consumed only by `riskCapacity.ts`:

| Feature | Domain | Weight in capacity score |
|---|---|---|
| `occupation` | salaried, business_owner, freelancer, student, retired, homemaker | 0.20 (`riskCapacity.ts:77-78`) |
| `incomeStability` | very_stable … unstable | 0.25 (`:83-84`) |
| `monthlyEmis` | numeric ₹ | 0.15 (`:89-91`) |
| `dependents` | numeric count | 0.15 (`:96-98`) |
| `hasInsurance` | boolean | 0.10 (`:103-104`) |
| `existingInvestments` | none, fd_only, mixed, diversified, advanced | 0.15 (`:109-110`) |

### 2.2 Fund-level features consumed by the model

Schema: `src/types/mutualFund.ts:7-61`. Features **actually consumed** by filtering or scoring:

| Feature | Definition | Computation / source | Role |
|---|---|---|---|
| `category` | Workbook category code (`EQ-LC`, `DT-CR`, …) | Workbook column, `sync-onedrive/index.ts:131-176` | All hard filters, median grouping, credit penalty gate |
| `volatility`, `stdDev` | Annualized standard deviation (%) | Workbook | Risk/goal filters; low-vol sub-score (10%); drawdown proxy; beginner penalty; suitability badge |
| `sharpeRatio` | Excess return / total volatility | Workbook | Goal filter (`minSharpe`); Sharpe sub-score (10%); Sortino imputation |
| `sortinoRatio` | Excess return / downside deviation | Workbook, often NA | Dominant sub-score (30%) |
| `ret3Y` / `cagr3Y` | 3-year annualized return | Workbook | Goal filter (`requirePositive3Y`); category-relative CAGR (20%) |
| `ret1M, ret3M, ret6M, ret1Y, ret5Y/cagr5Y` | Trailing returns | Workbook | Consistency proxy (15%) |
| `expenseRatio` | TER (%) | Workbook | Amount filter; expense sub-score (10%); beginner penalty |
| `aum` | Net assets (₹ crore) | Workbook | Amount filter; AUM sub-score (5%) |
| `avgCreditQuality` | Rating string | Workbook (debt sheets) | Credit penalty multiplier |
| `amc` | Fund house | Regex on scheme name, `sync-onedrive/index.ts:117-129` | Diversification cap (max 2) |
| `name` | Scheme name | Workbook | Exclusion list match |
| `id` | Synthetic identifier | Pipeline | De-duplication in diversification |

**Features present in the schema but never consumed by the live recommendation path** (important for the paper's honesty): `beta`, `alpha`, `infoRatio`, `rSquared`, `nav`/`latestNav`/`previousNav`, `high52W`, `low52W`, `turnover`, `marketCap`, `minInvestment`, `exitLoad`, `benchmark`, `avgMaturity`, `ytm`, `ret1W`, `ret10Y`, `fundManager`, `launch`, `rank`, `strengthBadge`, `riskLevel`. Notably **no alpha, no beta, no benchmark-relative performance, and no true maximum drawdown enter the score.** `riskLevel` and `strengthBadge` are derived in the pipeline (`sync-onedrive/index.ts:89-111`) for display only.

Also dead: `AMOUNT_CONSTRAINTS.directPlanOnly` (`categoryMappings.ts:185,191`) is defined but never enforced; `RISK_CONSTRAINTS.minCreditQuality` (`:48`) is defined but never read by any filter.

### 2.3 Portfolio-level features

**None are consumed.** `src/hooks/usePortfolio.tsx` reads and writes the holdings table and computes a display summary (`:153-162`); it is not imported by `intersectionEngine.ts`, `scoringEngineV3.ts`, or `strategyPortfolioEngine.ts`. The builder call site passes only `funds, risk, goal, horizon, experience, investmentAmount, capacityInputs` (`BuildPortfolio.tsx:417-427`). There is no overlap detection, no concentration measurement against current holdings, and no incremental-portfolio objective. See §10.

---

## 3. Feature engineering **[IMPLEMENTED]**

### 3.1 Missing-value semantics

Raw cells equal to `null`, `''`, or the sentinel `'--'` are parsed to `null`, not zero (`scoringEngineV3.ts:12-16`):

$$
\text{safe}(v)=\begin{cases}\texttt{null} & v \in \{\texttt{null}, \texttt{undefined}, \text{''}, \text{'--'}\}\ \text{or}\ v \notin \mathbb{R}\\ v & \text{otherwise}\end{cases}
$$

NA values are handled differently by filters, category aggregates, normalization, and scoring; the behavior is not uniformly “neutral”:

1. **Category medians:** missing CAGR, Sharpe, and volatility observations are omitted. Missing Sortino is first approximated from Sharpe and volatility, and that approximation is included in the category Sortino median (`:45-64`, `:88-95`).
2. **Scoring-time substitutions:** missing Sortino, Sharpe, and volatility use the category median when available; Sortino otherwise uses its Sharpe-based approximation. Missing 3Y CAGR receives the category median for one local variable, but its category-relative z-score is explicitly set to zero (`:215-243`).
3. **Expense/AUM score:** missing expense ratio or AUM produces an exact normalized sub-score of $0.5$ (`:245-253`).
4. **Normalization extrema:** `computeNormStats` substitutes 0 for missing Sharpe, volatility, expense, and AUM when computing min/max extrema; missing Sortino uses the approximation (`:155-182`). Those zeros affect other funds’ normalization ranges even though the missing fund itself receives a 0.5 expense/AUM score or a category-median risk score.
5. **Filter leniency:** a metric threshold is skipped when that metric parses as missing. A fund with missing volatility, Sharpe, 3Y return, AUM, or expense can therefore pass the corresponding filter (`intersectionEngine.ts:71-78, 96-107, 132-140`).

The implementation does not test or model a missingness mechanism. Calling these substitutions “neutral” is only partly accurate: direct missing expense/AUM sub-scores are neutral constants, but missingness can alter normalization extrema and filter eligibility. See §18.

### 3.2 Category aggregates

For each category $c$ with member set $\mathcal{F}_c$:

$$
\tilde{r}_c = \operatorname{median}\{r_{3Y}(f) : f \in \mathcal{F}_c,\ r_{3Y}(f) \neq \text{NA}\}
$$

$$
\sigma_c = \max\left(\sqrt{\tfrac{1}{|A_c|}\textstyle\sum_{r \in A_c}(r-\bar{A_c})^2},\; \epsilon\right),\quad \epsilon \text{ enforced by } \texttt{|| 1}
$$

with $\sigma_c$ set to 1 when the observed CAGR population standard deviation is 0 or there are fewer than two observed CAGR values (`scoringEngineV3.ts:55-56, 79-84`). Sharpe, Sortino, and volatility category medians are also computed, but **only CAGR receives category dispersion and a category-relative z-score**. Missing Sortino values are approximated before computing its median; missing Sharpe and volatility are excluded from their medians (`:45-64`). The standard deviation uses the population divisor $1/n$, not $1/(n-1)$.

Aggregates are memoized using the weak key `${funds.length}-${funds[0].id}` (`:28-33`). Equal-length universes sharing the same first fund can collide even if their remaining members differ; this can return stale category statistics until the key changes.

### 3.3 Metric imputation by approximation

When `sortinoRatio` is NA and no category median exists, it is approximated from Sharpe (`:88-95`):

$$
\widehat{\text{Sortino}}(f)=\begin{cases}1.1 \cdot \text{Sharpe}(f) & \sigma(f) > 15\\ 1.4 \cdot \text{Sharpe}(f) & \text{otherwise}\end{cases}
$$

Maximum drawdown is never observed; it is approximated as (`:117-121`)

$$
\widehat{\text{MDD}}(f) = 2.5\,\sigma(f).
$$

Both constants are heuristic and unvalidated (§18).

### 3.4 Consistency proxy

True rolling-window consistency is not computable from the data (only point-in-time trailing returns exist). The implementation substitutes the fraction of available trailing horizons that exceed 80% of the category median 3-year CAGR (`:98-114`). Let $P(f) \subseteq \{r_{1M}, r_{3M}, r_{6M}, r_{1Y}, r_{3Y}, r_{5Y}\}$ be the non-NA subset:

$$
\text{Cons}(f) = \begin{cases}
0.5 & |P(f)| = 0\\[4pt]
\dfrac{\bigl|\{r \in P(f) : r > 0.8\,\tilde{r}_c\}\bigr|}{|P(f)|} & \text{otherwise}
\end{cases}
$$

**Dimensional caveat for the paper:** $r_{1M}$ and $r_{3M}$ are *cumulative period* returns while $\tilde r_c$ is an *annualized* 3-year CAGR; they are compared without annualization. This systematically biases the consistency score downward for short horizons in high-CAGR categories.

### 3.5 Normalization

Two schemes coexist.

**Min–max over the eligible universe** (`:155-188`). For metric $m$ with universe extrema $m_{\min}, m_{\max}$:

$$
\mathcal{N}(m) = \operatorname{clip}_{[0,1]}\!\left(\frac{m - m_{\min}}{m_{\max}-m_{\min}}\right), \qquad \mathcal{N}(m)=0.5 \text{ if } m_{\max}=m_{\min}
$$

Extrema are recomputed per request over the **post-filter eligible set** (`intersectionEngine.ts:240`), so a fund's normalized score is context-dependent: the same fund scores differently for two investors. This is a deliberate consequence of computing `computeNormStats` after filtering.

**Category-relative z-mapping** for return (`scoringEngineV3.ts:222-230`):

$$
z_c(f) = \frac{r_{3Y}(f) - \tilde{r}_c}{\sigma_c}, \qquad \mathcal{Z}(f)=\operatorname{clip}_{[0,1]}\!\left(\frac{z_c(f)+3}{6}\right)
$$

with $z_c(f)=0 \Rightarrow \mathcal{Z}=0.5$ when $r_{3Y}$ is NA.

---

## 4. Personalization mechanism **[IMPLEMENTED]**

Personalization enters at **four** distinct points. Critically, **the seven scoring weights are identical for all investors** — personalization is achieved by set restriction and multiplicative modifiers, not by re-weighting.

```text
investor profile x_u
  ├─(1) five constraint tables ────────► feasible set C(u)     [hard]
  ├─(2) experience level ─────────────► sectoral exclusion +
  │                                      beginner score penalties
  ├─(3) risk × goal ──────────────────► allocation model M(u)  [set shape]
  └─(4) risk × horizon ───────────────► DT-CR suppression factor
                    │
                    ▼
         identical weight vector w  ──► S(f,u) ──► sort ──► greedy bucket fill ──► top 9
```

### 4.1 Preference validation (pre-engine)

Before preferences reach the engine, `preferenceValidator.ts:44-147` eliminates structurally empty intersections and rewrites the profile:

| Condition | Effect |
|---|---|
| goal = preservation | disables risk = aggressive; auto-resets aggressive → conservative (`:54-64`) |
| risk = aggressive | disables goal = preservation; clears the goal (`:67-77`) |
| horizon = short | disables goal = wealth and risk = aggressive; risk auto-resets to moderate (`:80-102`) |
| goal = tax | disables horizon = short; auto-resets to medium (`:105-115`) |
| risk = conservative ∧ goal = wealth | disables short and medium; auto-resets to long (`:118-132`) |
| goal = preservation | disables horizon = long; auto-resets to short (`:135-145`) |

These rules encode domain knowledge (ELSS statutory 3-year lock-in; equity unsuitability at short horizons) and are the clearest evidence of a **knowledge-based** recommender.

### 4.2 Risk capacity and the downgrade rule

Only in the builder path. A weighted capacity score is formed on a 1–5 scale (`riskCapacity.ts:68-116`):

$$
K(u) = 0.20\,o + 0.25\,s + 0.15\,e + 0.15\,d + 0.10\,i + 0.15\,v
$$

with sub-scores from lookup tables (`:25-48`) and the EMI / dependent step functions

$$
e = \begin{cases}1 & \text{EMI}>50000\\2 & >20000\\3 & >5000\\4 & >0\\5 & =0\end{cases}
\qquad
d = \begin{cases}1 & \text{dep}>4\\2 & >2\\3 & >0\\5 & =0\end{cases}
\qquad
i = \begin{cases}5 & \text{insured}\\1 & \text{else}\end{cases}
$$

Missing occupation/stability default to 3, missing existing-investments to 2 (`:77, 83, 109`). The score is rounded and clipped: $\hat{K}=\operatorname{clip}_{[1,5]}(\operatorname{round}(K))$.

The final risk level applies a **conservatism dominance rule**:

$$
\rho_{\text{final}} = \Lambda\!\left(\min\bigl(\Lambda^{-1}(\rho_{\text{selected}}),\, \hat{K}\bigr)\right),
\quad \Lambda^{-1}: \{\text{cons},\text{mod},\text{agg}\}\mapsto\{2,3,5\}
$$

$$
\Lambda(x)=\begin{cases}\text{conservative} & x\le 2\\ \text{moderate} & 2<x\le 3.5\\ \text{aggressive} & x>3.5\end{cases}
$$

(`riskCapacity.ts:50-66, 121-126`). Stated preference can therefore only be *reduced*, never amplified — a paternalistic asymmetry worth defending explicitly in the paper.

### 4.3 A verified defect affecting personalization

Onboarding writes `experience_level = 'advanced'` (`Onboarding.tsx:18-45`) while `EXPERIENCE_MODIFIERS` and `BuildPortfolio.tsx` use the key `'experienced'` (`categoryMappings.ts:173`, `BuildPortfolio.tsx:546-591`). For a dashboard user who selected "advanced", `EXPERIENCE_MODIFIERS['advanced']` is `undefined`, so `applyExperienceFilter` returns the universe unmodified (`intersectionEngine.ts:118-120`). The behavioral effect is benign here (sectoral funds remain permitted, which is the intended treatment for experienced users) but the mismatch is real and should be disclosed as an implementation-fidelity limitation, not presented as design.

---

## 5. Core recommendation algorithm **[IMPLEMENTED]**

### 5.1 Classification

The live pipeline is a **hybrid of knowledge-based constraint satisfaction and utility-based (multi-attribute) scoring**, executed entirely client-side and deterministically. Precisely:

- **Rule-based / knowledge-based:** yes — six constraint tables and a validator encoding financial domain rules.
- **Weighted scoring / utility-based (MAUT):** yes — a fixed seven-term linear utility with multiplicative penalties.
- **Statistical:** partially — category medians, population standard deviation, min–max and z-normalization computed over the live universe.
- **Content-based:** yes in the weak sense that items are scored from their own attributes, but there is **no user-profile vector learned from item interactions**, so it is not content-based filtering in the classical Balabanović sense.
- **Collaborative filtering:** **no** — no user–item interaction matrix exists.
- **Machine learning / learning-to-rank:** **no** — see §12.
- **Optimization-based:** **no** — greedy fill, no objective solved; no mean–variance or any programmatic optimizer.
- **LLM-assisted:** **no** for recommendation. An LLM exists in the product for a chat assistant and for prose insight generation, but it does not select, score, filter or order recommended funds.

### 5.2 Pipeline stages (dashboard path)

**Stage 0 — Universe exclusion.** Substring blacklist, case-insensitive: `EXCLUDED_FUND_NAMES = ['bharat 22 etf']` (`categoryMappings.ts:195`, applied `intersectionEngine.ts:57-60, 224`).

**Stage 1 — Five hard-constraint filters,** applied in sequence (`intersectionEngine.ts:227-231`):

1. `applyRiskConstraints` — blocked-category membership; volatility cap; drawdown cap. **Note:** the `maxDrawdown` field is compared against the *volatility* value, not any drawdown metric (`:75-78`), so for conservative investors the binding constraint is $\sigma \le \min(4, 8) = 4$.
2. `applyGoalEligibility` — allowed category prefix set, blocked categories, volatility cap, Sharpe floor, positive-3Y requirement (`:83-110`).
3. `applyHorizonRules` — blocked categories only (`:112-116`). `maxDuration` is defined (`categoryMappings.ts:136`) but never enforced.
4. `applyExperienceFilter` — removes all sectoral categories unless `allowSectoral` (`:118-125`).
5. `applyAmountConstraints` — AUM floor, expense ceiling (`:127-142`).

Constant tables in full: `RISK_CONSTRAINTS` (`categoryMappings.ts:44-73`), `GOAL_ELIGIBILITY` (`:85-121`), `HORIZON_RULES` (`:129-150`), `EXPERIENCE_MODIFIERS` (`:160-179`), `AMOUNT_CONSTRAINTS` (`:188-192`), `SECTORAL_CATEGORIES` (`:30-34`).

**Stage 2 — Cascading fallback relaxation.** If the feasible set is empty, constraints are dropped in a fixed priority order (`:199-213`): (risk ∧ horizon ∧ goal) → (risk ∧ horizon) → (risk) → the unfiltered universe. This encodes an explicit **constraint priority ordering**: risk tolerance is the least relaxable, amount and experience the most. It also means a recommendation is *always* returned, possibly violating the investor's stated goal — a safety/soundness trade-off that must be disclosed.

**Stage 3 — Statistics and scoring.** Medians and extrema are computed over the *post-filter* set (`:239-240`); every fund is scored (§6).

**Stage 4 — Global sort** by descending composite score (`:263`).

**Stage 5 — Diversification.** Buckets from `getAllocationModel(risk, goal)` (`categoryMappings.ts:203-278`) are traversed in declaration order; within each, funds are re-sorted by score and admitted while bucket count $<$ `maxFunds`, total $<9$, and the AMC has fewer than 2 admitted funds (`intersectionEngine.ts:156-172`). Any shortfall is filled from the global ranking under the AMC cap plus a max-2-per-category cap (`:174-192`).

**Stage 6 — Truncation and fallback at the call site.** `Index.tsx:126` takes the first nine, or, if the engine returned nothing at all, falls back to `funds.slice(0, 9)` — the first nine funds in cache order, **entirely unpersonalized**. This last-resort path is a correctness hazard worth naming in §18.

### 5.3 Strategy-portfolio path (builder)

A distinct engine (`strategyPortfolioEngine.ts`) produces named portfolios with weights. Templates and their target bands (`:76-167`):

| Strategy | Equity | Debt | Hybrid | Expected return band | Gate |
|---|---|---|---|---|---|
| Conservative | 10–25% | 55–75% | 10–25% | 6–9% | — |
| Balanced | 40–55% | 25–35% | 15–25% | 10–13% | — |
| Growth | 65–80% | 10–20% | 5–15% | 13–17% | $\hat K \ge 3$ or risk ≠ conservative |
| Aggressive | 85–95% | 0–10% | 0–5% | 16–22% | $\hat K \ge 4$ or risk = aggressive |

Fund selection per template (`:258-366`) uses per-bucket caps (mostly 1) and the same AMC cap of 2. Asset-class targets take the midpoint of each band; the target is split equally across the funds chosen in that class; residual rounding error is added to the largest allocation so the weights sum to exactly 100 (`:356-363`). Templates yielding fewer than three funds are discarded (`:486`).

`portfolioConstruction.ts` applies a per-fund concentration cap of 40% with renormalization when the total deviates from 100 by more than 0.5 (`:147-157`), and fixed intra-class splits (`:41-68`):

- equity, $\hat K \le 2$: Large/Flexi 100%
- equity, $\hat K \le 3$: Large/Flexi 50%, Balanced/Multi-asset 30%, Value/ELSS 20%
- equity, $\hat K \ge 4$: Large/Flexi 40%, Mid 30%, Small/Sectoral 30%
- debt (always): Corporate Bond 50%, Short/Low Duration 30%, Gilt/Banking-PSU 20%

Equity allocation as a function of capacity is a lookup, not a formula (`riskCapacity.ts:144-152`): $\hat K \mapsto \{1{:}20, 2{:}35, 3{:}60, 4{:}80, 5{:}95\}$ percent.

---

## 6. Mathematical model **[IMPLEMENTED]**

All quantities below are transcribed from `scoringEngineV3.ts:202-327`.

### 6.1 Sub-scores

Let $c$ be the fund's category, $\tilde{m}_c$ the category median of metric $m$, and $\mathcal{N}$ the universe min–max map of §3.5.

$$
\begin{aligned}
s_1(f) &= \mathcal{N}\bigl(\text{Sortino}^\ast(f)\bigr), && \text{Sortino}^\ast = \begin{cases}\text{Sortino}(f) & \text{observed}\\ \tilde{\text{Sortino}}_c & \text{NA, median exists}\\ \widehat{\text{Sortino}}(f) & \text{otherwise}\end{cases}\\[4pt]
s_2(f) &= \operatorname{clip}_{[0,1]}\!\left(\tfrac{z_c(f)+3}{6}\right), && z_c(f)=\tfrac{r_{3Y}(f)-\tilde r_c}{\sigma_c},\ \ z_c=0 \text{ if } r_{3Y}=\text{NA}\\[4pt]
s_3(f) &= \text{Cons}(f) && \text{(§3.4)}\\[4pt]
s_4(f) &= \mathcal{N}\bigl(\text{Sharpe}^\ast(f)\bigr), && \text{Sharpe}^\ast = \text{Sharpe}(f) \text{ or } \tilde{\text{Sharpe}}_c\\[4pt]
s_5(f) &= 1-\mathcal{N}\bigl(\sigma^\ast(f)\bigr), && \sigma^\ast = \sigma(f)\ \text{or}\ \text{stdDev}(f)\ \text{or}\ \tilde\sigma_c\\[4pt]
s_6(f) &= \begin{cases}0.5 & \text{TER}=\text{NA}\\ 1-\mathcal{N}(\text{TER}(f)) & \text{else}\end{cases}\\[4pt]
s_7(f) &= \begin{cases}0.5 & \text{AUM}=\text{NA}\\ \mathcal{N}(\text{AUM}(f)) & \text{else}\end{cases}
\end{aligned}
$$

### 6.2 Base utility

$$
S_0(f) = \mathbf{w}^\top \mathbf{s}(f) = 0.30\,s_1 + 0.20\,s_2 + 0.15\,s_3 + 0.10\,s_4 + 0.10\,s_5 + 0.10\,s_6 + 0.05\,s_7
$$

with $\sum_i w_i = 1$ and $S_0 \in [0,1]$. Weights are literal constants at `scoringEngineV3.ts:256-263`; they are **not learned** and their provenance is not documented in the code.

### 6.3 Multiplicative modifiers

**Credit penalty** (debt categories only, `:125-143`). Let $q$ be the uppercased credit-quality string:

$$
\pi(f)=\min\Bigl(0.10\cdot\mathbb{1}[\,\text{"A"}\in q \wedge \text{"AA"}\notin q\,] + 0.15\cdot\mathbb{1}[\,\text{"BBB"}\vee\text{"BB"}\vee\text{"B"}\in q\,] + 0.10\cdot\mathbb{1}[c=\text{DT-CR}],\;0.25\Bigr)
$$

**Credit-risk category suppression** (`:270-277`):

$$
\kappa(f,u)=\begin{cases}0.80 & c=\text{DT-CR} \ \wedge\ \neg(\rho=\text{aggressive}\wedge h=\text{long})\\ 1 & \text{otherwise}\end{cases}
$$

**Beginner modifiers** (`:280-286`):

$$
\beta(f,u)=\bigl(0.7\bigr)^{\mathbb{1}[\text{exp}=\text{beginner}\,\wedge\,\sigma^\ast>15]}\cdot\bigl(0.9\bigr)^{\mathbb{1}[\text{exp}=\text{beginner}\,\wedge\,\text{TER}>1.5]}
$$

### 6.4 Final score

$$
\boxed{\,S(f,u) = 100 \cdot \bigl(1-\pi(f)\bigr)\,\kappa(f,u)\,\beta(f,u)\;\sum_{i=1}^{7} w_i\, s_i(f)\,}
$$

rounded to two decimals (`:320`). Range $[0,100]$; observed values are well below 100 because the seven sub-scores rarely co-maximize.

### 6.5 Derived labels

$$
\text{match}(f)=\begin{cases}\text{high} & S>70\\ \text{medium} & 40<S\le70\\ \text{low}&S\le40\end{cases}
\quad\text{(\texttt{intersectionEngine.ts:255})}
$$

$$
\text{downside}(f)=\begin{cases}\text{low} & 2.5\sigma^\ast<10\\ \text{moderate} & 10\le 2.5\sigma^\ast<25\\ \text{high} & \text{else}\end{cases}
\quad\text{(\texttt{:309-311})}
$$

$$
\text{suitability}(f,u)=\begin{cases}\text{limited} & \rho=\text{cons} \wedge \sigma^\ast>10\\ \text{adjusted} & (\rho=\text{cons}\wedge\sigma^\ast>6) \vee (\rho=\text{mod}\wedge\sigma^\ast>18)\\ \text{aligned}&\text{else}\end{cases}
\quad\text{(\texttt{:314-317})}
$$

### 6.6 The legacy V1 model (dead code, documented for completeness)

`src/utils/recommendationEngine.ts` implements an **additive point-based** score with dozens of hardcoded bonuses (e.g. conservative group bonuses: LARGE +25, DEBT +30, SMALL −50, INTERNATIONAL −50, `:190-219`) followed by a category multiplier table (`:305-321`, e.g. SMALL 1.4, LARGE 0.85, INTERNATIONAL 0), plus duplicate-exposure and thematic-overload de-duplication (`:393-419`). It is not reachable from any page or hook. **The paper must not describe V1 as the deployed method.**

---

## 7. Pseudocode **[IMPLEMENTED]**

### Algorithm 1 — Constrained personalized fund ranking

```text
Input : F (fund universe), x_u = (ρ, g, h, ε, a), K = 9
Output: R, an ordered recommendation set, |R| ≤ K

 1  F ← { f ∈ F : name(f) contains no term in EXCLUDED_FUND_NAMES }
 2  E ← F
 3  for each filter φ in ⟨risk(ρ), goal(g), horizon(h), experience(ε), amount(a)⟩ do
 4      E ← { f ∈ E : φ(f) }            ▷ metric tests skipped when the metric is NA
 5  if E = ∅ then
 6      E ← relax(F, x_u)               ▷ drop goal, then horizon, then all but risk, then none
 7  Θ ← categoryAggregates(E)           ▷ median CAGR/Sharpe/Sortino/vol, population σ per category
 8  Ω ← minMaxExtrema(E)                ▷ Sortino, Sharpe, vol, TER, AUM
 9  for each f ∈ E do
10      s ← subScores(f, Θ, Ω)          ▷ §6.1; NA ⇒ category median or 0.5
11      S[f] ← 100 · (1−π(f)) · κ(f,x_u) · β(f,x_u) · ⟨w, s⟩
12  sort E by S descending
13  R ← ∅ ; usedAMC ← ∅ ; M ← allocationModel(ρ, g)
14  for each bucket b ∈ M do            ▷ declaration order, not score order
15      n ← 0
16      for each f ∈ E with cat(f) ∈ b, f ∉ R, in score order do
17          if n ≥ b.maxFunds or |R| ≥ K then break
18          if count(usedAMC, amc(f)) ≥ 2 then continue
19          R ← R ∪ {f} ; usedAMC[amc(f)] += 1 ; n ← n + 1
20  for each f ∈ E in score order while |R| < K do          ▷ shortfall fill
21      if f ∈ R or count(usedAMC, amc(f)) ≥ 2
                 or count(catOf(R), cat(f)) ≥ 2 then continue
22      R ← R ∪ {f} ; usedAMC[amc(f)] += 1
23  return first K elements of R
       ▷ caller: if R = ∅ then return F[0..K−1]  (unpersonalized last resort)
```

### Algorithm 2 — Strategy portfolio construction

```text
Input : F, x_u, capacity inputs y_u
Output: P, a set of named portfolios with weights summing to 100

 1  K̂ ← clip(round(0.20·o + 0.25·s + 0.15·e + 0.15·d + 0.10·i + 0.15·v), 1, 5)
 2  ρ* ← Λ( min( Λ⁻¹(ρ), K̂ ) )                     ▷ conservatism dominance
 3  E ← Algorithm 1, lines 1–12, using ρ*           ▷ scored eligible set
 4  for each template t ∈ {Conservative, Balanced, Growth, Aggressive} do
 5      if gate(t, K̂, ρ*) is false then continue
 6      (τ_eq, τ_dt, τ_hy) ← midpoints of t's allocation bands
 7      Sel ← ∅
 8      for each bucket b ∈ t.buckets do
 9          admit up to b.maxFunds top-scored funds, AMC cap 2
10      for each asset class κ do
11          split τ_κ equally across Sel ∩ κ
12      cap any single weight at 40, renormalize if |Σw − 100| > 0.5
13      add rounding residual to the largest weight so Σw = 100 exactly
14      if |Sel| ≥ 3 then P ← P ∪ {(t, Sel, w)}
15  return P
```

---

## 8. Design rationale and per-metric critique **[analysis of IMPLEMENTED choices]**

| Component | Investor characteristic represented | Justification | Limitation as implemented |
|---|---|---|---|
| Sortino, 30% | Loss aversion; asymmetric utility over downside | Downside deviation matches prospect-theoretic preferences better than total variance | Frequently NA and then imputed by a heuristic multiple of Sharpe, so the dominant term is often a transform of the 10%-weighted term — an undisclosed weight concentration |
| Category-relative CAGR, 20% | Desire for return, corrected for structural category differences | z-scoring within category prevents debt–equity return comparisons | Uses population σ over possibly tiny categories; $\sigma_c$ floored at 1 distorts thin categories; single 3Y point estimate |
| Consistency, 15% | Preference for reliability over lucky single periods | Cheap proxy for rolling-window stability | Compares cumulative short-period returns to an annualized median (§3.4); the 0.8 factor is arbitrary |
| Sharpe, 10% | Total-risk-adjusted efficiency | Standard, widely understood | Partially redundant with the Sortino term |
| Low volatility, 10% | Tolerance for path discomfort | Directly maps to experienced drawdown discomfort | Double-counts with Sharpe and Sortino denominators |
| Expense ratio, 10% | Cost sensitivity; the only near-deterministic predictor of relative net return | Strong empirical support in the fund-performance literature | Min–max across the whole eligible set mixes debt and equity cost scales |
| AUM, 5% | Operational stability, liquidity, closure risk | Reasonable low weight | Large AUM harms small-cap alpha capacity; treated as monotonically good |

**Why multi-factor beats single-criterion baselines.** Return-only ranking is not personalized and maximizes an estimator with high variance and strong mean reversion. Risk-only ranking recommends cash-like instruments to everyone. Expense-only ranking is personalized-agnostic and ignores mandate fit. Category-average ranking cannot discriminate within a category. Random selection has no defensible loss. The implemented model dominates all of these on **constraint satisfaction** (it cannot recommend a 3-year-lock-in ELSS to a short-horizon investor) and on **set-level diversification** (AMC and bucket caps), neither of which any single-criterion ranking can express. Whether it dominates on realized risk-adjusted return is **untested** — see §13.

---

## 9. Recommender-system classification **[IMPLEMENTED]**

The system is best classified as a **knowledge-based, constraint-plus-utility recommender with set-level diversification**, in the Burke taxonomy: primarily *knowledge-based* with a *utility-based* scoring layer, combined by **cascade** hybridization (constraints filter, then utility ranks).

Supporting evidence:

- **Knowledge-based / constraint-based:** explicit domain rule tables and a preference-consistency validator with auto-repair (`categoryMappings.ts:44-192`, `preferenceValidator.ts:44-147`). This is the Felfernig-style constraint-based paradigm, appropriate for high-stakes, low-frequency, no-interaction-history domains.
- **Utility-based (MAUT):** a fixed additive multi-attribute utility function with normalized attributes and hand-elicited weights (`scoringEngineV3.ts:255-263`).
- **Content-based (weak sense only):** items are scored from intrinsic attributes; but the user model is a declared categorical profile, not a learned interest vector, so it is *not* content-based filtering.
- **Context-aware:** only weakly — normalization statistics depend on the current universe, and the data refreshes over time, but no temporal, device, or situational context enters the score.
- **Collaborative filtering:** absent.
- **Portfolio-aware:** **absent in the recommendation path** (§10).
- **Cold-start behavior:** by construction, the system has no cold-start problem for users — it requires zero interaction history. This is a genuine and defensible advantage of the paradigm choice for this domain.

---

## 10. Portfolio-awareness audit **[IMPLEMENTED]**

**Finding: the recommendation model is not portfolio-aware.**

- `usePortfolio.tsx` is the only holdings accessor; it performs CRUD and computes a display summary (`:153-162`) and is imported by no engine file.
- `BuildPortfolio.tsx:417-427` passes only preferences and capacity inputs into `generateStrategyPortfolios`; holdings are not an argument.
- Consequently: existing holdings, current allocation, concentration, realized portfolio risk, realized portfolio return, fund overlap, category exposure and portfolio health **do not influence** which funds are recommended or how they are ranked. An investor holding nine large-cap funds receives the same dashboard recommendations as an identical investor holding nothing.

**Diversification is intra-recommendation only.** The AMC cap of 2, the per-bucket `maxFunds`, and the max-2-per-category shortfall rule (`intersectionEngine.ts:164-190`) diversify *within the newly proposed set*. The 40% single-fund concentration cap in `portfolioConstruction.ts:147-149` diversifies *within a newly constructed portfolio*. Neither consults prior holdings.

**Implication for the paper.** "Portfolio-aware recommendation" can be presented only as **[PROPOSED]** future work, formulated as an incremental objective:

$$
f^\ast = \arg\max_{f} \; \Bigl[\, S(f,u) \;-\; \lambda\,\mathrm{Overlap}\bigl(f, H_u\bigr) \;-\; \mu\,\Delta\mathrm{Concentration}\bigl(H_u \cup \{f\}\bigr)\Bigr]
$$

where $H_u$ is the current holdings set. Claiming this is implemented would be false.

---

## 11. Dynamics: does the recommendation change when data changes? **[IMPLEMENTED]**

**The model is dynamic in its inputs and stateless in its computation.** There are no stored recommendations; the ranked set is recomputed from scratch on every render of the dashboard whose `funds` or `profile` dependency changed (`Index.tsx:114-127`, a `useMemo`). Therefore any change in the underlying fund data propagates to the recommendation at the next computation, with no retraining, no versioning, and no persistence.

Data refresh path:

```text
OneDrive Excel workbook
   └─ sync-onedrive edge function
        · positional column maps per asset-class sheet (index.ts:26-56)
        · numeric coercion (:65-71); riskLevel (:89-104); strengthBadge from Sharpe (:106-111)
        · AMC via regex on scheme name (:117-129); rank by within-class Sharpe sort (:224-233)
        └─ Supabase fund_cache: cache_key ∈ {workbook_data, mf_data}, TTL 1 year (:239-255)
   └─ fetch-fund-data edge function
        · merges live AMFI NAVs (:12-83) → recaches mf_data, TTL 24 h (:213-227)
   └─ useFundCache hook (client)
        · localStorage mirror for instant load (:47-70)
        · staleness test (:9-33): refresh if IST now > 21:30 and last update < 21:30 today,
          or last update older than 24 h
        · on stale: sync-onedrive → fallback fetch-fund-data?action=full → fallback mfapi
   └─ Index.tsx useMemo → recommendFundsV2 → fresh ranking
```

**Refresh is client-driven, not scheduled.** `pg_cron` and `pg_net` are installed by migration `20260406015311_*.sql`, but no `cron.schedule(...)` call exists anywhere in the repository. Recomputation therefore occurs only when a user loads the dashboard after the staleness threshold. *Whether an external scheduler outside this repository invokes the sync function is not determinable from the current implementation.*

**Second-order dynamic effect worth noting in the paper:** because min–max extrema and category medians are recomputed over the current eligible universe on every call (`intersectionEngine.ts:239-240`), a data update changes not only the updated fund's score but the normalized scores of *every* fund. Rankings are therefore only ordinally stable under monotone universe-wide shifts, and score values are not comparable across data vintages.

---

## 12. Machine-learning audit **[IMPLEMENTED — strict]**

| Criterion | Present? | Evidence |
|---|---|---|
| Training dataset | No | No labeled dataset, no historical panel retained; only current cross-sectional snapshot in `fund_cache` |
| Train / validation / test split | No | No split logic anywhere |
| Fitted model artifact | No | No `.pkl`, ONNX, TF/PyTorch, or serialized coefficients in the repo |
| Parameters learned from data | No | All 7 weights, all thresholds, all multipliers are literals (`scoringEngineV3.ts:255-317`, `categoryMappings.ts:44-192`) |
| Supervised learning | No | No target variable is ever defined |
| Unsupervised learning | No | Grouping is by declared category label, not clustering |
| Reinforcement learning | No | No reward signal, no policy, no exploration |
| Model validation | No | No metric computation of any kind |
| Inference | No | Score evaluation is closed-form arithmetic, not model inference |
| Learned weights | No | See above |

> **The current recommendation methodology is not a trained machine-learning model.**

What it actually is: a **deterministic multi-attribute utility function evaluated under hard domain constraints**, with data-dependent *normalization* (category medians, population standard deviation, min–max extrema) computed per request. Data-dependent normalization is descriptive statistics, not learning: nothing is estimated against a target, and nothing is retained between requests except a within-session memo (`scoringEngineV3.ts:28-33`).

**Minimum changes required to make it genuinely ML** (all currently absent):
1. Persist a **historical panel** of fund attributes with as-of timestamps, so features can be constructed strictly from information available at time $t$.
2. Define a **target**: e.g. forward 3-year risk-adjusted excess return over category, or a binary top-quartile-persistence label.
3. Construct **point-in-time features** with no look-ahead, including delisted/merged funds to avoid survivorship bias.
4. Adopt a **temporal split** (walk-forward), never a random split.
5. Fit a model (§19), validate it out-of-sample, and compare against the current hand-tuned utility as the incumbent baseline.

---

## 13. Evaluation framework **[PROPOSED — nothing below is implemented or measured]**

No evaluation exists in the codebase: no precision/recall/F1, no NDCG/MAP/MRR/hit-rate, no backtest, no benchmark comparison, no user feedback capture. **No results may be reported for the current system.** The following framework is designed for the paper.

Because there is no ground-truth relevance label, evaluation must be **two-track**.

### Track A — Financial outcome evaluation (primary)

Treat the recommendation as a portfolio-formation rule and evaluate the *realized* out-of-sample outcome.

- **Formation:** at each rebalance date $t$, run Algorithm 1 using only data observable at $t$; hold the equal-weighted top-9 for horizon $H$.
- **Metrics** on the realized out-of-sample path: annualized return; volatility; Sharpe; Sortino; maximum drawdown; Calmar; tracking error and information ratio against a category-matched benchmark; turnover; and the fraction of periods with negative excess return.
- **Personalization validity:** for each of the 3×4×3 = 36 preference cells, verify that realized volatility is monotone non-decreasing in stated risk tolerance. This is the single most important test — it checks whether personalization does what it claims.

### Track B — Ranking / conformance evaluation (secondary)

Define pseudo-relevance labels post hoc: a fund is *relevant* at $t$ for horizon $H$ if its realized $H$-period risk-adjusted return falls in the top quartile of its category. Then report NDCG@9, Precision@9, MAP and MRR over the eligible set.

### Track C — Constraint-conformance audit (deterministic, cheap, and fully defensible)

Assert, over all 36 preference cells × all data vintages:
- zero recommendations violating any hard constraint of the cell;
- fallback-relaxation frequency (how often is the goal constraint silently dropped?);
- unpersonalized-fallback frequency (how often does `Index.tsx:126` return `funds.slice(0,9)`?);
- feasible-set cardinality distribution per cell;
- coverage: fraction of the 2,000-fund universe ever recommendable, and Gini concentration of recommendation frequency across funds and AMCs.

Track C requires no market data and can be reported as a rigorous, honest result today.

---

## 14. Experimental design **[PROPOSED]**

**Dataset.** Monthly (or quarterly) snapshots of the Indian open-ended scheme universe over a period spanning at least one full regime change — a 2013–2025 window covers the 2013 taper shock, 2018 credit-fund crisis (essential for testing the credit-penalty term), the 2020 COVID drawdown and recovery, and the 2022 rate cycle. Snapshots **must include funds that later merged, wound up, or were delisted**, otherwise the entire study is survivorship-contaminated.

**Protocol.** Strict walk-forward: at each $t$, features from $[t-36\text{m}, t]$ only; evaluation on $(t, t+H]$ for $H \in \{1, 3, 5\}$ years; roll forward; never re-use future data for normalization (note that the current implementation's universe-wide min–max normalization is trivially point-in-time-safe, since it uses only cross-sectional data — this is one thing the design gets right for free).

**Simulated investor cohorts.** Enumerate all 36 preference cells; for the capacity engine, sample capacity inputs to cover $\hat K \in \{1,\dots,5\}$. Report per-cell and pooled results.

**Statistical testing.** Paired comparisons of strategy returns against each baseline using stationary bootstrap (Politis–Romano) for time-series dependence; Ledoit–Wolf test for Sharpe-ratio differences; Diebold–Mariano where applicable; Benjamini–Hochberg FDR control across the 36 cells to avoid selection over cohorts. Report effect sizes, not only p-values.

**Robustness.** Vary $K \in \{5,9,15\}$; vary the AMC cap; vary the rebalance frequency; add realistic transaction costs and exit loads; recompute with the NA-imputation policy switched from category-median to listwise deletion; perturb each weight by ±25%.

---

## 15. Baselines **[PROPOSED]**

| # | Baseline | Definition | What its comparison isolates |
|---|---|---|---|
| B0 | Random | Uniform sample of 9 from the eligible set | Floor; tests whether scoring adds anything at all |
| B1 | Random from full universe | Ignores constraints too | Isolates the value of the constraint layer alone |
| B2 | Return-only | Top-9 by $r_{3Y}$ | Value of risk adjustment |
| B3 | Sharpe-only | Top-9 by Sharpe | Value of the additional six factors |
| B4 | Low-volatility-only | Bottom-9 by $\sigma$ | Value of the return terms |
| B5 | Expense-only | Bottom-9 by TER | Strength of the cost anomaly alone |
| B6 | Category average | Category-median fund per bucket | Value of within-category discrimination |
| B7 | Equal-weight multi-factor | Same 7 sub-scores with $w_i = 1/7$ | Whether the specific hand-tuned weights matter |
| B8 | Passive index | Broad-market index fund, cost-adjusted | The economically decisive benchmark |
| B9 | Learned LTR model | §19 | Headroom available from learning |

B7 and B8 are the two that matter most. If the model cannot beat B7, the weight elicitation contributes nothing and should be reported as such. If it cannot beat B8 net of costs, that must be reported too.

---

## 16. Ablation study **[PROPOSED]**

Each ablation removes one component and re-runs the full walk-forward protocol.

| Ablation | Operationalization | Question answered |
|---|---|---|
| A1 no return terms | $w_2 = w_3 = 0$, renormalize | Do return factors add realized value or only backward-looking noise? |
| A2 no risk terms | $w_1 = w_4 = w_5 = 0$ | How much drawdown protection do the risk terms actually buy? |
| A3 no cost term | $w_6 = 0$ | Is the expense-ratio effect the dominant real driver? |
| A4 no consistency | $w_3 = 0$ | Is the consistency proxy informative or is it noise given its dimensional defect (§3.4)? |
| A5 no constraint layer | Score the full universe | The core claim of a knowledge-based recommender rests here |
| A6 no personalization | Fix all investors to one profile | Does personalization change realized outcomes, or only labels? |
| A7 no diversification | Take the raw top-9 | Cost in score vs. benefit in realized portfolio variance |
| A8 no AMC cap | Remove the max-2 rule | Concentration/reputation trade-off |
| A9 no credit penalty | $\pi = 0$, $\kappa = 1$ | Best evaluated on the 2018 credit-crisis window specifically |
| A10 no median imputation | Listwise-delete NA funds | Sensitivity of results to the NA policy; also measures how many funds are ranked on largely imputed evidence |
| A11 Sortino de-imputation | Use only observed Sortino | Tests the §8 concern that the 30% term is often a rescaled Sharpe |

A10 and A11 are the most diagnostic for this particular implementation and should be foregrounded.

---

## 17. Explainability **[IMPLEMENTED + PROPOSED]**

### 17.1 What exists

The scorer emits natural-language reason strings alongside the score (`scoringEngineV3.ts:288-306`), triggered by fixed thresholds: Sortino > 2 or > 1.2; category-relative $z$ > 1 or > 0.5; consistency > 0.7; TER < 0.5; $\sigma$ < 5; AUM > 10000; nonzero credit penalty; conservative + debt; ELSS. Plus three categorical labels (`match`, `downside`, `suitability`, §6.5). These are **post-hoc threshold triggers, not contribution measures** — a reason may fire on a term that contributed little, and a decisive term may produce no reason.

### 17.2 Structural transparency

The model is nonetheless **fully white-box and exactly decomposable**. Unlike a learned model, no approximation (LIME/SHAP) is needed: the contribution of factor $i$ to the final score is available in closed form.

### 17.3 Proposed explanation framework **[PROPOSED]**

Report, per recommended fund:

$$
\underbrace{c_i(f) = 100\,(1-\pi)\,\kappa\,\beta\, w_i s_i(f)}_{\text{exact additive contribution, } \sum_i c_i = S}
$$

together with:
- **Penalty attribution:** $S_0 \to S$ decomposed multiplicatively into credit, DT-CR and beginner factors, each expressed as points lost.
- **Peer attribution:** $z_c(f)$ and the fund's percentile within its category, distinguishing "good fund" from "good category".
- **Constraint provenance:** which of the five filters the fund survived, and *whether relaxation occurred* — the fallback cascade (`intersectionEngine.ts:199-213`) must be surfaced to the user, since a relaxed recommendation silently violates a stated goal.
- **Evidence quality flag:** the fraction of the seven sub-scores that were imputed rather than observed. Given §3.1, this is the single most important disclosure for user trust and is currently absent.
- **Counterfactual:** the smallest preference change that would admit or exclude the fund.

---

## 18. Limitations and biases **[of the IMPLEMENTED model]**

Only issues the code actually exhibits are listed.

**Data and estimation**
1. **Survivorship bias.** The universe is the currently-listed set; merged and wound-up schemes are absent, so any historical claim built on it is upward-biased.
2. **Historical-performance bias.** Every return, Sharpe, Sortino and volatility input is backward-looking; the model implicitly assumes persistence, which is weak for equity return and strong mainly for cost.
3. **Point-in-time snapshot only.** No historical panel is retained, so look-ahead-free evaluation is impossible today, and no backtest can be run against the deployed system as-is.
4. **Positional workbook parsing.** Columns are read by fixed index per sheet (`sync-onedrive/index.ts:26-56`); any column reordering in the source workbook silently corrupts every downstream feature. This failure mode has occurred in this project.
5. **Regex-derived AMC.** The diversification cap depends on an AMC extracted by pattern-matching scheme names (`:117-129`); misparses silently weaken the constraint.

**Methodological**
6. **Unvalidated weights.** The vector $(0.30, 0.20, 0.15, 0.10, 0.10, 0.10, 0.05)$ has no stated elicitation procedure and no empirical support in the repository.
7. **Sortino imputation concentration.** When Sortino is NA — common — the 30% term becomes a category median or a fixed multiple of Sharpe, so the model's dominant factor may be largely a rescaling of a 10% factor, inflating apparent factor diversity.
8. **Redundant risk factors.** Sharpe, Sortino and low-volatility share the same denominator construct; the effective weight on "low risk" exceeds the nominal 10%.
9. **Drawdown is never measured.** `maxDrawdown` constraints are applied to volatility (`intersectionEngine.ts:75-78`), and displayed downside risk uses $2.5\sigma$ (`scoringEngineV3.ts:117-121`). No drawdown figure in the system is an observed drawdown.
10. **Dimensional inconsistency in the consistency term** (§3.4).
11. **Context-dependent normalization.** Min–max extrema are taken over the post-filter set, so scores are not comparable across investors or across data vintages; only within-list ordering is meaningful.
12. **Small-category instability.** Population $\sigma_c$ over a handful of funds, floored at 1, makes $z_c$ unstable in thin categories.
13. **Missingness is treated as ignorable.** Filters skip NA values entirely, so a fund with no reported volatility can pass a conservative investor's volatility cap. Data missingness is plausibly correlated with fund quality and age, making this non-ignorable.
14. **Silent constraint relaxation.** The fallback cascade can return funds violating the stated goal or horizon with no user-visible signal (`:199-213`).
15. **Unpersonalized last resort.** `Index.tsx:126` can return the first nine cached funds with no filtering or scoring at all.
16. **Greedy set construction.** Bucket order is declaration order, so earlier buckets consume the AMC budget; the returned set is not the score-maximizing feasible set.
17. **No portfolio awareness** (§10).
18. **No feedback loop.** No click, adoption, retention or realized-outcome signal is captured, so the system cannot improve and cannot be evaluated on user response.
19. **Static regime assumption.** Constants are fixed; the model cannot adapt to a rate or volatility regime change except through its inputs.
20. **Implementation-fidelity defect.** The `advanced` / `experienced` key mismatch (§4.3).

**Not applicable / explicitly absent risks**
- *Overfitting in the statistical sense* does not apply — nothing is fitted. The analogous risk is **manual overfitting** of constants to the authors' priors, which is undetectable without §13–16.
- *Data leakage* does not apply to the live scoring path, which is purely cross-sectional. It would become the central risk the moment a learned model (§19) is introduced.

---

## 19. Evolution to a genuine ML recommender **[PROPOSED]**

**Current → limitation → proposal.**

| Candidate | Fit to this problem | Required data | Target | Notes |
|---|---|---|---|---|
| **Learning-to-rank (LambdaMART)** | **Strongest fit.** The problem is natively a ranking problem with a natural query = investor profile | Panel of point-in-time features per fund, grouped by (profile, date) | Graded relevance from forward risk-adjusted category-relative return | Directly optimizes NDCG; keeps the constraint layer intact as a pre-filter |
| Gradient boosting (XGBoost/LightGBM) regression | Strong | Same panel | Forward $H$-period Sortino or excess return | Simplest credible first model; pointwise, ignores set effects |
| Random Forest | Adequate baseline | Same | Same | Useful mainly as a robustness check |
| Neural recommender (two-tower) | **Poor fit now** | Requires large interaction logs that do not exist | — | Only viable after substantial adoption data |
| Context-aware (factorization machines) | Moderate | Interaction logs + context | Adoption | Blocked on the same missing logs |
| Reinforcement learning | **Not advisable** | Long-horizon reward, safe off-policy evaluation | Long-run investor utility | Reward is delayed by years; exploration on real money is ethically and legally untenable in a SEBI-regulated context |

**Recommended architecture: hybrid, keeping the constraints.** The hard-constraint layer must survive any ML migration — it encodes statutory and suitability rules (ELSS lock-in, risk suitability) that a learned model must never be free to violate. The correct design is:

$$
\text{ML ranker over } \mathcal{C}(u), \quad\text{with}\quad \hat{S}(f,u) = \text{LTR}\bigl(z_f, x_u, \text{context}_t\bigr)
$$

i.e. learning replaces the *utility function*, never the *feasibility predicate*. The current hand-tuned $S$ then becomes the incumbent baseline (B7's stronger sibling) that the learned model must beat out-of-sample, walk-forward, net of costs.

**Prerequisite data engineering, in order:** (1) begin persisting timestamped snapshots immediately — this is the binding constraint on all future ML work and every month not captured is permanently lost; (2) include dead funds; (3) instrument user-facing recommendation impressions and adoptions; (4) record realized outcomes for recommended sets.

---

## 20. Defensible research contributions **[assessment]**

Stated conservatively. Each claim is marked defensible or not.

| Claim type | Defensible now | Comment |
|---|---|---|
| **Methodological** | Partly | A formalization of mutual-fund recommendation as *constraint satisfaction followed by multi-attribute utility with set-level diversification* is a legitimate, precisely-specified contribution. Claiming novelty of the paradigm is **not** defensible — knowledge-based recommenders are well established. The contribution is the **domain instantiation**: a complete, published, reproducible constraint table set for the Indian mutual-fund universe (SEBI category taxonomy → suitability rules). That artifact is genuinely useful and rarely published. |
| **Personalization** | Conditional | Defensible *only* if §13 Track C is run and shows the 36 preference cells produce materially different, constraint-conformant recommendation sets. Without it, personalization is asserted, not shown. Any claim that personalization improves investor outcomes requires Track A. |
| **Portfolio-aware** | **Not defensible** | The system is not portfolio-aware (§10). This must be presented as proposed future work only. |
| **Financial-risk** | Partly | The explicit downside-risk-dominant weighting and the credit-quality penalty are defensible *design* contributions. Any claim that they reduce realized drawdown requires the §16 A2/A9 ablations. |
| **Engineering** | Yes | A reproducible, fully white-box, zero-cold-start, sub-200 ms client-side pipeline over ~2,000 schemes with an explicit NA-propagation policy and constraint-relaxation cascade is a real, reportable systems contribution — provided the limitations in §18 are stated. |
| **Empirical** | **None yet** | No evaluation exists. No performance, accuracy or outcome claim of any kind can be made from the current implementation. |

**Claims to avoid explicitly:** calling the system machine learning, AI-driven, learned, trained, or predictive; reporting any accuracy figure; asserting portfolio-awareness; asserting superiority over passive indexing.

---

## 21. Condensed technical specification

**Problem.** Constrained personalized ranking of mutual-fund schemes; output = ordered set of ≤ 9 schemes, or a weighted portfolio summing to 100%.

**Inputs.** Investor: 5 categorical preferences (+6 capacity variables in the builder path). Fund: 12 consumed numeric/categorical attributes from a workbook + AMFI NAV. Portfolio: **none consumed**.

**Features.** 7 normalized sub-scores: Sortino, category-relative 3Y CAGR z-score, multi-period consistency proxy, Sharpe, inverse volatility, inverse expense ratio, AUM.

**Preprocessing.** `'--'`/null → NA; NA excluded from category aggregates, imputed at scoring by category median or the neutral constant 0.5, and skipped by all filter thresholds. Min–max normalization over the post-filter universe; category-wise z-scoring for return; heuristic imputation of Sortino ($1.1\times$ or $1.4\times$ Sharpe) and drawdown ($2.5\sigma$).

**Formulation.**
$$S(f,u)=100\,(1-\pi(f))\,\kappa(f,u)\,\beta(f,u)\bigl(0.30 s_1+0.20 s_2+0.15 s_3+0.10 s_4+0.10 s_5+0.10 s_6+0.05 s_7\bigr)$$

**Algorithm.** Blacklist → 5 sequential hard filters → cascading relaxation if empty → per-request category and universe statistics → score → global sort → greedy allocation-bucket fill under `maxFunds`, AMC ≤ 2, category ≤ 2 → truncate to 9.

**Personalization.** Constraint-set restriction (5 tables), sectoral gating and beginner penalties by experience, allocation-model selection by risk × goal, DT-CR suppression by risk × horizon, and a $\min(\text{stated}, \text{capacity})$ risk downgrade in the builder path. **Scoring weights are invariant across investors.**

**Portfolio-awareness.** None.

**Output.** Ranked funds with score, `matchLevel`, `downsideRisk`, `suitabilityBadge`, and threshold-triggered reason strings; or named strategy portfolios with exact-100% allocations.

**Evaluation.** None implemented. Proposed: financial walk-forward backtest, pseudo-relevance ranking metrics, and a constraint-conformance audit, against 10 baselines with 11 ablations.

**Limitations.** Survivorship bias; backward-looking inputs; unvalidated hand-set weights; Sortino imputation concentrating the dominant factor; drawdown never measured; NA treated as ignorable; silent constraint relaxation; context-dependent normalization; greedy non-optimal set construction; no portfolio awareness; no feedback loop.

**Classification.** Knowledge-based constraint-based recommender cascaded with a utility-based (MAUT) scorer and set-level diversification. **Not machine learning.**

**Future ML.** Learning-to-rank (LambdaMART) or gradient-boosted regression replacing the utility function only, with the constraint layer retained as a hard pre-filter, trained on a point-in-time survivorship-free panel under walk-forward validation.

---

### Source index

`src/utils/recommendation/intersectionEngine.ts` · `scoringEngineV3.ts` · `categoryMappings.ts` · `riskCapacity.ts` · `preferenceValidator.ts` · `portfolioConstruction.ts` · `strategyPortfolioEngine.ts` · `src/utils/recommendationEngine.ts` (dead) · `src/types/mutualFund.ts` · `src/hooks/useFundCache.tsx` · `src/hooks/usePortfolio.tsx` · `src/pages/Index.tsx` · `src/pages/Onboarding.tsx` · `src/components/dashboard/BuildPortfolio.tsx` · `supabase/functions/sync-onedrive/index.ts` · `supabase/functions/fetch-fund-data/index.ts`
