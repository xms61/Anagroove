# SpotySpice Multi-Generation Crossword Benchmark & Evaluation Report

**Timestamp**: 2026-09-19T13:44:55.891Z
**Generations Per Case**: 3
**Total Crosswords Generated**: 138
**Catalog Scale**: 500.098 tracks | 94.117 artists | 496.891 samples

## 1. Executive Summary & Judgment Matrix

| Suite | Prompts | Pass Rate | Avg Score | Track Uniqueness | Overlap (Jaccard) | Short Words (3-5) | Medium (6-8) | Long (9+) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **DENSE** | 10 | 100% | 100/100 | 86% | 0.10 | 48% | 37% | 14% |
| **SMALL** | 10 | 100% | 100/100 | 88% | 0.07 | 94% | 6% | 0% |
| **THEMED** | 10 | 90% | 99/100 | 82% | 0.12 | 51% | 30% | 19% |
| **CUSTOM** | 10 | 100% | 100/100 | 87% | 0.10 | 56% | 33% | 11% |
| **EDGE_CASES** | 6 | 100% | 100/100 | 74% | 0.23 | 53% | 31% | 17% |

## 2. Evaluation Criteria & Audit Checklist

- **Language Enforcement**: 100% English purity for Western/general prompts; Korean allowed for K-Pop; Japanese allowed for Anime & City Pop.
- **Anime vs Japanese Separation**: 100% of placed tracks in Anime crosswords are authentic openings/endings/OSTs; Japanese City Pop tracks reject modern anime hijack and Western homonyms.
- **Word Length Variety**: Active rotation ensures 3-5 letter words represent 30-55% of all placed answers across layouts.
- **Popularity Variety & Anti-Repetitiveness**: High uniqueness ratio (>0.70) and low Jaccard overlap (<0.20) across successive generations.
- **Authenticity**: 0 covers, 0 karaoke, 0 instrumentals, 0 fake audio modifications.
- **Thematic Fidelity**: Single-artist crosswords contain 100% target artist songs with 0 leaked artist-name clues; temporal crosswords respect year bounds.

## 3. Detailed Benchmark Case Audit

### Suite: DENSE

#### [D01] "90s rock" — PASSED (Score: 100/100)
- **Archetype**: `dense`
- **Repetitiveness**: Unique Tracks: 87% (26/30) | Jaccard Overlap: 0.09
- **Length Variety**: Short (3-5): 47% | Medium (6-8): 43% | Long (9+): 10%
- **Popularity**: Min: 31, Max: 90, Avg: 59, StdDev: 18.5 (High: 43%, Mid: 40%, Catalog: 17%)
- **Violations**: None (100% clean)

```
░░ ░░ ░░ ░░ M  ░░ ░░ ░░ ░░ W  ░░
░░ ░░ ░░ ░░ E  ░░ ░░ A  ░░ O  ░░
P  ░░ ░░ ░░ T  H  E  C  U  R  E
E  ░░ W  ░░ A  ░░ ░░ O  ░░ L  ░░
A  ░░ H  ░░ L  ░░ ░░ U  ░░ D  ░░
R  E  A  L  L  Y  ░░ S  ░░ ░░ ░░
L  ░░ T  ░░ I  ░░ ░░ T  E  A  ░░
J  ░░ S  ░░ C  ░░ ░░ I  ░░ ░░ ░░
A  ░░ ░░ ░░ A  C  D  C  ░░ ░░ ░░
M  O  O  N  ░░ ░░ ░░ ░░ ░░ ░░ ░░
```

#### [D02] "2000s pop" — PASSED (Score: 100/100)
- **Archetype**: `dense`
- **Repetitiveness**: Unique Tracks: 93% (27/29) | Jaccard Overlap: 0.04
- **Length Variety**: Short (3-5): 41% | Medium (6-8): 41% | Long (9+): 17%
- **Popularity**: Min: 42, Max: 92, Avg: 69, StdDev: 14.7 (High: 48%, Mid: 52%, Catalog: 0%)
- **Violations**: None (100% clean)

```
░░ M  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
░░ A  ░░ W  H  E  N  E  V  E  R  ░░
░░ R  ░░ ░░ O  ░░ ░░ ░░ ░░ ░░ O  ░░
T  O  G  E  T  H  E  R  ░░ ░░ X  ░░
░░ O  ░░ ░░ E  ░░ ░░ ░░ ░░ ░░ A  ░░
░░ N  ░░ ░░ L  ░░ ░░ M  ░░ P  N  K
░░ 5  ░░ ░░ ░░ ░░ ░░ Y  ░░ ░░ N  ░░
░░ ░░ ░░ G  O  O  D  L  I  F  E  ░░
░░ ░░ ░░ ░░ ░░ ░░ ░░ O  ░░ ░░ ░░ ░░
░░ ░░ ░░ ░░ ░░ ░░ ░░ V  ░░ ░░ ░░ ░░
░░ ░░ ░░ ░░ T  A  K  E  ░░ ░░ ░░ ░░
```

#### [D03] "classic disco" — PASSED (Score: 100/100)
- **Archetype**: `dense`
- **Repetitiveness**: Unique Tracks: 70% (21/30) | Jaccard Overlap: 0.25
- **Length Variety**: Short (3-5): 47% | Medium (6-8): 33% | Long (9+): 20%
- **Popularity**: Min: 41, Max: 78, Avg: 59, StdDev: 11.5 (High: 27%, Mid: 73%, Catalog: 0%)
- **Violations**: None (100% clean)

```
░░ G  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ F
D  O  N  N  A  S  U  M  M  E  R
░░ T  ░░ ░░ ░░ ░░ ░░ I  ░░ ░░ E
░░ T  ░░ ░░ B  E  E  G  E  E  S
B  A  N  D  ░░ ░░ ░░ H  ░░ ░░ H
░░ ░░ ░░ ░░ ░░ F  ░░ T  ░░ ░░ ░░
░░ ░░ ░░ ░░ N  A  V  Y  ░░ ░░ ░░
░░ W  ░░ ░░ ░░ N  ░░ ░░ ░░ ░░ ░░
G  I  V  E  I  T  U  P  ░░ ░░ ░░
░░ L  ░░ ░░ ░░ A  ░░ ░░ ░░ ░░ ░░
░░ L  ░░ ░░ ░░ S  ░░ ░░ ░░ ░░ ░░
░░ ░░ ░░ ░░ ░░ Y  ░░ ░░ ░░ ░░ ░░
```

#### [D04] "80s synthpop" — PASSED (Score: 100/100)
- **Archetype**: `dense`
- **Repetitiveness**: Unique Tracks: 67% (20/30) | Jaccard Overlap: 0.26
- **Length Variety**: Short (3-5): 37% | Medium (6-8): 30% | Long (9+): 33%
- **Popularity**: Min: 2, Max: 78, Avg: 28, StdDev: 32.2 (High: 30%, Mid: 0%, Catalog: 70%)
- **Violations**: None (100% clean)

```
░░ ░░ ░░ L  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
░░ ░░ ░░ U  ░░ A  ░░ ░░ ░░ ░░ ░░ ░░
░░ ░░ ░░ C  ░░ B  E  R  O  C  K  ░░
░░ ░░ ░░ R  ░░ B  ░░ ░░ ░░ ░░ ░░ ░░
░░ ░░ R  E  M  A  S  T  E  R  E  D
V  ░░ ░░ T  ░░ ░░ ░░ ░░ ░░ ░░ ░░ O
E  ░░ ░░ I  ░░ ░░ ░░ ░░ ░░ ░░ ░░ V
R  ░░ N  A  T  S  U  ░░ ░░ ░░ ░░ E
S  ░░ ░░ ░░ ░░ O  ░░ ░░ ░░ ░░ ░░ S
I  N  T  H  E  R  O  O  M  ░░ ░░ ░░
O  ░░ ░░ ░░ ░░ R  ░░ ░░ ░░ ░░ ░░ ░░
N  O  O  H  ░░ Y  ░░ ░░ ░░ ░░ ░░ ░░
```

