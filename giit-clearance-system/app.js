import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendEmailVerification, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const Naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });

const cfg = window.firebaseConfig || {};
const appCfg = window.appConfig || {};
const ADMIN_EMAIL = String(appCfg.adminEmail || '').trim().toLowerCase();
const COLLECTIONS = window.giitDatabase?.collections || {
  users: 'giit_clearance_users',
  payments: 'giit_clearance_payments',
  certificates: 'giit_clearance_certificates'
};
const FIRESTORE_DATABASE_ID = String(appCfg.firestoreDatabaseId || '').trim();
const DEPARTMENTS = ['Full Stack Web Development', 'Data and Analytics', , 'Cyberscurity', 'Digital Marketing', 'Software Development'];
  const REQUIRED_DEPARTMENTS = [' Cybersecurity', 'Data Science', 'Full Stack ', 'Software Development'];
const PAYMENT_TYPES = {
  'Full Stack Web Development': ['Front End Development', 'Back End Developtment', 'UI/UX design', 'Word Press',"Full Stack Graduation Fee"],
  'Data and Analytics': ['Data and Analytics', 'Business Analytics', 'Data Analytics Graduation Fee', 'Business Analysis Graduation Fee'],
  'Cyberscurity': ['Cybersecurity', 'Networking', 'Cybersecurity Graduation Fee', 'Networking Graduation Fee'],
  'Digital Marketing': ['Digital Marketing', 'Digital Marketing Graduation Fee'],
  'Data Science': ['Data Science','Data Science Graduation Fee' ], 
  'Software Development': ['AWS', 'Cloud Computing', 'DevOps', 'Azure','Google Cloud', 'Software Development Graduation Fee' ]
};

const params = new URLSearchParams(location.search);
const privateAdminLogin = params.has('admin');
const privateAdminSignup = false; // Admin signup is permanently disabled.

let firebaseApp, auth, db;
let authMode = privateAdminLogin ? 'admin' : 'student';
let registerRole = 'student';
let currentUser = null;
let users = [], payments = [];

function normalizedEmail(value = '') { return String(value).trim().toLowerCase(); }
function isDesignatedAdmin(fbUser) {
  return !!ADMIN_EMAIL && normalizedEmail(fbUser?.email) === ADMIN_EMAIL;
}
function getConfiguredFirestore(app) {
  return FIRESTORE_DATABASE_ID ? getFirestore(app, FIRESTORE_DATABASE_ID) : getFirestore(app);
}

function isConfigured() {
  return cfg.apiKey && !String(cfg.apiKey).includes('PASTE_')
    && cfg.projectId && !String(cfg.projectId).includes('PASTE_')
    && ADMIN_EMAIL && appCfg.databaseNamespace;
}
function today() { return new Date().toISOString().slice(0, 10); }
function escapeHtml(v='') { return String(v).replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s])); }
function statusBadge(status) { return `<span class="status ${String(status).toLowerCase().replaceAll(' ', '-')}">${escapeHtml(status)}</span>`; }
function normalizeDate(value) {
  if (!value) return today();
  if (typeof value === 'string') return value;
  if (value.toDate) return value.toDate().toISOString().slice(0, 10);
  return today();
}
function toast(msg, type = '') {
  const node = document.createElement('div');
  node.className = `toast-item ${type}`;
  node.textContent = msg;
  $('#toast').appendChild(node);
  setTimeout(() => node.remove(), 4200);
}

function setLoading(button, isLoading, loadingText = 'Please wait...') {
  if (!button) return;
  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}
