# GIIT Clearance System

A duplicated and rebranded version of the old **Historical Clearance System**, rebuilt for **GIIT Africa** with a separate database and **one central administrator**.

## What changed

| Area | Old Historical system | GIIT Clearance System |
|---|---|---|
| Name | Historical Clearance Statement System | **GIIT Clearance System** |
| Firebase project | `historical-clearance-system` | **`giit-smart-learning`** (different database) |
| Data collections | `users`, `payments`, `certificates` | `giit_clearance_users`, `giit_clearance_payments`, `giit_clearance_certificates` |
| Admin model | Multiple department admins + invite-code signup | **One fixed administrator only** |
| Admin scope | One department per admin | **All departments** |
| Admin signup | `admin-signup.html` | **Removed** |
| Branding | HC text mark | GIIT Africa logo |

The old site's functions are preserved:

- Student registration and login
- Google sign-in
- Password reset
- Email verification for students
- Departmental clearance progress
- Payment-proof upload to Cloudinary
- Payment history and search
- Admin approval/rejection with rejection reason
- Automatic clearance recalculation after approvals
- Manual Clear/Pending student status control
- Clearance certificate PDF download
- QR-code certificate verification
- CSV report export
- Separate GIIT data namespace

## One-admin model

The only administrator email is configured in `firebase-config.js`:

```js
adminEmail: "feranmiadmin@gmail.com"
```

The same email is enforced in `firestore.rules`:

```txt
request.auth.token.email == "feranmiadmin@gmail.com"
```

This administrator:

- logs in through `index.html?admin=1`
- sees all students
- sees payment proofs from every department
- approves/rejects any proof
- manually changes student clearance status
- exports all payment records

No invite code, department selection or admin signup exists. A non-admin account cannot create another admin because `firestore.rules` only allows `role: "admin"` for the fixed admin email and its own user document.

> **Important — security before going live:** publish `firestore.rules` in Firebase Console before deploying this app with real student data. The `giit-smart-learning` project currently has permissive Firestore rules, and the frontend alone cannot protect the database. These rules are what truly enforce the one-admin model and student data privacy.

## Different database

This project points to the separate GIIT Firebase project:

```txt
Project ID: giit-smart-learning
```

Clearance records are stored only in these namespaced collections:

```txt
giit_clearance_users
giit_clearance_payments
giit_clearance_certificates
```

That means GIIT clearance data does not mix with:

- the old Historical system's `users`, `payments` and `certificates` collections
- the GIIT Smart Learning platform's normal `users` collection

Firebase Authentication is shared with the GIIT Firebase project, but application data is isolated.

If you later create a brand-new Firebase project just for clearance:

1. Replace `window.firebaseConfig` in `firebase-config.js`.
2. Create its Firestore database.
3. Publish `firestore.rules` to that database.
4. Create the fixed admin account in Firebase Authentication.
5. Update `adminEmail` in both `firebase-config.js` and `firestore.rules`.

## Firebase Console setup

In the `giit-smart-learning` Firebase project:

1. Open **Authentication → Sign-in method**.
2. Enable **Email/Password**.
3. Enable **Google** if students should use Google sign-in.
4. Open **Firestore Database**.
5. Publish the included `firestore.rules`.
6. Ensure this admin user exists in **Authentication → Users**:

```txt
feranmiadmin@gmail.com
```

If that account does not exist yet, create it manually in Firebase Authentication and set its password. The app does **not** create admin accounts.

The first time the fixed admin logs in, the app automatically creates its admin profile in `giit_clearance_users`.

## Cloudinary setup

Payment proofs do not use Firebase Storage. They go directly to Cloudinary:

```js
cloudinaryCloudName: "dinypexvn",
cloudinaryUploadPreset: "smart-learning",
cloudinaryFolder: "giit-clearance-system/payment-proofs"
```

The `smart-learning` unsigned preset was confirmed to accept both images and PDFs. Only the returned secure URL is saved in Firestore.

To use a different preset:

1. Create an **unsigned** upload preset in Cloudinary.
2. Allow `image/*` and PDF files.
3. Replace `cloudinaryUploadPreset` in `firebase-config.js`.

## Certificate QR links

`siteBaseUrl` is empty by default, so certificate QR codes use the domain where the app is running:

```txt
https://your-domain/verify.html?cert=GIIT-CERT-...
```

After final deployment, you can pin it in `firebase-config.js`:

```js
siteBaseUrl: "https://your-giit-clearance-site.vercel.app"
```

## Run locally

From this folder:

```bash
npm start
```

Then open:

```txt
http://localhost:4173
```

Use a local server instead of opening `index.html` directly, because Firebase ES modules and service-style files behave correctly over HTTP.

Run static checks:

```bash
npm run check
```

## Deployment

This is a static HTML/CSS/JavaScript site, so it can be deployed to Vercel, Netlify, Firebase Hosting or any static host.

For Vercel:

1. Create a new project named `giit-clearance-system`.
2. Upload this folder.
3. Do **not** reuse the old Historical Vercel project.
4. After deployment, optionally set `siteBaseUrl` to the production URL.
5. Add the production domain to Firebase Authentication → Authorized domains.
6. Publish `firestore.rules` to the Firebase database used by this app.

## Files

- `index.html` — landing, auth, student dashboard and central admin dashboard
- `styles.css` — responsive GIIT-branded UI
- `app.js` — authentication, Firestore, Cloudinary, approvals, certificates and reports
- `firebase-config.js` — separate database config and fixed admin email
- `verify.html` / `verify.js` — public QR certificate verification
- `firestore.rules` — one-admin security rules for GIIT collections
- `storage.rules` — reference only; Cloudinary is used instead
- `server.mjs` — zero-dependency local static server
- `test_static.mjs` — branding, single-admin and database-isolation checks
- `giit-africa-logo.svg` — deployment-friendly GIIT Africa logo (embeds the PNG)
- `giit-africa-logo.png` — original GIIT Africa logo
- `vendor/` — local jsPDF and QRCode libraries
