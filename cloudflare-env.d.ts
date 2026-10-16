declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    TEACHER_EMAILS?: string;
    ALLOW_GUEST_STUDENTS?: string;
  }
}
