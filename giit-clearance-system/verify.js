import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const cfg = window.firebaseConfig || {};
const appCfg = window.appConfig || {};
const COLLECTIONS = window.giitDatabase?.collections || {
  certificates: 'giit_clearance_certificates'
};
const FIRESTORE_DATABASE_ID = String(appCfg.firestoreDatabaseId || '').trim();
const card = document.querySelector('#verifyCard');
const params = new URLSearchParams(location.search);
const certId = params.get('cert');

function escapeHtml(v = '') {
  return String(v).replace(/[&<>"]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
}
function dateValue(value) {
  if (!value) return 'Not available';
  if (typeof value === 'string') return value;
  if (value.toDate) return value.toDate().toISOString().slice(0, 10);
  return 'Not available';
}
function renderInvalid(message) {
  card.className = 'verify-card invalid';
  card.innerHTML = `
    <span class="eyebrow danger-label">Invalid Certificate</span>
    <h2>Certificate Not Verified</h2>
    <p>${escapeHtml(message)}</p>
    <a class="btn secondary" href="index.html">Back to GIIT Portal</a>
  `;
}
function renderValid(cert) {
  card.className = 'verify-card valid';
  card.innerHTML = `
    <span class="eyebrow success-label">Certificate Valid</span>
    <h2>Verified GIIT Clearance Certificate</h2>
    <div class="verify-seal">✓</div>
    <div class="verify-details">
      <p><b>Certificate ID:</b> ${escapeHtml(cert.certificateId)}</p>
      <p><b>Student Name:</b> ${escapeHtml(cert.studentName)}</p>
      <p><b>Matric / ID:</b> ${escapeHtml(cert.matric)}</p>
      <p><b>Clearance Status:</b> ${escapeHtml(cert.clearanceStatus)}</p>
      <p><b>Certificate Status:</b> ${escapeHtml(cert.status)}</p>
      <p><b>Date Issued:</b> ${escapeHtml(dateValue(cert.issuedAt))}</p>
      <p><b>Institution/System:</b> ${escapeHtml(cert.institutionName || appCfg.institutionName || 'GIIT Clearance System')}</p>
    </div>
    <p class="verify-note">This record was retrieved from the separate GIIT clearance database.</p>
  `;
}

async function boot() {
  if (!certId) return renderInvalid('No certificate ID was provided in the verification link.');
  try {
    const app = initializeApp(cfg);
    const db = FIRESTORE_DATABASE_ID ? getFirestore(app, FIRESTORE_DATABASE_ID) : getFirestore(app);
    const snap = await getDoc(doc(db, COLLECTIONS.certificates, certId));
    if (!snap.exists()) return renderInvalid('This certificate ID was not found in the GIIT clearance database.');
    const cert = snap.data();
    if (cert.status !== 'Valid' || cert.clearanceStatus !== 'Cleared') return renderInvalid('This certificate exists but is not currently valid or cleared.');
    renderValid(cert);
  } catch (err) {
    renderInvalid(err.message || 'Unable to verify this certificate at the moment.');
  }
}
boot();
