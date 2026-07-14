-- Display name only; enum value stays highest_privy
UPDATE plan_tiers SET name = 'Privy', updated_at = NOW()
WHERE tier = 'highest_privy' AND name ILIKE '%highest%privy%';
