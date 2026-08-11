# COBRA Assistant - User Guide

## 🤖 What is COBRA Assistant?

COBRA Assistant is your AI-powered facility scheduling assistant that helps you find rooms, check availability, and get instant answers about the SWU facility management system.

---

## 🎯 How to Access

### Desktop/Laptop:
1. Look for the **circular chatbot button** in the bottom-right corner of the screen
2. Click the button to open the chat window
3. Start asking questions!

### The Chatbot Button:
- **Location**: Fixed at bottom-right corner (always visible)
- **Appearance**: Circular maroon button with COBRA avatar
- **Size**: 64x64 pixels
- **Hover**: Shows "Open COBRA Assistant" tooltip

---

## 💬 How to Use

### Starting a Conversation:

1. **Click the chatbot button** (bottom-right corner)
2. The chat window opens with a welcome message
3. Type your question in the input field
4. Press **Enter** or click the **Send button** ➤

### Quick Prompts:
- Below the messages, you'll see suggested questions
- Click any suggestion to instantly use it
- Prompts change based on your conversation

### Conversation Tips:
- ✅ Be specific (mention capacity, equipment, dates)
- ✅ Ask follow-up questions (AI remembers context)
- ✅ Use natural language (talk normally)
- ❌ Avoid unrelated topics (AI is for facility management)

---

## 📝 What Can You Ask?

### 🏢 Room Search
```
"Find a room for 40 students"
"Show me all classrooms with projectors"
"Which rooms have air conditioning?"
"What's the largest room available?"
```

### 📅 Availability Checks
```
"Is Room 301 available tomorrow at 2 PM?"
"Show available rooms this Friday"
"What rooms are free right now?"
"Check auditorium schedule for next week"
```

### 🛠️ Equipment Queries
```
"Which rooms have smart boards?"
"Show me all computer labs"
"List rooms with video conferencing equipment"
"Find a room with projector and whiteboard"
```

### 📍 Location Searches
```
"Show all rooms in the Main Building"
"What's on the 3rd floor?"
"List all facilities in Building B"
"Where is the closest computer lab?"
```

### 🔧 Maintenance Info
```
"Which rooms are under maintenance?"
"When will Room 205 be available again?"
"Show operational rooms only"
"Why is the science lab closed?"
```

### 📊 Performance & Analytics
```
"Which rooms are most used?"
"Show booking statistics for this month"
"What's the utilization rate of computer labs?"
"Which rooms are underutilized?"
```

---

## 🎨 Understanding the Chat Interface

### Window Layout:

```
┌─────────────────────────────────────┐
│  COBRA Assistant        [X]         │  ← Header (maroon)
│  Smart Facility Chatbot             │
├─────────────────────────────────────┤
│  🌟 AI-Powered RAG System           │  ← Status badge
│  Connected to Gemini AI             │
├─────────────────────────────────────┤
│                                     │
│  🤖 Bot: Hi! I am COBRA...          │  ← Bot messages (left)
│                                     │
│           User: Find a room     👤  │  ← Your messages (right)
│                                     │
│  🤖 Bot: Here are available...      │
│                                     │
│  💡 Suggested Questions:            │  ← Quick prompts
│  [Find room for 40] [Show schedule] │
│                                     │
├─────────────────────────────────────┤
│  [Type your message...]      [➤]   │  ← Input area
│  Powered by Google Gemini AI       │
└─────────────────────────────────────┘
```

### Message Types:

**Bot Messages** (Left, white background):
- Normal responses with information
- Have robot icon 🤖
- White background with gray border

**Your Messages** (Right, maroon background):
- Your questions and inputs
- Have "U" icon
- Maroon background with white text

**Error Messages** (Left, red tinted):
- Error notifications
- Have alert icon ⚠️
- Red/pink background

**Loading State**:
- Shows spinner icon 🔄
- "Analyzing system data" message
- Bouncing dots animation

---

## 🎯 Sample Conversation

### Example 1: Finding a Room

```
👤 You: "I need a room for 40 students"

🤖 COBRA: "Based on your requirement for 40+ capacity, 
here are available rooms:

1. Room 305 (Main Building, 3rd Floor)
   - Capacity: 45 people
   - Equipment: Projector, Whiteboard, AC
   
2. Room B-201 (Building B, 2nd Floor)
   - Capacity: 50 people
   - Equipment: Smart Projector, Sound System

Would you like to check their availability?"

👤 You: "Check the first one for tomorrow at 2 PM"

🤖 COBRA: "Room 305 is AVAILABLE tomorrow at 2:00 PM.

Room Details:
- Location: Main Building, 3rd Floor
- Capacity: 45 people
- Equipment: Projector, Whiteboard, AC
- Status: Operational

Would you like help with booking?"
```

### Example 2: Equipment Search

```
👤 You: "Which rooms have video conferencing equipment?"

🤖 COBRA: "I found 3 rooms with video conferencing equipment:

1. Conference Room A (Admin Building)
   - Capacity: 30 people
   - Equipment: Video Conference System, Smart TV, 
     Wireless Mic
   
2. Room 401 (Main Building, 4th Floor)
   - Capacity: 40 people
   - Equipment: Video Conference Setup, Projector
   
3. Executive Conference (Building C)
   - Capacity: 20 people
   - Equipment: Premium Video Conference System, 
     Multiple Cameras

Would you like to see their schedules?"
```

---

## ⚡ Power User Tips

### 1. **Use Context Awareness**
The AI remembers your conversation:
```
You: "Show rooms with 50 capacity"
Bot: [Lists 5 rooms]

You: "Which ones have projectors?"
Bot: [Filters previous list]

You: "What about the first one?"
Bot: [Details about Room #1]
```

