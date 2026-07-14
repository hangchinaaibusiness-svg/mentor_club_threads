'use strict';
/*
 * init-tables.js — TỰ TẠO bảng mẫu "14.7 Đăng Threads (Meta)" trong Base theo schema/table.json.
 * Idempotent: có rồi thì chỉ bổ sung cột thiếu. In ra TABLE_ID để đặt vào biến THREADS_TABLE_ID (tuỳ chọn).
 */
const fs = require('fs');
const path = require('path');
const L = require('./lark');

(async () => {
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../schema/table.json'), 'utf8'));
  const tk = await L.token();
  const NAME = process.env.THREADS_TABLE_NAME || schema.table_name;

  let tid = await L.findTableByName(tk, NAME);
  if (tid) {
    console.log(`[table] đã có: ${NAME} = ${tid}`);
  } else {
    const primary = schema.fields.find(f => f.field_name === schema.primary_field) || schema.fields[0];
    tid = await L.createTable(tk, NAME, schema.default_view_name || 'Grid', L.fieldPayload(primary));
    console.log(`[table] ĐÃ TẠO: ${NAME} = ${tid}`);
  }

  const have = new Set((await L.listFields(tk, tid)).map(f => f.field_name));
  for (const f of schema.fields) {
    if (have.has(f.field_name)) continue;
    const r = await L.createField(tk, tid, L.fieldPayload(f));
    console.log((r.code === 0 ? '[field] + ' : '[field] ! ') + f.field_name + (r.code === 0 ? '' : ' :: ' + (r.msg || JSON.stringify(r))));
    await new Promise(s => setTimeout(s, 150));
  }
  console.log('\nTABLE_ID=' + tid);
  console.log('Base: ' + L.cfg.DOMAIN.replace('open.', '') + ' | app_token=' + L.cfg.BASE_ID);
})().catch(e => { console.error('FATAL', e.message || e); process.exit(1); });
