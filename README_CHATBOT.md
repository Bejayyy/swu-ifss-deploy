# 🤖 COBRA Assistant - AI-Powered RAG Chatbot

## Overview

COBRA (Comprehensive Operational Bot for Room Administration) Assistant is an intelligent chatbot that uses **RAG (Retrieval-Augmented Generation)** technology with Google's Gemini AI to answer questions about your facility scheduling system using real-time Firestore data.

---

## 🎯 What Makes This Special?

### Traditional Chatbot:
```
User: "Find a room for 40 students"
Bot: "I don't have access to your room data."
```

### COBRA Assistant (RAG-Powered):
```
User: "Find a room for 40 students"
Bot: "Here are available rooms for 40+ students:
     - Room 305 (Main Building): 45 capacity
     - Room B-201 (Building B): 50 capacity
     Both have projectors and are available now."
```

**The difference?** COBRA queries YOUR actual database before answering!

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 🔍 **Smart Room Search** | Find rooms by capacity, equipment, location |
| 📅 **Availability Checking** | Real-time schedule verification |
| 🛠️ **Equipment Filtering** | Search by projectors, AC, computers, etc. |
| 📊 **Performance Analytics** | Room utilization and booking insights |
| 🔧 **Maintenance Tracking** | View maintenance status and schedules |
| 💬 **Context Awareness** | Remembers conversation for follow-ups |
| ⚡ **Real-Time Data** | Always queries latest Firestore data |
| 🎨 **Beautiful UI** | Modern, responsive chat interface |

---

## 📚 Documentation

We've created comprehensive guides for different audiences:

### For Developers:
- 📖 **[CHATBOT_RAG_SETUP.md](./CHATBOT_RAG_SETUP.md)** - Technical setup & configuration
- 🏗️ **[CHATBOT_IMPLEMENTATION_SUMMARY.md](./CHATBOT_IMPLEMENTATION_SUMMARY.md)** - Architecture & implementation details

### For Users:
- 👤 **[CHATBOT_USER_GUIDE.md](./CHATBOT_USER_GUIDE.md)** - How to use the chatbot
- 💡 **[CHATBOT_QUERY_EXAMPLES.md](./CHATBOT_QUERY_EXAMPLES.md)** - 100+ example queries

