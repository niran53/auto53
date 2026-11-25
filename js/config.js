// ตั้งค่าระบบ: ใส่ค่าจาก Supabase > Project Settings > API
// ถ้าเว้นว่าง ระบบจะทำงานแบบบันทึกในเครื่อง (localStorage) โดยอัตโนมัติ
export const CONFIG = {
  SUPABASE_URL: '',        // เช่น 'https://abcdefgh.supabase.co'
  SUPABASE_ANON_KEY: '',   // anon public key (เปิดเผยได้ ปลอดภัยด้วย Row Level Security)
  REQUIRE_LOGIN: false,    // true = ต้องเข้าสู่ระบบด้วยบัญชี Supabase Auth ก่อนใช้งาน
  SCHOOL_NAME: 'วิทยาลัยเทคนิค',
  TERM_TEXT: 'ภาคเรียนที่ 2 ปีการศึกษา 2569',
};