function safeId(value='') {
  return String(value).trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'student';
}
function certificateIdFor(user) { return `GIIT-CERT-${safeId(user.matric || user.id)}`.toUpperCase(); }
function verificationUrlFor(certId) {
  const base = (appCfg.siteBaseUrl || location.origin || '').replace(/\/$/, '');
  return `${base}/verify.html?cert=${encodeURIComponent(certId)}`;
}
function show(view) {
  $('#landingView').classList.toggle('hidden', view !== 'landing');
  $('#authView').classList.toggle('hidden', view !== 'auth');
  $('#appView').classList.toggle('hidden', view !== 'app');
  $('#logoutBtn').classList.toggle('hidden', view !== 'app');
}
function requireFirebaseConfigured() {
  if (isConfigured()) return true;
  toast('GIIT database is not configured. Update firebase-config.js.', 'error');
  return false;
}
function requireCloudinaryConfigured() {
  const cloudName = appCfg.cloudinaryCloudName || '';
  const preset = appCfg.cloudinaryUploadPreset || '';
  if (cloudName && preset && !cloudName.includes('PASTE_') && !preset.includes('PASTE_')) return true;
  toast('Cloudinary is not configured. Add cloudinaryCloudName and cloudinaryUploadPreset in firebase-config.js.', 'error');
  return false;
}
async function uploadProofToCloudinary(file) {
  if (!requireCloudinaryConfigured()) throw new Error('Cloudinary upload is not configured.');
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', appCfg.cloudinaryUploadPreset);
  formData.append('folder', appCfg.cloudinaryFolder || 'giit-clearance-system/payment-proofs');
  const url = `https://api.cloudinary.com/v1_1/${appCfg.cloudinaryCloudName}/auto/upload`;
  let response;
  try {
    response = await fetch(url, { method: 'POST', body: formData });
  } catch (networkError) {
    throw new Error('Upload connection failed. Check internet connection, run the project from a local server/hosting, and confirm your Cloudinary cloud name/upload preset.');
  }
  let result = {};
  try { result = await response.json(); } catch (_) {}
  if (!response.ok) throw new Error(result.error?.message || 'Cloudinary upload failed. Confirm the upload preset is UNSIGNED and allows image/PDF uploads.');
  return { proofUrl: result.secure_url, proofPublicId: result.public_id, proofResourceType: result.resource_type };
}
async function generateQrDataUrl(text) {
  if (!window.QRCode) throw new Error('QR library is not available.');
  if (typeof window.QRCode.toDataURL === 'function') return await window.QRCode.toDataURL(text, { width: 220, margin: 1 });
  const holder = document.createElement('div');
  holder.style.position = 'fixed'; holder.style.left = '-9999px'; holder.style.top = '-9999px';
  document.body.appendChild(holder);
  new window.QRCode(holder, { text, width: 220, height: 220, colorDark: '#000000', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel?.H });
  await new Promise(resolve => setTimeout(resolve, 80));
  const canvas = holder.querySelector('canvas');
  const img = holder.querySelector('img');
  const dataUrl = canvas ? canvas.toDataURL('image/png') : img?.src;
  holder.remove();
  if (!dataUrl) throw new Error('Could not generate QR code.');
  return dataUrl;
}

function paymentTypeOptions() {
  return Object.entries(PAYMENT_TYPES).flatMap(([dept, types]) => types.map(type => ({ dept, type })));
}
function syncPaymentDepartmentWithType() {
  const selected = $('#paymentType')?.selectedOptions?.[0];
  const dept = selected?.dataset?.dept;
  if (dept && $('#paymentDepartment')) $('#paymentDepartment').value = dept;
}
function departmentMatches() {
  // One central administrator can review every department.
  return true;
}
function visiblePaymentsForCurrentAdmin() {
  return payments;
}
function includesSearch(values, queryText) {
  const q = String(queryText || '').trim().toLowerCase();
  if (!q) return true;
  return values.some(v => String(v ?? '').toLowerCase().includes(q));
}
function studentPayments(studentId = currentUser.id) { return payments.filter(p => p.studentId === studentId); }
function approvedDepartmentsFor(studentId = currentUser?.id, source = payments) {
  return new Set(source.filter(p => p.studentId === studentId && p.status === 'Approved').map(p => p.department));
}
function hasAllDepartmentApprovals(studentId = currentUser?.id, source = payments) {
  const approved = approvedDepartmentsFor(studentId, source);
  return REQUIRED_DEPARTMENTS.every(dept => approved.has(dept));
}
function canCurrentStudentDownloadCertificate() {
  // Certificate is available only after an admin sets the student profile to Cleared.
  return currentUser?.role === 'student' && currentUser.clearanceStatus === 'Cleared';
}

async function setupFirebase() {
  if (!requireFirebaseConfigured()) return false;
  firebaseApp = initializeApp(cfg);
  auth = getAuth(firebaseApp);
  db = getConfiguredFirestore(firebaseApp);
  onAuthStateChanged(auth, async (fbUser) => {
    if (!fbUser) { currentUser = null; show(privateAdminLogin ? 'auth' : 'landing'); return; }

    // Students must verify their email. The fixed administrator may log in
    // even if the underlying GIIT Firebase account is not email-verified.
    if (!isDesignatedAdmin(fbUser) && !fbUser.emailVerified) {
      currentUser = null;
      await signOut(auth);
      setAuthScreen('student', 'login');
      toast('Please verify your email address before logging in. Check your inbox or spam folder.', 'error');
      return;
    }

    try {
      await loadCurrentProfile(fbUser);
      await loadAllData();
      renderApp();
    } catch (err) {
      toast(err.message || 'Could not load profile.', 'error');
      await signOut(auth);
    }
  });
  return true;
}

function profileDefaultsFor(fbUser, extra = {}) {
  const admin = isDesignatedAdmin(fbUser);
  const email = normalizedEmail(fbUser.email || '');
  return {
    name: extra.name || fbUser.displayName || (admin ? appCfg.adminDisplayName || 'GIIT Clearance Administrator' : (email.split('@')[0] || 'GIIT Student')),
    matric: extra.matric || (admin ? 'GIIT/ADMIN/001' : `GIIT/${String(fbUser.uid).slice(0, 8).toUpperCase()}`),
    email,
    role: admin ? 'admin' : 'student',
    adminDepartment: admin ? 'All Departments' : null,
    profileScope: admin ? 'all-departments' : 'student-only',
    clearanceStatus: admin ? 'Cleared' : 'Pending',
    authProvider: fbUser.providerData?.[0]?.providerId || 'password',
    createdAt: serverTimestamp()
  };
}

