declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    EVAL_API_KEY?: string;
    EVAL_API_URL?: string;
    EVAL_MODEL?: string;
    BUCKET?: R2Bucket;
  }
}
