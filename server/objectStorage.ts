import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "portfolio-assets";
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

let client: SupabaseClient | null = null;
let bucketReady: Promise<void> | null = null;

function getClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase Storage is not configured.");
  if (!client) client = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return client;
}

async function ensureBucket() {
  if (!bucketReady) {
    bucketReady = (async () => {
      const supabase = getClient();
      const { data, error } = await supabase.storage.getBucket(BUCKET);
      if (data) return;
      if (error && !/not found|does not exist/i.test(error.message)) throw error;
      const { error: createError } = await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: String(MAX_FILE_BYTES), allowedMimeTypes: IMAGE_TYPES });
      if (createError && !/already exists/i.test(createError.message)) throw createError;
    })();
  }
  return bucketReady;
}

export async function putProjectImage(key: string, data: Buffer, contentType: string) {
  if (!IMAGE_TYPES.includes(contentType)) throw new Error("Unsupported project image type.");
  if (data.length > MAX_FILE_BYTES) throw new Error("Project images must be 2 MB or smaller.");
  await ensureBucket();
  const supabase = getClient();
  const { error } = await supabase.storage.from(BUCKET).upload(key, data, { contentType, upsert: false, cacheControl: "31536000" });
  if (error) throw error;
  const { data: publicUrl } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return { key, url: publicUrl.publicUrl };
}