async function ensureClearanceProfile(fbUser, extra = {}) {
  if (!ADMIN_EMAIL) throw new Error('Administrator email is not configured in firebase-config.js.');
  const ref = doc(db, COLLECTIONS.users, fbUser.uid);
  let snap = await getDoc(ref);
  const admin = isDesignatedAdmin(fbUser);

  if (!snap.exists()) {
    await setDoc(ref, profileDefaultsFor(fbUser, extra));
    snap = await getDoc(ref);
  } else {
    const data = snap.data();
    if (admin && data.role !== 'admin') {
      await updateDoc(ref, {
        role: 'admin',
        adminDepartment: 'All Departments',
        profileScope: 'all-departments',
        clearanceStatus: 'Cleared',
        updatedAt: serverTimestamp()
      });
      snap = await getDoc(ref);
    } else if (!admin && data.role === 'admin') {
      await signOut(auth);
      throw new Error('Only the designated GIIT administrator can use an admin account.');
    }
  }

  if (!snap.exists()) throw new Error('Profile could not be created in the GIIT clearance database.');
  return { id: fbUser.uid, ...snap.data() };
}

async function loadCurrentProfile(fbUser) {
  currentUser = await ensureClearanceProfile(fbUser);
  if (currentUser.role === 'admin') {
    authMode = 'admin';
    if (!privateAdminLogin && location.hash !== '#admin') {
      history.replaceState(null, '', `${location.pathname}?admin=1`);
    }
  }
}

async function loadAllData() {
  if (currentUser?.role === 'admin') {
    const [userDocs, paymentDocs] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.users)),
      getDocs(collection(db, COLLECTIONS.payments))
    ]);
    users = userDocs.docs.map(d => ({ id: d.id, ...d.data() }));
    payments = paymentDocs.docs.map(d => ({ id: d.id, ...d.data() }));
    return;
  }
  const paymentDocs = await getDocs(query(collection(db, COLLECTIONS.payments), where('studentId', '==', currentUser.id)));
  users = [currentUser];
  payments = paymentDocs.docs.map(d => ({ id: d.id, ...d.data() }));
}

function setAuthScreen(mode, tab = 'login') {
  authMode = mode === 'admin' ? 'admin' : 'student';
  registerRole = 'student';
  const isAdmin = authMode === 'admin';
  const activeTab = isAdmin ? 'login' : tab;
  $('#authEyebrow').textContent = isAdmin ? 'Single Central Admin' : 'Student Access';
  $('#authHeroTitle').textContent = isAdmin ? 'One administrator. Full clearance control.' : 'Access your clearance portal.';
  $('#authHeroText').textContent = isAdmin ? 'This account reviews every department, approves/rejects proofs, updates student status and exports reports.' : 'Submit payment proof to the correct clearance department and track approval.';
  $('#loginTitle').textContent = isAdmin ? 'Administrator Login' : 'Student Login';
  $('#registerTitle').textContent = 'Student Registration';
  $('#registerSubmitBtn').textContent = 'Create Student Account';
  $('#registerTab').textContent = 'Student Signup';
  $('#registerTab').classList.toggle('hidden', isAdmin);
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.authTab === activeTab));
  $('#loginForm').classList.toggle('hidden', activeTab !== 'login');
  $('#registerForm').classList.toggle('hidden', activeTab !== 'register');
  show('auth');
}

async function login(email, password) {
  if (!requireFirebaseConfigured()) return;
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const admin = isDesignatedAdmin(cred.user);

  if (!admin && !cred.user.emailVerified) {
    try { await sendEmailVerification(cred.user); } catch (_) {}
    await signOut(auth);
    throw new Error('Please verify your email address before logging in. A new verification link has been sent if Firebase allows it. Check inbox, spam, promotions, or all mail.');
  }

  const profile = await ensureClearanceProfile(cred.user);
  if (authMode === 'admin' && (!admin || profile.role !== 'admin')) {
    await signOut(auth);
    throw new Error('Only the designated GIIT administrator can access this area.');
  }
  if (authMode === 'student' && admin) {
    authMode = 'admin';
    history.replaceState(null, '', `${location.pathname}?admin=1`);
  }
}

async function loginWithGoogle() {
  if (!requireFirebaseConfigured()) return;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  const admin = isDesignatedAdmin(cred.user);
  const profile = await ensureClearanceProfile(cred.user);

  if (authMode === 'admin' && (!admin || profile.role !== 'admin')) {
    await signOut(auth);
    throw new Error('Only the designated GIIT administrator can access this area.');
  }
  if (authMode === 'student' && !admin && profile.role === 'admin') {
    await signOut(auth);
    throw new Error('This account is not permitted to use the administrator area.');
  }
  if (authMode === 'student' && admin) {
    authMode = 'admin';
    history.replaceState(null, '', `${location.pathname}?admin=1`);
  }
}

