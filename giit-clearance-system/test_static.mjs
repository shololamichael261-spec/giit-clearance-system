import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.dirname(new URL(import.meta.url).pathname);
const checks = [];
const tempDir = mkdtempSync(path.join(tmpdir(), 'giit-check-'));

function check(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({ name, ok: false, message: error.message });
  }
}

function read(file) {
  return readFileSync(path.join(root, file), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

check('Project is branded GIIT Clearance System', () => {
  assert(read('index.html').includes('<title>GIIT Clearance System</title>'), 'index.html title is wrong');
  assert(read('verify.html').includes('GIIT Clearance System'), 'verify.html is not branded');
  assert(read('firebase-config.js').includes('institutionName: "GIIT Clearance System"'), 'config institution name is wrong');
});

check('Old Historical branding is removed from runtime files', () => {
  for (const file of ['index.html', 'verify.html', 'app.js', 'verify.js']) {
    const text = read(file);
    assert(!text.includes('Historical Clearance Statement System'), `${file} still contains the old system name`);
    assert(!text.includes('HCS-CERT'), `${file} still contains old certificate IDs`);
  }
});

check('Multiple-admin signup pages are removed', () => {
  assert(!existsSync(path.join(root, 'admin-signup.html')), 'admin-signup.html still exists');
  assert(!existsSync(path.join(root, 'admin-signup.js')), 'admin-signup.js still exists');
  assert(read('app.js').includes('const privateAdminSignup = false'), 'admin signup is not disabled in app.js');
  assert(read('firestore.rules').includes('Admin signup is disabled'), 'rules do not document single-admin mode');
});

check('One fixed administrator is configured', () => {
  assert(read('firebase-config.js').includes('adminEmail: "feranmiadmin@gmail.com"'), 'admin email is missing');
  assert(read('app.js').includes('function isDesignatedAdmin'), 'admin email check is missing');
  assert(read('firestore.rules').includes('request.auth.token.email == "feranmiadmin@gmail.com"'), 'rules do not enforce admin email');
});

check('Separate GIIT data collections are used everywhere', () => {
  for (const file of ['firebase-config.js', 'firestore.rules']) {
    const text = read(file);
    assert(text.includes('giit_clearance_users'), `${file} is missing users collection`);
    assert(text.includes('giit_clearance_payments'), `${file} is missing payments collection`);
    assert(text.includes('giit_clearance_certificates'), `${file} is missing certificates collection`);
  }
  assert(read('app.js').includes('COLLECTIONS.users'), 'app.js does not use GIIT collection names');
  assert(read('verify.js').includes('COLLECTIONS.certificates'), 'verify.js does not use GIIT certificate collection');
  assert(!/collection\(db, '(users|payments|certificates)'\)/.test(read('app.js')), 'app.js still uses an unprefixed collection');
  assert(!/doc\(db, '(users|payments|certificates)',/.test(read('app.js')), 'app.js still uses an unprefixed document path');
});

check('All departments are controlled by one admin', () => {
  assert(read('app.js').includes('return payments;'), 'admin payment visibility is still department-filtered');
  assert(read('app.js').includes("reviewedByDepartment: 'Central Administration'"), 'review action is not centralised');
  assert(read('index.html').includes('All Department Payment Proofs'), 'admin dashboard still says department-only');
});

check('Local proof upload uses GIIT Cloudinary folder', () => {
  const config = read('firebase-config.js');
  assert(config.includes('cloudinaryUploadPreset: "smart-learning"'), 'Cloudinary preset is not configured');
  assert(config.includes('giit-clearance-system/payment-proofs'), 'GIIT upload folder is missing');
  assert(read('app.js').includes('appCfg.cloudinaryFolder'), 'app.js does not use the GIIT upload folder');
});

check('JavaScript files parse successfully', () => {
  for (const [source, target] of [['app.js', 'app.mjs'], ['verify.js', 'verify.mjs'], ['firebase-config.js', 'config.mjs'], ['server.mjs', 'server-check.mjs']]) {
    const file = path.join(tempDir, target);
    writeFileSync(file, read(source), 'utf8');
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  }
});

check('Required static assets exist', () => {
  for (const file of ['giit-africa-logo.png', 'giit-africa-logo.svg', 'styles.css', 'vendor/jspdf.umd.min.js', 'vendor/qrcode.min.js', 'README.md']) {
    assert(existsSync(path.join(root, file)), `${file} is missing`);
  }
});

rmSync(tempDir, { recursive: true, force: true });

let passed = 0;
for (const item of checks) {
  console.log(`${item.ok ? '✅' : '❌'} ${item.name}${item.ok ? '' : ` — ${item.message}`}`);
  if (item.ok) passed += 1;
}
console.log(`\n${passed}/${checks.length} checks passed`);
if (passed !== checks.length) process.exit(1);
