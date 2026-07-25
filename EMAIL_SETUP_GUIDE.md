# Email Setup Guide - Cloud Functions Solution

## Overview
This guide will help you set up automatic email notifications for registrar account creation using Firebase Cloud Functions.

---

## Prerequisites

### 1. Upgrade to Firebase Blaze Plan (Pay-as-you-go)
- Go to [Firebase Console](https://console.firebase.google.com)
- Select your project
- Go to **Settings** (gear icon) → **Usage and billing**
- Click **Modify plan** → Select **Blaze (Pay as you go)**
- Add a payment method

**Cost:** First 2 million function invocations per month are FREE. Typical cost: $0.01-$0.50/month for small projects.

---

## Step 1: Set Up Email Service

### Option A: Using Gmail (Easiest for Testing)

1. **Enable 2-Factor Authentication on your Gmail account:**
   - Go to [Google Account Security](https://myaccount.google.com/security)
   - Enable 2-Step Verification

2. **Generate App Password:**
   - Go to [App Passwords](https://myaccount.google.com/apppasswords)
   - Select app: **Mail**
   - Select device: **Other (Custom name)** → Enter "SWU IFSS"
   - Click **Generate**
   - Copy the 16-character password (example: `abcd efgh ijkl mnop`)

3. **Configure Firebase Functions:**
   ```bash
   firebase functions:config:set email.user="your-email@gmail.com"
   firebase functions:config:set email.pass="abcd efgh ijkl mnop"
   firebase functions:config:set email.app_url="https://your-app-url.com"
   ```

### Option B: Using SendGrid (Recommended for Production)

1. Create account at [SendGrid](https://sendgrid.com/)
2. Generate API key
3. Configure:
   ```bash
   firebase functions:config:set email.service="sendgrid"
   firebase functions:config:set email.apikey="YOUR_SENDGRID_API_KEY"
   firebase functions:config:set email.from="noreply@yourdomain.com"
   firebase functions:config:set email.app_url="https://your-app-url.com"
   ```

---

## Step 2: Install Dependencies

```bash
cd functions
npm install
```

This installs:
- `firebase-admin` - Firebase server SDK
- `firebase-functions` - Cloud Functions runtime
- `nodemailer` - Email sending library

---

## Step 3: Deploy Cloud Functions

```bash
# From project root directory
firebase deploy --only functions
```

Wait for deployment to complete (1-2 minutes).

---

## Step 4: Verify Configuration

Check your configuration:
```bash
firebase functions:config:get
```

Should show:
```json
{
  "email": {
    "user": "your-email@gmail.com",
    "pass": "****",
    "app_url": "https://your-app-url.com"
  }
}
```

---

## Step 5: Test Email Sending

1. **Open your web app**
2. **Sign in as Developer**
3. **Go to Registrar Management**
4. **Click "Add Registrar"**
5. **Fill in the form:**
   - Email: test-registrar@phinmaed.com
   - Display Name: Test User
   - Password: TempPass123!
6. **Click Create**
7. **Check the test email inbox** for the welcome email

---

## Troubleshooting

### Error: "Missing or insufficient permissions"
**Solution:** Make sure you're signed in as a Developer role user.

### Error: "Failed to send email"
**Possible causes:**
1. **App password incorrect:**
   - Regenerate app password in Gmail
   - Update config: `firebase functions:config:set email.pass="new-password"`
   - Redeploy: `firebase deploy --only functions`

2. **Gmail blocked the login:**
   - Check [Recent Security Activity](https://myaccount.google.com/notifications)
   - Allow access if prompted

3. **Functions not deployed:**
   - Run: `firebase deploy --only functions`
   - Check deployment status in Firebase Console → Functions

### Email not received
1. **Check spam folder**
2. **Verify email address is correct**
3. **Check Firebase Functions logs:**
   ```bash
   firebase functions:log
   ```

### View Function Logs
```bash
# View recent logs
firebase functions:log

# View logs for specific function
firebase functions:log --only sendRegistrarWelcomeEmail
```

---

## How It Works

1. **Developer creates registrar account** in the web app
2. **Account is created** in Firebase Authentication & Firestore
3. **Cloud Function is called** automatically (`sendRegistrarWelcomeEmail`)
4. **Email is sent** using nodemailer through Gmail SMTP
5. **Registrar receives** welcome email with credentials and "Join Now" button

**The email function runs in Firebase's cloud servers, so:**
- ✅ No local server needed
- ✅ Works 24/7 automatically
- ✅ Scales automatically
- ✅ Always available after deployment

---

## Email Template Preview

The registrar will receive an email with:
- **Welcome header** with SWU branding (maroon #800000)
- **Personalized greeting** with their name
- **Login credentials** (email + temporary password)
- **List of permissions** they have as registrar
- **"Join Now" button** linking to your app
- **Professional HTML styling**

---

## Security Notes

1. **Never commit email passwords** to git
2. **Use app passwords**, not actual Gmail password
3. **Passwords in emails** are sent over HTTPS (secure)
4. **Encourage users** to change password after first login

---

## Production Recommendations

For production deployment:

1. **Use a dedicated email account:**
   - Create `noreply@yourdomain.com` or `support@yourdomain.com`
   - Don't use personal Gmail

2. **Consider professional email service:**
   - SendGrid: 100 emails/day free
   - AWS SES: $0.10 per 1000 emails
   - Mailgun: 5,000 emails/month free

3. **Set up email monitoring:**
   - Check Firebase Functions logs regularly
   - Set up error alerts in Firebase Console

4. **Add rate limiting:**
   - Prevent spam by limiting registrar creation
   - Already handled by Cloud Functions quota

---

## Cost Breakdown

**Firebase Blaze Plan:**
- Cloud Functions: First 2M invocations/month FREE
- Typical usage: 10-100 emails/month = **$0.00**
- Network egress: First 5GB/month FREE

**Email Service (Gmail):**
- FREE for low volume (<500 emails/day)

**Estimated Total:** $0.00 - $1.00 per month for typical usage

---

## Need Help?

- Firebase Functions Docs: https://firebase.google.com/docs/functions
- Nodemailer Docs: https://nodemailer.com/
- Firebase Support: https://firebase.google.com/support

---

## Quick Reference Commands

```bash
# Install dependencies
cd functions && npm install

# Deploy functions
firebase deploy --only functions

# Set email config
firebase functions:config:set email.user="email@gmail.com"
firebase functions:config:set email.pass="app-password"

# View config
firebase functions:config:get

# View logs
firebase functions:log

# Test locally (optional)
firebase emulators:start --only functions
```

---

✅ Once deployed, the email system works automatically forever without needing any server running!
