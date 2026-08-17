/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BALKIZ_LOGO_URL?: string;
  readonly VITE_PARTNER_LOGO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
