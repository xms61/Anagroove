# SpotySpice Database Validation & Analytics Report

*Generated on: 2026-09-19T14:17:44.148Z*  
*Database Path: `C:\Users\xms\Documents\Projects\SpotySpice\server\data\catalog.sqlite`*

---

## 1. Executive Health Summary

| Diagnostic Domain | Status | Key Observation |
| :--- | :---: | :--- |
| **SQLite Structural Integrity** | ✅ PASS | `PRAGMA integrity_check` & `quick_check` returned `ok` |
| **Foreign Key Constraints** | ✅ PASS | 0 foreign key constraint violations |
| **Referential Integrity** | ✅ PASS | Orphan tracks: 0, Orphan samples: 0, Orphan providers: 0 |
| **Audio Sample Coverage** | ✅ HEALTHY | **99.36%** of tracks have verified playback preview samples |
| **Cross-Provider Referencing** | ✅ HEALTHY | **6.473** tracks (1.29%) multi-linked across providers |
| **Semantic Deduplication** | ✅ CLEAN | **0** soft duplicate candidate clusters identified |
| **Language & Geographic Scope** | ✅ DIVERSE | **11** distinct languages, **20+** ISRC country codes |

---

## 2. Catalog Scale & Inventory Breakdown

| Metric Dimension | Total Count | Relative Share / Context |
| :--- | :---: | :--- |
| **Total Canonical Tracks** | **500.097** | 100.0% of core music index |
| **Total Unique Artists** | **94.117** | Average ~5.3 tracks per artist |
| **Verified Audio Samples** | **496.890** | 99.36% coverage |
| **External Provider Identifiers** | **570.435** | Deezer, Spotify, iTunes links |
| **Multi-Provider Unified Tracks** | **6.473** | 1.29% catalog unification rate |

### Audio Codec Distribution
| Audio Codec | Sample Count | Share |
| :--- | :---: | :---: |
| `mp3` | 496.887 | 100.0% |
| `aac` | 3 | 0.0% |

### External Provider Breakdown
| Provider Source | Ingested Links | Distinct Tracks Linked |
| :--- | :---: | :---: |
| **DEEZER** | 560.528 | 489.203 |
| **SPOTIFY** | 9.904 | 9.858 |
| **ITUNES** | 3 | 3 |

---

## 3. Linguistic & Geographic Distribution

### Detected Languages
| Language Code | Language Family | Track Count | Percentage |
| :---: | :--- | :---: | :---: |
| `en` | English / Western | 465.147 | **93.01%** |
| `es` | Spanish (Latin / Iberian) | 14.597 | **2.92%** |
| `de` | German | 7.649 | **1.53%** |
| `fr` | French | 7.534 | **1.51%** |
| `pt` | Portuguese (Brazilian / Bossa Nova) | 2.670 | **0.53%** |
| `ja` | Japanese (Kanji / Kana / Romaji) | 572 | **0.11%** |
| `it` | Italian | 569 | **0.11%** |
| `ru` | Russian / Cyrillic | 458 | **0.09%** |
| `zh` | Chinese (Hanzi / Mandopop) | 452 | **0.09%** |
| `ko` | Korean (Hangul / K-Pop) | 427 | **0.09%** |
| `ar` | Arabic | 22 | **0%** |

### Top 20 ISRC Country Codes
| Rank | ISO Country Code | Track Count | Catalog Share |
| :---: | :---: | :---: | :---: |
| #1 | `US` | 132.062 | 26.41% |
| #2 | `GB` | 61.347 | 12.27% |
| #3 | `FR` | 37.709 | 7.54% |
| #4 | `QZ` | 36.925 | 7.38% |
| #5 | `DE` | 30.326 | 6.06% |
| #6 | `QM` | 21.381 | 4.28% |
| #7 | `NL` | 10.893 | 2.18% |
| #8 | `BR` | 9.401 | 1.88% |
| #9 | `QT` | 8.181 | 1.64% |
| #10 | `CA` | 7.771 | 1.55% |
| #11 | `TC` | 7.749 | 1.55% |
| #12 | `MX` | 7.432 | 1.49% |
| #13 | `IT` | 7.267 | 1.45% |
| #14 | `ES` | 6.942 | 1.39% |
| #15 | `JP` | 5.523 | 1.1% |
| #16 | `SE` | 4.857 | 0.97% |
| #17 | `UK` | 4.721 | 0.94% |
| #18 | `BX` | 4.701 | 0.94% |
| #19 | `AU` | 3.840 | 0.77% |
| #20 | `GX` | 3.414 | 0.68% |

