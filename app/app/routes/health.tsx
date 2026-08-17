import db from "../db.server";

/**
 * Deliberately outside /app: Railway/Render/Fly hit this directly to decide
 * whether a deploy is healthy, with no Shopify session and no embedding —
 * calling authenticate.admin() here would make every health check fail.
 * Pings the database rather than just returning 200 unconditionally, so a
 * bad DATABASE_URL or an unreachable Postgres fails the health check instead
 * of a deploy silently going live unable to serve any real request.
 */
export const loader = async () => {
  try {
    await db.$queryRaw`SELECT 1`;
    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("Health check failed:", error);
    return new Response("unhealthy", { status: 503 });
  }
};
