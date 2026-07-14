'use strict';
// Helper Lark Bitable REST (zero-dep, Node 20+ fetch).
const fs = require('fs');
const cfg = require('./config');
const API = cfg.DOMAIN + '/open-apis';

async function token() {
  if (!cfg.APP_ID || !cfg.APP_SECRET) throw new Error('Thiếu LARK_APP_ID / LARK_APP_SECRET');
  const r = await fetch(API + '/auth/v3/tenant_access_token/internal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: cfg.APP_ID, app_secret: cfg.APP_SECRET }),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error('Lark token: ' + JSON.stringify(j));
  return j.tenant_access_token;
}

async function api(tk, method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: 'Bearer ' + tk },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

async function listTables(tk) {
  let items = [], pt = '';
  do {
    const j = await api(tk, 'GET', `/bitable/v1/apps/${cfg.BASE_ID}/tables?page_size=100` + (pt ? '&page_token=' + pt : ''));
    if (j.code !== 0) throw new Error('listTables: ' + JSON.stringify(j));
    items = items.concat(j.data.items || []); pt = j.data.has_more ? j.data.page_token : '';
  } while (pt);
  return items;
}
async function findTableByName(tk, name) {
  const t = (await listTables(tk)).find(x => x.name === name);
  return t ? t.table_id : null;
}
async function listFields(tk, tableId) {
  let items = [], pt = '';
  do {
    const j = await api(tk, 'GET', `/bitable/v1/apps/${cfg.BASE_ID}/tables/${tableId}/fields?page_size=100` + (pt ? '&page_token=' + pt : ''));
    if (j.code !== 0) throw new Error('listFields: ' + JSON.stringify(j));
    items = items.concat(j.data.items || []); pt = j.data.has_more ? j.data.page_token : '';
  } while (pt);
  return items;
}
async function createTable(tk, name, viewName, firstField) {
  const j = await api(tk, 'POST', `/bitable/v1/apps/${cfg.BASE_ID}/tables`,
    { table: { name, default_view_name: viewName, fields: [firstField] } });
  if (j.code !== 0) throw new Error('createTable: ' + JSON.stringify(j));
  return j.data.table_id;
}
async function createField(tk, tableId, payload) {
  return api(tk, 'POST', `/bitable/v1/apps/${cfg.BASE_ID}/tables/${tableId}/fields`, payload);
}
async function listRecords(tk, tableId) {
  let items = [], pt = '';
  do {
    const j = await api(tk, 'GET', `/bitable/v1/apps/${cfg.BASE_ID}/tables/${tableId}/records?page_size=200` + (pt ? '&page_token=' + pt : ''));
    if (j.code !== 0) throw new Error('listRecords: ' + JSON.stringify(j));
    items = items.concat(j.data.items || []); pt = j.data.has_more ? j.data.page_token : '';
  } while (pt);
  return items;
}
async function getRecord(tk, tableId, recId) {
  const j = await api(tk, 'GET', `/bitable/v1/apps/${cfg.BASE_ID}/tables/${tableId}/records/${recId}`);
  if (j.code !== 0) throw new Error('getRecord ' + recId + ': ' + JSON.stringify(j));
  return j.data.record; // { record_id, fields }
}
async function updateRow(tk, tableId, recId, fields) {
  const j = await api(tk, 'PUT', `/bitable/v1/apps/${cfg.BASE_ID}/tables/${tableId}/records/${recId}`, { fields });
  if (j.code !== 0) throw new Error('updateRow: ' + JSON.stringify(j));
}
async function downloadMedia(tk, tableId, fileToken, out) {
  const tries = [
    `${API}/drive/v1/medias/${fileToken}/download?extra=${encodeURIComponent(JSON.stringify({ bitablePerm: { tableId } }))}`,
    `${API}/drive/v1/medias/${fileToken}/download`,
  ];
  for (const u of tries) {
    const r = await fetch(u, { headers: { Authorization: 'Bearer ' + tk } });
    if (r.ok && (r.headers.get('content-type') || '').indexOf('json') < 0) {
      const b = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(out, b); return b.length;
    }
  }
  throw new Error('không tải được media từ Lark');
}

// field payload builder từ schema entry
function fieldPayload(f) {
  const p = { field_name: f.field_name, type: f.type };
  if (f.type === 3 && f.options) p.property = { options: f.options.map(o => ({ name: o })) };
  if (f.type === 5) p.property = { date_formatter: 'yyyy/MM/dd HH:mm', auto_fill: false };
  return p;
}

const plain = v => v == null ? '' : typeof v === 'string' ? v
  : Array.isArray(v) ? v.map(x => x.text || x.name || x.link || '').join('')
  : (v.text || v.name || v.link || String(v));

module.exports = {
  cfg, token, api, listTables, findTableByName, listFields, createTable, createField,
  listRecords, getRecord, updateRow, downloadMedia, fieldPayload, plain,
};