#### [D05] "golden age hip hop" — PASSED (Score: 100/100)
- **Archetype**: `dense`
- **Repetitiveness**: Unique Tracks: 97% (29/30) | Jaccard Overlap: 0.02
- **Length Variety**: Short (3-5): 57% | Medium (6-8): 27% | Long (9+): 17%
- **Popularity**: Min: 70, Max: 95, Avg: 81, StdDev: 7.7 (High: 100%, Mid: 0%, Catalog: 0%)
- **Violations**: None (100% clean)

```
░░ ░░ ░░ ░░ ░░ ░░ ░░ H  ░░ ░░ ░░ ░░
░░ ░░ ░░ ░░ ░░ ░░ ░░ A  ░░ ░░ ░░ ░░
F  ░░ ░░ F  U  T  U  R  E  ░░ ░░ ░░
K  ░░ ░░ L  ░░ ░░ ░░ D  ░░ ░░ ░░ O
I  D  G  A  F  ░░ ░░ ░░ ░░ ░░ ░░ U
N  ░░ ░░ S  ░░ D  O  J  A  C  A  T
░░ ░░ ░░ H  ░░ E  ░░ C  ░░ ░░ ░░ K
░░ ░░ ░░ I  ░░ A  ░░ O  ░░ ░░ ░░ A
░░ ░░ ░░ N  O  T  ░░ L  ░░ ░░ ░░ S
░░ ░░ ░░ G  ░░ H  ░░ E  ░░ ░░ ░░ T
```

#### [D06] "dance anthems" — PASSED (Score: 100/100)
- **Archetype**: `dense`
- **Repetitiveness**: Unique Tracks: 93% (28/30) | Jaccard Overlap: 0.04
- **Length Variety**: Short (3-5): 60% | Medium (6-8): 33% | Long (9+): 7%
- **Popularity**: Min: 70, Max: 100, Avg: 82, StdDev: 8.2 (High: 100%, Mid: 0%, Catalog: 0%)
- **Violations**: None (100% clean)

```
░░ ░░ ░░ ░░ D  ░░ ░░ ░░ ░░
░░ ░░ ░░ ░░ J  ░░ ░░ C  ░░
R  O  A  D  S  ░░ ░░ L  ░░
░░ ░░ ░░ ░░ N  ░░ ░░ O  ░░
░░ ░░ ░░ P  A  R  I  S  ░░
░░ ░░ T  ░░ K  ░░ ░░ E  ░░
░░ L  O  V  E  ░░ ░░ ░░ S
░░ ░░ C  ░░ ░░ ░░ ░░ ░░ U
░░ ░░ A  N  G  E  L  ░░ M
░░ ░░ S  ░░ ░░ ░░ E  ░░ M
░░ ░░ ░░ ░░ F  L  A  M  E
░░ ░░ ░░ ░░ ░░ ░░ N  ░░ R
```

#### [D07] "latin essentials" — PASSED (Score: 100/100)
- **Archetype**: `dense`
- **Repetitiveness**: Unique Tracks: 90% (27/30) | Jaccard Overlap: 0.05
- **Length Variety**: Short (3-5): 47% | Medium (6-8): 47% | Long (9+): 7%
- **Popularity**: Min: 60, Max: 89, Avg: 69, StdDev: 8.1 (High: 40%, Mid: 60%, Catalog: 0%)
- **Violations**: None (100% clean)

```
░░ ░░ ░░ ░░ S  A  B  E  S  ░░ ░░
░░ ░░ B  ░░ ░░ ░░ ░░ ░░ E  ░░ ░░
░░ ░░ O  ░░ ░░ ░░ D  ░░ S  ░░ ░░
░░ ░░ D  ░░ ░░ ░░ A  ░░ S  ░░ ░░
░░ T  A  M  O  ░░ N  ░░ I  ░░ ░░
░░ ░░ ░░ E  ░░ ░░ N  ░░ O  ░░ ░░
░░ ░░ ░░ N  ░░ ░░ Y  ░░ N  ░░ ░░
░░ L  U  I  S  F  O  N  S  I  ░░
░░ ░░ ░░ E  ░░ ░░ C  ░░ ░░ ░░ ░░
M  C  I  G  ░░ B  E  C  K  Y  G
U  ░░ ░░ O  ░░ ░░ A  ░░ ░░ ░░ ░░
Y  ░░ ░░ ░░ ░░ ░░ N  ░░ ░░ ░░ ░░
```

#### [D08] "indie rock gems" — PASSED (Score: 100/100)
- **Archetype**: `dense`
- **Repetitiveness**: Unique Tracks: 80% (24/30) | Jaccard Overlap: 0.12
- **Length Variety**: Short (3-5): 67% | Medium (6-8): 33% | Long (9+): 0%
- **Popularity**: Min: 81, Max: 99, Avg: 92, StdDev: 5 (High: 100%, Mid: 0%, Catalog: 0%)
- **Violations**: None (100% clean)

```
░░ K  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
E  A  G  L  E  S  ░░ R  ░░ M  ░░ ░░
░░ N  ░░ ░░ ░░ T  H  E  C  U  R  E
░░ S  ░░ S  ░░ I  ░░ M  ░░ S  ░░ ░░
░░ A  ░░ T  O  L  D  ░░ F  E  E  L
░░ S  ░░ A  ░░ L  ░░ ░░ ░░ ░░ N  ░░
░░ ░░ ░░ Y  ░░ ░░ ░░ ░░ ░░ ░░ T  ░░
░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ E  ░░
░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ R  ░░
```

#### [D09] "motown hits" — PASSED (Score: 100/100)
- **Archetype**: `dense`
- **Repetitiveness**: Unique Tracks: 83% (25/30) | Jaccard Overlap: 0.12
- **Length Variety**: Short (3-5): 50% | Medium (6-8): 37% | Long (9+): 13%
- **Popularity**: Min: 30, Max: 69, Avg: 46, StdDev: 11.1 (High: 0%, Mid: 70%, Catalog: 30%)
- **Violations**: None (100% clean)

```
░░ G  E  T  R  E  A  D  Y  ░░ ░░ M
░░ ░░ ░░ H  ░░ ░░ L  ░░ ░░ C  ░░ O
░░ T  U  R  N  ░░ T  ░░ ░░ H  ░░ U
░░ ░░ ░░ O  ░░ V  E  R  S  I  O  N
C  L  O  U  D  ░░ R  ░░ ░░ L  ░░ T
░░ ░░ ░░ G  ░░ ░░ N  ░░ ░░ D  ░░ A
░░ ░░ ░░ H  ░░ ░░ A  ░░ ░░ ░░ ░░ I
░░ B  ░░ ░░ ░░ ░░ T  ░░ ░░ ░░ ░░ N
░░ A  N  O  T  H  E  R  ░░ ░░ ░░ ░░
░░ B  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
░░ Y  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
```

#### [D10] "r&b classics" — PASSED (Score: 100/100)
- **Archetype**: `dense`
- **Repetitiveness**: Unique Tracks: 97% (29/30) | Jaccard Overlap: 0.02
- **Length Variety**: Short (3-5): 30% | Medium (6-8): 50% | Long (9+): 20%
- **Popularity**: Min: 70, Max: 97, Avg: 83, StdDev: 6.8 (High: 100%, Mid: 0%, Catalog: 0%)
- **Violations**: None (100% clean)

