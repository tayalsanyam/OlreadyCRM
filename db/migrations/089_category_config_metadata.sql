-- Display metadata + intake side for grievance categories
ALTER TABLE support.category_config
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS raised_by_type support.raised_by_type;

-- MUA / artist categories
UPDATE support.category_config SET label = 'Lead reversal', description = 'Wants leads reversed / credited back', raised_by_type = 'mua' WHERE category = 'lead_reversal';
UPDATE support.category_config SET label = 'Lead quality', description = 'Leads were wrong, fake, or not serious', raised_by_type = 'mua' WHERE category = 'lead_quality';
UPDATE support.category_config SET label = 'Did not get business', description = 'Lead did not convert or book', raised_by_type = 'mua' WHERE category = 'did_not_get_business';
UPDATE support.category_config SET label = 'Plan extension', description = 'Renewal, expiry, or plan upgrade request', raised_by_type = 'mua' WHERE category = 'plan_extension';
UPDATE support.category_config SET label = 'Invoice / contract / payment', description = 'Billing, invoice, contract, or payment issue', raised_by_type = 'mua' WHERE category = 'invoice_contract';
UPDATE support.category_config SET label = 'RM relationship', description = 'Issue with assigned relationship manager', raised_by_type = 'mua' WHERE category = 'rm_relationship';
UPDATE support.category_config SET label = 'Sales promise', description = 'Sales team promised something not delivered', raised_by_type = 'mua' WHERE category = 'sales_promise';
UPDATE support.category_config SET label = 'Profile / plan query', description = 'Profile, visibility, or plan feature question', raised_by_type = 'mua' WHERE category = 'profile_query';

-- Bride / lead categories
UPDATE support.category_config SET label = 'Too many calls', description = 'Excessive or repeated calls from Olready or artists', raised_by_type = 'bride' WHERE category = 'too_many_calls';
UPDATE support.category_config SET label = 'Artist not responding', description = 'Assigned or suggested artist is not replying', raised_by_type = 'bride' WHERE category = 'artist_not_responding';
UPDATE support.category_config SET label = 'No contact from MUAs', description = 'No artist outreach after enquiry or match', raised_by_type = 'bride' WHERE category = 'no_contact_from_muas';
UPDATE support.category_config SET label = 'RMs unresponsive', description = 'Relationship manager or coordinator not responding', raised_by_type = 'bride' WHERE category = 'rm_unresponsive';
UPDATE support.category_config SET label = 'Wrong details shared', description = 'Incorrect information about artist, booking, or event', raised_by_type = 'bride' WHERE category = 'wrong_details_shared';

-- Other / universal
UPDATE support.category_config SET label = 'Business collaboration', description = 'Partnership, vendor, or business enquiry', raised_by_type = 'other' WHERE category = 'business_collaboration';
UPDATE support.category_config SET label = 'Other', description = 'Does not fit the categories above', raised_by_type = NULL WHERE category = 'other';

-- Fallback label from slug
UPDATE support.category_config
SET label = INITCAP(REPLACE(category, '_', ' '))
WHERE label IS NULL OR TRIM(label) = '';
