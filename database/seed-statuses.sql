INSERT INTO case_statuses (name, color, sort_order, is_default) VALUES
  ('Order Received', '#60a5fa', 10, 1),
  ('Planning', '#38bdf8', 20, 0),
  ('Wax-up Design', '#818cf8', 30, 0),
  ('Waiting on Model or STL', '#f59e0b', 40, 0),
  ('New CBCT Needed', '#fb923c', 50, 0),
  ('Case on Hold', '#f97316', 60, 0),
  ('Planning Completed (Needs Scheduling)', '#a78bfa', 70, 0),
  ('Pending Dr''s Approval (Video Sent)', '#c084fc', 80, 0),
  ('Review Scheduled', '#d946ef', 90, 0),
  ('Case Approved QC and Paperwork', '#14b8a6', 100, 0),
  ('Surgical Guide Design', '#06b6d4', 110, 0),
  ('Guide Printing', '#0ea5e9', 120, 0),
  ('Finishing and Preparing for shipping', '#22c55e', 130, 0),
  ('STL Shared with Dr', '#4ade80', 140, 0),
  ('Case Shipped', '#84cc16', 150, 0),
  ('Invoice Sent', '#eab308', 160, 0),
  ('Billed', '#facc15', 170, 0),
  ('Completed', '#22c55e', 180, 0),
  ('Order Canceled', '#ef4444', 190, 0)
ON DUPLICATE KEY UPDATE
  color = VALUES(color),
  sort_order = VALUES(sort_order),
  is_default = VALUES(is_default);

UPDATE cases c
JOIN case_statuses old_status ON old_status.id = c.status_id
JOIN case_statuses new_status ON new_status.name = CASE
  WHEN old_status.name IN ('Completed', 'Delivered', 'Closed') OR old_status.sort_order = 30 THEN 'Completed'
  WHEN old_status.name IN ('In Progress', 'Planning') OR old_status.sort_order = 20 THEN 'Planning'
  WHEN old_status.name = 'New' OR old_status.sort_order = 10 THEN 'Order Received'
  WHEN old_status.name IN (
    'CASE ON HOLD (DR''S REQUEST)',
    'Case on Hold'
  ) THEN 'Case on Hold'
  WHEN old_status.name IN (
    'Need New CBCT Scan',
    'New CBCT Needed'
  ) THEN 'New CBCT Needed'
  WHEN old_status.name IN (
    'Planning Completed (Need Scheduling)',
    'Planning Completed (Needs Scheduling)'
  ) THEN 'Planning Completed (Needs Scheduling)'
  WHEN old_status.name IN (
    'Pending Doctor Approval',
    'Pending Dr''s Approval (Video Sent)'
  ) THEN 'Pending Dr''s Approval (Video Sent)'
  WHEN old_status.name IN (
    'Case Approved / QC & Paperwork',
    'Case Approved QC and Paperwork',
    'QC'
  ) THEN 'Case Approved QC and Paperwork'
  WHEN old_status.name = 'Surgical Guide Design' THEN 'Surgical Guide Design'
  WHEN old_status.name = 'Guide Printing' THEN 'Guide Printing'
  WHEN old_status.name IN (
    'Finishing / Preparing for Shipping',
    'Finishing and Preparing for shipping'
  ) THEN 'Finishing and Preparing for shipping'
  ELSE 'Order Received'
END
SET c.status_id = new_status.id
WHERE old_status.name NOT IN (
  'Order Received',
  'Planning',
  'Wax-up Design',
  'Waiting on Model or STL',
  'New CBCT Needed',
  'Case on Hold',
  'Planning Completed (Needs Scheduling)',
  'Pending Dr''s Approval (Video Sent)',
  'Review Scheduled',
  'Case Approved QC and Paperwork',
  'Surgical Guide Design',
  'Guide Printing',
  'Finishing and Preparing for shipping',
  'STL Shared with Dr',
  'Case Shipped',
  'Invoice Sent',
  'Billed',
  'Completed',
  'Order Canceled'
);