```
░░ ░░ B  ░░ ░░ ░░ ░░ ░░ R  ░░ ░░ ░░
T  H  I  N  G  ░░ A  K  O  N  ░░ ░░
H  ░░ R  ░░ ░░ ░░ ░░ ░░ U  ░░ ░░ ░░
E  ░░ T  E  L  E  P  A  T  I  A  ░░
A  ░░ H  ░░ ░░ ░░ ░░ ░░ I  ░░ ░░ ░░
B  ░░ D  ░░ F  R  I  E  N  D  S  ░░
Y  ░░ A  ░░ O  ░░ ░░ ░░ E  ░░ ░░ ░░
S  ░░ Y  ░░ L  ░░ ░░ ░░ ░░ ░░ ░░ ░░
S  ░░ S  A  D  E  ░░ ░░ ░░ ░░ ░░ ░░
░░ ░░ E  ░░ E  ░░ ░░ ░░ ░░ ░░ ░░ ░░
░░ ░░ X  ░░ D  I  A  M  O  N  D  S
```

### Suite: SMALL

#### [S01] "pop bops" — PASSED (Score: 100/100)
- **Archetype**: `small`
- **Repetitiveness**: Unique Tracks: 83% (15/18) | Jaccard Overlap: 0.13
- **Length Variety**: Short (3-5): 100% | Medium (6-8): 0% | Long (9+): 0%
- **Popularity**: Min: 90, Max: 100, Avg: 93, StdDev: 2.8 (High: 100%, Mid: 0%, Catalog: 0%)
- **Violations**: None (100% clean)

```
░░ R  ░░ ░░ ░░ M  ░░
░░ A  ░░ S  T  A  Y
A  I  N  T  ░░ N  ░░
░░ N  ░░ O  ░░ ░░ ░░
░░ ░░ ░░ R  ░░ ░░ ░░
░░ T  R  Y  ░░ ░░ ░░
```

#### [S02] "quick hits" — PASSED (Score: 100/100)
- **Archetype**: `small`
- **Repetitiveness**: Unique Tracks: 78% (14/18) | Jaccard Overlap: 0.16
- **Length Variety**: Short (3-5): 89% | Medium (6-8): 11% | Long (9+): 0%
- **Popularity**: Min: 10, Max: 41, Avg: 22, StdDev: 12.4 (High: 0%, Mid: 17%, Catalog: 83%)
- **Violations**: None (100% clean)

```
░░ ░░ ░░ B  ░░ ░░ ░░
░░ J  ░░ J  ░░ ░░ ░░
D  E  M  O  ░░ ░░ ░░
░░ S  ░░ R  O  O  M
F  U  N  K  ░░ ░░ O
░░ S  ░░ ░░ ░░ ░░ I
```

#### [S03] "punk rock" — PASSED (Score: 100/100)
- **Archetype**: `small`
- **Repetitiveness**: Unique Tracks: 89% (16/18) | Jaccard Overlap: 0.07
- **Length Variety**: Short (3-5): 100% | Medium (6-8): 0% | Long (9+): 0%
- **Popularity**: Min: 83, Max: 99, Avg: 95, StdDev: 3.9 (High: 100%, Mid: 0%, Catalog: 0%)
- **Violations**: None (100% clean)

```
░░ ░░ K  ░░ S  W  E  E  T
F  A  I  N  T  ░░ L  ░░ E
░░ ░░ D  ░░ A  ░░ S  ░░ E
░░ ░░ S  ░░ Y  ░░ E  ░░ N
```

#### [S04] "short titles" — PASSED (Score: 100/100)
- **Archetype**: `small`
- **Repetitiveness**: Unique Tracks: 89% (16/18) | Jaccard Overlap: 0.06
- **Length Variety**: Short (3-5): 89% | Medium (6-8): 11% | Long (9+): 0%
- **Popularity**: Min: 2, Max: 74, Avg: 26, StdDev: 20.3 (High: 6%, Mid: 22%, Catalog: 72%)
- **Violations**: None (100% clean)

```
░░ ░░ ░░ N  ░░ ░░
C  H  R  I  S  ░░
░░ ░░ ░░ K  ░░ ░░
░░ C  L  E  A  N
░░ ░░ O  ░░ ░░ T
░░ ░░ V  ░░ ░░ O
░░ S  E  R  ░░ ░░
```

#### [S05] "euro dance" — PASSED (Score: 100/100)
- **Archetype**: `small`
- **Repetitiveness**: Unique Tracks: 94% (17/18) | Jaccard Overlap: 0.03
- **Length Variety**: Short (3-5): 83% | Medium (6-8): 17% | Long (9+): 0%
- **Popularity**: Min: 71, Max: 100, Avg: 80, StdDev: 8.4 (High: 100%, Mid: 0%, Catalog: 0%)
- **Violations**: None (100% clean)

```
░░ R  ░░ ░░ ░░ ░░ ░░
░░ A  N  G  E  L  ░░
░░ D  ░░ ░░ ░░ ░░ D
B  I  Z  A  R  R  E
░░ O  ░░ R  ░░ ░░ E
░░ ░░ N  E  W  ░░ P
```

#### [S06] "ska hits" — PASSED (Score: 100/100)
- **Archetype**: `small`
- **Repetitiveness**: Unique Tracks: 89% (16/18) | Jaccard Overlap: 0.07
- **Length Variety**: Short (3-5): 89% | Medium (6-8): 11% | Long (9+): 0%
- **Popularity**: Min: 72, Max: 91, Avg: 80, StdDev: 6 (High: 100%, Mid: 0%, Catalog: 0%)
- **Violations**: None (100% clean)

```
B  U  S  Y  ░░ ░░
A  ░░ A  ░░ H  ░░
I  ░░ F  E  I  D
L  ░░ A  ░░ P  ░░
A  ░░ E  ░░ S  ░░
░░ ░░ R  ░░ ░░ ░░
░░ W  A  S  N  T
```

#### [S07] "funk groove" — PASSED (Score: 100/100)
- **Archetype**: `small`
- **Repetitiveness**: Unique Tracks: 94% (17/18) | Jaccard Overlap: 0.03
- **Length Variety**: Short (3-5): 100% | Medium (6-8): 0% | Long (9+): 0%
- **Popularity**: Min: 40, Max: 78, Avg: 56, StdDev: 9.9 (High: 17%, Mid: 83%, Catalog: 0%)
- **Violations**: None (100% clean)

```
░░ B  ░░ ░░ ░░ ░░
░░ L  I  F  E  ░░
░░ A  ░░ ░░ ░░ G
░░ C  A  M  E  O
░░ K  ░░ A  ░░ O
░░ ░░ ░░ R  ░░ D
E  A  S  Y  ░░ ░░
```

#### [S08] "folk songs" — PASSED (Score: 100/100)
- **Archetype**: `small`
- **Repetitiveness**: Unique Tracks: 89% (16/18) | Jaccard Overlap: 0.07
- **Length Variety**: Short (3-5): 100% | Medium (6-8): 0% | Long (9+): 0%
- **Popularity**: Min: 2, Max: 38, Avg: 12, StdDev: 9.7 (High: 0%, Mid: 0%, Catalog: 100%)
- **Violations**: None (100% clean)

```
░░ F  O  L  K
░░ ░░ ░░ E  ░░
░░ C  ░░ A  ░░
░░ R  ░░ N  ░░
M  A  S  S  I
░░ W  ░░ ░░ T
B  L  U  E  S
```

#### [S09] "trap beats" — PASSED (Score: 100/100)
- **Archetype**: `small`
- **Repetitiveness**: Unique Tracks: 89% (16/18) | Jaccard Overlap: 0.06
- **Length Variety**: Short (3-5): 94% | Medium (6-8): 6% | Long (9+): 0%
- **Popularity**: Min: 72, Max: 89, Avg: 81, StdDev: 5.3 (High: 100%, Mid: 0%, Catalog: 0%)
- **Violations**: None (100% clean)

```
░░ ░░ ░░ ░░ M
░░ ░░ S  ░░ A
T  ░░ H  I  M
A  ░░ O  ░░ A
K  N  O  W  ░░
E  ░░ K  ░░ ░░
```

