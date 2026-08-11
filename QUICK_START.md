# 🚀 COBRA Assistant - Quick Start Guide

## ✅ Your Setup (Already Done!)

- ✅ API Key configured (AQ format)
- ✅ Code updated for new API
- ✅ Fetch-based implementation ready
- ✅ Multi-endpoint fallback enabled

---

## 🎯 Test Right Now (3 Steps)

### Step 1: Restart Dev Server
```bash
npm run dev
```

### Step 2: Open Browser
Go to your dev URL (usually `http://localhost:5173`)

### Step 3: Click Chatbot
- Look bottom-right corner
- Click circular button
- Ask: **"Hello, can you help me?"**

---

## ✅ If It Works

You'll see:
```
🤖 Hi! I am COBRA Assistant, your SWU-IFSS 
intelligent assistant. Ask me about rooms, 
schedules, availability, equipment, and 
facility performance.
```

**Next**: Try these queries:
- "Find a room for 40 students"
- "Which rooms have projectors?"
- "Show available rooms today"

---

## ⚠️ If It Doesn't Work

### Check Console (F12)
Look for errors. Common ones:

**"All API endpoints failed"**
→ Share the exact error message with me

**"Invalid API key"**
→ Verify `.env` has: `VITE_GEMINI_API_KEY=YOUR_API_KEY_HERE`

**Network error**
→ Check internet connection

---

## 📊 What Changed

### New Implementation
- **File**: `ragChatbotService_fetch.js`
- **Method**: Direct HTTP requests (no SDK)
- **Benefit**: Works with AQ keys

### Tries These Endpoints:
1. `/v1/models/gemini-1.5-flash` ← Tries first
2. `/v1beta/models/gemini-1.5-flash` ← Fallback
3. `/v1/models/gemini-pro` ← Last resort

---

## 💡 Quick Test Queries

### Room Search:
```
"Find a room for 40 students"
"Show me all classrooms with projectors"
"What's the largest room available?"
```

### Availability:
```
"Is Room 301 available tomorrow at 2 PM?"
"Show available rooms this Friday"
"What rooms are free right now?"
```

### Equipment:
```
"Which rooms have air conditioning?"
"Show me all computer labs"
"Find rooms with smart boards"
```

---

## 📁 Key Files

| File | Purpose | Status |
|------|---------|--------|
| `.env` | API key | ✅ Configured |
| `ragChatbotService_fetch.js` | RAG logic | ✅ Ready |
| `CobraChatbot.jsx` | UI | ✅ Updated |

---

## 🐛 Quick Fixes

### Not seeing chatbot button?
→ Scroll down, bottom-right corner

### Loading forever?
→ Check console for errors

### Empty responses?
→ Verify Firestore has data

### API key error?
→ Make sure `.env` key starts with `AQ.`

---

## 📞 Need Help?

1. **Test first** - Try the chatbot
2. **Check console** - Open F12, look for errors
3. **Share error** - Copy exact message
4. **Screenshot** - If helpful

---

## 🎉 Expected Result

### Working Chatbot:
```
👤 You: "Find a room for 40 students"

🤖 COBRA: Based on your requirement for 40+ 
capacity, here are available rooms:

1. Room 305 (Main Building, 3rd Floor)
   - Capacity: 45 people
   - Equipment: Projector, Whiteboard, AC
   - Status: Available
   
[... more rooms ...]

Would you like to check their availability?
```

---

## ⚡ Next Steps

### If Working:
1. ✅ Test with real queries
2. ✅ Train users
3. ✅ Monitor usage
4. ✅ Collect feedback

### If Not Working:
1. Share console error
2. Note which endpoint failed
3. Check network tab
4. I'll help debug

---

**Ready? Test it now!** 🚀

Open browser → Click chatbot → Ask question → Get AI response!
