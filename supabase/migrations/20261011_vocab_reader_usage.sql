-- 語彙トレ「読む」の解説(Claude)呼び出し回数(JST日ごと)。Edge Function vocab-reader が上限判定に使う
create table if not exists public.vocab_reader_usage (
  day date primary key,
  analyze_count integer not null default 0
);
alter table public.vocab_reader_usage enable row level security;

-- 1回分の枠を取る。上限に達していたら null を返す(行ロックで数えるので同時アクセスでも超えない)
create or replace function public.vocab_reader_take(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := (now() at time zone 'Asia/Tokyo')::date;
  n integer;
begin
  insert into vocab_reader_usage(day, analyze_count) values (d, 1)
  on conflict (day) do update set analyze_count = vocab_reader_usage.analyze_count + 1
  where vocab_reader_usage.analyze_count < p_limit
  returning analyze_count into n;
  return n;
end;
$$;
revoke all on function public.vocab_reader_take(integer) from public, anon, authenticated;
grant execute on function public.vocab_reader_take(integer) to service_role;