### Quick Links:
- [Quick Start Guide](#-quick-start)
- [Example Queries](#-example-queries)
- [Architecture](#-architecture)
- [Troubleshooting](#-troubleshooting)

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Get Your Gemini API Key
1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in and create an API key
3. Copy the key (starts with `AIza...`)

### 3. Configure Environment
Add to your `.env` file:
```env
VITE_GEMINI_API_KEY=AIzaSy...your_actual_key_here
```

### 4. Start Development Server
```bash
npm run dev
```

### 5. Test It Out!
- Look for the chatbot button in the bottom-right corner
- Click to open the chat window
- Try: "Find a room for 40 students"

---

## 💡 Example Queries

### Room Search:
```
✅ "Find an available room for 40 students"
✅ "Show me all rooms with projectors"
✅ "Which rooms have air conditioning?"
✅ "What's the largest classroom available?"
```

### Availability:
```
✅ "Is Room 301 available tomorrow at 2 PM?"
✅ "Show available rooms this Friday"
✅ "What rooms are free right now?"
```

### Equipment:
```
✅ "Which rooms have smart boards?"
✅ "Show me all computer labs"
✅ "Find rooms with video conferencing"
```

### Analytics:
```
✅ "Which rooms are most frequently booked?"
✅ "Show utilization rate for computer labs"
✅ "Which rooms are underutilized?"
```

**See [CHATBOT_QUERY_EXAMPLES.md](./CHATBOT_QUERY_EXAMPLES.md) for 100+ more examples!**

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│                    User Interface                │
│            (CobraChatbot Component)             │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│              RAG Service Layer                   │
│                                                  │
│  Step 1: Fetch Data from Firestore              │
│  ├─ Buildings → Floors → Rooms                  │
│  ├─ Room Reservations                           │
│  └─ Academic Schedules                          │
│                                                  │
│  Step 2: Build Context String                   │
│  └─ Format data for AI understanding            │
│                                                  │
│  Step 3: Query Gemini AI                        │
│  └─ Send context + user question                │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│         Gemini AI (gemini-1.5-flash)            │
│   Analyzes context and generates response       │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│            Response to User                      │
└─────────────────────────────────────────────────┘
```

---

## 📂 Project Structure

```
swu-iff-error/
├── src/
│   ├── components/
│   │   └── CobraChatbot.jsx          # Main chatbot component
│   └── services/
│       └── ragChatbotService.js      # RAG logic & Gemini integration
├── .env                               # Environment variables (API key)
├── package.json                       # Dependencies
└── Documentation/
    ├── CHATBOT_RAG_SETUP.md          # Setup guide
    ├── CHATBOT_QUERY_EXAMPLES.md     # Example queries
    ├── CHATBOT_USER_GUIDE.md         # User manual
    ├── CHATBOT_IMPLEMENTATION_SUMMARY.md  # Technical details
    └── README_CHATBOT.md             # This file
```

---

## 🔧 Technical Details

### Technology Stack:
- **Frontend**: React 19.2.6
- **AI Model**: Google Gemini 1.5 Flash
- **Database**: Firebase Firestore
- **SDK**: @google/generative-ai v0.21.0
- **UI Icons**: Lucide React

### Firestore Collections Used:
- `buildings` - Building information
- `buildings/{id}/floors` - Floor details
- `buildings/{id}/floors/{id}/rooms` - Room specifications
- `room_reservations` - Booking data
- `schedule_entries` - Academic schedules
- `maintenance_schedules` - Maintenance info

### Key Features:
- ✅ Real-time data fetching
- ✅ Context-aware conversations
- ✅ Error handling
- ✅ Loading states
- ✅ Dynamic quick prompts
- ✅ Responsive design

---

## 🎨 User Interface

### Chat Window:
```
┌──────────────────────────────────────┐
│ 🤖 COBRA Assistant          [X]      │
│ Smart Facility Chatbot               │
├──────────────────────────────────────┤
│ ✨ AI-Powered RAG System             │
│ Connected to Gemini AI               │
├──────────────────────────────────────┤
│                                      │
│ Bot: Hi! How can I help you?         │
│                  You: Find a room 👤 │
│                                      │
│ 💡 [Quick Prompts]                   │
├──────────────────────────────────────┤
│ [Type message here...]    [Send ➤]  │
└──────────────────────────────────────┘
```

### Visual Features:
- Gradient maroon header
- Bot avatar icon
- AI-powered badge
- Animated loading states
- Error handling UI
- Quick prompt buttons
- Responsive layout

---

## 🔒 Security

### API Key Protection:
- ✅ Stored in `.env` (gitignored)
- ✅ Never committed to version control
- ⚠️ Client-side exposure (visible in browser)

### Production Recommendations:
1. Use Firebase Cloud Functions for server-side API calls
2. Implement rate limiting per user
3. Add authentication requirements
4. Restrict API key in Google Cloud Console

---

## 📊 Usage Limits (Free Tier)

| Metric | Limit |
|--------|-------|
| Requests per minute | 15 |
| Requests per day | 1,500 |
| Tokens per minute | 1,000,000 |
| Context window | 1M tokens |

**For higher limits:** Upgrade to paid tier in Google AI Studio

---

## 🐛 Troubleshooting

### "API key is not configured"
**Fix**: Add `VITE_GEMINI_API_KEY` to `.env` and restart server

### "Failed to fetch data"
**Fix**: Verify Firestore collections exist and Firebase is configured

### Slow responses
**Expected**: First query fetches all data (~2-3 seconds)  
**Improvement**: Implement caching (see setup guide)

### Empty or generic responses
**Fix**: Ensure Firestore has data in buildings/rooms collections

**See [CHATBOT_RAG_SETUP.md](./CHATBOT_RAG_SETUP.md) for detailed troubleshooting**

---

## 📈 Performance Tips

### For Development:
- Use `gemini-1.5-flash` (fast, cost-effective) ✅ Already configured
- Cache frequently accessed data
- Limit conversation history to 10 messages

### For Production:
- Implement server-side API calls
- Add request throttling
- Use Redis for data caching
- Monitor API usage in Google AI Studio

---

## 🎓 Learning Resources

### Understand RAG:
- [What is RAG?](https://www.promptingguide.ai/techniques/rag)
- [Google Gemini Docs](https://ai.google.dev/gemini-api/docs)
- [RAG Best Practices](https://www.anthropic.com/index/retrieval-augmented-generation)

### Gemini API:
- [Official Documentation](https://ai.google.dev/gemini-api/docs/quickstart)
- [API Reference](https://ai.google.dev/api)
- [Rate Limits & Pricing](https://ai.google.dev/pricing)

---

## 🚀 Future Enhancements

### Planned Features:
- [ ] Voice input/output
- [ ] Multi-language support
- [ ] Chat history persistence
- [ ] Export conversations
- [ ] Advanced analytics dashboard
- [ ] Direct booking integration
- [ ] Mobile app version

### Performance:
- [ ] Data caching layer
- [ ] Request throttling
- [ ] Optimized context building
- [ ] Parallel data fetching

---

## 🤝 Contributing

### Found a Bug?
1. Check existing issues
2. Create detailed bug report
3. Include steps to reproduce

### Want to Improve?
1. Fork the repository
2. Create feature branch
3. Make changes
4. Submit pull request

---

## 📞 Support

### For Users:
- Read [CHATBOT_USER_GUIDE.md](./CHATBOT_USER_GUIDE.md)
- Try example queries from [CHATBOT_QUERY_EXAMPLES.md](./CHATBOT_QUERY_EXAMPLES.md)
- Contact registrar office for system issues

### For Developers:
- Read [CHATBOT_RAG_SETUP.md](./CHATBOT_RAG_SETUP.md)
- Review [CHATBOT_IMPLEMENTATION_SUMMARY.md](./CHATBOT_IMPLEMENTATION_SUMMARY.md)
- Check browser console for errors
- Verify Firestore data structure

---

## 📝 License

This chatbot implementation is part of the SWU-IFSS project.  
See main project LICENSE file for details.

---

## 🙏 Acknowledgments

- **Google Gemini AI** - For the powerful language model
- **Firebase/Firestore** - For real-time database
- **React Team** - For the UI framework
- **Lucide** - For beautiful icons

---

## 📢 Feedback

We're constantly improving COBRA Assistant!

**Share your experience:**
- 📧 Email: support@swu-ifss.com
- 💡 Feature requests welcome
- 🐛 Bug reports appreciated
- ⭐ Star the project if you like it!

---

## 🎉 Get Started Now!

```bash
# 1. Install dependencies
npm install

# 2. Add your Gemini API key to .env
echo "VITE_GEMINI_API_KEY=your_key_here" >> .env

# 3. Start the server
npm run dev

# 4. Open your browser and click the chatbot button!
```

**Your intelligent facility assistant is ready! 🚀**

---

**Note**: This implementation uses the new Gemini API format with API keys starting with `AIza` as you specified. The RAG system queries your actual Firestore database to provide accurate, real-time responses about rooms, schedules, equipment, and facility performance.

**Happy chatting! 🤖💬**
