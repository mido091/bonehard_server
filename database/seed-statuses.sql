INSERT INTO case_statuses (name, color, sort_order, is_default) VALUES
  ('New', '#3b82f6', 10, 1),
  ('In Progress', '#f59e0b', 20, 0),
  ('Completed', '#22c55e', 30, 0)
ON DUPLICATE KEY UPDATE
  color = VALUES(color),
  sort_order = VALUES(sort_order),
  is_default = VALUES(is_default);

UPDATE cases c
JOIN case_statuses old_status ON old_status.id = c.status_id
JOIN case_statuses new_status ON new_status.name = CASE
  WHEN old_status.name IN ('Completed', 'Delivered', 'Closed') OR old_status.sort_order = 30 THEN 'Completed'
  WHEN old_status.name IN (
    'CASE ON HOLD (DR''S REQUEST)',
    'Case Approved / QC & Paperwork',
    'Need New CBCT Scan',
    'Planning',
    'Planning Completed (Need Scheduling)',
    'Pending Doctor Approval',
    'Surgical Guide Design',
    'Guide Printing',
    'Finishing / Preparing for Shipping',
    'In Progress',
    'QC'
  ) OR old_status.sort_order = 20 THEN 'In Progress'
  ELSE 'New'
END
SET c.status_id = new_status.id
WHERE old_status.name NOT IN ('New', 'In Progress', 'Completed');