async function resetPassword() {
  const email = $('#loginEmail').value.trim();
  if (!email) throw new Error('Enter your email address first, then click reset password.');
  await sendPasswordResetEmail(auth, email);
}
async function registerAccount(profile) {
  if (!requireFirebaseConfigured()) return;
  if (normalizedEmail(profile.email) === ADMIN_EMAIL) {
    throw new Error('The administrator account is fixed. Use the Admin Login page instead.');
  }
  const cred = await createUserWithEmailAndPassword(auth, profile.email, profile.password);
  await setDoc(doc(db, COLLECTIONS.users, cred.user.uid), {
    name: profile.name,
    matric: profile.matric,
    email: normalizedEmail(profile.email),
    role: 'student',
    adminDepartment: null,
    profileScope: 'student-only',
    clearanceStatus: 'Pending',
    authProvider: 'password',
    createdAt: serverTimestamp()
  });
  try { await sendEmailVerification(cred.user); } catch (err) { console.warn('Email verification could not be sent:', err); }
  await signOut(auth);
}

async function logout() { await signOut(auth); toast('Logged out successfully.', 'success'); }

async function recalcStudentStatus(studentId) {
  const snap = await getDocs(query(collection(db, COLLECTIONS.payments), where('studentId', '==', studentId)));
  const allStudentPayments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const cleared = hasAllDepartmentApprovals(studentId, allStudentPayments);
  const status = cleared ? 'Cleared' : 'Pending';
  const u = users.find(x => x.id === studentId); if (u) u.clearanceStatus = status;
  if (currentUser?.id === studentId) currentUser.clearanceStatus = status;
  await updateDoc(doc(db, COLLECTIONS.users, studentId), { clearanceStatus: status });
  return status;
}
async function verifyCertificateEligibilityFromFirestore() {
  const userSnap = await getDoc(doc(db, COLLECTIONS.users, currentUser.id));
  if (!userSnap.exists()) throw new Error('Student profile could not be found.');
  const freshProfile = { id: currentUser.id, ...userSnap.data() };
  const paymentDocs = await getDocs(query(collection(db, COLLECTIONS.payments), where('studentId', '==', currentUser.id)));
  const freshPayments = paymentDocs.docs.map(d => ({ id: d.id, ...d.data() }));
  if (freshProfile.clearanceStatus !== 'Cleared') {
    throw new Error('Certificate is locked until an admin clears your profile.');
  }
  currentUser = freshProfile;
  payments = freshPayments;
}
async function createOrUpdateCertificateRecord(certId, verifyUrl) {
  await setDoc(doc(db, COLLECTIONS.certificates, certId), {
    certificateId: certId,
    studentId: currentUser.id,
    studentName: currentUser.name || '',
    matric: currentUser.matric || '',
    clearanceStatus: 'Cleared',
    status: 'Valid',
    verificationUrl: verifyUrl,
    issuedAt: serverTimestamp(),
    institutionName: appCfg.institutionName || 'GIIT Clearance System'
  }, { merge: true });
}

