# Gemini New API Format Setup (Keys Starting with AQ)

## Important: New API Key Format

You mentioned your API key starts with **AQ** (not AIza). This is the newer Gemini API format.

## Updated Configuration

### 1. API Key Format
Your `.env` should have:
```env
VITE_GEMINI_API_KEY=AQxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 2. Compatible Model Names

With the new API format, try these model names in order:

**Option 1: gemini-1.5-flash** (Currently configured)
```javascript
model: 'gemini-1.5-flash'
```

**Option 2: gemini-1.5-pro**
```javascript
model: 'gemini-1.5-pro'
```

**Option 3: gemini-pro**
```javascript
model: 'gemini-pro'
```

## Testing Your Setup

### Step 1: Verify Your API Key

1. Open `.env` file
2. Confirm your key starts with `AQ`
3. Ensure no extra spaces or quotes
4. Format should be exactly:
   ```
   VITE_GEMINI_API_KEY=AQxxxxxxxxxxxxxxxxxxxx
   ```

### Step 2: Restart Development Server

After changing `.env`:
```bash
# Stop the server (Ctrl+C)
# Then restart:
npm run dev
```

### Step 3: Test the Chatbot

1. Open browser and clear cache (Ctrl+Shift+R)
2. Click chatbot button
3. Try: "Hello"
4. Check browser console for errors

## If Still Getting 404 Error

The SDK might need the API endpoint specified. Let me know and I'll update the code to:

```javascript
const genAI = new GoogleGenerativeAI(
  import.meta.env.VITE_GEMINI_API_KEY,
  {
    apiVersion: 'v1', // or 'v1beta'
  }
);
```

## Alternative: Use Latest SDK

If issues persist, we can try:

1. **Update SDK version** to the absolute latest:
   ```bash
   npm install @google/generative-ai@latest
   ```

2. **Use fetch-based implementation** instead of SDK

3. **Direct REST API calls** with your AQ key

## Common Issues with New API Format

### Issue: "404 Model Not Found"
**Cause**: Model name incompatible with new API version  
**Fix**: Try model names in this order:
1. `gemini-1.5-flash` ✅ Currently set
2. `gemini-1.5-pro`
3. `gemini-pro`
4. `models/gemini-1.5-flash`
5. `models/gemini-pro`

### Issue: "Invalid API Key"
**Cause**: Key format or env variable issue  
**Fix**: 
- Verify key starts with `AQ`
- Check no extra characters
- Restart dev server after .env changes

### Issue: "API Version Mismatch"
**Cause**: New API uses different endpoint  
**Fix**: May need to specify API version explicitly

## Quick Test Without RAG

To isolate the issue, try this simple test in browser console:

```javascript
// Test direct API call
const apiKey = 'AQyour_key_here';
const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{
      parts: [{ text: 'Hello, how are you?' }]
    }]
  })
})
.then(r => r.json())
.then(console.log)
.catch(console.error);
```

If this works, the issue is in SDK configuration.  
If this fails, the API key or endpoint needs adjustment.

## Next Steps

**Please try the current configuration:**
1. Make sure `.env` has your AQ key
2. Restart dev server
3. Test chatbot
4. Check browser console

**If still failing**, let me know the exact error and I'll:
- Update to use direct fetch API instead of SDK
- Or configure SDK for new API endpoint
- Or implement alternative authentication method

## Model Comparison (New API)

| Model | Speed | Quality | Cost | Availability |
|-------|-------|---------|------|--------------|
| gemini-1.5-flash | ⚡⚡⚡ | ⭐⭐⭐ | 💰 | Should work |
| gemini-1.5-pro | ⚡⚡ | ⭐⭐⭐⭐⭐ | 💰💰💰 | Should work |
| gemini-pro | ⚡⚡⚡ | ⭐⭐⭐⭐ | 💰💰 | Fallback option |

**Currently configured**: `gemini-1.5-flash` (best balance for RAG)

## Reference Links

- [Gemini API Docs](https://ai.google.dev/gemini-api/docs)
- [Model Names](https://ai.google.dev/gemini-api/docs/models/gemini)
- [Migration Guide](https://ai.google.dev/gemini-api/docs/migrate-to-gemini)

---

**Status**: Code updated for new API format (AQ keys)  
**Current Model**: gemini-1.5-flash  
**Next**: Test and report results
