"""
Facility Utilization Rate (FUR) and mandatory co-location eligibility.

Under the co-location pathway (2025 General Appropriations Act expansion of
F.S. 1002.333, implemented by Rule 6A-1.0998271 and amended by the State Board
in Feb 2026 - VERIFY; NOT "SB 2510"), a district must make an under-used public
school available to a Schools of Hope operator. A school is flagged eligible
when EITHER:
  - FUR < FUR_MAX_PCT (default 75%; the rule reads "utilization rate under 75%"), OR
  - surplus student stations >= SURPLUS_SEATS_MIN (default 400).

FUR = current FTE enrollment / FISH satisfactory student-station capacity * 100.

The rule adds a non-capacity criterion the caller must apply separately: the
school must be MORE THAN 4 YEARS OLD. That belongs at the spatial/join stage
(see backend/schema.sql soh_colocation_targets), not in this FUR function.

These thresholds and the choice of "satisfactory" (vs. permanent) capacity
encode a reading of the statute/rule; keep them as arguments so a corrected
reading is a call-site change, not a rewrite. See ../SCHOOLS_OF_HOPE_LEGAL_BASIS.md.
"""

from __future__ import annotations

import pandas as pd

FUR_MAX_PCT = 75.0
SURPLUS_SEATS_MIN = 400


def colocation_eligibility(
    fish: pd.DataFrame,
    enrollment: pd.DataFrame,
    *,
    key: str = "msid",
    capacity_col: str = "satisfactory_capacity",
    enrollment_col: str = "fte_enrollment",
    fur_max_pct: float = FUR_MAX_PCT,
    surplus_seats_min: int = SURPLUS_SEATS_MIN,
) -> pd.DataFrame:
    """Join FISH capacity to enrollment, compute FUR + surplus, flag eligibility.

    Returns every school (not just the eligible ones) with `fur_pct`,
    `surplus_seats`, `eligible`, and `eligible_reason` columns, sorted with the
    eligible schools first. Callers that want only eligible rows can filter on
    `.eligible`. Rows with zero/blank capacity get FUR = NaN and are treated as
    not eligible (never a divide-by-zero, never a fake 0%).
    """
    merged = fish.merge(enrollment[[key, enrollment_col]], on=key, how="left", suffixes=("", "_enr"))
    # If the fish frame already carried an enrollment column, the merge suffixes
    # the freshly-joined one as `_enr`; otherwise it lands under its own name.
    enr = merged[f"{enrollment_col}_enr"] if f"{enrollment_col}_enr" in merged.columns else merged[enrollment_col]

    cap = pd.to_numeric(merged[capacity_col], errors="coerce")
    enr = pd.to_numeric(enr, errors="coerce")

    fur = (enr / cap.where(cap > 0) * 100).round(1)
    surplus = (cap - enr)

    under_fur = fur < fur_max_pct
    over_surplus = surplus >= surplus_seats_min
    eligible = (under_fur | over_surplus).fillna(False)

    reason = pd.Series("", index=merged.index, dtype="object")
    reason[under_fur.fillna(False)] = f"FUR < {fur_max_pct:g}%"
    reason[over_surplus.fillna(False) & ~under_fur.fillna(False)] = f">= {surplus_seats_min} surplus stations"
    reason[under_fur.fillna(False) & over_surplus.fillna(False)] = f"FUR < {fur_max_pct:g}% and >= {surplus_seats_min} surplus stations"

    out = merged.copy()
    out["fur_pct"] = fur
    out["surplus_seats"] = surplus
    out["eligible"] = eligible
    out["eligible_reason"] = reason
    return out.sort_values(["eligible", "fur_pct"], ascending=[False, True]).reset_index(drop=True)


if __name__ == "__main__":
    # Minimal smoke check with illustrative numbers.
    fish = pd.DataFrame({
        "msid": ["13-0001", "13-0002", "13-0003", "13-0004"],
        "satisfactory_capacity": [1000, 800, 1200, 0],
    })
    enr = pd.DataFrame({
        "msid": ["13-0001", "13-0002", "13-0003", "13-0004"],
        "fte_enrollment": [700, 780, 700, 300],   # 70% | 97.5% but 20 surplus | 58% + 500 surplus | no cap
    })
    res = colocation_eligibility(fish, enr)
    print(res[["msid", "fur_pct", "surplus_seats", "eligible", "eligible_reason"]].to_string(index=False))