---

## 4. Temporal (Era) & Popularity Profiling

### Decade / Era Distribution
| Decade Era | Track Count | Catalog Share |
| :--- | :---: | :---: |
| **Pre-1960s** | 6 | **0%** |
| **1960s** | 92 | **0.02%** |
| **1970s** | 376 | **0.08%** |
| **1980s** | 978 | **0.2%** |
| **1990s** | 3.269 | **0.65%** |
| **2000s** | 20.793 | **4.16%** |
| **2010s** | 75.880 | **15.17%** |
| **2020s** | 110.883 | **22.17%** |
| **Unknown** | 287.820 | **57.55%** |

### Popularity Statistics
- **Raw Scale**: Min: 0, Max: 999858, Avg: 186479.69 (Deezer Rank 0-1,000,000)
- **Normalized Scale (0-100)**: Average: **19.19 / 100**

| Normalized Tier (0-100) | Track Count | Catalog Share |
| :---: | :---: | :---: |
| Score 00-10 | 226.455 | 45.28% |
| Score 11-20 | 94.502 | 18.9% |
| Score 21-30 | 63.524 | 12.7% |
| Score 31-40 | 47.008 | 9.4% |
| Score 41-50 | 30.051 | 6.01% |
| Score 51-60 | 17.293 | 3.46% |
| Score 61-70 | 10.000 | 2% |
| Score 71-80 | 7.459 | 1.49% |
| Score 81-90 | 2.685 | 0.54% |
| Score 91-100 | 1.120 | 0.22% |

---

## 5. Genre Taxonomy & Artist Landscape

- **Artists with Tagged Genres**: 695 (0.74% of artists)
- **Total Distinct Genres**: 37

### Top 30 Genres Across Catalog
| Rank | Genre Name | Associated Artists | Artist Share |
| :---: | :--- | :---: | :---: |
| #1 | **Hip-Hop** | 115 | 0.12% |
| #2 | **Pop** | 107 | 0.11% |
| #3 | **Rock** | 61 | 0.06% |
| #4 | **Reggaeton** | 43 | 0.05% |
| #5 | **R&B** | 41 | 0.04% |
| #6 | **Alternative Rock** | 34 | 0.04% |
| #7 | **Classic Rock** | 33 | 0.04% |
| #8 | **Hip Hop** | 32 | 0.03% |
| #9 | **Latin** | 30 | 0.03% |
| #10 | **Electronic** | 29 | 0.03% |
| #11 | **EDM** | 22 | 0.02% |
| #12 | **K-Pop** | 21 | 0.02% |
| #13 | **Anime** | 21 | 0.02% |
| #14 | **Regional Mexican** | 19 | 0.02% |
| #15 | **Funk** | 14 | 0.01% |
| #16 | **Soul** | 13 | 0.01% |
| #17 | **Disco** | 13 | 0.01% |
| #18 | **Japanese** | 13 | 0.01% |
| #19 | **French House** | 12 | 0.01% |
| #20 | **Punk** | 11 | 0.01% |
| #21 | **Motown** | 11 | 0.01% |
| #22 | **Grunge** | 10 | 0.01% |
| #23 | **Country** | 10 | 0.01% |
| #24 | **Reggae** | 10 | 0.01% |
| #25 | **Filmi** | 10 | 0.01% |
| #26 | **Alternative** | 9 | 0.01% |
| #27 | **City Pop** | 9 | 0.01% |
| #28 | **Sertanjeo** | 9 | 0.01% |
| #29 | **Metal** | 8 | 0.01% |
| #30 | **Bossa Nova** | 8 | 0.01% |