function renderApp() {
  show('app');
  $('#rolePill').textContent = currentUser.role === 'admin' ? 'CENTRAL ADMIN • ALL DEPARTMENTS' : 'STUDENT';
  $('#welcomeTitle').textContent = `Welcome, ${currentUser.name}`;
  $('#welcomeSub').textContent = currentUser.role === 'admin' ? 'Control every clearance department, student record and payment proof from one dashboard.' : 'Submit payment proof to departments and track clearance.';
  $('#studentDashboard').classList.toggle('hidden', currentUser.role !== 'student');
  $('#adminDashboard').classList.toggle('hidden', currentUser.role !== 'admin');
  currentUser.role === 'admin' ? renderAdmin() : renderStudent();
}
function renderStudent() {
  const sPayments = studentPayments();
  const studentSearch = $('#studentPaymentSearch')?.value || '';
  const filteredStudentPayments = sPayments.filter(p => includesSearch([p.paymentType, p.billName, p.department, p.amount, p.reference, p.status, p.rejectionReason, normalizeDate(p.createdAt)], studentSearch));
  const approved = approvedDepartmentsFor(currentUser.id);
  const pendingDepartments = REQUIRED_DEPARTMENTS.filter(dept => !approved.has(dept));
  $('#studentBillsTotal').textContent = pendingDepartments.length;
  $('#studentPaymentsCount').textContent = sPayments.length;
  $('#studentStatus').textContent = currentUser.clearanceStatus || 'Pending';
  $('#clearanceProgress').innerHTML = REQUIRED_DEPARTMENTS.map(dept => {
    const latest = sPayments.filter(p => p.department === dept).sort((a,b)=>normalizeDate(b.createdAt).localeCompare(normalizeDate(a.createdAt)))[0];
    const state = approved.has(dept) ? 'approved' : latest?.status === 'Rejected' ? 'rejected' : latest?.status === 'Pending' ? 'pending' : 'not-submitted';
    const label = approved.has(dept) ? 'Approved' : latest?.status === 'Rejected' ? 'Rejected' : latest?.status === 'Pending' ? 'Under Review' : 'Not Submitted';
    return `<div class="progress-step ${state}"><strong>${escapeHtml(dept)}</strong><span>${label}</span></div>`;
  }).join('');
  $('#billsTable').innerHTML = REQUIRED_DEPARTMENTS.map(dept => {
    const latest = sPayments.filter(p => p.department === dept).sort((a,b)=>normalizeDate(b.createdAt).localeCompare(normalizeDate(a.createdAt)))[0];
    const paymentType = latest?.paymentType || (PAYMENT_TYPES[dept]?.[0] || 'Department Payment');
    const status = approved.has(dept) ? 'Approved' : (latest?.status || 'Pending');
    return `<tr><td data-label="Department">${escapeHtml(dept)}</td><td data-label="Required Payment">${escapeHtml(paymentType)}</td><td data-label="Status">${statusBadge(status)}</td></tr>`;
  }).join('');
  $('#paymentDepartment').innerHTML = DEPARTMENTS.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  $('#paymentType').innerHTML = paymentTypeOptions().map(o => `<option value="${escapeHtml(o.type)}" data-dept="${escapeHtml(o.dept)}">${escapeHtml(o.type)} (${escapeHtml(o.dept)})</option>`).join('');
  syncPaymentDepartmentWithType();
  $('#paymentHistoryTable').innerHTML = filteredStudentPayments.length ? filteredStudentPayments.sort((a,b)=>normalizeDate(b.createdAt).localeCompare(normalizeDate(a.createdAt))).map(p => `<tr><td data-label="Date">${normalizeDate(p.createdAt)}</td><td data-label="Type">${escapeHtml(p.paymentType || p.billName || 'Payment')}</td><td data-label="Department">${escapeHtml(p.department || 'N/A')}</td><td data-label="Amount">${Naira.format(p.amount)}</td><td data-label="Status">${statusBadge(p.status)}</td><td data-label="Note">${escapeHtml(p.rejectionReason || (p.status === 'Pending' ? 'Awaiting department review' : ''))}</td></tr>`).join('') : `<tr><td colspan="6" class="empty">${sPayments.length ? 'No payment history matches your search.' : 'You have not submitted any payment proof yet. Start by selecting a payment type, department, amount and receipt file above.'}</td></tr>`;
  renderCertificate();
}
function renderCertificate() {
  const eligible = canCurrentStudentDownloadCertificate();
  const cert = `<div class="certificate" id="printCertificate"><p>${escapeHtml(appCfg.institutionName || 'GIIT Clearance System')}</p><h2>Clearance Certificate</h2><div class="seal">${escapeHtml(appCfg.institutionShortName || 'GCS')}</div><p>This certifies that</p><h3>${escapeHtml(currentUser.name)}</h3><p>Matric/ID: <b>${escapeHtml(currentUser.matric)}</b></p><p>has completed all required departmental clearance obligations.</p><p>Date Issued: <b>${today()}</b></p></div>`;
  $('#certificatePreview').innerHTML = eligible ? cert : '<p class="empty">Certificate will become available after an admin changes your clearance status to Cleared.</p>';
  $('#downloadCertificateBtn').disabled = !eligible;
}
function askRejectionReason() {
  return new Promise((resolve) => {
    const modal = $('#rejectionModal');
    const input = $('#rejectionReasonInput');
    const submit = $('#rejectionSubmitBtn');
    const cancelButtons = [$('#rejectionCancelBtn'), $('#rejectionBackBtn')];
    input.value = '';
    modal.classList.remove('hidden');
    setTimeout(() => input.focus(), 50);

    const cleanup = (value) => {
      modal.classList.add('hidden');
      submit.removeEventListener('click', onSubmit);
      cancelButtons.forEach(btn => btn.removeEventListener('click', onCancel));
      resolve(value);
    };
    const onSubmit = () => {
      const reason = input.value.trim();
      if (!reason) { toast('Rejection reason is required.', 'error'); return; }
      cleanup(reason);
    };
    const onCancel = () => cleanup('');
    submit.addEventListener('click', onSubmit);
    cancelButtons.forEach(btn => btn.addEventListener('click', onCancel));
  });
}

