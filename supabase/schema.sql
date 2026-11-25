-- ระบบจัดตารางสอนอัตโนมัติ: โครงสร้างฐานข้อมูล Supabase
-- วิธีใช้: Supabase Dashboard > SQL Editor > วางทั้งไฟล์ > Run

create extension if not exists "pgcrypto";

-- ชุดข้อมูลที่ยืนยันการนำเข้าแล้ว
create table if not exists public.datasets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  summary     jsonb,                 -- จำนวนครู/ห้อง/กลุ่ม/วิชา/คาบ
  raw         jsonb not null,        -- ข้อมูลดิบ 5 ชีต (ครู ห้องเรียน กลุ่มเรียน รายวิชา การลงทะเบียน)
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

-- ผลการจัดตารางแต่ละรอบ
create table if not exists public.runs (
  id           uuid primary key default gen_random_uuid(),
  dataset_id   uuid references public.datasets(id) on delete cascade,
  dataset_name text,
  seed         integer not null,
  max_iter     integer,
  elapsed_ms   integer,
  hard         integer,              -- จำนวนการละเมิดเงื่อนไขบังคับ (ตรวจโดย Inspector)
  soft         integer,              -- จำนวนการละเมิดเงื่อนไขยืดหยุ่น
  confirmed    boolean not null default false,
  result       jsonb,                -- placements, history, baseline
  metrics      jsonb,                -- สรุปตัวชี้วัด
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists runs_created_idx on public.runs (created_at desc);

alter table public.datasets enable row level security;
alter table public.runs     enable row level security;

-- แบบที่ 1 (แนะนำ เมื่อ REQUIRE_LOGIN = true): ผู้ใช้ที่เข้าสู่ระบบแล้วใช้งานได้ทั้งหมด
drop policy if exists "auth all datasets" on public.datasets;
create policy "auth all datasets" on public.datasets for all to authenticated using (true) with check (true);
drop policy if exists "auth all runs" on public.runs;
create policy "auth all runs" on public.runs for all to authenticated using (true) with check (true);

-- แบบที่ 2 (สาธิต ไม่ต้องเข้าสู่ระบบ เมื่อ REQUIRE_LOGIN = false): เปิดให้ anon ใช้งานได้
-- ลบเครื่องหมาย -- หน้า 4 บรรทัดด้านล่างถ้าต้องการใช้แบบนี้
-- drop policy if exists "anon all datasets" on public.datasets;
-- create policy "anon all datasets" on public.datasets for all to anon using (true) with check (true);
-- drop policy if exists "anon all runs" on public.runs;
-- create policy "anon all runs" on public.runs for all to anon using (true) with check (true);

-- บัญชีทดสอบสำหรับกรรมการ: สร้างที่ Authentication > Users > Add user
-- (เช่น judge@example.com / รหัสผ่านที่กำหนด) แล้วติ๊ก Auto Confirm User
