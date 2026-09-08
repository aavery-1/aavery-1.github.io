"""
Core geospatial eligibility logic for the Florida Schools of Hope site tool.

Given Persistently Low-Performing School (PLPS) locations and a statewide FDOR
parcel layer, this:
  1. buffers each PLPS by 5 miles (in a projected CRS, so miles are real miles),
  2. finds every parcel intersecting that buffer,
  3. keeps only parcels whose FDOR use code is on the sole-occupancy
     "fast-track" (rezoning-exempt) list.

Run:  python spatial_join.py --plps data/plps.shp --parcels data/parcels.shp \
                             --out data/soh_candidate_parcels.gpkg

CRS note: buffering and distance MUST happen in a planar, meter-based CRS.
We use EPSG:3086 (Florida GDL Albers, meters). Storage/serving stays EPSG:4326.

LEGAL note: BUFFER_MILES and FAST_TRACK_DOR_CODES encode a reading of
F.S. 1002.333 and Rule 6A-1.0998271 (2025 GAA expansion, amended Feb 2026).
VERIFY both before use; the DOR codes especially must match the current DOR
Uniform Use Code table. See ../SCHOOLS_OF_HOPE_LEGAL_BASIS.md.
"""

from __future__ import annotations

import argparse

import geopandas as gpd
import pandas as pd

WGS84 = "EPSG:4326"
FL_ALBERS_M = "EPSG:3086"        # Florida GDL Albers, units = meters
METERS_PER_MILE = 1609.344
BUFFER_MILES = 5.0

# FDOR two-digit use codes that qualify for the fast-track pathway. VERIFY.
# (Best-known DOR_UC values; see backend/schema.sql for the same caveat.)
FAST_TRACK_DOR_CODES: dict[str, str] = {
    "71": "Churches / religious facilities",
    "72": "Private schools and colleges",
    "79": "Cultural organizations / museums",
    "75": "Non-profit / charitable / community services",
    "32": "Enclosed theaters / auditoriums / cinemas",
    "84": "Colleges (public)",
}


def eligibility_buffer(plps: gpd.GeoDataFrame, miles: float = BUFFER_MILES) -> gpd.GeoDataFrame:
    """Return one dissolved 5-mile buffer polygon layer around the PLPS.

    Buffers in EPSG:3086 so the radius is a true ground distance, then returns
    the result in WGS84. If PLPS geometries are property polygons rather than
    points, the buffer is measured from the property line automatically.
    """
    projected = plps.to_crs(FL_ALBERS_M)
    buffered = projected.copy()
    buffered["geometry"] = projected.geometry.buffer(miles * METERS_PER_MILE)
    return buffered.to_crs(WGS84)


def fast_track_parcels_in_buffer(
    parcels: gpd.GeoDataFrame,
    buffers: gpd.GeoDataFrame,
    dor_col: str = "DOR_UC",
) -> gpd.GeoDataFrame:
    """Parcels that intersect any eligibility buffer AND carry a fast-track code."""
    if parcels.crs is None:
        raise ValueError("parcels layer has no CRS; set it before joining")
    parcels = parcels.to_crs(WGS84)

    # Dissolve every PLPS buffer into one coverage so a parcel intersecting
    # several buffers is counted once (no post-join dedup needed). The spatial
    # index on the parcel layer keeps this fast on a statewide table.
    coverage = gpd.GeoDataFrame(geometry=[buffers.to_crs(WGS84).union_all()], crs=WGS84)
    in_zone = gpd.sjoin(parcels, coverage, how="inner", predicate="intersects")
    in_zone = in_zone.drop(columns=[c for c in in_zone.columns if c.startswith("index_right")])

    codes = in_zone[dor_col].astype(str).str.strip().str.zfill(2)
    mask = codes.isin(FAST_TRACK_DOR_CODES)
    eligible = in_zone[mask].copy()
    eligible["use_type"] = codes[mask].map(FAST_TRACK_DOR_CODES)
    return eligible


def main() -> None:
    ap = argparse.ArgumentParser(description="SOH fast-track parcel eligibility join")
    ap.add_argument("--plps", required=True, help="PLPS points or property polygons (any OGR format)")
    ap.add_argument("--parcels", required=True, help="FDOR parcels layer (any OGR format)")
    ap.add_argument("--dor-col", default="DOR_UC", help="parcel use-code column (default DOR_UC)")
    ap.add_argument("--miles", type=float, default=BUFFER_MILES)
    ap.add_argument("--out", default="soh_candidate_parcels.gpkg")
    args = ap.parse_args()

    plps = gpd.read_file(args.plps)
    parcels = gpd.read_file(args.parcels)
    print(f"loaded {len(plps)} PLPS features, {len(parcels)} parcels")

    buffers = eligibility_buffer(plps, args.miles)
    candidates = fast_track_parcels_in_buffer(parcels, buffers, args.dor_col)
    print(f"{len(candidates)} fast-track candidate parcels within {args.miles} mi of a PLPS")
    print(candidates["use_type"].value_counts().to_string())

    candidates.to_file(args.out, driver="GPKG")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