### 2. **Ask Follow-Up Questions**
```
You: "Find available rooms tomorrow"
Bot: [Shows list]

You: "Filter by capacity over 30"
Bot: [Refined list]

You: "Which floor are they on?"
Bot: [Floor information]
```

### 3. **Combine Multiple Criteria**
```
"Find a ground floor room for 35 students with 
projector and whiteboard, available Monday morning"
```

### 4. **Request Comparisons**
```
"Compare Room 301 and Room 305"
"What's the difference between Lab A and Lab B?"
```

### 5. **Get Specific Details**
```
"Tell me everything about Room 305"
"What equipment does the Main Auditorium have?"
"Show me the complete schedule for Room B-201"
```

---

## ⚙️ Features Breakdown

### ✅ Real-Time Data
- Queries live Firestore database
- Always up-to-date information
- No manual refresh needed

### ✅ Smart Search
- Natural language understanding
- Flexible query formats
- Context-aware responses

### ✅ Multi-Criteria Filtering
- Capacity requirements
- Equipment needs
- Location preferences
- Time availability

### ✅ Conversation Memory
- Remembers last 10 messages
- Can reference previous answers
- Maintains topic continuity

### ✅ Quick Actions
- Suggested questions
- One-click prompts
- Common queries pre-loaded

---

## 🚫 What It Can't Do (Yet)

### Not Supported:
- ❌ Actually book/reserve rooms (use reservation system)
- ❌ Modify existing reservations
- ❌ Access personal user information
- ❌ Send emails or notifications
- ❌ Create calendar events
- ❌ Process payment transactions

### For These Tasks:
- Use the main navigation menu
- Go to "Reservations" or "Schedule" sections
- Contact registrar or administrator

---

## 📱 Responsive Design

### Desktop (1024px+):
- Chat window: 400px wide
- Positioned: Bottom-right corner
- Full feature set

### Tablet (768px - 1023px):
- Chat window: 90% screen width
- Centered positioning
- All features available

### Mobile (<768px):
- Full-screen chat window
- Optimized touch targets
- Simplified quick prompts

---

## 🔍 Advanced Search Examples

### Complex Queries:

```
"Find a room on the ground floor with wheelchair 
access, capacity for 30, with projector and 
whiteboard, available Tuesday and Thursday 
mornings between 9-11 AM"
```

The AI will:
1. Filter by floor level
2. Check accessibility features
3. Match capacity requirement
4. Verify equipment availability
5. Cross-check schedule for time slots
6. Suggest best matches

### Analytical Queries:

```
"Show me utilization statistics for all computer 
labs over the past 2 weeks, and identify which 
times have the highest and lowest bookings"
```

The AI will:
1. Aggregate booking data
2. Calculate usage percentages
3. Identify peak times
4. Highlight underutilized periods
5. Provide actionable insights

---

## 🎓 For Students

### Common Student Queries:
```
"Where is my next class?"
"Show me all available study rooms"
"Which rooms are open after 5 PM?"
"Find a quiet room for group work"
"Where can I find a computer lab?"
```

### Tips for Students:
- Be specific about group size
- Mention time preferences
- Ask about equipment needs
- Check multiple options

---

## 👨‍🏫 For Teachers

### Common Teacher Queries:
```
"Find a room for a seminar with 25 students"
"Check equipment in Room 305 before class"
"What rooms are available for make-up classes?"
"Show my classroom schedule for this week"
"Which rooms have recording equipment?"
```

### Tips for Teachers:
- Verify equipment before sessions
- Check room capacity vs enrollment
- Look for backup room options
- Consider accessibility needs

---

## 👥 For Administrators

### Common Admin Queries:
```
"Show room utilization report for this month"
"Which rooms need maintenance scheduling?"
"What's the booking rate for Building B?"
"Identify underutilized facilities"
"Show peak usage times across all rooms"
```

### Tips for Administrators:
- Use for quick insights
- Generate reports for meetings
- Monitor facility performance
- Plan maintenance windows

---

## 🆘 Troubleshooting

### Issue: Chatbot button not visible
**Solution**: Scroll down page; button is fixed at bottom-right

### Issue: Chat window won't open
**Solution**: Refresh page; check browser console for errors

### Issue: Slow responses
**Solution**: First query is slower (fetching data); subsequent queries are faster

### Issue: "Error processing request"
**Solution**: Check internet connection; API key may need configuration

### Issue: Inaccurate information
**Solution**: Data comes from Firestore; verify database is up-to-date

---

## 🌟 Best Practices

### DO:
✅ Ask clear, specific questions  
✅ Use follow-up questions for clarification  
✅ Try different phrasings if confused  
✅ Report issues to administrators  
✅ Use quick prompts for common tasks  

### DON'T:
❌ Share sensitive personal information  
❌ Expect instant room bookings (use proper system)  
❌ Ask unrelated questions  
❌ Spam multiple queries at once  
❌ Rely solely on AI for critical decisions  

---

## 📞 Support

### Need Help?
- Contact registrar office
- Email: registrar@swu-ifss.com
- Report chatbot issues to IT support

### Feedback:
We're constantly improving COBRA Assistant!
- Report bugs or errors
- Suggest new features
- Share success stories

---

## 🎉 Summary

**COBRA Assistant makes facility management easy:**

1️⃣ **Open** the chat (bottom-right button)  
2️⃣ **Ask** your question naturally  
3️⃣ **Get** instant, accurate answers  
4️⃣ **Follow up** with more questions  

**Remember:**
- It's powered by real-time Firestore data
- It understands natural language
- It remembers your conversation context
- It's always learning and improving

**Start chatting now and experience intelligent facility management! 🚀**
