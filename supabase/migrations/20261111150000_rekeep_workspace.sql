create schema if not exists rekeep_private;
revoke all on schema rekeep_private from public;
create table public.rekeep_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  order_number text not null check (length(order_number) between 1 and 24),
  customer text not null check (length(customer) between 1 and 64),
  message text not null check (length(message) between 1 and 1600),
  items jsonb not null check (case when jsonb_typeof(items) = 'array' then jsonb_array_length(items) between 2 and 10 else false end),
  created_at timestamptz not null default now(),
  unique(user_id, order_number),
  unique(id, user_id)
);
create table public.rekeep_refunds (
  case_id uuid primary key,
  user_id uuid not null default auth.uid(),
  item_id text not null,
  amount_cents integer not null check (amount_cents > 0),
  reference text not null check (length(reference) between 1 and 120),
  payment_ref text,
  source text not null default 'external' check (source in ('external','braintree_sandbox')),
  status text not null default 'recorded' check (status in ('recorded','pending','submitted','settled')),
  created_at timestamptz not null default now(),
  foreign key (case_id, user_id) references public.rekeep_cases(id, user_id) on delete cascade
);
create unique index rekeep_refunds_external_reference on public.rekeep_refunds(user_id, reference) where source = 'external';
create unique index rekeep_refunds_braintree_payment on public.rekeep_refunds(payment_ref) where source = 'braintree_sandbox';

alter table public.rekeep_cases enable row level security;
alter table public.rekeep_refunds enable row level security;
revoke all on public.rekeep_cases, public.rekeep_refunds from anon, authenticated;
grant select on public.rekeep_cases, public.rekeep_refunds to authenticated;
grant insert (order_number,customer,message,items), update (message) on public.rekeep_cases to authenticated;
grant insert (case_id,item_id,reference) on public.rekeep_refunds to authenticated;
grant select, insert, update on public.rekeep_cases, public.rekeep_refunds to service_role;

create policy rekeep_own_cases on public.rekeep_cases for select to authenticated using (user_id = (select auth.uid()));
create policy rekeep_create_case on public.rekeep_cases for insert to authenticated with check (user_id = (select auth.uid()));
create policy rekeep_edit_case on public.rekeep_cases for update to authenticated
  using (user_id = (select auth.uid()) and not exists (select 1 from public.rekeep_refunds r where r.case_id = rekeep_cases.id))
  with check (user_id = (select auth.uid()));
create policy rekeep_own_refunds on public.rekeep_refunds for select to authenticated using (user_id = (select auth.uid()));
create policy rekeep_record_refund on public.rekeep_refunds for insert to authenticated
  with check (user_id = (select auth.uid()) and source = 'external' and status = 'recorded' and payment_ref is null);

create function rekeep_private.derive_refund_amount()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  amount integer;
  order_total bigint;
begin
  select (entry ->> 'cents')::integer into amount
  from public.rekeep_cases c, jsonb_array_elements(c.items) entry
  where c.id = new.case_id and c.user_id = new.user_id and entry ->> 'id' = new.item_id;
  select sum((entry ->> 'cents')::integer) into order_total
  from public.rekeep_cases c, jsonb_array_elements(c.items) entry
  where c.id = new.case_id and c.user_id = new.user_id;
  if amount is null or amount <= 0 or amount >= order_total then
    raise exception 'Select a refundable order item.' using errcode = '23514';
  end if;
  new.amount_cents = amount;
  return new;
end
$$;
revoke all on function rekeep_private.derive_refund_amount() from public;
create trigger rekeep_calculate_refund
before insert on public.rekeep_refunds
for each row execute function rekeep_private.derive_refund_amount();

create function rekeep_private.validate_order_items()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  entry jsonb;
begin
  if (select count(distinct value->>'id') from jsonb_array_elements(new.items)) <> jsonb_array_length(new.items) then
    raise exception 'Order item identifiers must be unique.' using errcode = '23514';
  end if;
  for entry in select value from jsonb_array_elements(new.items)
  loop
    if jsonb_typeof(entry->'cents') is distinct from 'number'
      or (entry->>'cents') !~ '^[1-9][0-9]{0,6}$'
      or length(coalesce(entry->>'name','')) not between 1 and 80 then
      raise exception 'Order items need a name and a positive amount.' using errcode = '23514';
    end if;
  end loop;
  return new;
end
$$;
revoke all on function rekeep_private.validate_order_items() from public;
create trigger rekeep_validate_items
before insert or update of items on public.rekeep_cases
for each row execute function rekeep_private.validate_order_items();
