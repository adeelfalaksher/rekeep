alter table public.rekeep_refunds
  drop constraint rekeep_refunds_status_check,
  add constraint rekeep_refunds_status_check
    check (status in ('recorded','pending','submitted','settled','failed'));
