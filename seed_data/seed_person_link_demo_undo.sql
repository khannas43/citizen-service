SET search_path TO expenditure_integrity;

UPDATE employee_identity SET person_id = NULL
 WHERE employee_code IN ('GJ-BAN-DEESA-02', 'GJ-BAN-DEESA-12');
