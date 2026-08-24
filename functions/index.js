/**
 * Optional Cloud Functions (Firebase Admin SDK) for production:
 * - Delete Auth user when Developer removes a Registrar
 * - Create users without client secondary-app pattern
 * - Send email notifications
 *
 * Deploy: firebase deploy --only functions
 */
require('dotenv').config();
const functions = require('firebase-functions/v1');
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

  // Only registrars and developers may delete staff accounts
  const callerRole = caller.data().role;
  if (!['registrar', 'developer'].includes(callerRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Registrar or Developer role required.');
  }

  const { uid } = data;
  if (!uid) {
    throw new functions.https.HttpsError('invalid-argument', 'uid is required.');
  }

  // Prevent self-deletion
  if (uid === context.auth.uid) {
    throw new functions.https.HttpsError('failed-precondition', 'Cannot delete your own account.');
  }

  const target = await admin.firestore().doc(`users/${uid}`).get();
  if (!target.exists) {
    // User already gone from Firestore — still try to clean up Auth
    try {
      await admin.auth().deleteUser(uid);
    } catch (err) {
      if (err.code !== 'auth/user-not-found') throw err;
    }
    return { success: true };
  }

  const targetData = target.data();

  // Developers cannot be deleted via this function
  if (targetData.role === 'developer') {
    throw new functions.https.HttpsError('failed-precondition', 'Developer accounts cannot be deleted from here.');
  }

  // 1. Delete Firebase Auth account first
  try {
    await admin.auth().deleteUser(uid);
  } catch (error) {
    // auth/user-not-found is acceptable — the Auth record may have been removed already
    if (error.code !== 'auth/user-not-found') {
      throw new functions.https.HttpsError('internal', `Failed to delete Auth account: ${error.message}`);
    }
  }

  // 2. Delete Firestore user document
  await admin.firestore().doc(`users/${uid}`).delete();

  return { success: true };
});