function renderAdmin() {
  const studentSearch = $('#adminStudentSearch')?.value || '';
  const paymentSearch = $('#adminPaymentSearch')?.value || '';
  const students = users.filter(u => u.role === 'student');
  const filteredStudents = students.filter(s => includesSearch([s.name, s.matric, s.email, s.clearanceStatus], studentSearch));
  const dept = 'All Departments';
  const adminPayments = visiblePaymentsForCurrentAdmin();
  const filteredAdminPayments = adminPayments.filter(p => {
    const student = users.find(u => u.id === p.studentId) || {};
    return includesSearch([student.name, student.matric, student.email, p.studentName, p.matric, p.paymentType, p.billName, p.department, p.amount, p.reference, p.status, p.rejectionReason], paymentSearch);
  });
  $('#adminStudentsCount').textContent = students.length;
  $('#adminPendingCount').textContent = filteredAdminPayments.filter(p => p.status === 'Pending').length;
  $('#adminClearedCount').textContent = dept;
  $('#adminDepartmentName').textContent = dept;
  $('#studentsTable').innerHTML = filteredStudents.length ? filteredStudents.map(s => `<tr><td data-label="Name">${escapeHtml(s.name)}</td><td data-label="ID">${escapeHtml(s.matric)}</td><td data-label="Status">${statusBadge(s.clearanceStatus || 'Pending')}</td><td data-label="Email">${escapeHtml(s.email || '')}</td><td data-label="Action"><div class="row-actions"><button class="btn small success" data-status-id="${s.id}" data-status-value="Cleared">Clear</button><button class="btn small danger" data-status-id="${s.id}" data-status-value="Pending">Pending</button><button class="btn small secondary" data-recalc="${s.id}">Auto Check</button></div></td></tr>`).join('') : `<tr><td colspan="5" class="empty">${students.length ? 'No student record matches your search.' : 'No student records yet. Students will appear here after they create accounts.'}</td></tr>`;
  $('#adminPaymentsTable').innerHTML = filteredAdminPayments.length ? filteredAdminPayments.map(p => {
    const s = users.find(u => u.id === p.studentId) || {};
    const proof = p.proofUrl ? `<a href="${escapeHtml(p.proofUrl)}" target="_blank" rel="noopener">View Proof</a>` : escapeHtml(p.proofName || 'Uploaded');
    const actions = p.status === 'Pending' ? `<div class="row-actions"><button class="btn small success" data-review="${p.id}" data-decision="Approved">Approve</button><button class="btn small danger" data-review="${p.id}" data-decision="Rejected">Reject</button></div>` : '<small>Reviewed</small>';
    return `<tr><td data-label="Student">${escapeHtml(s.name || p.studentName || 'Unknown')}</td><td data-label="Type">${escapeHtml(p.paymentType || p.billName || 'Payment')}</td><td data-label="Department">${escapeHtml(p.department || 'N/A')}</td><td data-label="Amount">${Naira.format(p.amount)}</td><td data-label="Reference">${escapeHtml(p.reference)}</td><td data-label="Proof">${proof}</td><td data-label="Status">${statusBadge(p.status)}</td><td data-label="Action">${actions}</td></tr>`;
  }).join('') : `<tr><td colspan="8" class="empty">${adminPayments.length ? 'No payment proof matches your search.' : 'No payment proof has been submitted yet.'}</td></tr>`;
}
async function reviewPayment(paymentId, decision) {
  const p = payments.find(x => x.id === paymentId); if (!p) return;
  let rejectionReason = '';
  if (decision === 'Rejected') {
    rejectionReason = await askRejectionReason();
    if (!rejectionReason.trim()) return;
  }
  await updateDoc(doc(db, COLLECTIONS.payments, paymentId), {
    status: decision,
    rejectionReason: decision === 'Rejected' ? rejectionReason.trim() : '',
    reviewedAt: serverTimestamp(),
    reviewedBy: currentUser.id,
    reviewedByDepartment: 'Central Administration'
  });
  p.status = decision;
  p.rejectionReason = rejectionReason.trim();
  if (decision === 'Approved') await recalcStudentStatus(p.studentId);
  await loadAllData(); renderAdmin(); toast(`Payment ${decision.toLowerCase()}.`, decision === 'Approved' ? 'success' : 'error');
}
async function setStudentClearanceStatus(studentId, status) {
  if (!['Cleared', 'Pending'].includes(status)) return;
  await updateDoc(doc(db, COLLECTIONS.users, studentId), { clearanceStatus: status, clearanceUpdatedAt: serverTimestamp(), clearanceUpdatedBy: currentUser.id });
  const student = users.find(u => u.id === studentId);
  if (student) student.clearanceStatus = status;
  renderAdmin();
  toast(`Student clearance status changed to ${status}.`, status === 'Cleared' ? 'success' : 'error');
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.submitter || e.target.querySelector('button[type="submit"]');
  setLoading(btn, true, 'Logging in...');
  try { await login($('#loginEmail').value.trim(), $('#loginPassword').value); toast('Logged in successfully.', 'success'); }
  catch (err) { toast(err.message, 'error'); }
  finally { setLoading(btn, false); }
});

