import { config } from "../config";
import { FileStore } from "./file";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";
export * from "./types";

let store: Store | null = null;
export function db(): Store {
  if (store) return store;
  if (config.supabaseUrl && config.supabaseServiceKey) store = new SupabaseStore(config.supabaseUrl, config.supabaseServiceKey);
  else if (config.allowFileStore) store = new FileStore(config.fileStorePath);
  else throw new Error("NOT_CONFIGURED: database (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)");
  return store;
}
