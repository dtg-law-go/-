-- 동탄국제고 학생청원: Supabase SQL Editor에서 전체 실행
-- 주의: 새 프로젝트에서 실행하는 것을 권장합니다.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  student_id text not null,
  name text not null,
  cohort text not null,
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.petitions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 100),
  content text not null check (char_length(content) between 5 and 5000),
  proposer_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default '게시중' check (status in ('게시중','검토대상','검토중','반려됨','반영됨')),
  admin_reply text,
  answered_at timestamptz,
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recommendations (
  id bigint generated always as identity primary key,
  petition_id uuid not null references public.petitions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  recommended_at timestamptz not null default now(),
  unique (petition_id,user_id)
);

create table if not exists public.notices (
  notice_key text primary key check (notice_key in ('top','notice1','notice2','notice3','guide','admin')),
  content text not null default '',
  admin_only boolean not null default false,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.notices(notice_key,content,admin_only) values
('top','학생청원 운영 안내: 추천인 20명 이상인 안건은 자동으로 검토 대상이 됩니다.',false),
('notice1','중요 안내를 입력하세요.',false),
('notice2','운영 일정이나 처리 현황을 입력하세요.',false),
('notice3','추가 안내 사항을 입력하세요.',false),
('guide','1. 학생 누구나 안건을 발의할 수 있습니다.\n2. 추천은 계정당 한 번만 가능하며 취소할 수 없습니다.\n3. 개인정보는 관리자에게만 공개됩니다.\n4. 추천인 20명 이상이면 검토 대상이 됩니다.',false),
('admin','관리자만 확인할 수 있는 운영 메모입니다.',true)
on conflict (notice_key) do nothing;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin'); $$;

-- 가입 시 프로필 자동 생성. 학교 이메일 도메인을 DB에서도 검사합니다.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if lower(new.email) not like '%@dtg.hs.kr' then
    raise exception '동탄국제고 학교 이메일만 가입할 수 있습니다.';
  end if;
  insert into public.profiles(id,email,student_id,name,cohort)
  values(
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'student_id',''),
    coalesce(new.raw_user_meta_data->>'name',''),
    coalesce(new.raw_user_meta_data->>'cohort','')
  );
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end; $$;
drop trigger if exists petitions_touch_updated_at on public.petitions;
create trigger petitions_touch_updated_at before update on public.petitions
for each row execute procedure public.touch_updated_at();

-- 추천 20명 도달 시 게시중 → 검토대상 자동 전환. 관리자 답변은 생성하지 않습니다.
create or replace function public.promote_petition_after_recommendation()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  update public.petitions
  set status='검토대상'
  where id=new.petition_id
    and status='게시중'
    and (select count(*) from public.recommendations where petition_id=new.petition_id) >= 20;
  return new;
end; $$;
drop trigger if exists recommendations_promote_petition on public.recommendations;
create trigger recommendations_promote_petition after insert on public.recommendations
for each row execute procedure public.promote_petition_after_recommendation();

alter table public.profiles enable row level security;
alter table public.petitions enable row level security;
alter table public.recommendations enable row level security;
alter table public.notices enable row level security;

drop policy if exists "profiles own read" on public.profiles;
create policy "profiles own read" on public.profiles for select to authenticated
using ((select auth.uid())=id or public.is_admin());

drop policy if exists "public petitions read" on public.petitions;
create policy "public petitions read" on public.petitions for select to anon,authenticated
using (is_private=false or proposer_id=(select auth.uid()) or public.is_admin());

drop policy if exists "students create petitions" on public.petitions;
create policy "students create petitions" on public.petitions for insert to authenticated
with check (proposer_id=(select auth.uid()));

drop policy if exists "admins update petitions" on public.petitions;
create policy "admins update petitions" on public.petitions for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins delete petitions" on public.petitions;
create policy "admins delete petitions" on public.petitions for delete to authenticated
using (public.is_admin());

drop policy if exists "recommend own insert" on public.recommendations;
create policy "recommend own insert" on public.recommendations for insert to authenticated
with check (user_id=(select auth.uid()) and exists(select 1 from public.petitions p where p.id=petition_id and not p.is_private));

drop policy if exists "recommend own or admin read" on public.recommendations;
create policy "recommend own or admin read" on public.recommendations for select to authenticated
using (user_id=(select auth.uid()) or public.is_admin());

drop policy if exists "visible notices read" on public.notices;
create policy "visible notices read" on public.notices for select to anon,authenticated
using (not admin_only or public.is_admin());

drop policy if exists "admins update notices" on public.notices;
create policy "admins update notices" on public.notices for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- 공개 화면용: 추천인의 개인정보를 노출하지 않고 추천 수만 반환
create or replace function public.get_public_petitions()
returns table(
 id uuid,title text,content text,status text,admin_reply text,answered_at timestamptz,
 created_at timestamptz,recommendation_count bigint
) language sql stable security definer set search_path=public
as $$
 select p.id,p.title,p.content,p.status,p.admin_reply,p.answered_at,p.created_at,count(r.id)
 from public.petitions p left join public.recommendations r on r.petition_id=p.id
 where p.is_private=false
 group by p.id order by p.created_at desc;
$$;
grant execute on function public.get_public_petitions() to anon,authenticated;

create or replace function public.get_visible_notices()
returns table(notice_key text,content text,admin_only boolean,updated_at timestamptz)
language sql stable security definer set search_path=public
as $$
 select n.notice_key,n.content,n.admin_only,n.updated_at
 from public.notices n
 where not n.admin_only or public.is_admin()
 order by n.notice_key;
$$;
grant execute on function public.get_visible_notices() to anon,authenticated;

create or replace function public.get_petition_proposer(target_petition uuid)
returns table(student_id text,name text,cohort text,email text)
language sql stable security definer set search_path=public
as $$
 select pr.student_id,pr.name,pr.cohort,pr.email
 from public.petitions p join public.profiles pr on pr.id=p.proposer_id
 where p.id=target_petition and public.is_admin();
$$;
grant execute on function public.get_petition_proposer(uuid) to authenticated;

create or replace function public.get_petition_recommenders(target_petition uuid)
returns table(student_id text,name text,cohort text,recommended_at timestamptz)
language sql stable security definer set search_path=public
as $$
 select pr.student_id,pr.name,pr.cohort,r.recommended_at
 from public.recommendations r join public.profiles pr on pr.id=r.user_id
 where r.petition_id=target_petition and public.is_admin()
 order by r.recommended_at;
$$;
grant execute on function public.get_petition_recommenders(uuid) to authenticated;

-- 첫 관리자 계정을 가입시킨 뒤 아래 이메일을 정확히 확인하고 실행하세요.
-- update public.profiles set role='admin' where email='2510203@dtg.hs.kr';
