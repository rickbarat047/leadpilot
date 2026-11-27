// Dialect-neutral business profile update. SQLite has no GREATEST(), so the
// onboarding step uses a CASE expression supported by both SQLite and Postgres.
export type BusinessUpdateInput = {
  name: string | null;
  industry: string | null;
  description: string | null;
  location: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  hoursJson: string;
  settingsJson: string;
  businessId: string;
};

export function businessUpdateSql(input: BusinessUpdateInput): { sql: string; params: unknown[] } {
  return {
    sql: `UPDATE businesses SET name=COALESCE(?, name), industry=COALESCE(?, industry), description=COALESCE(?, description),
      location=COALESCE(?, location), phone=COALESCE(?, phone), email=COALESCE(?, email), website=COALESCE(?, website),
      hours_json=?, settings_json=?,
      onboarding_step=CASE WHEN onboarding_step < 8 THEN 8 ELSE onboarding_step END WHERE id=?`,
    params: [
      input.name, input.industry, input.description, input.location,
      input.phone, input.email, input.website, input.hoursJson,
      input.settingsJson, input.businessId,
    ],
  };
}