#### [S10] "club mix" — PASSED (Score: 100/100)
- **Archetype**: `small`
- **Repetitiveness**: Unique Tracks: 88% (15/17) | Jaccard Overlap: 0.06
- **Length Variety**: Short (3-5): 100% | Medium (6-8): 0% | Long (9+): 0%
- **Popularity**: Min: 11, Max: 76, Avg: 30, StdDev: 15.3 (High: 6%, Mid: 12%, Catalog: 82%)
- **Violations**: None (100% clean)

```
░░ ░░ B  O  Y  S
░░ ░░ A  ░░ ░░ ░░
S  A  D  K  O  ░░
A  ░░ ░░ N  ░░ ░░
Y  ░░ ░░ E  ░░ ░░
░░ O  N  E  ░░ ░░
```

### Suite: THEMED

#### [T01] "70s Classic Rock" — PASSED (Score: 100/100)
- **Archetype**: `themed`
- **Repetitiveness**: Unique Tracks: 73% (22/30) | Jaccard Overlap: 0.16
- **Length Variety**: Short (3-5): 50% | Medium (6-8): 33% | Long (9+): 17%
- **Popularity**: Min: 13, Max: 88, Avg: 59, StdDev: 24.5 (High: 50%, Mid: 20%, Catalog: 30%)
- **Violations**: None (100% clean)

```
E  L  T  O  N  J  O  H  N  ░░ ░░ R  ░░
R  ░░ ░░ ░░ ░░ ░░ ░░ E  ░░ ░░ ░░ E  ░░
I  ░░ ░░ ░░ A  ░░ ░░ A  ░░ ░░ ░░ M  ░░
C  ░░ ░░ ░░ C  ░░ ░░ R  ░░ ░░ ░░ A  ░░
C  ░░ ░░ ░░ D  O  N  T  ░░ ░░ ░░ S  ░░
L  ░░ ░░ ░░ C  ░░ ░░ ░░ ░░ ░░ ░░ T  ░░
A  ░░ W  ░░ ░░ ░░ J  O  U  R  N  E  Y
P  ░░ A  ░░ ░░ ░░ ░░ ░░ S  ░░ ░░ R  ░░
T  I  N  Y  D  A  N  C  E  R  ░░ ░░ ░░
O  ░░ N  ░░ ░░ ░░ ░░ ░░ D  ░░ ░░ ░░ ░░
N  ░░ A  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
```

#### [T02] "90s Grunge" — PASSED (Score: 100/100)
- **Archetype**: `themed`
- **Repetitiveness**: Unique Tracks: 77% (23/30) | Jaccard Overlap: 0.14
- **Length Variety**: Short (3-5): 60% | Medium (6-8): 30% | Long (9+): 10%
- **Popularity**: Min: 7, Max: 79, Avg: 39, StdDev: 19.9 (High: 13%, Mid: 23%, Catalog: 63%)
- **Violations**: None (100% clean)

```
░░ ░░ P  O  I  N  T  ░░ B  ░░ ░░
░░ ░░ ░░ ░░ ░░ ░░ U  ░░ U  ░░ ░░
░░ ░░ ░░ ░░ P  R  E  S  S  ░░ J
░░ ░░ ░░ ░░ ░░ ░░ S  ░░ H  ░░ E
░░ ░░ ░░ ░░ ░░ ░░ D  ░░ ░░ ░░ R
D  O  W  N  I  N  A  H  O  L  E
A  ░░ ░░ ░░ ░░ ░░ Y  ░░ ░░ ░░ M
I  ░░ ░░ ░░ ░░ ░░ ░░ ░░ S  A  Y
S  ░░ ░░ ░░ ░░ ░░ ░░ ░░ N  ░░ ░░
Y  E  L  L  O  W  ░░ ░░ A  ░░ ░░
░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ K  ░░ ░░
░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ E  ░░ ░░
```

#### [T03] "French House" — PASSED (Score: 100/100)
- **Archetype**: `themed`
- **Repetitiveness**: Unique Tracks: 67% (20/30) | Jaccard Overlap: 0.31
- **Length Variety**: Short (3-5): 43% | Medium (6-8): 27% | Long (9+): 30%
- **Popularity**: Min: 44, Max: 100, Avg: 71, StdDev: 14.6 (High: 43%, Mid: 57%, Catalog: 0%)
- **Violations**: None (100% clean)

```
░░ ░░ ░░ G  ░░ ░░ L  ░░ ░░ ░░ ░░ R  ░░
F  A  C  E  ░░ T  O  O  P  T  O  O  P
░░ ░░ ░░ S  ░░ ░░ V  ░░ ░░ ░░ ░░ U  ░░
░░ ░░ ░░ A  F  T  E  R  I  M  A  G  E
░░ ░░ ░░ F  ░░ ░░ G  ░░ ░░ ░░ ░░ E  ░░
░░ ░░ ░░ F  ░░ ░░ E  ░░ ░░ ░░ K  ░░ ░░
░░ ░░ ░░ E  ░░ ░░ N  ░░ ░░ L  A  D  Y
W  O  R  L  D  ░░ E  ░░ ░░ ░░ V  ░░ ░░
░░ ░░ ░░ S  ░░ ░░ R  E  M  A  I  N  ░░
░░ ░░ ░░ T  ░░ ░░ A  ░░ ░░ ░░ N  ░░ ░░
░░ ░░ ░░ E  ░░ ░░ T  ░░ ░░ ░░ S  ░░ ░░
░░ ░░ ░░ I  ░░ ░░ I  ░░ ░░ ░░ K  ░░ ░░
░░ ░░ ░░ N  ░░ ░░ O  ░░ ░░ ░░ Y  ░░ ░░
░░ ░░ ░░ ░░ ░░ ░░ N  ░░ ░░ ░░ ░░ ░░ ░░
```

#### [T04] "80s City Pop" — PASSED (Score: 100/100)
- **Archetype**: `themed`
- **Repetitiveness**: Unique Tracks: 85% (23/27) | Jaccard Overlap: 0.08
- **Length Variety**: Short (3-5): 37% | Medium (6-8): 22% | Long (9+): 41%
- **Popularity**: Min: 2, Max: 24, Avg: 7, StdDev: 5.6 (High: 0%, Mid: 0%, Catalog: 100%)
- **Violations**: None (100% clean)

```
M  A  R  I  Y  A  T  A  K  E  U  C  H  I
I  ░░ ░░ ░░ ░░ ░░ A  ░░ ░░ ░░ ░░ ░░ ░░ ░░
K  ░░ ░░ ░░ P  R  E  V  I  O  U  S  L  Y
I  ░░ ░░ ░░ ░░ ░░ K  ░░ ░░ ░░ ░░ ░░ ░░ ░░
M  ░░ L  ░░ ░░ ░░ O  ░░ ░░ ░░ ░░ ░░ ░░ ░░
A  ░░ U  ░░ ░░ ░░ O  ░░ ░░ ░░ ░░ ░░ ░░ ░░
T  ░░ C  ░░ ░░ ░░ N  ░░ ░░ ░░ ░░ L  ░░ ░░
S  O  R  R  Y  ░░ U  ░░ ░░ R  O  O  M  ░░
U  ░░ E  ░░ ░░ ░░ K  ░░ ░░ ░░ ░░ V  ░░ ░░
B  ░░ T  ░░ ░░ M  I  T  S  U  K  E  T  A
A  ░░ I  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
R  ░░ A  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
A  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
```

#### [T05] "Motown Soul" — PASSED (Score: 100/100)
- **Archetype**: `themed`
- **Repetitiveness**: Unique Tracks: 90% (27/30) | Jaccard Overlap: 0.05
- **Length Variety**: Short (3-5): 60% | Medium (6-8): 30% | Long (9+): 10%
- **Popularity**: Min: 37, Max: 75, Avg: 53, StdDev: 10.5 (High: 7%, Mid: 90%, Catalog: 3%)
- **Violations**: None (100% clean)

