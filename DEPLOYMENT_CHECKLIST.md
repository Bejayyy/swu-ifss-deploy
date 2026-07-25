# Deployment Checklist - Email Notifications

## ✅ What's Been Done

### 1. Fixed Schedule Display ✓
- Blocks now correctly extend to their end time
- 30-minute time slots working properly

### 2. Fixed Registrar Creation Permission ✓  
- Firestore rules updated and deployed
- Developers can now create registrar accounts

### 3. Email Notification System ✓
- Cloud Function created: `sendRegistrarWelcomeEmail`
- Automatic email sending on registrar creation
- Professional HTML email template with credentials and "Join Now" button
- No local server needed - runs 24/7 in Firebase cloud

---

## 📋 What You Need To Do

### Step 1: Upgrade Firebase Plan (5 minutes)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **swu-ifss**
3. Click **⚙️ Settings** → **Usage and billing**
4. Click **Modify plan**
5. Select **Blaze (Pay as you go)**
6. Add payment method (credit/debit card)

**Note:** First 2 million function calls/month are FREE. Expected cost: $0-$1/month.

---

### Step 2: Set Up Email (10 minutes)

#### Using Gmail (Recommended for Start):

1. **Enable 2-Factor Auth:**
   - Go to: https://myaccount.google.com/security
   - Enable **2-Step Verification**

2. **Create App Password:**
   - Go to: https://myaccount.google.com/apppasswords
   - App: **Mail**
   - Device: **Other** → Type "SWU IFSS" → **Generate**
   - Copy the 16-character password (looks like: `abcd efgh ijkl mnop`)

3. **Configure Firebase (Run these commands):**
   ```bash
   firebase functions:config:set email.user="your-email@gmail.com"
   firebase functions:config:set email.pass="abcd efgh ijkl mnop"
   firebase functions:config:set email.app_url="https://your-deployed-app-url.com"
   ```

---

### Step 3: Install & Deploy (5 minutes)

```bash
# 1. Install dependencies in functions folder
cd functions
npm install
cd ..

# 2. Deploy Cloud Functions
firebase deploy --only functions
```

Wait for "Deploy complete!" message.

---

### Step 4: Test It! (2 minutes)

1. Open your web app
2. Sign in as **Developer**
3. Go to **Registrar Management**
4. Click **"Add Registrar"**
5. Fill in:
   - Email: `test@phinmaed.com`
   - Name: `Test User`
   - Password: `Test123!`
6. Click **Create**
7. Check email inbox for welcome message

---

## 🎯 Expected Result

The registrar will receive an email that looks like this:

```
┌─────────────────────────────────────┐
│     Welcome to SWU IFSS            │  ← Maroon header
└─────────────────────────────────────┘

Hello Test User,

Your registrar account has been successfully created...

┌─────────────────────────────────────┐
│  Your Login Credentials:            │
│  Email: test@phinmaed.com          │
│  Temporary Password: Test123!      │
└─────────────────────────────────────┘

As a registrar, you have full access to manage:
• Room scheduling and reservations
• Building and facility management  
• User accounts and permissions
• Academic calendars
• Maintenance schedules

        ┌──────────────┐
        │   Join Now   │  ← Clickable button
        └──────────────┘

Best regards,
SWU IFSS Team
```

---

## 🔧 Troubleshooting

### "Permission denied" when creating registrar
**Solution:** Already fixed! Rules deployed. Make sure you're signed in as Developer.

### "Failed to send email" error
1. **Check app password is correct:**
   ```bash
   firebase functions:config:get
   ```

2. **Regenerate and update if wrong:**
   ```bash
   firebase functions:config:set email.pass="new-app-password"
   firebase deploy --only functions
   ```

### Email not received
1. Check spam/junk folder
2. Verify Gmail settings allow "Less secure app access" (if using app password)
3. Check Firebase logs:
   ```bash
   firebase functions:log
   ```

---

## 📂 Files Modified/Created

### Modified:
- ✅ `firestore.rules` - Fixed registrar creation permission
- ✅ `src/constants/scheduleGrid.js` - Fixed schedule block height
- ✅ `src/services/registrarService.js` - Added email sending
- ✅ `src/firebase/firebase.js` - Added functions initialization
- ✅ `.gitignore` - Added Firebase-specific entries

### Created:
- ✅ `functions/index.js` - Cloud Function for sending emails
- ✅ `functions/package.json` - Dependencies configuration
- ✅ `EMAIL_SETUP_GUIDE.md` - Detailed setup instructions
- ✅ `DEPLOYMENT_CHECKLIST.md` - This file

---

## 💰 Cost Estimate

| Service | Usage | Cost |
|---------|-------|------|
| Cloud Functions | 100 registrar creations/month | $0.00 (under free tier) |
| Gmail SMTP | <500 emails/day | $0.00 |
| **Total** | | **$0.00/month** |

Only if you exceed 2 million function calls/month (unlikely) will you see charges (~$0.40 per million calls).

---

## ✨ Benefits of This Solution

✅ **No server needed** - Runs in Firebase cloud 24/7  
✅ **Automatic** - Works every time a registrar is created  
✅ **Scalable** - Handles high volume automatically  
✅ **Professional** - HTML email template with branding  
✅ **Secure** - Credentials sent over HTTPS  
✅ **Reliable** - Firebase 99.95% uptime SLA  
✅ **Free tier friendly** - Stays within free limits for typical usage  

---

## 📞 Support

- **Firebase Functions:** https://firebase.google.com/docs/functions
- **Setup Guide:** See `EMAIL_SETUP_GUIDE.md`
- **Firebase Console:** https://console.firebase.google.com/

---

## ✅ Final Checklist

- [ ] Upgraded to Firebase Blaze plan
- [ ] Created Gmail app password
- [ ] Configured email settings with `firebase functions:config:set`
- [ ] Ran `cd functions && npm install`
- [ ] Deployed with `firebase deploy --only functions`
- [ ] Tested by creating a registrar
- [ ] Verified email was received

**Once all checked, you're done! The system works automatically from now on. 🎉**
