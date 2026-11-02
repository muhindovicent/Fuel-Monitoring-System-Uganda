const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('MVP migration creates only server-side pending reports', () => {
  const sql = fs.readFileSync(path.join(root, 'migrations', '001_mvp.sql'), 'utf8');
  assert.match(sql, /status TEXT NOT NULL DEFAULT 'pending'/);
  assert.match(sql, /REFERENCES stations\(id\)/);
  assert.match(sql, /verified_by BIGINT NOT NULL REFERENCES app_users/);
  assert.doesNotMatch(sql, /changeme_in_production/);
});
test('API never accepts a client-provided verification status', () => {
  const code = fs.readFileSync(path.join(root, 'src', 'module.ts'), 'utf8');
  assert.match(code, /class ReportDto/);
  const dto = code.split('class ReportDto')[1].split('class ReviewDto')[0];
  assert.doesNotMatch(dto, /status|trustScore|verified/);
  assert.match(code, /FOR UPDATE/);
  assert.match(code, /requireRole\(req.user, \['admin', 'inspector'\]\)/);
});
test('No default production admin password or JWT secret', () => {
  const code = fs.readFileSync(path.join(root,'src','main.ts'), 'utf8');
  assert.match(code, /strong JWT_SECRET/);
  const admin = fs.readFileSync(path.join(root,'scripts','create-admin.cjs'), 'utf8');
  assert.match(admin, /password.length < 16/);
});

test('Service worker never caches private or price API responses', () => {
  const sw = fs.readFileSync(path.join(root, '..', 'app', 'service-worker.js'), 'utf8');
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/v1\/'\)/);
  assert.match(sw, /event\.respondWith\(fetch\(request\)\.catch/);
  assert.doesNotMatch(sw, /addEventListener\('message'/);
});
