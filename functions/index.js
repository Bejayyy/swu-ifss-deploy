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

admin.initializeApp();

const APP_URL = process.env.APP_URL || 'https://swu-ifss.firebaseapp.com';

// Lazy-initialize the email transporter only when needed (not at module load time)
// This avoids SMTP connection attempts during deployment that cause timeouts
let _transporter = null;
function getTransporter() {
  if (!_transporter) {
    const nodemailer = require('nodemailer');
    _transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return _transporter;
}

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

// Delete staff user (dean, GSD, teacher, etc.) - can be called by registrars
exports.deleteStaffAuthUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }

  const caller = await admin.firestore().doc(`users/${context.auth.uid}`).get();
  if (!caller.exists || caller.data().status !== 'active') {
    throw new functions.https.HttpsError('permission-denied', 'Active user required.');
  }

  const { uid } = data;
  if (!uid) {
    throw new functions.https.HttpsError('invalid-argument', 'uid is required.');
  }

  const target = await admin.firestore().doc(`users/${uid}`).get();
  if (!target.exists) {
    throw new functions.https.HttpsError('not-found', 'User not found.');
  }

  const targetData = target.data();
  const allowedRoles = ['dean', 'organization_head', 'teacher', 'gsd', 'student_life'];
  
  if (!allowedRoles.includes(targetData.role)) {
    throw new functions.https.HttpsError('failed-precondition', 'Can only delete staff users.');
  }

  // Delete Auth user
  try {
    await admin.auth().deleteUser(uid);
  } catch (error) {
    // If user doesn't exist in Auth, that's okay, continue with Firestore deletion
    if (error.code !== 'auth/user-not-found') {
      throw error;
    }
  }

  // Delete Firestore document
  await admin.firestore().doc(`users/${uid}`).delete();

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
    await getTransporter().sendMail(mailOptions);
    return { success: true, message: 'Welcome email sent successfully' };
  } catch (error) {
    console.error('Error sending email:', error);
    throw new functions.https.HttpsError('internal', 'Failed to send email: ' + error.message);
  }
});

// Send welcome email when a staff user is created (dean, GSD, teacher, etc.)
exports.sendStaffWelcomeEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }

  const caller = await admin.firestore().doc(`users/${context.auth.uid}`).get();
  if (!caller.exists || caller.data().status !== 'active') {
    throw new functions.https.HttpsError('permission-denied', 'Active user required.');
  }

  const { email, displayName, role, password } = data;
  if (!email || !displayName || !role) {
    throw new functions.https.HttpsError('invalid-argument', 'email, displayName, and role are required.');
  }

  const roleLabels = {
    'dean': 'Dean',
    'organization_head': 'Organization Head',
    'teacher': 'Teacher',
    'gsd': 'GSD Head',
    'student_life': 'Student Life',
  };

  const roleLabel = roleLabels[role] || role;

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
            <p>Your account has been successfully created for the SWU Integrated Facility Scheduling System (IFSS).</p>
            
            <div class="credentials">
              <h3>Your Account Details:</h3>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Role:</strong> ${roleLabel}</p>
              ${password ? `<p><strong>Temporary Password:</strong> ${password}</p>
              <p><em>You will be required to set a new password on your first login.</em></p>` : `<p><em>You can sign in using your Google account.</em></p>`}
            </div>

            <p>Your account gives you access to:</p>
            <ul>
              <li>View room schedules and availability</li>
              <li>Submit room reservation requests</li>
              <li>Track your requests and approvals</li>
              <li>Access academic calendar information</li>
            </ul>

            <center>
              <a href="${APP_URL}" class="button">Sign In Now</a>
            </center>

            <p>You can sign in using either:</p>
            <ul>
              <li>Your institutional email and the password above</li>
              <li>Your Google account (using your @phinmaed.com email)</li>
            </ul>

            <p>If you have any questions or need assistance, please contact your registrar administrator.</p>

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
    await getTransporter().sendMail(mailOptions);
    return { success: true, message: 'Welcome email sent successfully' };
  } catch (error) {
    console.error('Error sending email:', error);
    throw new functions.https.HttpsError('internal', 'Failed to send email: ' + error.message);
  }
});
