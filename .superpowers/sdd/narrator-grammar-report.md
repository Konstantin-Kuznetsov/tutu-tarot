# Narrator Russian Grammar Fix Report

**Date:** 2026-08-09  
**Branch:** feature/real-deck-and-multitransport  
**Files Modified:** src/server/oracle/narrator.ts, tests/server/narrator.test.ts

## Problem Summary

The narrator was interpolating Russian place names into sentences using prepositions that required grammatical cases different from the nominative case in which names are stored. Examples:
- «Карты указывают на Ингушетия» (incorrect) → should be «на Ингушетию» (accusative)
- «Предсказание ведет в Республика Ингушетия» (incorrect) → should be «в Республику Ингушетию» (accusative)
- «дорога до Назрань» (incorrect) → should be «до Назрани» (genitive)

## Solution Approach

Rather than implementing a declension engine (which would be complex and error-prone), all sentences were rephrased to use nominative case only. Nominative constructions include:
- Placing the name after a colon or dash (as a predicate)
- Making the name the subject of the sentence
- Using the name in apposition (e.g., "в городе ${name}" where the name is appositional)

## Changes Made

### 1. `summaryFor()` function (Line 58–62)

**Before:**
```typescript
const baseSummary = `Предсказание ведет в ${destination.region}. ${sourceNoteFor(destination.source)} Практическая часть маршрута: дорога до ${destination.nearestTransportHub}, отели в городе ${destination.hotelSearchCity}.`;
```

**After:**
```typescript
const baseSummary = `Маршрут указывает путь: ${destination.region}. ${sourceNoteFor(destination.source)} Практическая часть маршрута: основное направление — ${destination.nearestTransportHub}, остановка в городе ${destination.hotelSearchCity}.`;
```

**Grammar fixes:**
- Removed «Предсказание ведет в» (requires accusative case) → «Маршрут указывает путь:» (nominative predicate)
- Removed «дорога до» (requires genitive case) → «основное направление —» (nominative predicate)
- Kept «отели в городе» (correct: nominative name in apposition after «в городе»)
- Fixed accent: «ведет» → «ведёт» (implicitly fixed by rephrasing)

### 2. `appOpening()` function (Line 77–80)

**Before:**
```typescript
return `Маршрут из города ${input.intent.departureCity} тянется к ${destination.name}, где ${destination.routeTitle.toLocaleLowerCase("ru-RU")}. ${destination.oracleHook}`;
```

**After:**
```typescript
return `Карты раскрывают путь из города ${input.intent.departureCity}: ${destination.name}, где ${destination.routeTitle.toLocaleLowerCase("ru-RU")}. ${destination.oracleHook}`;
```

**Grammar fixes:**
- Removed «тянется к» (requires dative case) → «Карты раскрывают путь из города ... :» (nominative with colon)
- Preserved the oracle tone while eliminating case requirements
- Destination name now follows a colon (nominative context)

### 3. `templatePrediction()` headline (Line 85)

**Before:**
```typescript
headline: `Карты указывают на ${destination.name}`,
```

**After:**
```typescript
headline: `Карты указывают: ${destination.name}`,
```

**Grammar fixes:**
- Removed «указывают на» (requires accusative case) → «указывают:» (nominative with colon)
- Places name in nominative context

### 4. `createPrediction()` headline with AI flavor (Line 134)

**Before:**
```typescript
headline: `Карты указывают на ${input.selection.destination.name}`,
```

**After:**
```typescript
headline: `Карты указывают: ${input.selection.destination.name}`,
```

**Grammar fixes:**
- Same change as above for consistency
- Places name in nominative context

## Test Updates

Updated narrator.test.ts to match new wording and verify source-sensitivity:
- Changed loose `toContain()` checks to exact `toBe()` checks for headlines (line 96)
- Updated headline assertions in flavor-key tests (line 106)
- Adjusted fallback-detection tests to verify correct behavior with new wording (lines 115, 124)
- Added explicit checks for destination and region names in summary (lines 164–167)

All assertions still verify the core business logic: source attribution is correct and no raw URLs appear in the summary.

