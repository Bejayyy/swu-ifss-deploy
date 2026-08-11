# COBRA Assistant - RAG Chatbot Setup Guide

## Overview

The COBRA Assistant is an AI-powered chatbot that uses **Retrieval-Augmented Generation (RAG)** with Google's Gemini API to answer questions about the SWU Integrated Facility Scheduling System. It provides intelligent responses based on real-time data from your Firestore database.

## Features

✅ **RAG (Retrieval-Augmented Generation)** - Queries real Firestore data before answering  
✅ **Room Search** - Find available rooms based on capacity, equipment, and requirements  
✅ **Schedule Queries** - Check room availability and current schedules  
✅ **Equipment Filters** - Search rooms by equipment (projectors, AC, etc.)  
✅ **Performance Analytics** - Get insights on room utilization and performance  
✅ **Maintenance Status** - View which rooms are under maintenance  
✅ **Conversational Context** - Maintains conversation history for better responses

## Setup Instructions

### Step 1: Install Dependencies

The required package has been added to `package.json`:

```bash
npm install
```

This will install:
- `@google/generative-ai` - Official Gemini AI SDK

### Step 2: Get Your Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Get API Key"** or **"Create API Key"**
4. Copy your API key (new format starts with `AQ...`, older format starts with `AIza...`)

**Note**: The newest Gemini API keys start with `AQ` rather than `AIza`. Both formats should work with our implementation.

### Step 3: Configure Environment Variables

Open your `.env` file and add your Gemini API key:

```env
# Gemini AI API Key for RAG Chatbot
VITE_GEMINI_API_KEY=AIzaSy...your_actual_key_here
```

⚠️ **Important**: Replace `YOUR_GEMINI_API_KEY_HERE` with your actual API key!

### Step 4: Restart Development Server

After adding the API key, restart your development server:

```bash
npm run dev
```

## How It Works

### RAG Architecture

```
User Question
     ↓
[CobraChatbot Component]
     ↓
[ragChatbotService.js]
     ↓
1. Fetch Real Data from Firestore:
   - Buildings & Rooms
   - Reservations
   - Class Schedules
     ↓
2. Build Context String
     ↓
3. Send to Gemini AI with Context
     ↓
4. Return AI Response
     ↓
[Display to User]
```

### Data Sources

The chatbot queries the following Firestore collections:

1. **Buildings** → Floors → Rooms
   - Room capacity, type, equipment
   - Maintenance status
   - Manager information

2. **Room Reservations**
   - Current and upcoming reservations
   - Reservation status and requestor
   - Time slots and dates

3. **Schedule Entries**
   - Academic class schedules
   - Course information
   - Instructor assignments

## Usage Examples

### Example Queries

**Room Search:**
- "Find an available room for 40 students"
- "Show me all rooms with projectors"
- "What's the largest classroom available?"
- "Which rooms have air conditioning?"

**Availability Checks:**
- "Is Room 301 available tomorrow at 2 PM?"
- "Show available rooms this Friday afternoon"
- "What rooms are free right now?"

**Equipment & Facilities:**
- "Which rooms have video conferencing equipment?"
- "Show all computer labs"
- "List rooms with whiteboards"

**Maintenance:**
- "Which rooms are currently under maintenance?"
- "When will Room 205 be available again?"

**Performance & Analytics:**
- "What's the utilization rate of the main building?"
- "Which rooms are most frequently booked?"

## Files Modified/Created

### New Files:
- `src/services/ragChatbotService.js` - RAG logic and Gemini AI integration

### Modified Files:
- `src/components/CobraChatbot.jsx` - Fully functional chatbot UI
- `.env` - Added Gemini API key configuration
- `package.json` - Added @google/generative-ai dependency

## API Key Security

⚠️ **Security Best Practices:**

1. **Never commit your API key** to version control
2. The `.env` file is already in `.gitignore`
3. Use different API keys for development and production
4. Set up [API key restrictions](https://cloud.google.com/docs/authentication/api-keys#securing_an_api_key) in Google Cloud Console

## Troubleshooting

### "API key is not configured"
- Make sure you added `VITE_GEMINI_API_KEY` to `.env`
- Restart your dev server after adding the key
- Check that the key starts with `AQ` (new format) or `AIza` (older format)
- Verify no extra spaces or quotes around the key

### "Failed to fetch data"
- Verify your Firestore is set up correctly
- Check that collections exist: `buildings`, `room_reservations`, `schedule_entries`
- Ensure Firebase configuration is correct in `.env`

### Slow Responses
- First query takes longer as it fetches all data
- Consider implementing caching for frequently accessed data
- Use `gemini-1.5-flash` model (already configured) for faster responses

### Rate Limiting
- Free tier: 15 requests per minute
- Consider implementing request throttling for production
- Monitor usage in [Google AI Studio](https://aistudio.google.com)

## Customization

### Changing the AI Model

Edit `src/services/ragChatbotService.js`:

```javascript
// Current: Fast and cost-effective
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Alternative: More powerful but slower
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
```

### Adding More Data Sources

To add more data to the RAG context:

1. Create a new fetch function in `ragChatbotService.js`
2. Add the data to `buildSystemContext()`
3. Update the system prompt to mention the new data type

### Customizing Prompts

Edit the system prompt in `queryGeminiWithRAG()` to change:
- Bot personality
- Response format
- Specific instructions

## Performance Optimization

### For Production:

1. **Implement Data Caching**
   ```javascript
   // Cache building data for 5 minutes
   let cachedBuildings = null;
   let cacheTime = 0;
   
   async function fetchBuildingsData() {
     if (cachedBuildings && Date.now() - cacheTime < 300000) {
       return cachedBuildings;
     }
     // ... fetch logic
     cachedBuildings = buildings;
     cacheTime = Date.now();
     return buildings;
   }
   ```

2. **Limit Data Scope**
   - Only fetch recent reservations (last 7 days)
   - Limit schedule entries to current semester
   - Paginate large result sets

3. **Add Request Throttling**
   ```javascript
   // Prevent spam requests
   const [lastRequestTime, setLastRequestTime] = useState(0);
   const MIN_DELAY = 2000; // 2 seconds between requests
   ```

## Support

For issues or questions:
1. Check Firebase console for data integrity
2. Verify API key is valid in Google AI Studio
3. Check browser console for error messages
4. Review Firestore security rules

## Version History

- **v1.0** - Initial RAG chatbot implementation with Gemini AI
  - Real-time Firestore queries
  - Conversation context support
  - Dynamic quick prompts
  - Error handling and loading states

---

**Note**: This chatbot uses the new Gemini API format. The API keys now start with `AIza` as you mentioned. The RAG system queries your actual Firestore data to provide accurate, real-time responses about your facility scheduling system.
