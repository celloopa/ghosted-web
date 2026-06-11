-- RLS security tests (pgTAP — run with `supabase test db`).
-- Plan M2: "user A cannot select/update/delete user B's rows", treated as a
-- P0 feature with tests, not config.

begin;
select plan(8);

-- two fake users
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.dev');

-- seed a row as user A
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

insert into public.applications (id, company, position, role_type, status)
values ('10000000-0000-0000-0000-000000000001', 'Acme', 'Designer', 'other', 'applied');

insert into public.events (application_id, type, date)
values ('10000000-0000-0000-0000-000000000001', 'applied', '2026-01-01');

select is(
  (select count(*)::int from public.applications), 1,
  'user A sees own application'
);

-- switch to user B
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';

select is(
  (select count(*)::int from public.applications), 0,
  'user B cannot SELECT user A applications'
);

select is(
  (select count(*)::int from public.events), 0,
  'user B cannot SELECT user A events'
);

-- UPDATE affects zero rows
update public.applications set company = 'Hacked' where id = '10000000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.applications where company = 'Hacked'), 0,
  'user B UPDATE touches zero rows'
);

-- DELETE affects zero rows
delete from public.applications where id = '10000000-0000-0000-0000-000000000001';
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select is(
  (select count(*)::int from public.applications), 1,
  'user B DELETE removed nothing — row still visible to A'
);

-- INSERT with a foreign user_id is rejected by the with check policy
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.applications (user_id, company, position, role_type)
     values ('00000000-0000-0000-0000-00000000000a', 'Spoof', 'Spoof', 'other') $$,
  '42501',
  null,
  'user B cannot INSERT a row owned by user A'
);

-- core invariant holds at the database layer too
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select throws_ok(
  $$ update public.applications set status = 'closed'
     where id = '10000000-0000-0000-0000-000000000001' $$,
  '23514',
  null,
  'closed without closed_reason violates the check constraint'
);

select lives_ok(
  $$ update public.applications set status = 'closed', closed_reason = 'rejected'
     where id = '10000000-0000-0000-0000-000000000001' $$,
  'closed with a reason is fine'
);

select * from finish();
rollback;