$('#googleLoginBtn').addEventListener('click', async e => {
  const btn = e.currentTarget;
  setLoading(btn, true, 'Connecting...');
  try { await loginWithGoogle(); toast('Signed in with Google successfully.', 'success'); }
  catch (err) { toast(err.message, 'error'); }
  finally { setLoading(btn, false); }
});
$('#resetPasswordBtn').addEventListener('click', async e => {
  const btn = e.currentTarget;
  setLoading(btn, true, 'Sending link...');
  try { await resetPassword(); toast('Password reset link sent. Check your email.', 'success'); }
  catch (err) { toast(err.message, 'error'); }
  finally { setLoading(btn, false); }
});
$('#registerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.submitter || e.target.querySelector('button[type="submit"]');
  if ($('#regPassword').value !== $('#regConfirmPassword').value) return toast('Passwords do not match.', 'error');
  setLoading(btn, true, 'Creating account...');
  try {
    await registerAccount({ name: $('#regName').value.trim(), matric: $('#regId').value.trim(), email: $('#regEmail').value.trim(), password: $('#regPassword').value });
    toast(registerRole === 'student' ? 'Account created. Please verify your email before logging in.' : 'Admin account created successfully.', 'success');
  } catch (err) { toast(err.message, 'error'); }
  finally { setLoading(btn, false); }
});
$('#paymentForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.submitter || e.target.querySelector('button[type="submit"]');
  const paymentType = $('#paymentType').value;
  const department = $('#paymentDepartment').value;
  const file = $('#paymentFile').files[0];
  if (!file) return toast('Please select a payment proof file.', 'error');
  setLoading(btn, true, 'Uploading proof...');
  try {
    const uploaded = await uploadProofToCloudinary(file);
    await addDoc(collection(db, COLLECTIONS.payments), {
      studentId: currentUser.id,
      studentName: currentUser.name || '',
      matric: currentUser.matric || '',
      paymentType,
      department,
      amount: Number($('#paymentAmount').value),
      reference: $('#paymentRef').value.trim(),
      proofName: file.name,
      proofUrl: uploaded.proofUrl,
      proofPublicId: uploaded.proofPublicId,
      proofResourceType: uploaded.proofResourceType,
      uploadProvider: 'cloudinary',
      status: 'Pending',
      createdAt: serverTimestamp()
    });
    e.target.reset();
    await loadAllData();
    renderStudent();
    toast(`Payment proof submitted to ${department} for review.`, 'success');
  } catch (err) { toast(err.message, 'error'); }
  finally { setLoading(btn, false); }
});
$('#paymentType')?.addEventListener('change', syncPaymentDepartmentWithType);
$('#studentPaymentSearch')?.addEventListener('input', renderStudent);
$('#adminStudentSearch')?.addEventListener('input', renderAdmin);
$('#adminPaymentSearch')?.addEventListener('input', renderAdmin);
$('#adminPaymentsTable').addEventListener('click', e => { const id = e.target.dataset.review; const decision = e.target.dataset.decision; if (id && decision) reviewPayment(id, decision); });
$('#studentsTable').addEventListener('click', async e => {
  const statusId = e.target.dataset.statusId;
  const statusValue = e.target.dataset.statusValue;
  if (statusId && statusValue) {
    try { await setStudentClearanceStatus(statusId, statusValue); }
    catch (err) { toast(err.message || 'Could not update clearance status.', 'error'); }
    return;
  }
  const id = e.target.dataset.recalc;
  if (!id) return;
  try {
    const status = await recalcStudentStatus(id);
    await loadAllData();
    renderAdmin();
    toast(`Student status automatically rechecked: ${status}.`, 'success');
  } catch (err) { toast(err.message || 'Could not recheck status.', 'error'); }
});
$('#refreshBtn').addEventListener('click', async () => { await loadAllData(); renderApp(); toast('Dashboard refreshed.', 'success'); });
$('#logoutBtn').addEventListener('click', logout);
$('#backHomeBtn').addEventListener('click', () => { history.replaceState(null, '', location.pathname); show('landing'); });
$$('[data-toggle-password]').forEach(btn => btn.addEventListener('click', () => {
  const input = document.getElementById(btn.dataset.togglePassword);
  if (!input) return;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  btn.textContent = showing ? 'Show' : 'Hide';
}));
$$('.nav-student-login').forEach(btn => btn.addEventListener('click', () => setAuthScreen('student', 'login')));
$$('.nav-student-signup').forEach(btn => btn.addEventListener('click', () => setAuthScreen('student', 'register')));
$$('.nav-admin-login').forEach(btn => btn.addEventListener('click', () => { history.replaceState(null, '', `${location.pathname}?admin=1`); setAuthScreen('admin', 'login'); }));
$$('.tab').forEach(tab => tab.addEventListener('click', () => setAuthScreen(authMode, tab.dataset.authTab)));