```
░░ L  ░░ L  ░░ M  ░░ ░░ ░░ ░░
░░ O  ░░ O  ░░ E  ░░ ░░ ░░ ░░
░░ V  ░░ V  ░░ R  ░░ ░░ ░░ ░░
░░ E  ░░ E  ░░ C  ░░ ░░ ░░ ░░
░░ H  U  R  R  Y  ░░ ░░ ░░ ░░
░░ A  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
░░ N  E  I  T  H  E  R  ░░ ░░
░░ G  ░░ T  ░░ ░░ ░░ E  ░░ ░░
B  O  S  S  ░░ ░░ P  A  P  A
░░ V  ░░ ░░ ░░ ░░ ░░ C  ░░ I
░░ E  ░░ ░░ ░░ ░░ ░░ H  ░░ N
░░ R  ░░ ░░ ░░ ░░ ░░ ░░ ░░ T
```

#### [T06] "2010s EDM" — PASSED (Score: 100/100)
- **Archetype**: `themed`
- **Repetitiveness**: Unique Tracks: 87% (26/30) | Jaccard Overlap: 0.09
- **Length Variety**: Short (3-5): 67% | Medium (6-8): 10% | Long (9+): 23%
- **Popularity**: Min: 41, Max: 94, Avg: 58, StdDev: 14 (High: 20%, Mid: 80%, Catalog: 0%)
- **Violations**: None (100% clean)

```
░░ ░░ ░░ L  E  T  I  T  B  E  M  E
░░ ░░ ░░ ░░ ░░ ░░ T  ░░ ░░ ░░ ░░ ░░
B  L  A  H  B  L  A  H  B  L  A  H
░░ ░░ W  ░░ ░░ ░░ I  ░░ ░░ ░░ ░░ ░░
░░ ░░ A  ░░ ░░ ░░ N  ░░ ░░ ░░ ░░ ░░
░░ ░░ Y  ░░ A  ░░ T  ░░ ░░ ░░ ░░ ░░
░░ ░░ ░░ ░░ B  ░░ M  ░░ ░░ ░░ ░░ K
░░ ░░ ░░ C  O  M  E  ░░ M  A  D  E
░░ ░░ ░░ ░░ U  ░░ ░░ ░░ I  ░░ ░░ E
░░ ░░ ░░ ░░ T  R  A  I  N  ░░ ░░ P
░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ D  ░░ ░░ ░░
```

#### [T07] "90s Hip Hop" — PASSED (Score: 100/100)
- **Archetype**: `themed`
- **Repetitiveness**: Unique Tracks: 83% (25/30) | Jaccard Overlap: 0.11
- **Length Variety**: Short (3-5): 50% | Medium (6-8): 40% | Long (9+): 10%
- **Popularity**: Min: 10, Max: 75, Avg: 35, StdDev: 20.6 (High: 13%, Mid: 13%, Catalog: 73%)
- **Violations**: None (100% clean)

```
░░ ░░ ░░ ░░ ░░ ░░ C  H  E  C  K
░░ ░░ ░░ ░░ ░░ ░░ ░░ E  ░░ ░░ ░░
░░ ░░ ░░ ░░ C  R  E  A  M  ░░ ░░
░░ ░░ ░░ ░░ ░░ ░░ ░░ R  ░░ ░░ ░░
M  I  D  N  I  G  H  T  ░░ ░░ ░░
Y  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
N  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
A  T  L  I  E  N  S  ░░ ░░ S  ░░
M  ░░ ░░ ░░ ░░ ░░ K  ░░ ░░ T  ░░
E  ░░ ░░ R  E  M  I  X  ░░ A  ░░
I  ░░ ░░ ░░ ░░ ░░ L  ░░ ░░ T  ░░
S  P  R  E  A  D  L  O  V  E  ░░
░░ ░░ ░░ ░░ ░░ ░░ S  ░░ ░░ ░░ ░░
```

#### [T08] "Bossa Nova" — WARNING (Score: 93/100)
- **Archetype**: `themed`
- **Repetitiveness**: Unique Tracks: 77% (23/30) | Jaccard Overlap: 0.18
- **Length Variety**: Short (3-5): 47% | Medium (6-8): 37% | Long (9+): 17%
- **Popularity**: Min: 30, Max: 76, Avg: 51, StdDev: 13 (High: 13%, Mid: 63%, Catalog: 23%)
- **Violations**:
  - ✗ Language compliance failure (1 tracks): Bossa Nova prompt has non-Portuguese/Spanish/English track: Caetano Veloso - "Trem Das Cores (Ao Vivo)" [de]

```
░░ A  L  A  B  A  M  A  ░░ ░░ ░░ ░░
░░ ░░ ░░ ░░ E  ░░ ░░ ░░ ░░ ░░ ░░ ░░
░░ ░░ B  ░░ B  ░░ G  ░░ ░░ ░░ ░░ ░░
I  P  A  N  E  M  A  ░░ M  ░░ ░░ ░░
░░ ░░ N  ░░ R  ░░ M  ░░ A  ░░ ░░ ░░
░░ ░░ D  ░░ ░░ ░░ E  ░░ R  ░░ ░░ ░░
░░ G  A  L  C  O  S  T  A  ░░ B  ░░
░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ C  ░░ R  ░░
░░ ░░ ░░ ░░ ░░ C  O  R  A  C  A  O
░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ T  ░░ Z  ░░
░░ ░░ ░░ ░░ ░░ ░░ V  O  U  ░░ I  ░░
░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ L  ░░
```

#### [T09] "Reggae Roots" — PASSED (Score: 100/100)
- **Archetype**: `themed`
- **Repetitiveness**: Unique Tracks: 90% (27/30) | Jaccard Overlap: 0.05
- **Length Variety**: Short (3-5): 53% | Medium (6-8): 37% | Long (9+): 10%
- **Popularity**: Min: 70, Max: 98, Avg: 79, StdDev: 8.3 (High: 100%, Mid: 0%, Catalog: 0%)
- **Violations**: None (100% clean)

```
░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ H  ░░ ░░
░░ ░░ ░░ ░░ S  ░░ V  ░░ E  ░░ ░░
░░ ░░ ░░ D  A  R  E  L  L  ░░ ░░
░░ D  ░░ ░░ F  ░░ R  ░░ L  ░░ ░░
░░ A  ░░ ░░ A  ░░ A  ░░ O  ░░ ░░
░░ D  I  L  E  ░░ N  ░░ ░░ ░░ S
░░ D  ░░ ░░ R  ░░ O  ░░ T  ░░ T
░░ Y  ░░ ░░ A  ░░ R  ░░ A  ░░ I
░░ ░░ ░░ ░░ ░░ N  O  R  I  E  L
░░ ░░ ░░ ░░ ░░ ░░ S  ░░ N  ░░ L
A  N  U  E  L  A  A  ░░ Y  ░░ ░░
```

#### [T10] "K-Pop 2010s" — PASSED (Score: 100/100)
- **Archetype**: `themed`
- **Repetitiveness**: Unique Tracks: 90% (26/29) | Jaccard Overlap: 0.06
- **Length Variety**: Short (3-5): 45% | Medium (6-8): 38% | Long (9+): 17%
- **Popularity**: Min: 20, Max: 65, Avg: 37, StdDev: 15.8 (High: 0%, Mid: 41%, Catalog: 59%)
- **Violations**: None (100% clean)

```
░░ R  E  D  V  E  L  V  E  T  ░░
░░ ░░ X  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
░░ N  O  W  ░░ S  ░░ ░░ ░░ ░░ ░░
░░ ░░ ░░ H  ░░ O  ░░ ░░ B  ░░ ░░
░░ R  E  A  L  L  Y  ░░ I  ░░ ░░
░░ ░░ ░░ T  ░░ O  ░░ ░░ G  ░░ ░░
░░ ░░ ░░ I  ░░ ░░ ░░ ░░ B  ░░ ░░
░░ ░░ ░░ S  ░░ ░░ ░░ C  A  N  T
░░ ░░ ░░ L  ░░ ░░ ░░ ░░ N  ░░ ░░
S  M  O  O  T  H  I  N  G  ░░ ░░
░░ ░░ ░░ V  ░░ ░░ ░░ ░░ ░░ ░░ ░░
░░ ░░ ░░ E  ░░ ░░ ░░ ░░ ░░ ░░ ░░
```

