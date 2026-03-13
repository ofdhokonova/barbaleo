-- ═══════════════════════════════════════════════════════
-- BARBALEO CLUB — Схема базы данных Supabase
-- Выполни это в SQL Editor на supabase.com
-- ═══════════════════════════════════════════════════════

-- 1. УСЛУГИ
create table if not exists services (
  id             serial primary key,
  name           text not null,
  price          integer not null,
  duration_minutes integer not null default 30,
  description    text,
  is_active      boolean not null default true,
  created_at     timestamptz default now()
);

-- 2. РАСПИСАНИЕ (по дням недели: 0=воскресенье, 1=пн ... 6=сб)
create table if not exists schedule (
  id             serial primary key,
  day_of_week    integer not null unique check (day_of_week between 0 and 6),
  is_open        boolean not null default true,
  open_time      time not null default '09:00:00',
  close_time     time not null default '21:00:00'
);

-- 3. ЗАПИСИ
create table if not exists bookings (
  id                       serial primary key,
  date                     date not null,
  time                     time not null,
  services                 jsonb not null default '[]',
  total_price              integer not null default 0,
  total_duration           integer not null default 0,
  client_name              text,
  client_phone             text,
  client_telegram_id       text,
  client_telegram_username text,
  reminder_sent            boolean not null default false,
  status                   text not null default 'pending'
                           check (status in ('pending','done','cancelled')),
  notes                    text,
  created_at               timestamptz default now()
);

-- ═══════════════════════════════════════════════════════
-- НАЧАЛЬНЫЕ ДАННЫЕ: расписание (пн-сб 9:00-21:00)
-- ═══════════════════════════════════════════════════════
insert into schedule (day_of_week, is_open, open_time, close_time) values
  (0, false, '09:00:00', '21:00:00'), -- воскресенье — выходной
  (1, true,  '09:00:00', '21:00:00'), -- понедельник
  (2, true,  '09:00:00', '21:00:00'), -- вторник
  (3, true,  '09:00:00', '21:00:00'), -- среда
  (4, true,  '09:00:00', '21:00:00'), -- четверг
  (5, true,  '09:00:00', '21:00:00'), -- пятница
  (6, true,  '09:00:00', '21:00:00') -- суббота
on conflict (day_of_week) do nothing;

-- ═══════════════════════════════════════════════════════
-- НАЧАЛЬНЫЕ ДАННЫЕ: услуги из прайс-листа
-- ═══════════════════════════════════════════════════════
-- Длительности: стрижка=60, борода=40, стрижка+борода=100, комплекс=120, химзавивка=180
-- Лимит на одну запись: 120 мин (кроме химзавивки — 180 мин)
insert into services (name, price, duration_minutes, description) values
  ('Мужская стрижка',                1200, 60,  null),
  ('Стрижка машинкой (одна насадка)',  800, 60,  null),
  ('Детская стрижка (до 12 лет)',     1000, 60,  null),
  ('Комплекс (стрижка + борода)',     2000, 120, null),
  ('Камуфляж — голова',              1200, 60,  'Американ Крю'),
  ('Камуфляж — борода',               900, 40,  'Американ Крю'),
  ('Камуфляж Кондор — голова',        900, 60,  null),
  ('Камуфляж Кондор — борода',        700, 40,  null),
  ('Бритьё шейвером',                 900, 40,  null),
  ('Бритьё опасной бритвой',         1100, 40,  null),
  ('Удаление волос воском — уши/нос', 350, 15,  null),
  ('Удаление волос воском — затылок', 500, 20,  null),
  ('Удаление волос воском — шея',     600, 20,  null),
  ('Архитектура бровей',              400, 20,  null),
  ('Укладка',                         700, 20,  null),
  ('Массаж лица',                     800, 20,  null),
  ('Массаж головы',                   600, 20,  null),
  ('Маска',                           600, 20,  null),
  ('Моделирование бороды',           1000, 40,  null),
  ('Химическая завивка',             6000, 180, null),
  ('Стрижка насадками',              1000, 60,  null),
  ('Маникюр',                        1400, 45,  null),
  ('Комплексный премиум уход для лица', 2000, 60, 'Распаривание, скрабирование, маска, массаж, патчи, увлажнение');

-- ═══════════════════════════════════════════════════════
-- RLS (Row Level Security) — кто что может делать
-- ═══════════════════════════════════════════════════════

-- Услуги: читать могут все, изменять — только через service_role (бэкенд/админ)
alter table services enable row level security;
create policy "services_public_read" on services for select using (true);
create policy "services_all_authenticated" on services for all using (true) with check (true);

-- Расписание: читать могут все
alter table schedule enable row level security;
create policy "schedule_public_read" on schedule for select using (true);
create policy "schedule_all_authenticated" on schedule for all using (true) with check (true);

-- Записи: создавать могут все, читать — все (фильтрация на клиенте по telegram_id)
alter table bookings enable row level security;
create policy "bookings_public_insert" on bookings for insert with check (true);
create policy "bookings_public_select" on bookings for select using (true);
create policy "bookings_public_update" on bookings for update using (true) with check (true);
