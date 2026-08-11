# Quick Testing Guide - Optimized Chatbot

## Test These 5 Queries to Verify Performance

### 1. Test Simple Query (Should be instant - <0.1s)
**Query:** `hi`  
**Expected:** Instant greeting without database loading  
**Look for:** No "Analyzing system data..." loading message

---

### 2. Test Room Search by Capacity (Should be 1-2s)
**Query:** `what are the rooms that are available for my event that requires computer with max 60 capacity for the date August 18, 2026`

**Expected Response Format (NO asterisks):**
```
AVAILABLE ROOMS:

Room TH-309
  Building: TechHub Building (TB), Floor 1
  Capacity: 59 people
  Equipment: Computers, Projector, Air Conditioning, Whiteboard, CCTV
  Status: Available (Operational)

ALTERNATIVE OPTIONS:

Room DOL-101
  Building: WesTech (DOL), Floor 1
  Capacity: 40 people
  Equipment: Computers, Projector, Audio System, CCTV, Internet
```

**Check:**
- ✅ NO asterisks or markdown symbols
- ✅ Clean professional formatting
- ✅ Response appears word-by-word (streaming)
- ✅ Total time: 1-2 seconds

---

### 3. Test Streaming (Watch response appear progressively)
**Query:** `show me all rooms with projectors`  
**Expected:** Text should appear word-by-word, not all at once  
**How to verify:** Watch closely - you should see the response "typing out"

---

### 4. Test Follow-up Question (Uses conversation context)
**First:** `what rooms have computers?`  
**Then:** `which one is the largest?`  
**Expected:** Should reference rooms from previous answer

---

### 5. Test Cache Speed (Should be faster)
**First query:** `rooms with 50 capacity` - will be 1-2 seconds  
**Wait 10 seconds**  
**Same query again:** `rooms with 50 capacity` - should be 0.5-1 second (faster!)

---

## Console Logs to Check

Open browser DevTools (F12) → Console tab:

### On Chat Open:
```
🚀 Pre-loading...
✅ Pre-loaded 45 rooms
```

### On First Query:
```
📦 Using cached data
```

### Performance Check:
- Network tab should show `streamGenerateContent` endpoint
- Response should start arriving in <1 second

---

## Common Issues & Fixes

### Issue: Response still has asterisks (**, *)
**Fix:** The optimization fixes this - make sure you're using the updated `ragChatbotService_fetch.js`

### Issue: Response takes 5+ seconds
**Possible causes:**
1. Cache not working - check console for "Fetching data..." (should say "Using cached data")
2. API key issue - verify it starts with `AQ`
3. Network slow - check DevTools Network tab timing

### Issue: "API key missing" error
**Fix:** Verify `.env` file has `VITE_GEMINI_API_KEY=AQ...`  
**Then:** Restart dev server (`npm run dev`)

### Issue: Streaming doesn't work (all text appears at once)
**Check:**
1. Browser supports async generators (Chrome 88+, Firefox 94+)
2. Console for JavaScript errors
3. Network tab shows `streamGenerateContent` endpoint

---

## Performance Targets

| Query Type | Target Time | What You'll See |
|------------|-------------|-----------------|
| Greetings ("hi", "thanks") | <0.1s | Instant |
| Room search (first time) | 1-2s | "Analyzing..." then response |
| Room search (cached) | 0.5-1.5s | Faster, uses cache |
| Simple follow-up | 0.8-1.5s | Quick context reuse |

---

## Professional Formatting Checklist

When testing responses, verify:
- ✅ NO asterisks (*)
- ✅ NO bold markers (**)
- ✅ NO markdown symbols
- ✅ Uses CAPITAL LETTERS for headers
- ✅ Uses dashes (-) or numbers (1., 2.) for lists
- ✅ Clean indentation for nested info
- ✅ Line breaks for readability

---

## Ready to Test!

1. Open your app: `npm run dev` (if not already running)
2. Click the COBRA chatbot button (bottom right)
3. Wait for "AI Ready - Instant Responses" indicator
4. Try the 5 test queries above
5. Check console logs for performance indicators

If all 5 tests pass, your optimized chatbot is working perfectly! 🚀