### Suite: CUSTOM

#### [C01] "songs by Queen" — PASSED (Score: 100/100)
- **Archetype**: `custom`
- **Repetitiveness**: Unique Tracks: 93% (28/30) | Jaccard Overlap: 0.04
- **Length Variety**: Short (3-5): 70% | Medium (6-8): 30% | Long (9+): 0%
- **Popularity**: Min: 30, Max: 96, Avg: 55, StdDev: 18.8 (High: 20%, Mid: 60%, Catalog: 20%)
- **Violations**: None (100% clean)

```
░░ ░░ ░░ ░░ ░░ ░░ W  H  I  T  E
░░ ░░ ░░ ░░ ░░ ░░ I  ░░ ░░ ░░ ░░
░░ ░░ ░░ ░░ ░░ ░░ L  ░░ ░░ ░░ ░░
Y  O  U  R  S  E  L  F  ░░ S  ░░
░░ ░░ ░░ ░░ T  ░░ ░░ ░░ ░░ E  ░░
░░ ░░ ░░ B  O  H  E  M  I  A  N
░░ D  ░░ ░░ N  ░░ ░░ I  ░░ S  ░░
Y  O  U  R  E  ░░ ░░ R  ░░ I  ░░
░░ N  ░░ ░░ ░░ ░░ H  A  R  D  ░░
░░ T  ░░ ░░ ░░ ░░ ░░ C  ░░ E  ░░
░░ ░░ ░░ ░░ ░░ ░░ ░░ L  ░░ ░░ ░░
░░ ░░ ░░ ░░ ░░ ░░ ░░ E  ░░ ░░ ░░
```

#### [C02] "songs by Daft Punk" — PASSED (Score: 100/100)
- **Archetype**: `custom`
- **Repetitiveness**: Unique Tracks: 93% (28/30) | Jaccard Overlap: 0.04
- **Length Variety**: Short (3-5): 63% | Medium (6-8): 30% | Long (9+): 7%
- **Popularity**: Min: 20, Max: 95, Avg: 48, StdDev: 14.4 (High: 3%, Mid: 70%, Catalog: 27%)
- **Violations**: None (100% clean)

```
░░ ░░ ░░ ░░ ░░ ░░ P  ░░ ░░ ░░ ░░ ░░ ░░
░░ ░░ O  H  Y  E  A  H  ░░ ░░ ░░ ░░ ░░
░░ ░░ ░░ ░░ ░░ ░░ R  ░░ ░░ S  ░░ ░░ ░░
░░ ░░ ░░ D  A  F  T  ░░ ░░ H  ░░ ░░ ░░
░░ ░░ ░░ I  ░░ ░░ ░░ ░░ W  O  R  L  D
░░ ░░ ░░ S  ░░ ░░ ░░ L  ░░ R  ░░ ░░ ░░
░░ ░░ ░░ C  I  R  C  U  I  T  ░░ ░░ ░░
░░ Q  ░░ W  ░░ ░░ ░░ C  ░░ ░░ ░░ ░░ ░░
H  U  M  A  N  ░░ ░░ K  ░░ ░░ ░░ ░░ ░░
░░ O  ░░ R  ░░ ░░ ░░ Y  ░░ ░░ ░░ ░░ ░░
░░ ░░ ░░ S  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
```

#### [C03] "chill acoustic coffeehouse" — PASSED (Score: 100/100)
- **Archetype**: `custom`
- **Repetitiveness**: Unique Tracks: 97% (29/30) | Jaccard Overlap: 0.02
- **Length Variety**: Short (3-5): 50% | Medium (6-8): 37% | Long (9+): 13%
- **Popularity**: Min: 0, Max: 83, Avg: 51, StdDev: 24.1 (High: 30%, Mid: 43%, Catalog: 27%)
- **Violations**: None (100% clean)

```
░░ ░░ ░░ ░░ ░░ C  ░░ ░░ ░░
░░ ░░ ░░ ░░ ░░ H  ░░ A  ░░
░░ ░░ ░░ ░░ R  I  G  H  T
░░ ░░ ░░ ░░ ░░ L  ░░ A  ░░
░░ P  ░░ ░░ ░░ L  ░░ ░░ ░░
░░ E  ░░ B  E  A  T  S  ░░
░░ S  Z  A  ░░ ░░ ░░ A  ░░
░░ A  ░░ D  ░░ ░░ ░░ N  ░░
░░ D  ░░ ░░ F  ░░ ░░ ░░ ░░
T  O  M  W  A  L  K  E  R
░░ ░░ ░░ ░░ S  ░░ ░░ ░░ ░░
░░ ░░ ░░ ░░ T  ░░ ░░ ░░ ░░
```

#### [C04] "rap hits between 2018 and 2024" — PASSED (Score: 100/100)
- **Archetype**: `custom`
- **Repetitiveness**: Unique Tracks: 80% (24/30) | Jaccard Overlap: 0.15
- **Length Variety**: Short (3-5): 60% | Medium (6-8): 30% | Long (9+): 10%
- **Popularity**: Min: 60, Max: 85, Avg: 74, StdDev: 6.4 (High: 80%, Mid: 20%, Catalog: 0%)
- **Violations**: None (100% clean)

```
░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ S  ░░
░░ ░░ ░░ ░░ ░░ ░░ ░░ J  ░░ ░░ A  ░░
░░ ░░ ░░ ░░ ░░ ░░ ░░ U  ░░ ░░ B  ░░
░░ E  ░░ G  ░░ ░░ M  I  R  R  O  R
░░ A  ░░ O  ░░ ░░ ░░ C  ░░ ░░ T  ░░
░░ R  E  D  B  O  N  E  ░░ ░░ A  ░░
░░ F  ░░ I  ░░ ░░ ░░ ░░ ░░ ░░ G  ░░
░░ Q  ░░ S  ░░ ░░ D  R  A  K  E  ░░
░░ U  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
J  A  Y  Z  ░░ S  ░░ ░░ ░░ ░░ ░░ ░░
░░ K  ░░ ░░ ░░ A  ░░ ░░ ░░ ░░ ░░ ░░
░░ E  V  E  R  Y  B  O  D  Y  S  ░░
```

#### [C05] "rock before 1975" — PASSED (Score: 100/100)
- **Archetype**: `custom`
- **Repetitiveness**: Unique Tracks: 53% (16/30) | Jaccard Overlap: 0.43
- **Length Variety**: Short (3-5): 50% | Medium (6-8): 27% | Long (9+): 23%
- **Popularity**: Min: 13, Max: 88, Avg: 52, StdDev: 25.6 (High: 43%, Mid: 23%, Catalog: 33%)
- **Violations**: None (100% clean)

```
░░ P  ░░ ░░ ░░ ░░ ░░ ░░ R  ░░ ░░ ░░
░░ A  ░░ ░░ ░░ ░░ ░░ B  I  R  D  S
M  I  N  D  S  ░░ Y  ░░ D  ░░ ░░ ░░
░░ N  ░░ ░░ ░░ L  O  V  E  ░░ ░░ ░░
░░ T  I  N  Y  ░░ U  ░░ R  ░░ ░░ ░░
░░ I  ░░ ░░ ░░ ░░ R  ░░ S  ░░ ░░ ░░
░░ T  ░░ ░░ ░░ ░░ S  ░░ ░░ ░░ T  ░░
░░ B  ░░ E  L  T  O  N  J  O  H  N
░░ L  ░░ ░░ ░░ ░░ N  ░░ ░░ ░░ A  ░░
F  A  L  L  I  N  G  ░░ ░░ ░░ T  ░░
░░ C  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ S  ░░
░░ K  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
```

