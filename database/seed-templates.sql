INSERT INTO case_templates (name, description, is_active)
SELECT 'Surgical Guide Standard', 'Default task flow for guided surgery cases.', 1
WHERE NOT EXISTS (SELECT 1 FROM case_templates WHERE name = 'Surgical Guide Standard');

INSERT INTO case_template_tasks (template_id, title, description, priority, sort_order)
SELECT ct.id, 'Review client files', 'Check submitted scans, photos, and clinical notes.', 'normal', 10
FROM case_templates ct
WHERE ct.name = 'Surgical Guide Standard'
  AND NOT EXISTS (
    SELECT 1 FROM case_template_tasks ctt
    WHERE ctt.template_id = ct.id AND ctt.title = 'Review client files'
  );

INSERT INTO case_template_tasks (template_id, title, description, priority, sort_order)
SELECT ct.id, 'Plan design', 'Prepare the digital treatment plan and design direction.', 'high', 20
FROM case_templates ct
WHERE ct.name = 'Surgical Guide Standard'
  AND NOT EXISTS (
    SELECT 1 FROM case_template_tasks ctt
    WHERE ctt.template_id = ct.id AND ctt.title = 'Plan design'
  );

INSERT INTO case_template_tasks (template_id, title, description, priority, sort_order)
SELECT ct.id, 'Final quality check', 'Validate outputs before production or delivery.', 'high', 30
FROM case_templates ct
WHERE ct.name = 'Surgical Guide Standard'
  AND NOT EXISTS (
    SELECT 1 FROM case_template_tasks ctt
    WHERE ctt.template_id = ct.id AND ctt.title = 'Final quality check'
  );
