-- ClassCaption schema. Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to re-run.

create extension if not exists pgcrypto;

-- Live classes ---------------------------------------------------------------
create table if not exists public.classes (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  join_code   text not null unique,
  source_lang text not null default 'en-IN',          -- BCP-47 used by Web Speech
  status      text not null default 'live' check (status in ('live','ended')),
  languages   text[] not null default '{}',            -- languages students picked (translation targets)
  lecture_id  uuid,                                    -- set when the class is saved as a lecture
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);

-- One row per final sentence spoken by the teacher.
create table if not exists public.captions (
  id           bigserial primary key,
  class_id     uuid not null references public.classes(id) on delete cascade,
  seq          int  not null,
  text         text not null,
  translations jsonb not null default '{}'::jsonb,     -- { "hi": "...", "ta": "..." }
  offset_s     real not null default 0,                -- seconds since class start
  created_at   timestamptz not null default now()
);
create index if not exists captions_class_seq on public.captions(class_id, seq);

-- Student reactions during a live class: "I'm lost" taps and typed questions.
create table if not exists public.reactions (
  id          bigserial primary key,
  class_id    uuid not null references public.classes(id) on delete cascade,
  kind        text not null check (kind in ('lost','question')),
  text        text,                                    -- question text (kind = 'question')
  lang        text,                                    -- language the student wrote in
  text_en     text,                                    -- question translated to the class language
  caption_seq int,                                     -- caption the student was looking at
  offset_s    real not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists reactions_class on public.reactions(class_id, created_at);

-- Recorded lectures (uploaded, or saved automatically from a live class) -----
create table if not exists public.lectures (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid references public.classes(id) on delete set null,
  title        text not null,
  source       text not null default 'upload' check (source in ('upload','live')),
  audio_path   text,                                   -- path inside the "lectures" storage bucket
  media_type   text,                                   -- e.g. audio/mpeg, video/mp4
  status       text not null default 'uploaded'
               check (status in ('uploaded','transcribing','translating','summarising','ready','failed')),
  progress     int  not null default 0,
  duration_s   real,
  notes        jsonb not null default '{}'::jsonb,     -- { "en": {summary, key_terms, quiz}, "hi": {...} }
  confusion    jsonb not null default '[]'::jsonb,     -- [{ seq, offset_s, count }] from live "I'm lost" taps
  error        text,
  created_at   timestamptz not null default now()
);

create table if not exists public.segments (
  id           bigserial primary key,
  lecture_id   uuid not null references public.lectures(id) on delete cascade,
  idx          int  not null,
  start_s      real not null,
  end_s        real not null,
  text         text not null,
  translations jsonb not null default '{}'::jsonb
);
create index if not exists segments_lecture_idx on public.segments(lecture_id, idx);

-- Row level security: all WRITES go through the Next.js API routes using the service-role key.
-- (v3 below narrows public READ to captions and class_events.)
alter table public.classes  enable row level security;
alter table public.captions enable row level security;
alter table public.reactions enable row level security;
alter table public.lectures enable row level security;
alter table public.segments enable row level security;

drop policy if exists "public read" on public.classes;
drop policy if exists "public read" on public.captions;
drop policy if exists "public read" on public.reactions;
drop policy if exists "public read" on public.lectures;
drop policy if exists "public read" on public.segments;
create policy "public read" on public.classes  for select using (true);
create policy "public read" on public.captions for select using (true);
create policy "public read" on public.reactions for select using (true);
create policy "public read" on public.lectures for select using (true);
create policy "public read" on public.segments for select using (true);

-- Realtime: push new captions, reactions and status changes to browsers.
do $$
begin
  begin alter publication supabase_realtime add table public.captions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.reactions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.lectures; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.classes;  exception when duplicate_object then null; end;
end $$;

-- Storage bucket for lecture audio/video (private; served via signed URLs).
insert into storage.buckets (id, name, public)
values ('lectures', 'lectures', false)
on conflict (id) do nothing;

-- If you ran an older copy of this file, this brings the classes table up to date.
alter table public.classes add column if not exists languages text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- v2: classrooms (persistent courses with a PIN) for the frontend screens.
-- Each live class belongs to a classroom; students can join with the classroom PIN.
create table if not exists public.classrooms (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  subject_code            text,
  room                    text,
  description             text,
  join_code               text not null unique,
  default_source_language text not null default 'en-IN',
  created_at              timestamptz not null default now()
);
alter table public.classrooms enable row level security;
drop policy if exists "public read" on public.classrooms;
create policy "public read" on public.classrooms for select using (true);

alter table public.classes  add column if not exists classroom_id uuid references public.classrooms(id) on delete set null;
alter table public.lectures add column if not exists classroom_id uuid references public.classrooms(id) on delete set null;

-- Reactions: "speak" = Speak-for-me request read aloud by the teacher's device; optional student name.
alter table public.reactions add column if not exists student_name text;
alter table public.reactions drop constraint if exists reactions_kind_check;
alter table public.reactions add constraint reactions_kind_check check (kind in ('lost','question','speak'));

-- ---------------------------------------------------------------------------
-- v3: teacher accounts, server-only live events, and locked-down reads.
create table if not exists public.teachers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null unique,
  institution   text,
  department    text,
  password_hash text not null,                         -- scrypt; never leaves the server
  created_at    timestamptz not null default now()
);
alter table public.teachers enable row level security;  -- no policies: only the server can read it

