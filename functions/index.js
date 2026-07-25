/**
 * Optional Cloud Functions (Firebase Admin SDK) for production:
 * - Delete Auth user when Developer removes a Registrar
 * - Create users without client secondary-app pattern
 * - Send email notifications
 *
 * Deploy: firebase deploy --only functions
 */
require('dotenv').config();
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

// Configure email transport using environment variables
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const APP_URL = process.env.APP_URL || 'https://swu-ifss.firebaseapp.com';

exports.deleteRegistrarAuthUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }

  const caller = await admin.firestore().doc(`users/${context.auth.uid}`).get();
  if (!caller.exists || caller.data().role !== 'developer' || caller.data().status !== 'active') {
    throw new functions.https.HttpsError('permission-denied', 'Developers only.');
  }

  const { uid } = data;
  if (!uid) {
    throw new functions.https.HttpsError('invalid-argument', 'uid is required.');
  }

  const target = await admin.firestore().doc(`users/${uid}`).get();
  if (!target.exists || target.data().role !== 'registrar') {
    throw new functions.https.HttpsError('failed-precondition', 'Target is not a registrar.');
  }

  await admin.auth().deleteUser(uid);
  await admin.firestore().doc(`users/${uid}`).delete();
  await admin.firestore().doc(`registrar_management/${uid}`).delete();

  return { success: true };
});

// Send welcome email when a new registrar is created
exports.sendRegistrarWelcomeEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }

  const caller = await admin.firestore().doc(`users/${context.auth.uid}`).get();
  if (!caller.exists || caller.data().role !== 'developer' || caller.data().status !== 'active') {
    throw new functions.https.HttpsError('permission-denied', 'Developers only.');
  }

  const { email, displayName, password } = data;
  if (!email || !displayName) {
    throw new functions.https.HttpsError('invalid-argument', 'email and displayName are required.');
  }

  const mailOptions = {
    from: process.env.EMAIL_USER || 'noreply@swu-ifss.com',
    to: email,
    subject: 'Welcome to SWU Room Scheduling System',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #800000; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background-color: #800000; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .credentials { background-color: #fff; padding: 15px; border-left: 4px solid #800000; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to SWU IFSS</h1>
          </div>
          <div class="content">
            <h2>Hello ${displayName},</h2>
            <p>Your registrar account has been successfully created for the SWU Integrated Facility Scheduling System (IFSS).</p>
            
            <div class="credentials">
              <h3>Your Login Credentials:</h3>
              <p><strong>Email:</strong> ${email}</p>
              ${password ? `<p><strong>Temporary Password:</strong> ${password}</p>` : ''}
              <p><em>Please change your password after your first login for security purposes.</em></p>
            </div>

            <p>As a registrar, you have full access to manage:</p>
            <ul>
              <li>Room scheduling and reservations</li>
              <li>Building and facility management</li>
              <li>User accounts and permissions</li>
              <li>Academic calendars</li>
              <li>Maintenance schedules</li>
            </ul>

            <center>
              <a href="${APP_URL}" class="button">Join Now</a>
            </center>

            <p>If you have any questions or need assistance, please contact your system administrator.</p>

            <p>Best regards,<br>SWU IFSS Team</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true, message: 'Welcome email sent successfully' };
  } catch (error) {
    console.error('Error sending email:', error);
    throw new functions.https.HttpsError('internal', 'Failed to send email: ' + error.message);
  }
});
