/*
  GIIT CLEARANCE SYSTEM — DATABASE CONFIGURATION
  ------------------------------------------------
  This app uses a DIFFERENT Firebase project from the old
  legacy clearance system:

    Firebase project : giit-smart-learning
    Data namespace   : giit_clearance

  All clearance records are stored in GIIT-only collections:
    giit_clearance_users
    giit_clearance_payments
    giit_clearance_certificates

  That keeps GIIT clearance data separate from the old system and
  prevents GIIT records from mixing with existing Smart Learning users.

  To move to a brand-new Firebase project later:
  1. Replace window.firebaseConfig with the new Web App config.
  2. Enable Email/Password and Google Authentication.
  3. Create the Firestore database.
  4. Publish the included firestore.rules.
  5. Change adminEmail below and the same email inside firestore.rules.
*/

window.firebaseConfig = {
  apiKey: "AIzaSyAs09gp-JfzUgnFYar73_5_IX5OGPdBsE0",
    authDomain: "historical-clearance-app.firebaseapp.com",
    projectId: "historical-clearance-app",
    storageBucket: "historical-clearance-app.firebasestorage.app",
    messagingSenderId: "789502315534",
    appId: "1:789502315534:web:6cb30dc8944b36766b805f"
};

window.appConfig = {
  // ONE administrator controls every department.
  // Change this in BOTH firebase-config.js and firestore.rules if needed.
  adminEmail: "shololamichael261@gmail.com",
  adminDisplayName: "GIIT Clearance Administrator",
  institutionName: "GIIT Clearance System",
  institutionShortName: "GCS",

  // Separate data namespace for this application.
  databaseNamespace: "giit_clearance",

  // Leave blank to use this project's default Firestore database.
  // If you create a named Firestore database, put its ID here and use
  // the same database ID in firestore.rules deployment settings.
  firestoreDatabaseId: "",

  // Cloudinary receives payment proof images/PDFs.
  cloudinaryCloudName: "jyjjsi2c",
  cloudinaryUploadPreset: "lasu_clearance_uploads",
  cloudinaryFolder: "images/lasu_images",

  // Leave blank to use whatever domain the app is deployed on.
  // Set it to the final Vercel URL when certificate QR links are ready.
  siteBaseUrl: "giit-clearance-system.vercel.app"
};

window.giitDatabase = {
  projectId: window.firebaseConfig.projectId,
  namespace: window.appConfig.databaseNamespace,
  collections: {
    users: `${window.appConfig.databaseNamespace}_users`,
    payments: `${window.appConfig.databaseNamespace}_payments`,
    certificates: `${window.appConfig.databaseNamespace}_certificates`
  }
};