alter table public.classrooms add column if not exists teacher_id uuid references public.teachers(id) on delete cascade;
alter table public.lectures   add column if not exists teacher_id uuid references public.teachers(id) on delete set null;
create index if not exists classrooms_teacher on public.classrooms(teacher_id);

-- Announcements, board scans and "class ended", written only by the server (so students can't fake them)
-- and delivered to students over Realtime.
create table if not exists public.class_events (
  id         bigserial primary key,
  class_id   uuid not null references public.classes(id) on delete cascade,
  kind       text not null check (kind in ('announcement','board','ended')),
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists class_events_class on public.class_events(class_id, created_at);
alter table public.class_events enable row level security;
drop policy if exists "public read" on public.class_events;
create policy "public read" on public.class_events for select using (true);
do $$
begin
  begin alter publication supabase_realtime add table public.class_events; exception when duplicate_object then null; end;
end $$;

-- Browsers only need to read live captions and live events (over Realtime, by class id).
-- Everything else (PINs, student questions and names, lectures) is served by the API after a permission check.
drop policy if exists "public read" on public.classes;
drop policy if exists "public read" on public.classrooms;
drop policy if exists "public read" on public.reactions;
drop policy if exists "public read" on public.lectures;
drop policy if exists "public read" on public.segments;

-- ---------------------------------------------------------------------------
-- v4: per-classroom word list (names and subject terms, one per line) that speech recognition
-- and translation always spell the same way.
alter table public.classrooms add column if not exists glossary text;

-- ---------------------------------------------------------------------------
-- v5: "Ask the lecture" retrieval (RAG). Transcript chunks with Gemini embeddings in pgvector;
-- a question is embedded and only the closest chunks go to the LLM. Filled on first question.
create extension if not exists vector;
create table if not exists public.segment_chunks (
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  chunk      int  not null,
  start_idx  int  not null,
  end_idx    int  not null,
  start_s    real not null,
  text       text not null,
  embedding  vector(768) not null,
  primary key (lecture_id, chunk)
);
create index if not exists segment_chunks_embedding on public.segment_chunks using hnsw (embedding vector_cosine_ops);
alter table public.segment_chunks enable row level security; -- server only, no public policy

create or replace function public.match_segment_chunks(p_lecture uuid, p_query vector(768), p_count int default 6)
returns table (chunk int, start_idx int, end_idx int, start_s real, text text, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select c.chunk, c.start_idx, c.end_idx, c.start_s, c.text, 1 - (c.embedding <=> p_query) as similarity
  from public.segment_chunks c
  where c.lecture_id = p_lecture
  order by c.embedding <=> p_query
  limit greatest(1, least(p_count, 20));
$$;
revoke execute on function public.match_segment_chunks(uuid, vector, int) from public, anon, authenticated;

-- Make the API see the new tables/columns right away.
notify pgrst, 'reload schema';
