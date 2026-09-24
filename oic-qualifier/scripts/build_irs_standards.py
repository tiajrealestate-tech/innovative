#!/usr/bin/env python3
"""Build the versioned 2026 IRS standards data used by the HERtaxpro OIC qualifier."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


STATES = [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
    "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia",
    "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
    "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
    "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
    "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
    "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Puerto Rico", "Rhode Island",
    "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
    "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
]


def parse_housing(text_path: Path) -> list[dict]:
    state_pattern = "|".join(re.escape(state) for state in sorted(STATES, key=len, reverse=True))
    row_pattern = re.compile(
        rf"^(?P<county>.+?)\s{{2,}}(?P<state>{state_pattern})\s+"
        r"(?P<one>[\d,]+)\s+(?P<two>[\d,]+)\s+(?P<three>[\d,]+)\s+"
        r"(?P<four>[\d,]+)\s+(?P<five>[\d,]+)\s*$"
    )
    rows: list[dict] = []
    previous_line = ""
    for raw_line in text_path.read_text(encoding="utf-8").splitlines():
        match = row_pattern.match(raw_line)
        if not match:
            previous_line = raw_line.strip()
            continue
        county = match.group("county").strip()
        if county in {"Region", "Planning Region"} and previous_line and not any(char.isdigit() for char in previous_line):
            county = f"{previous_line} {county}"
        values = {key: int(match.group(key).replace(",", "")) for key in ("one", "two", "three", "four", "five")}
        rows.append(
            {
                "state": match.group("state"),
                "county": county,
                "family1": values["one"],
                "family2": values["two"],
                "family3": values["three"],
                "family4": values["four"],
                "family5Plus": values["five"],
            }
        )
        previous_line = ""

    keys = [(row["state"], row["county"]) for row in rows]
    if len(rows) < 3000:
        raise RuntimeError(f"Expected more than 3,000 county rows; parsed {len(rows)}")
    if len(keys) != len(set(keys)):
        raise RuntimeError("Duplicate state/county rows detected")
    return rows


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build_irs_standards.py HOUSING_TEXT OUTPUT_JSON")

    housing_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    output_path.parent.mkdir(parents=True, exist_ok=True)

    dataset = {
        "version": "2026.06.29",
        "effectiveDate": "2026-06-29",
        "reviewBy": "2027-06-01",
        "sources": {
            "collectionFinancialStandards": "https://www.irs.gov/businesses/small-businesses-self-employed/collection-financial-standards",
            "national": "https://www.irs.gov/pub/irs-sbse/national-standards.pdf",
            "healthcare": "https://www.irs.gov/pub/irs-sbse/out-of-pocket-health-care.pdf",
            "housing": "https://www.irs.gov/pub/irs-sbse/all-states-housing-standards.pdf",
            "transportation": "https://www.irs.gov/pub/irs-sbse/transportation-standards.pdf",
            "offerBooklet": "https://www.irs.gov/pub/irs-pdf/f656b.pdf",
            "officialPreQualifier": "https://www.irs.gov/oictool",
        },
        "nationalFoodClothingMisc": {
            "family1": 867,
            "family2": 1558,
            "family3": 1857,
            "family4": 2176,
            "eachAdditionalOver4": 397,
        },
        "outOfPocketHealthcarePerPerson": {"under65": 90, "age65Plus": 163},
        "transportation": {
            "publicTransportation": 220,
            "ownership": {"oneCar": 703, "twoCars": 1406},
            "operating": {
                "Northeast Region": {"oneCar": 330, "twoCars": 660},
                "Boston": {"oneCar": 347, "twoCars": 694},
                "New York": {"oneCar": 417, "twoCars": 834},
                "Philadelphia": {"oneCar": 344, "twoCars": 688},
                "Midwest Region": {"oneCar": 263, "twoCars": 526},
                "Chicago": {"oneCar": 334, "twoCars": 668},
                "Cleveland": {"oneCar": 263, "twoCars": 526},
                "Detroit": {"oneCar": 344, "twoCars": 688},
                "Minneapolis-St. Paul": {"oneCar": 260, "twoCars": 520},
                "St. Louis": {"oneCar": 269, "twoCars": 538},
                "South Region": {"oneCar": 291, "twoCars": 582},
                "Atlanta": {"oneCar": 319, "twoCars": 638},
                "Baltimore": {"oneCar": 299, "twoCars": 598},
                "Dallas-Ft. Worth": {"oneCar": 339, "twoCars": 678},
                "Houston": {"oneCar": 361, "twoCars": 722},
                "Miami": {"oneCar": 423, "twoCars": 846},
                "Tampa": {"oneCar": 320, "twoCars": 640},
                "Washington, D.C.": {"oneCar": 301, "twoCars": 602},
                "West Region": {"oneCar": 299, "twoCars": 598},
                "Anchorage": {"oneCar": 248, "twoCars": 496},
                "Denver": {"oneCar": 332, "twoCars": 664},
                "Honolulu": {"oneCar": 279, "twoCars": 558},
                "Los Angeles": {"oneCar": 365, "twoCars": 730},
                "Phoenix": {"oneCar": 348, "twoCars": 696},
                "San Diego": {"oneCar": 349, "twoCars": 698},
                "San Francisco": {"oneCar": 355, "twoCars": 710},
                "Seattle": {"oneCar": 288, "twoCars": 576},
            },
        },
        "assetAdjustments": {
            "cashExclusion": 1000,
            "quickSaleMultiplier": 0.8,
            "vehicleExclusionPerEligibleVehicle": 3450,
            "personalEffectsExclusion": 11980,
        },
        "offerMultipliers": {"lumpSumFiveMonthsOrLess": 12, "periodicSixToTwentyFourMonths": 24},
        "housing": parse_housing(housing_path),
    }

    output_path.write_text(json.dumps(dataset, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(dataset['housing'])} housing rows to {output_path}")


if __name__ == "__main__":
    main()