### Top 25 Most Prolific Artists
| Rank | Artist Name | Track Count | Primary Genres |
| :---: | :--- | :---: | :--- |
| #1 | **Graham Blvd** | 1.410 | `N/A` |
| #2 | **Gruselkabinett** | 1.156 | `N/A` |
| #3 | **Party Tyme** | 789 | `N/A` |
| #4 | **The Beatles** | 647 | `Rock, Classic Rock` |
| #5 | **David Bowie** | 613 | `Rock, Classic Rock` |
| #6 | **Metallica** | 608 | `Rock` |
| #7 | **Cornelia Funke** | 519 | `N/A` |
| #8 | **Die drei !!!** | 488 | `Spoken Word` |
| #9 | **Mix Factor** | 485 | `N/A` |
| #10 | **Ella Fitzgerald** | 464 | `N/A` |
| #11 | **Iggy Pop** | 453 | `N/A` |
| #12 | **Fünf Freunde** | 439 | `N/A` |
| #13 | **The City Of Prague Philharmonic Orchestra** | 437 | `N/A` |
| #14 | **Elvis Presley** | 434 | `Rock` |
| #15 | **KnightsBridge** | 425 | `N/A` |
| #16 | **Johnny Hallyday** | 425 | `N/A` |
| #17 | **Pink Floyd** | 396 | `Rock, Classic Rock` |
| #18 | **The Rolling Stones** | 391 | `Rock, Classic Rock` |
| #19 | **R.E.M.** | 373 | `Alternative Rock` |
| #20 | **U2** | 365 | `Rock, Alternative Rock` |
| #21 | **Fleetwood Mac** | 359 | `Rock, Classic Rock` |
| #22 | **Benjamin Blümchen** | 350 | `N/A` |
| #23 | **The Cure** | 343 | `Rock, Alternative Rock` |
| #24 | **Grateful Dead** | 342 | `N/A` |
| #25 | **Queen** | 334 | `Rock, Classic Rock` |

---

## 6. Data Quality, Anomalies & Contamination Analysis

### Structural & Referential Anomalies
- **Orphaned Tracks**: 0
- **Orphaned Samples**: 0
- **Orphaned Providers**: 0
- **Artists with 0 Tracks**: 572
- **Malformed Genres JSON**: 0
- **Malformed Sample URLs**: 0

### Duration & Metadata Boundaries
- **Tracks < 15 seconds** (audio blips / sfx): 741
- **Tracks > 60 minutes** (DJ mixes / audiobooks): 0
- **Invalid Release Years (< 1900 or > 2030)**: 0
- **Null Release Years**: 287.820 (57.55%)
- **Invalid Popularity (< 0 or > 1,000,000)**: 0

### Non-Music & Soundalike Contamination
- **Audiobooks / Radio Plays / Hörspiele**: **1.671** tracks
- **Soundalike Cover Bands & Karaoke**: **426** tracks
- **Workout & Audio Utilities**: **237** tracks
- **Total Contaminated Tracks Detected**: **2.334** (0.47% of catalog)

*Sample Contaminated Entries:*
  - **KnightsBridge** - `You Ain't Seen Nothing Yet` [Type: Soundalike Cover Band]
  - **KnightsBridge** - `Alone Again (Naturally)` [Type: Soundalike Cover Band]
  - **KnightsBridge** - `Vincent` [Type: Soundalike Cover Band]
  - **KnightsBridge** - `Anticipation` [Type: Soundalike Cover Band]
  - **KnightsBridge** - `Sandman` [Type: Soundalike Cover Band]
  - **KnightsBridge** - `Candida` [Type: Soundalike Cover Band]
  - **KnightsBridge** - `Superstar` [Type: Soundalike Cover Band]
  - **KnightsBridge** - `DIARY` [Type: Soundalike Cover Band]
  - **KnightsBridge** - `Big Yellow Taxi` [Type: Soundalike Cover Band]
  - **KnightsBridge** - `Honky Cat` [Type: Soundalike Cover Band]
  - **KnightsBridge** - `Mother Freedom` [Type: Soundalike Cover Band]
  - **KnightsBridge** - `Follow Me` [Type: Soundalike Cover Band]
  - **KnightsBridge** - `Country Road` [Type: Soundalike Cover Band]
  - **KnightsBridge** - `Brand New Key` [Type: Soundalike Cover Band]
  - **KnightsBridge** - `Hurting Each Other` [Type: Soundalike Cover Band]

### Soft Semantic Duplicates
- **Duplicate Candidate Clusters**: **0**
- *Sample Clusters Detected*:


---

## 7. Sanitization Engine Actions & Options

> [!IMPORTANT]
  > **Live Sanitization Executed**:  
  > - Duplicates Merged: **0**  
  > - Redundant Tracks Removed: **0**  
  > - Orphaned Records Cleaned: **0 samples, 0 providers**

---