$('#downloadCertificateBtn').addEventListener('click', async () => {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF || !window.QRCode) { toast('PDF/QR library is not available. Refresh the page and try again.', 'error'); return; }
  try {
    await verifyCertificateEligibilityFromFirestore();
    const certId = certificateIdFor(currentUser);
    const verifyUrl = verificationUrlFor(certId);
    await createOrUpdateCertificateRecord(certId, verifyUrl);
    const qrDataUrl = await generateQrDataUrl(verifyUrl);
    const docPdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = docPdf.internal.pageSize.getWidth();
    const pageHeight = docPdf.internal.pageSize.getHeight();
    const centerX = pageWidth / 2;
    const institution = appCfg.institutionName || 'GIIT Clearance System';
    const shortName = appCfg.institutionShortName || 'GCS';
    const matric = safeId(currentUser.matric || 'student');

    docPdf.setFillColor(247, 250, 255); docPdf.rect(0, 0, pageWidth, pageHeight, 'F');
    docPdf.setDrawColor(16, 32, 51); docPdf.setLineWidth(1.4); docPdf.rect(12, 12, pageWidth - 24, pageHeight - 24); docPdf.setLineWidth(0.4); docPdf.rect(17, 17, pageWidth - 34, pageHeight - 34);
    docPdf.setTextColor(23, 92, 211); docPdf.setFont('helvetica', 'bold'); docPdf.setFontSize(20); docPdf.text(institution, centerX, 34, { align: 'center' });
    docPdf.setTextColor(16, 32, 51); docPdf.setFontSize(30); docPdf.text('CLEARANCE CERTIFICATE', centerX, 55, { align: 'center' });
    docPdf.setFillColor(23, 92, 211); docPdf.circle(centerX, 78, 15, 'F'); docPdf.setTextColor(255, 255, 255); docPdf.setFontSize(15); docPdf.text(shortName, centerX, 82, { align: 'center' });
    docPdf.setTextColor(75, 85, 99); docPdf.setFont('helvetica', 'normal'); docPdf.setFontSize(14); docPdf.text('This is to certify that', centerX, 106, { align: 'center' });
    docPdf.setTextColor(16, 32, 51); docPdf.setFont('helvetica', 'bold'); docPdf.setFontSize(26); docPdf.text(String(currentUser.name || 'Student').toUpperCase(), centerX, 124, { align: 'center' });
    docPdf.setFontSize(13); docPdf.text(`Matric / ID Number: ${currentUser.matric || ''}`, centerX, 139, { align: 'center' });
    docPdf.setFontSize(10); docPdf.text(`Certificate ID: ${certId}`, centerX, 148, { align: 'center' });
    docPdf.setTextColor(75, 85, 99); docPdf.setFont('helvetica', 'normal'); docPdf.setFontSize(13);
    docPdf.text('has completed all required departmental clearance obligations and is hereby granted clearance.', centerX, 162, { align: 'center', maxWidth: 215 });
    docPdf.addImage(qrDataUrl, 'PNG', pageWidth - 62, 133, 34, 34); docPdf.setTextColor(16, 32, 51); docPdf.setFont('helvetica', 'bold'); docPdf.setFontSize(8); docPdf.text('Scan to verify', pageWidth - 45, 172, { align: 'center' });
    docPdf.setFontSize(11); docPdf.line(38, 180, 105, 180); docPdf.text('Clearance Officer', 71.5, 188, { align: 'center' }); docPdf.line(pageWidth - 125, 180, pageWidth - 68, 180); docPdf.text(`Date Issued: ${today()}`, pageWidth - 96.5, 188, { align: 'center' });
    docPdf.setFont('helvetica', 'normal'); docPdf.setTextColor(100, 116, 139); docPdf.setFontSize(8); docPdf.text(`Verify online: ${verifyUrl}`, centerX, 199, { align: 'center' });
    docPdf.save(`${matric}-clearance-certificate.pdf`);
    toast('Certificate PDF with QR code downloaded successfully.', 'success');
  } catch (err) { toast(err.message || 'Could not generate certificate PDF.', 'error'); }
});

$('#exportReportBtn').addEventListener('click', () => {
  const rows = [['Student','Matric/ID','Department','Payment Type','Amount','Reference','Status','Reviewed By']];
  visiblePaymentsForCurrentAdmin().forEach(p => {
    const s = users.find(u => u.id === p.studentId) || {};
    rows.push([s.name || p.studentName || '', s.matric || p.matric || '', p.department || '', p.paymentType || '', p.amount || '', p.reference || '', p.status || '', p.reviewedByDepartment || '']);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replaceAll('"','""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `giit-clearance-report-${today()}.csv`; a.click(); URL.revokeObjectURL(a.href);
});

(function boot() {
  if (params.has('admin-signup')) {
    history.replaceState(null, '', `${location.pathname}?admin=1`);
    toast('Admin signup is disabled. GIIT Clearance System has one fixed administrator.', 'error');
  }
  if (privateAdminLogin) setAuthScreen('admin', 'login');
  else show('landing');
  setupFirebase();
})();
