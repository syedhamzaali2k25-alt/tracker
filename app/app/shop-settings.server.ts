import db from "./db.server";

export interface ShopSettings {
  emailAlerts: boolean;
  alertEmail: string | null;
}

const DEFAULTS: ShopSettings = { emailAlerts: true, alertEmail: null };

export async function getShopSettings(shop: string): Promise<ShopSettings> {
  const row = await db.shopSettings.findUnique({ where: { shop } });
  if (!row) return DEFAULTS;
  return { emailAlerts: row.emailAlerts, alertEmail: row.alertEmail };
}

export async function saveShopSettings(shop: string, settings: ShopSettings): Promise<void> {
  await db.shopSettings.upsert({
    where: { shop },
    create: { shop, ...settings },
    update: settings,
  });
}

/** Used by the shop/redact GDPR webhook and app/uninstalled to purge a shop's data. */
export async function deleteShopSettings(shop: string): Promise<void> {
  await db.shopSettings.deleteMany({ where: { shop } });
}
