# ✅ COBRA Assistant - Final Test Checklist

## 🎯 Current Configuration

- ✅ **API Key**: AQ format configured
- ✅ **Primary Model**: Gemini 2.0 Flash Experimental
- ✅ **Fallback Models**: 5 alternatives ready
- ✅ **Data Source**: Firestore (buildings & rooms)
- ✅ **Error Handling**: Graceful fallbacks enabled

---

## 🚀 Quick Test (30 seconds)

### Step 1: Refresh Browser ⟳
```
Press: Ctrl + Shift + R
```
**Why**: Load updated code with Gemini 2.0

### Step 2: Open Chatbot 💬
- Look: Bottom-right corner
- Click: Circular maroon button
- See: Chat window opens

### Step 3: Send Message ✉️
Type: **"Hello"**  
Click: Send button (or press Enter)

### Step 4: Check Console 🔍
Press F12, look for:
```
🔄 Trying: gemini-2.0-flash-exp...
✅ Success with: gemini-2.0-flash-exp
```

---

## ✅ Success Criteria

### You Know It's Working When:

**1. No Errors in Console** ✅
- No 404 errors
- No "model not found"
- Shows "✅ Success with..."

**2. Bot Responds** ✅
```
🤖 Hi! I'm COBRA Assistant, your SWU facility 
scheduling AI. I can help you find rooms...
```

**3. Loading Works** ✅
- Shows spinner during processing
- Takes 2-4 seconds
- Then displays response

---

## 🧪 Full Test Suite

Once "Hello" works, run these tests:

### Test 1: Simple Room Search
```
Query: "Find a room for 40 students"
Expected: List of rooms with 40+ capacity
Time: 2-4 seconds
```

### Test 2: Equipment Filter
```
Query: "Which rooms have projectors?"
Expected: Rooms with projector equipment
Time: 2-3 seconds
```

### Test 3: Building Query
```
Query: "Show all rooms in the main building"
Expected: Rooms filtered by building
Time: 2-3 seconds
```

### Test 4: Availability
```
Query: "What rooms are available now?"
Expected: Rooms without current bookings
Time: 2-4 seconds
```

### Test 5: Context Awareness
```
You: "Find rooms with 50 capacity"
Bot: [Lists rooms]
You: "Show the first one"
Bot: [Details about first room]
Expected: Remembers previous list
```

---

## 📊 Console Messages Guide

### ✅ GOOD Messages:
```
🔄 Trying: gemini-2.0-flash-exp...
✅ Success with: gemini-2.0-flash-exp
⚠️ Error fetching schedule entries (skipping)
```
**Meaning**: Everything working! Schedule permission is optional.

### ⚠️ WARNING Messages:
```
🔄 Trying: gemini-2.0-flash-exp...
❌ Failed (404)
🔄 Trying: gemini-1.5-flash-latest...
✅ Success with: gemini-1.5-flash-latest
```
**Meaning**: 2.0 not available, using 1.5 (still good!)

### ❌ ERROR Messages:
```
❌ Error: All API endpoints failed
```
**Meaning**: None of the models worked - need to debug

---

## 🐛 Common Issues & Fixes

### Issue 1: No Chatbot Button
**Problem**: Can't find button  
**Fix**: Scroll down, look bottom-right corner  
**Check**: Button is circular maroon with avatar

### Issue 2: Loading Forever
**Problem**: Spinner never stops  
**Fix**: Check console for errors  
**Action**: Share console messages

### Issue 3: "All endpoints failed"
**Problem**: No model works  
**Fix**: Verify API key in `.env`  
**Check**: Key starts with `AQ.`

### Issue 4: Empty Responses
**Problem**: Bot says nothing  
**Fix**: Check Firestore has data  
**Action**: Verify buildings collection exists

---

## 📝 What to Report

If something doesn't work, share:

### ✅ Include:
1. **Console messages** (copy/paste)
2. **Which test failed** (step number)
3. **What you typed** (your query)
4. **What happened** (error, empty, etc.)
5. **Screenshot** (if helpful)

### ❌ Don't need:
- React DevTools message (normal)
- WebSocket warnings (not related)
- Router warnings (not related)

---

## 🎯 Expected Results

### Test 1: Hello
```
👤 You: "Hello"

🤖 COBRA: Hi! I'm COBRA Assistant, your SWU 
Integrated Facility Scheduling System AI. I can 
help you find available rooms, check schedules, 
view equipment, and analyze facility performance.

How can I assist you today?
```

### Test 2: Room Search
```
👤 You: "Find a room for 40 students"

🤖 COBRA: Based on your requirement for 40+ 
capacity, here are available rooms:

1. **Room 305** (Main Building, 3rd Floor)
   - Capacity: 45 people
   - Equipment: Projector, Whiteboard, AC
   - Status: Available

2. **Room B-201** (Building B, 2nd Floor)
   - Capacity: 50 people
   - Equipment: Smart Board, Sound System
   - Status: Available

Would you like to check availability for a 
specific date and time?
```

---

## ⏱️ Performance Benchmarks

### Acceptable Response Times:
- **Hello**: 1-2 seconds ✅
- **Simple query**: 2-3 seconds ✅
- **Complex query**: 3-5 seconds ✅
- **Follow-up**: 1-2 seconds ✅

### If Slower:
- First query fetches all data (expected)
- Network latency (check connection)
- Large database (consider caching)

---

## 🎉 Success Checklist

Mark these off as you test:

- [ ] Browser refreshed (Ctrl+Shift+R)
- [ ] Chatbot button visible
- [ ] Chat window opens
- [ ] "Hello" query sent
- [ ] Response received
- [ ] No 404 errors in console
- [ ] Loading animation works
- [ ] Follow-up query works
- [ ] Context remembered
- [ ] Equipment query works
- [ ] Room search works

**All checked?** 🎊 Your chatbot is fully operational!

---

## 📞 Next Steps

### If All Tests Pass ✅:
1. Train users on capabilities
2. Share example queries
3. Monitor usage patterns
4. Collect feedback

### If Tests Fail ⚠️:
1. Share console errors
2. Note which test failed
3. Copy exact error message
4. I'll help debug immediately!

---

## 🚀 Ready?

**Let's test it:**

1. ⟳ Refresh browser now
2. 💬 Click chatbot button
3. ✉️ Type "Hello"
4. 👀 Watch it work!

**Report back with results!** 📊
