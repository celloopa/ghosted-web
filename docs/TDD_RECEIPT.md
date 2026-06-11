# TDD Receipt — M1 core domain

Case-study artifact #2 (interview §23): the failing run existed before the
implementation. Both runs below are verbatim from 2026-06-11.

## Red — 44 tests written, zero implementation

```
 FAIL  test/derived.test.ts [ test/derived.test.ts ]
Error: Cannot find module '../src/index' imported from '.../test/derived.test.ts'
 FAIL  test/importV1.test.ts [ test/importV1.test.ts ]
Error: Cannot find module '../src/index' imported from '.../test/importV1.test.ts'
 FAIL  test/stats.test.ts [ test/stats.test.ts ]
Error: Cannot find module '../src/index' imported from '.../test/stats.test.ts'
 FAIL  test/transition.test.ts [ test/transition.test.ts ]
Error: Cannot find module '../src/index' imported from '.../test/transition.test.ts'
```

## Green — implementation written against the tests

```
 ✓ test/derived.test.ts (13 tests) 2ms
 ✓ test/transition.test.ts (9 tests) 3ms
 ✓ test/stats.test.ts (11 tests) 3ms
 ✓ test/importV1.test.ts (11 tests) 4ms

 Test Files  4 passed (4)
      Tests  44 passed (44)
   Duration  502ms (tests 12ms)
```

Every M1 acceptance criterion from GHOSTED_V2_PLAN.md exists as a named test:

| Plan criterion | Test |
|---|---|
| `transition` enforces legal moves; closed requires reason | `transition.test.ts` (9) |
| `isGhosted` true at exactly threshold+1, false with response | `derived.test.ts` |
| `needsFollowUp` 7-day cadence, stops after response | `derived.test.ts` |
| `computeStats` rates/groupings, empty + unclassified groups | `stats.test.ts` (11) |
| `parseV1Import` lossless 8→5 mapping, typed errors, never throws | `importV1.test.ts` (11) |
