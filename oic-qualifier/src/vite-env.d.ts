/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BOOKING_URL?: string;
  readonly VITE_STAN_COURSE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