#### [C06] "songs by Taylor Swift" — PASSED (Score: 100/100)
- **Archetype**: `custom`
- **Repetitiveness**: Unique Tracks: 93% (28/30) | Jaccard Overlap: 0.04
- **Length Variety**: Short (3-5): 67% | Medium (6-8): 23% | Long (9+): 10%
- **Popularity**: Min: 43, Max: 79, Avg: 60, StdDev: 9.3 (High: 17%, Mid: 83%, Catalog: 0%)
- **Violations**: None (100% clean)

```
░░ ░░ ░░ L  ░░ ░░ ░░ ░░ B  ░░ W
░░ ░░ ░░ O  ░░ ░░ ░░ ░░ R  ░░ I
░░ S  T  O  R  Y  ░░ L  O  M  L
░░ O  ░░ K  ░░ ░░ ░░ ░░ K  ░░ D
░░ P  ░░ ░░ ░░ ░░ D  ░░ E  ░░ E
░░ H  O  W  ░░ R  A  I  N  ░░ S
░░ I  ░░ ░░ ░░ ░░ D  ░░ ░░ ░░ T
C  A  S  S  A  N  D  R  A  ░░ ░░
░░ ░░ ░░ ░░ ░░ ░░ Y  ░░ ░░ ░░ ░░
```

#### [C07] "obscure punk rock before 1990" — PASSED (Score: 100/100)
- **Archetype**: `custom`
- **Repetitiveness**: Unique Tracks: 80% (24/30) | Jaccard Overlap: 0.14
- **Length Variety**: Short (3-5): 53% | Medium (6-8): 37% | Long (9+): 10%
- **Popularity**: Min: 20, Max: 92, Avg: 56, StdDev: 18.5 (High: 33%, Mid: 37%, Catalog: 30%)
- **Violations**: None (100% clean)

```
░░ ░░ D  I  R  T  Y  ░░ ░░
░░ ░░ I  ░░ ░░ ░░ ░░ ░░ ░░
B  O  S  T  O  N  ░░ ░░ ░░
░░ ░░ E  ░░ ░░ ░░ P  U  T
░░ ░░ A  ░░ M  ░░ I  ░░ ░░
░░ ░░ S  ░░ O  ░░ N  ░░ L
Q  U  E  E  N  ░░ K  ░░ O
░░ ░░ ░░ ░░ D  ░░ F  ░░ V
░░ ░░ C  H  A  R  L  I  E
░░ ░░ ░░ ░░ Y  ░░ O  ░░ ░░
░░ ░░ ░░ ░░ ░░ ░░ Y  ░░ ░░
░░ ░░ ░░ ░░ D  I  D  N  T
```

#### [C08] "summer pop anthems 2020-2024" — PASSED (Score: 100/100)
- **Archetype**: `custom`
- **Repetitiveness**: Unique Tracks: 97% (29/30) | Jaccard Overlap: 0.02
- **Length Variety**: Short (3-5): 47% | Medium (6-8): 37% | Long (9+): 17%
- **Popularity**: Min: 70, Max: 92, Avg: 82, StdDev: 6.7 (High: 100%, Mid: 0%, Catalog: 0%)
- **Violations**: None (100% clean)

```
░░ B  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
░░ R  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ H  O  W
D  O  J  A  C  A  T  ░░ ░░ M  ░░ ░░ I
░░ K  ░░ V  ░░ ░░ ░░ ░░ ░░ A  I  N  T
░░ E  ░░ A  D  E  L  E  ░░ N  ░░ ░░ H
░░ ░░ ░░ M  ░░ ░░ ░░ ░░ ░░ T  ░░ ░░ O
░░ ░░ ░░ A  N  T  I  H  E  R  O  ░░ U
░░ ░░ ░░ X  ░░ ░░ ░░ ░░ ░░ A  ░░ ░░ T
░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ M
░░ ░░ ░░ ░░ ░░ D  Y  N  A  M  I  T  E
```

#### [C09] "songs by Michael Jackson" — PASSED (Score: 100/100)
- **Archetype**: `custom`
- **Repetitiveness**: Unique Tracks: 93% (28/30) | Jaccard Overlap: 0.04
- **Length Variety**: Short (3-5): 57% | Medium (6-8): 37% | Long (9+): 7%
- **Popularity**: Min: 24, Max: 97, Avg: 57, StdDev: 20.9 (High: 33%, Mid: 40%, Catalog: 27%)
- **Violations**: None (100% clean)

```
░░ ░░ L  O  V  I  N  G  ░░ C  ░░
░░ ░░ ░░ ░░ ░░ ░░ ░░ H  O  L  D
░░ ░░ ░░ D  I  S  C  O  ░░ O  ░░
░░ ░░ ░░ ░░ ░░ O  ░░ S  ░░ S  ░░
░░ ░░ ░░ W  ░░ M  ░░ T  ░░ E  ░░
X  S  C  A  P  E  ░░ S  ░░ T  ░░
░░ C  ░░ L  ░░ T  ░░ ░░ ░░ ░░ ░░
░░ R  ░░ L  ░░ H  ░░ ░░ ░░ ░░ ░░
░░ E  ░░ ░░ ░░ I  ░░ ░░ ░░ ░░ ░░
░░ A  ░░ ░░ O  N  E  ░░ ░░ ░░ ░░
░░ M  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
```

#### [C10] "electronic beats after 2015" — PASSED (Score: 100/100)
- **Archetype**: `custom`
- **Repetitiveness**: Unique Tracks: 93% (28/30) | Jaccard Overlap: 0.04
- **Length Variety**: Short (3-5): 47% | Medium (6-8): 37% | Long (9+): 17%
- **Popularity**: Min: 52, Max: 95, Avg: 74, StdDev: 11.4 (High: 60%, Mid: 40%, Catalog: 0%)
- **Violations**: None (100% clean)

```
░░ ░░ S  ░░ ░░ ░░ ░░ A  ░░ ░░ ░░ ░░
L  E  T  M  E  L  O  V  E  Y  O  U
O  ░░ A  ░░ ░░ ░░ ░░ I  ░░ ░░ ░░ ░░
V  ░░ Y  O  U  ░░ S  C  A  R  E  D
E  ░░ W  ░░ ░░ ░░ ░░ I  ░░ ░░ ░░ ░░
░░ ░░ I  ░░ M  U  S  I  C  ░░ ░░ ░░
░░ ░░ T  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
░░ W  H  A  T  E  V  E  R  ░░ ░░ ░░
░░ ░░ M  ░░ ░░ ░░ ░░ ░░ A  ░░ ░░ ░░
░░ ░░ E  ░░ ░░ ░░ ░░ ░░ V  ░░ ░░ ░░
░░ ░░ ░░ ░░ ░░ ░░ ░░ Z  E  D  D  ░░
```

### Suite: EDGE_CASES

#### [E01] "anime openings" — PASSED (Score: 100/100)
- **Archetype**: `standard`
- **Repetitiveness**: Unique Tracks: 73% (22/30) | Jaccard Overlap: 0.18
- **Length Variety**: Short (3-5): 67% | Medium (6-8): 30% | Long (9+): 3%
- **Popularity**: Min: 1, Max: 75, Avg: 37, StdDev: 22.9 (High: 13%, Mid: 37%, Catalog: 50%)
- **Violations**: None (100% clean)

```
░░ J  A  K  A  ░░ ░░ ░░ ░░ ░░ ░░
░░ ░░ ░░ ░░ L  ░░ ░░ ░░ ░░ ░░ ░░
K  ░░ T  H  E  M  E  ░░ ░░ ░░ ░░
A  ░░ ░░ ░░ X  ░░ ░░ ░░ ░░ ░░ ░░
N  ░░ N  I  G  H  T  M  A  R  E
A  ░░ ░░ ░░ ░░ ░░ U  ░░ ░░ U  ░░
B  L  U  E  B  I  R  D  ░░ N  ░░
O  ░░ ░░ ░░ ░░ ░░ N  ░░ S  ░░ ░░
O  ░░ ░░ ░░ ░░ ░░ S  O  N  G  ░░
N  ░░ ░░ ░░ ░░ ░░ ░░ ░░ O  ░░ ░░
░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ W  ░░ ░░
```