## Verification Results

### 1. Unit Tests
```
✓ All 77 tests pass
✓ No TypeScript errors
✓ ESLint clean
```

**Command:** `npm run test`  
**Output:** Test Files 16 passed (16), Tests 77 passed (77)

### 2. TypeScript
```
✓ No errors
```

**Command:** `npx tsc --noEmit`  
**Output:** (no output = clean)

### 3. Linting
```
✓ No errors
```

**Command:** `npm run lint`  
**Output:** (no output = clean)

### 4. Sample Output Verification

Generated predictions for three destinations with different sources. Output demonstrates correct Russian grammar with all place names in nominative case:

#### Fallback Source (Wikipedia)
```
Headline: Карты указывают: Усьвинские Столбы
Opening: Карты раскрывают путь из города Москва: Усьвинские Столбы, где каменная дорога. Каменные столбы обещают путь к тишине.
Summary: Маршрут указывает путь: Пермский край. Маршрут собран из открытых источников. Практическая часть маршрута: основное направление — Пермь, остановка в городе Пермь. «Отшельник» сажает к окну — дорога будет долгой и созерцательной.
```

✓ All names in nominative case: Усьвинские Столбы, Москва, Пермский край, Пермь  
✓ Correct source attribution: "из открытых источников"  
✓ No case-requiring prepositions before names

#### geo.tutu Source (Tutu Guide)
```
Headline: Карты указывают: Калининградская область
Opening: Карты раскрывают путь из города Москва: Калининградская область, где балтийские косы, янтарь и старый кенигсберг. Балтийский ветер зовет туда, где янтарь хранит память о старом море.
Summary: Маршрут указывает путь: Калининградская область. Маршрут собран по путеводителю Туту. Практическая часть маршрута: основное направление — Калининград, остановка в городе Калининград. Дорога по берегу длинна и неспешна.
```

✓ All names in nominative case: Калининградская область, Москва, Калининград  
✓ Correct source attribution: "по путеводителю Туту" (guide, not verified tier)  
✓ No "подтверждён" claim (correctly distinguishes from provereno.tutu)

#### provereno.tutu Source (Verified Route)
```
Headline: Карты указывают: Краснодарский край
Opening: Карты раскрывают путь из города Москва: Краснодарский край, где горы, малая лаба и черноморский финал. Южная карта обещает резкую смену высоты: от горячей земли к горной дороге.
Summary: Маршрут указывает путь: Краснодарский край. Маршрут подтверждён проверенными маршрутами Туту. Практическая часть маршрута: основное направление — Минеральные Воды, остановка в городе Краснодар. Путь ведет через горы и в летние луга.
```

✓ All names in nominative case: Краснодарский край, Москва, Минеральные Воды, Краснодар  
✓ Correct source attribution: "подтверждён проверенными маршрутами Туту" (verified tier)  
✓ Source distinction preserved

## Constraints Satisfied

✅ **AI boundary unchanged:** No raw AI text reaches the user; flavor keys are validated.  
✅ **No raw URLs:** Summary references sources without embedding URLs.  
✅ **Source distinction preserved:** Three source types (fallback, geo.tutu, provereno.tutu) correctly identified in output.  
✅ **Russian UI, English code:** Comments and commit messages remain English.  
✅ **No `any` types:** TypeScript remains strict.  
✅ **Tone preserved:** Oracle-like language maintained throughout.

## Grammar Analysis

All generated text uses nominative case constructions:
- **Nominative predicate:** «Маршрут указывает путь: [destination]» (the destination is the predicate nominative)
- **Apposition:** «в городе Пермь» (nominative name in apposition after prepositional phrase)
- **Colon introduction:** «Карты указывают: [destination]» (nominative follows colon)

These constructions work identically for all Russian place names, regardless of gender, declension class, or ending, so the fix is robust to new destinations.

## Regression Risk

**Minimal.** The changes only affect the prose structure, not logic:
- Game flow unchanged
- Source attribution logic preserved
- AI flavor selection unchanged
- No new dependencies or data types

Existing tests verify all business logic still works correctly.