// Set / Update user password via Admin SDK (bypasses client-side auth/requires-recent-login)
exports.setUserPasswordAdmin = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }

  const { newPassword } = data;
  if (!newPassword || newPassword.length < 8) {
    throw new functions.https.HttpsError('invalid-argument', 'Password must be at least 8 characters.');
  }

  const uid = context.auth.uid;
  const email = (context.auth.token?.email || '').trim().toLowerCase();

  // 1. Update password on current UID in Firebase Auth
  try {
    await admin.auth().updateUser(uid, { password: newPassword });
  } catch (err) {
    console.warn('Admin updateUser for UID failed:', err);
  }

  // 2. Also check if there was another Auth account by email (e.g. if Google created a separate UID from the email/pass user)
  if (email) {
    try {
      const authUserByEmail = await admin.auth().getUserByEmail(email);
      if (authUserByEmail && authUserByEmail.uid !== uid) {
        await admin.auth().updateUser(authUserByEmail.uid, { password: newPassword });
      }
    } catch (e) {
      // Ignore if no other auth user
    }
  }

  // 3. Update Firestore user documents matching this UID
  await admin.firestore().doc(`users/${uid}`).set(
    {
      mustSetPassword: false,
      passwordEnabled: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // 4. Update any other user document in Firestore matching this email
  if (email) {
    try {
      const userQuery = await admin.firestore().collection('users').where('email', '==', email).get();
      if (!userQuery.empty) {
        const batch = admin.firestore().batch();
        userQuery.docs.forEach((d) => {
          batch.set(d.ref, { mustSetPassword: false, passwordEnabled: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        });
        await batch.commit();
      }
    } catch (e) {
      console.warn('Firestore multi-doc update error:', e);
    }
  }

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

// ─── Forgot Password: Send OTP ─────────────────────────────────────────────
exports.sendPasswordResetOTP = functions.https.onCall(async (data) => {
  const { email } = data;
  if (!email) {
    throw new functions.https.HttpsError('invalid-argument', 'Email is required.');
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Verify user exists in Firebase Auth
  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(normalizedEmail);
  } catch (err) {
    // Don't reveal whether user exists for security
    return { success: true, message: 'If the email is registered, an OTP has been sent.' };
  }

  // Verify user exists in Firestore
  const userDoc = await admin.firestore().doc(`users/${userRecord.uid}`).get();
  if (!userDoc.exists) {
    return { success: true, message: 'If the email is registered, an OTP has been sent.' };
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  // Store OTP in Firestore
  await admin.firestore().doc(`password_reset_otps/${normalizedEmail}`).set({
    otp,
    expiresAt,
    attempts: 0,
    createdAt: Date.now(),
    uid: userRecord.uid,
  });

  // Send OTP email
  const mailOptions = {
    from: process.env.EMAIL_USER || 'noreply@swu-ifss.com',
    to: normalizedEmail,
    subject: 'SWU IFSS — Password Reset Code',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #800000; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .otp-box { background: #fff; border: 2px solid #800000; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0; }
          .otp-code { font-size: 36px; font-weight: bold; color: #800000; letter-spacing: 8px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset</h1>
          </div>
          <div class="content">
            <h2>Hello ${userDoc.data().displayName || 'User'},</h2>
            <p>You requested a password reset for your SWU IFSS account. Use the code below to reset your password:</p>
            
            <div class="otp-box">
              <p style="margin:0 0 8px 0;font-size:14px;color:#666;">Your verification code</p>
              <div class="otp-code">${otp}</div>
            </div>

            <p><strong>This code expires in 10 minutes.</strong></p>
            <p>If you did not request a password reset, please ignore this email. Your account remains secure.</p>

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
    return { success: true, message: 'If the email is registered, an OTP has been sent.' };
  } catch (error) {
    console.error('Error sending OTP email:', error);
    throw new functions.https.HttpsError('internal', 'Failed to send OTP email. Please try again.');
  }
});

// ─── Forgot Password: Verify OTP & Reset Password ──────────────────────────
exports.verifyOTPAndResetPassword = functions.https.onCall(async (data) => {
  const { email, otp, newPassword } = data;
  if (!email || !otp || !newPassword) {
    throw new functions.https.HttpsError('invalid-argument', 'Email, OTP, and new password are required.');
  }

  if (newPassword.length < 8) {
    throw new functions.https.HttpsError('invalid-argument', 'Password must be at least 8 characters.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const otpRef = admin.firestore().doc(`password_reset_otps/${normalizedEmail}`);
  const otpDoc = await otpRef.get();

  if (!otpDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'No OTP request found. Please request a new code.');
  }

  const otpData = otpDoc.data();

  // Check expiry
  if (Date.now() > otpData.expiresAt) {
    await otpRef.delete();
    throw new functions.https.HttpsError('deadline-exceeded', 'OTP has expired. Please request a new code.');
  }

  // Check max attempts (5)
  if (otpData.attempts >= 5) {
    await otpRef.delete();
    throw new functions.https.HttpsError('resource-exhausted', 'Too many failed attempts. Please request a new code.');
  }

  // Verify OTP
  if (otpData.otp !== otp.trim()) {
    await otpRef.update({ attempts: admin.firestore.FieldValue.increment(1) });
    const remaining = 4 - otpData.attempts;
    throw new functions.https.HttpsError(
      'permission-denied',
      `Invalid OTP. ${remaining > 0 ? remaining + ' attempt(s) remaining.' : 'Please request a new code.'}`
    );
  }

  // OTP is valid — reset password
  try {
    await admin.auth().updateUser(otpData.uid, { password: newPassword });
  } catch (error) {
    console.error('Error resetting password:', error);
    throw new functions.https.HttpsError('internal', 'Failed to reset password. Please try again.');
  }

  // Clean up OTP document
  await otpRef.delete();

  // Update Firestore user profile
  try {
    await admin.firestore().doc(`users/${otpData.uid}`).update({
      mustSetPassword: false,
      passwordEnabled: true,
    });
  } catch {
    // Non-fatal
  }

  return { success: true, message: 'Password has been reset successfully.' };
});

// Send email notification when course scheduling access is granted to a Dean
exports.sendScheduleAccessGrantedEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }

  const caller = await admin.firestore().doc(`users/${context.auth.uid}`).get();
  if (!caller.exists || caller.data().status !== 'active') {
    throw new functions.https.HttpsError('permission-denied', 'Active user required.');
  }

  const { email, displayName, collegeName, schoolYearLabel, semester, startDate, endDate } = data;
  if (!email) {
    throw new functions.https.HttpsError('invalid-argument', 'email is required.');
  }

  const mailOptions = {
    from: process.env.EMAIL_USER || 'noreply@swu-ifss.com',
    to: email,
    subject: `SWU IFSS — Course Scheduling Access Granted (${schoolYearLabel} Sem ${semester})`,
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
          .info-box { background-color: #fff; padding: 18px; border-left: 4px solid #800000; margin: 20px 0; border-radius: 6px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .deadline { color: #800000; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Course Scheduling Access Granted</h1>
          </div>
          <div class="content">
            <h2>Hello ${displayName || 'Dean'},</h2>
            <p>The Registrar's Office has granted course scheduling access for your college: <strong>${collegeName || 'Your Department'}</strong>.</p>
            
            <div class="info-box">
              <h3 style="margin-top:0;color:#800000;">Scheduling Details & Accomplishment Window:</h3>
              <p><strong>School Year:</strong> ${schoolYearLabel}</p>
              <p><strong>Semester:</strong> Semester ${semester}</p>
              <p><strong>Start Date:</strong> ${startDate || 'Immediate'}</p>
              <p><strong>End Date (Deadline):</strong> <span class="deadline">${endDate || 'No deadline set'}</span></p>
            </div>

            <p>Please log into the SWU IFSS portal and plot your college's course schedule within the accomplishment window.</p>

            <center>
              <a href="${APP_URL}" class="button">Go to Course Scheduling</a>
            </center>

            <p>If you have questions regarding your scheduling period, please contact the Registrar's Office.</p>

            <p>Best regards,<br>SWU Registrar's Office</p>
          </div>
          <div class="footer">
            <p>This is an automated notification. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await getTransporter().sendMail(mailOptions);
    return { success: true, message: 'Access granted email sent successfully' };
  } catch (error) {
    console.error('Error sending access granted email:', error);
    return { success: false, error: error.message };
  }
});

// Send email notification to an approver when a reservation is waiting for their approval
exports.sendApprovalPendingEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }

  const { email, displayName, title, resType, venue, levelNumber, roleLabel, link } = data;
  if (!email) {
    throw new functions.https.HttpsError('invalid-argument', 'email is required.');
  }

  const mailOptions = {
    from: process.env.EMAIL_USER || 'noreply@swu-ifss.com',
    to: email,
    subject: `SWU IFSS — Action Required: ${resType || 'Academic'} Reservation Approval`,
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
          .info-box { background-color: #fff; padding: 18px; border-left: 4px solid #800000; margin: 20px 0; border-radius: 6px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Reservation Approval Required</h1>
          </div>
          <div class="content">
            <h2>Hello ${displayName || 'Approver'},</h2>
            <p>A room reservation request requires your review and approval.</p>
            
            <div class="info-box">
              <h3 style="margin-top:0;color:#800000;">Reservation Details:</h3>
              <p><strong>Activity / Title:</strong> ${title || 'Room Reservation'}</p>
              <p><strong>Request Type:</strong> ${resType || 'Academic'}</p>
              <p><strong>Designated Venue:</strong> ${venue || 'Campus Venue'}</p>
              <p><strong>Approval Step:</strong> Level ${levelNumber || 1} (${roleLabel || 'Approver'})</p>
            </div>

            <p>It is currently your turn to review, endorse, or sign this reservation request.</p>

            <center>
              <a href="${APP_URL}${link || '/request'}" class="button">Review & Approve Request</a>
            </center>

            <p>Thank you for your prompt attention to this matter.</p>

            <p>Best regards,<br>SWU IFSS System</p>
          </div>
          <div class="footer">
            <p>This is an automated notification. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await getTransporter().sendMail(mailOptions);
    return { success: true, message: 'Approval pending email sent successfully' };
  } catch (error) {
    console.error('Error sending approval pending email:', error);
    return { success: false, error: error.message };
  }
});

// Send email notification to requestor confirming request submission
exports.sendReservationSubmittedEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }

  const { email, displayName, title, resType, venue, levelNumber, roleLabel, link } = data;
  if (!email) {
    throw new functions.https.HttpsError('invalid-argument', 'email is required.');
  }

  const mailOptions = {
    from: process.env.EMAIL_USER || 'noreply@swu-ifss.com',
    to: email,
    subject: `📋 SWU IFSS — Reservation Request Submitted (${title || 'Room Reservation'})`,
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
          .info-box { background-color: #fff; padding: 18px; border-left: 4px solid #800000; margin: 20px 0; border-radius: 6px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Reservation Submitted</h1>
          </div>
          <div class="content">
            <h2>Hello ${displayName || 'Requestor'},</h2>
            <p>Your room reservation request has been submitted successfully and is currently under review.</p>
            
            <div class="info-box">
              <h3 style="margin-top:0;color:#800000;">Submitted Request Details:</h3>
              <p><strong>Activity / Title:</strong> ${title || 'Room Reservation'}</p>
              <p><strong>Request Type:</strong> ${resType || 'Academic'}</p>
              <p><strong>Designated Venue:</strong> ${venue || 'Campus Venue'}</p>
              <p><strong>Current Status:</strong> Pending Review (Level ${levelNumber || 1}: ${roleLabel || 'Approver'})</p>
            </div>

            <p>You will receive notification emails as your request progresses through the approval workflow.</p>

            <center>
              <a href="${APP_URL}${link || '/request'}" class="button">Track Request Status</a>
            </center>

            <p>Best regards,<br>SWU IFSS System</p>
          </div>
          <div class="footer">
            <p>This is an automated notification. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await getTransporter().sendMail(mailOptions);
    return { success: true, message: 'Submission confirmation email sent successfully' };
  } catch (error) {
    console.error('Error sending submission confirmation email:', error);
    return { success: false, error: error.message };
  }
});

// Send email notification to requestor when reservation is approved or rejected by an approver
exports.sendReservationDecisionEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }

  const { email, displayName, title, resType, venue, status, approverName, approverRole, remarks, link } = data;
  if (!email) {
    throw new functions.https.HttpsError('invalid-argument', 'email is required.');
  }

  const isApproved = status === 'approved';
  const subjectText = isApproved
    ? `✅ SWU IFSS — Reservation Request Approved (${title || 'Room Reservation'})`
    : `❌ SWU IFSS — Reservation Request Rejected (${title || 'Room Reservation'})`;

  const headerBg = isApproved ? '#166534' : '#991B1B';
  const statusBadge = isApproved ? 'APPROVED' : 'REJECTED';

  const mailOptions = {
    from: process.env.EMAIL_USER || 'noreply@swu-ifss.com',
    to: email,
    subject: subjectText,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: ${headerBg}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background-color: #800000; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .info-box { background-color: #fff; padding: 18px; border-left: 4px solid ${headerBg}; margin: 20px 0; border-radius: 6px; }
          .remarks-box { background-color: #fee2e2; border: 1px solid #fca5a5; padding: 14px; border-radius: 6px; margin: 15px 0; color: #991b1b; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Reservation Request ${statusBadge}</h1>
          </div>
          <div class="content">
            <h2>Hello ${displayName || 'Requestor'},</h2>
            <p>Your room reservation request status has been updated by <strong>${approverName || 'Approver'}</strong> (${approverRole || 'Approver'}).</p>
            
            <div class="info-box">
              <h3 style="margin-top:0;color:${headerBg};">Reservation Details:</h3>
              <p><strong>Activity / Title:</strong> ${title || 'Room Reservation'}</p>
              <p><strong>Request Type:</strong> ${resType || 'Academic'}</p>
              <p><strong>Designated Venue:</strong> ${venue || 'Campus Venue'}</p>
              <p><strong>Status:</strong> <strong>${statusBadge}</strong></p>
              <p><strong>Action Taken By:</strong> ${approverName || 'Approver'} (${approverRole || 'Approver'})</p>
            </div>

            ${!isApproved ? `
            <div class="remarks-box">
              <strong style="color: #991b1b; font-size: 14px;">Reason for Rejection:</strong>
              <p style="margin: 6px 0 0 0; font-size: 13px; font-weight: 600; color: #7f1d1d;">${remarks || 'No reason provided by approver.'}</p>
            </div>
            ` : (remarks ? `
            <div class="info-box">
              <strong>Approver Remarks:</strong>
              <p style="margin: 5px 0 0 0;">${remarks}</p>
            </div>
            ` : '')}

            <center>
              <a href="${APP_URL}${link || '/request'}" class="button">View Request Details</a>
            </center>

            <p>Best regards,<br>SWU IFSS System</p>
          </div>
          <div class="footer">
            <p>This is an automated notification. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await getTransporter().sendMail(mailOptions);
    return { success: true, message: 'Decision email sent successfully' };
  } catch (error) {
    console.error('Error sending decision email:', error);
    return { success: false, error: error.message };
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Send Postponement Email — No Class Day reservation displacement
// ═══════════════════════════════════════════════════════════════════════
exports.sendPostponementEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }

  const { email, displayName, reservationTitle, originalDate, venue, reason, rescheduleLink } = data;

  if (!email) {
    throw new functions.https.HttpsError('invalid-argument', 'Recipient email is required.');
  }

  const mailOptions = {
    from: `"SWU IFSS" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `⚠️ Reservation Postponed — No Class Day (${originalDate || 'Date'})`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { margin: 0; padding: 0; background: #f4f4f7; font-family: 'Segoe UI', Arial, sans-serif; }
          .container { max-width: 560px; margin: 30px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
          .header { background: #800000; color: #fff; padding: 28px 30px; text-align: center; }
          .header h1 { margin: 0; font-size: 20px; letter-spacing: 1px; }
          .header p { margin: 8px 0 0; font-size: 12px; opacity: 0.85; }
          .body { padding: 30px; color: #2B3235; line-height: 1.6; }
          .alert-box { background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 14px 18px; border-radius: 8px; margin: 16px 0; }
          .alert-box h3 { margin: 0 0 6px; color: #92400E; font-size: 14px; }
          .alert-box p { margin: 0; font-size: 13px; color: #78350F; }
          .details { background: #f9fafb; border: 1px solid #e5e7eb; padding: 16px; border-radius: 10px; margin: 16px 0; }
          .details p { margin: 4px 0; font-size: 13px; }
          .button { display: inline-block; background: #800000; color: #fff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; font-size: 14px; margin-top: 16px; }
          .footer { text-align: center; padding: 18px; font-size: 11px; color: #999; background: #f9fafb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ RESERVATION POSTPONED</h1>
            <p>No Class Day Declaration</p>
          </div>
          <div class="body">
            <p>Hi <strong>${displayName || 'User'}</strong>,</p>

            <div class="alert-box">
              <h3>No Class Day Declared</h3>
              <p><strong>Reason:</strong> ${reason || 'Class suspension'}</p>
            </div>

            <p>Your reservation has been <strong>postponed</strong> due to a declared No Class Day. Please reschedule at your earliest convenience.</p>

            <div class="details">
              <h3 style="margin-top:0;color:#800000;">Affected Reservation:</h3>
              <p><strong>Activity / Title:</strong> ${reservationTitle || 'Room Reservation'}</p>
              <p><strong>Original Date:</strong> ${originalDate || 'N/A'}</p>
              <p><strong>Venue:</strong> ${venue || 'Campus Venue'}</p>
            </div>

            <p>Our system has prepared <strong>room recommendations</strong> for you to quickly find an available slot. Click below to view suggestions and reschedule:</p>

            <center>
              <a href="${APP_URL}${rescheduleLink || '/reschedule'}" class="button">View Recommendations & Reschedule</a>
            </center>

            <p style="margin-top:20px;">If you need assistance, contact the Registrar's Office.</p>

            <p>Best regards,<br>SWU IFSS System</p>
          </div>
          <div class="footer">
            <p>This is an automated notification. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await getTransporter().sendMail(mailOptions);
    return { success: true, message: 'Postponement email sent successfully' };
  } catch (error) {
    console.error('Error sending postponement email:', error);
    return { success: false, error: error.message };
  }
});