#### [E02] "80s Japanese City Pop" — PASSED (Score: 100/100)
- **Archetype**: `standard`
- **Repetitiveness**: Unique Tracks: 74% (20/27) | Jaccard Overlap: 0.15
- **Length Variety**: Short (3-5): 33% | Medium (6-8): 19% | Long (9+): 48%
- **Popularity**: Min: 2, Max: 11, Avg: 6, StdDev: 2.3 (High: 0%, Mid: 0%, Catalog: 100%)
- **Violations**: None (100% clean)

```
░░ ░░ ░░ ░░ R  ░░ T  ░░ ░░ ░░ ░░ M
░░ ░░ T  A  E  K  O  O  N  U  K  I
░░ ░░ ░░ ░░ C  ░░ K  ░░ ░░ ░░ ░░ K
░░ S  ░░ ░░ I  ░░ I  ░░ M  ░░ ░░ I
░░ H  ░░ ░░ P  ░░ N  ░░ E  ░░ ░░ M
Y  O  A  K  E  ░░ O  ░░ L  ░░ ░░ A
░░ U  ░░ ░░ ░░ ░░ T  ░░ O  ░░ ░░ T
░░ S  H  E  T  L  A  N  D  ░░ ░░ S
░░ O  ░░ ░░ ░░ ░░ B  ░░ I  ░░ ░░ U
░░ K  ░░ ░░ ░░ ░░ I  ░░ O  ░░ ░░ B
░░ U  ░░ ░░ ░░ ░░ B  ░░ U  ░░ ░░ A
░░ ░░ ░░ ░░ ░░ ░░ I  ░░ S  ░░ ░░ R
░░ ░░ H  E  A  R  T  ░░ ░░ ░░ ░░ A
░░ ░░ ░░ ░░ ░░ ░░ O  ░░ ░░ ░░ ░░ ░░
```

#### [E03] "songs by Queen" — PASSED (Score: 100/100)
- **Archetype**: `standard`
- **Repetitiveness**: Unique Tracks: 93% (28/30) | Jaccard Overlap: 0.05
- **Length Variety**: Short (3-5): 63% | Medium (6-8): 30% | Long (9+): 7%
- **Popularity**: Min: 30, Max: 74, Avg: 46, StdDev: 11.4 (High: 3%, Mid: 70%, Catalog: 27%)
- **Violations**: None (100% clean)

```
░░ ░░ ░░ ░░ ░░ I  ░░ ░░ ░░ ░░ ░░ ░░
░░ ░░ ░░ ░░ O  N  E  ░░ ░░ ░░ ░░ ░░
░░ ░░ ░░ ░░ ░░ S  ░░ ░░ ░░ ░░ ░░ ░░
░░ ░░ ░░ ░░ L  I  V  E  ░░ ░░ ░░ ░░
░░ ░░ ░░ ░░ ░░ D  ░░ ░░ ░░ S  ░░ ░░
░░ ░░ ░░ B  R  E  A  K  T  H  R  U
░░ ░░ ░░ ░░ ░░ ░░ ░░ E  ░░ O  ░░ ░░
░░ ░░ ░░ ░░ ░░ T  I  E  ░░ W  H  O
░░ ░░ ░░ ░░ ░░ E  ░░ P  ░░ ░░ ░░ ░░
W  I  L  L  I  A  M  ░░ ░░ ░░ ░░ ░░
░░ ░░ ░░ ░░ ░░ R  ░░ ░░ ░░ ░░ ░░ ░░
```

#### [E04] "rock before 1975" — PASSED (Score: 100/100)
- **Archetype**: `standard`
- **Repetitiveness**: Unique Tracks: 47% (14/30) | Jaccard Overlap: 0.67
- **Length Variety**: Short (3-5): 53% | Medium (6-8): 30% | Long (9+): 17%
- **Popularity**: Min: 15, Max: 88, Avg: 54, StdDev: 25.3 (High: 43%, Mid: 27%, Catalog: 30%)
- **Violations**: None (100% clean)

```
E  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
L  ░░ ░░ B  I  R  D  S  ░░ ░░ ░░ ░░
V  ░░ P  ░░ ░░ ░░ ░░ O  ░░ ░░ ░░ ░░
I  ░░ I  ░░ ░░ ░░ ░░ U  ░░ ░░ H  ░░
S  O  N  G  ░░ ░░ ░░ N  ░░ ░░ E  ░░
P  ░░ K  ░░ B  O  B  D  Y  L  A  N
R  ░░ F  ░░ U  ░░ ░░ ░░ ░░ ░░ R  ░░
E  ░░ L  ░░ R  ░░ P  A  I  N  T  ░░
S  ░░ O  ░░ N  ░░ ░░ ░░ ░░ ░░ ░░ ░░
L  ░░ Y  ░░ I  ░░ ░░ ░░ ░░ ░░ ░░ ░░
E  ░░ D  A  N  C  E  R  ░░ ░░ ░░ ░░
Y  ░░ ░░ ░░ G  ░░ ░░ ░░ ░░ ░░ ░░ ░░
```

#### [E05] "K-Pop 2010s" — PASSED (Score: 100/100)
- **Archetype**: `standard`
- **Repetitiveness**: Unique Tracks: 77% (23/30) | Jaccard Overlap: 0.16
- **Length Variety**: Short (3-5): 57% | Medium (6-8): 37% | Long (9+): 7%
- **Popularity**: Min: 20, Max: 72, Avg: 40, StdDev: 17.2 (High: 3%, Mid: 37%, Catalog: 60%)
- **Violations**: None (100% clean)

```
░░ ░░ B  ░░ ░░ ░░ ░░ S  ░░ T  ░░ H
░░ ░░ I  ░░ S  O  L  O  ░░ H  ░░ O
░░ ░░ G  ░░ E  ░░ ░░ W  ░░ A  ░░ P
B  ░░ B  ░░ V  ░░ S  H  I  N  E  E
E  ░░ A  ░░ E  ░░ ░░ A  ░░ K  ░░ ░░
E  ░░ N  ░░ N  ░░ ░░ T  ░░ U  ░░ ░░
N  I  G  H  T  ░░ ░░ ░░ ░░ ░░ ░░ ░░
░░ ░░ ░░ ░░ E  ░░ ░░ ░░ ░░ ░░ ░░ ░░
░░ ░░ ░░ ░░ E  ░░ ░░ ░░ ░░ ░░ ░░ ░░
░░ ░░ F  A  N  C  Y  ░░ ░░ ░░ ░░ ░░
```

#### [E06] "French House" — PASSED (Score: 100/100)
- **Archetype**: `standard`
- **Repetitiveness**: Unique Tracks: 80% (24/30) | Jaccard Overlap: 0.18
- **Length Variety**: Short (3-5): 43% | Medium (6-8): 37% | Long (9+): 20%
- **Popularity**: Min: 51, Max: 93, Avg: 71, StdDev: 12.5 (High: 43%, Mid: 57%, Catalog: 0%)
- **Violations**: None (100% clean)

```
░░ ░░ C  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
░░ L  A  D  Y  ░░ ░░ ░░ ░░ ░░ ░░
B  ░░ S  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
L  O  S  T  ░░ ░░ ░░ ░░ ░░ ░░ ░░
I  ░░ I  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░
Z  ░░ M  ░░ S  ░░ ░░ ░░ T  ░░ G
Z  ░░ M  ░░ H  ░░ ░░ F  A  C  E
A  ░░ ░░ ░░ O  ░░ ░░ ░░ K  ░░ N
R  O  S  E  R  O  U  G  E  ░░ E
D  ░░ ░░ ░░ T  ░░ ░░ ░░ ░░ ░░ S
░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ I
░░ ░░ ░░ ░░ C  A  S  S  I  U  S
```
