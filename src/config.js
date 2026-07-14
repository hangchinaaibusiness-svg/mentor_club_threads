'use strict';
// Toàn bộ cấu hình lấy từ BIẾN MÔI TRƯỜNG (GitHub Vars/Secrets hoặc .env cục bộ).
// KHÔNG hardcode bí mật ở đây.
const cfg = {
  // Lark
  APP_ID:     process.env.LARK_APP_ID     || '',
  APP_SECRET: process.env.LARK_APP_SECRET || '',
  BASE_ID:    process.env.LARK_BASE_ID    || '',   // app_token của Base
  DOMAIN:    (process.env.LARK_DOMAIN     || 'https://open.larksuite.com').replace(/\/$/, ''),
  TABLE_ID:   process.env.THREADS_TABLE_ID   || '',                        // để trống -> tự dò theo tên
  TABLE_NAME: process.env.THREADS_TABLE_NAME || '14.7 Đăng Threads (Meta)',
  // Threads
  TH_TOKEN: process.env.THREADS_ACCESS_TOKEN || '',
  TH_USER:  process.env.THREADS_USER_ID      || '',   // để trống -> tự lấy qua /me
  TH_VER:   process.env.THREADS_API_VERSION  || 'v1.0',
  RESPECT_SCHEDULE: process.env.RESPECT_SCHEDULE !== 'false',
  // Host media (để đăng ảnh/video Threads cần URL công khai)
  FTP_HOST:  process.env.HANGCHINA_FTP_HOST || '',
  FTP_USER:  process.env.HANGCHINA_FTP_USER || '',
  FTP_PASS:  process.env.HANGCHINA_FTP_PASS || '',
  MEDIA_DIR:  process.env.THREADS_MEDIA_DIR || 'threads-media',
  MEDIA_BASE: (process.env.THREADS_MEDIA_BASE_URL || 'https://hangchina.net').replace(/\/$/, ''),
};
module.exports = cfg;
