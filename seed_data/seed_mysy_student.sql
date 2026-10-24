-- MYSY demo student: added to Kavita Rathod's family (a5000000-0000-0000-0000-000000000005),
-- lowest-income hero family (₹72,000/yr), well under MYSY's ₹6L ceiling.
-- Citizen login: XXXX-XXXX-5005 / OTP 123456 (student applies herself).
-- Run AFTER family-registry-service has been redeployed with the exam_type/exam_percentile/
-- course_category columns (Hibernate ddl-auto adds them on startup).
SET search_path TO family_registry;

INSERT INTO person (id, name, dob, gender, aadhaar_ref, occupation, annual_income, caste_category,
                    is_alive, mobile, education_level, employment_status,
                    exam_type, exam_percentile, course_category)
VALUES ('50000005-0000-0000-0000-000000000001', 'Meera Rathod', '2008-03-10', 'F', 'XXXX-XXXX-5005',
        'student', 0, 'NT', true, '9876545005', 'HIGHER_SEC', 'STUDENT',
        'STD12', 82.0, 'ENGINEERING_GROUP')
ON CONFLICT (id) DO UPDATE SET
    mobile = EXCLUDED.mobile,
    exam_type = EXCLUDED.exam_type,
    exam_percentile = EXCLUDED.exam_percentile,
    course_category = EXCLUDED.course_category;

INSERT INTO family_member (family_id, person_id, relationship_to_head)
VALUES ('a5000000-0000-0000-0000-000000000005', '50000005-0000-0000-0000-000000000001', 'DAUGHTER')
ON CONFLICT (family_id, person_id) DO NOTHING;
