-- Demo for rule 807 (salaried beneficiary): links one demo employee to a MYSY beneficiary and gives the employee a year of
-- pay above the scheme's income limit. Run, then "Run detection" on the Beneficiary tab. Safe to run twice.
SET search_path TO expenditure_integrity;

UPDATE employee_identity
   SET person_id = '0796d836-1ad5-484c-8280-a6e39253d3aa'            -- Bharti Darji, MYSY
 WHERE employee_code = 'GJ-BAN-DEESA-01';

INSERT INTO payroll_settlement (id, employee_code, component, period_start, period_end, gross_amount, net_amount, ddo_code, transaction_ref)
SELECT gen_random_uuid(), 'GJ-BAN-DEESA-01', 'BASIC', d::date, (d + interval '1 month - 1 day')::date, 90000, 80000, 'DDO-BAN-01', 'DEMO807-' || to_char(d, 'YYYYMM')
  FROM generate_series('2024-04-01'::date, '2025-03-01'::date, interval '1 month') AS d
 WHERE NOT EXISTS (SELECT 1 FROM payroll_settlement p WHERE p.transaction_ref = 'DEMO807-' || to_char(d, 'YYYYMM'));
