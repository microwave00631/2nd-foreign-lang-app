/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** 簡易パスコードゲートの合言葉の SHA-256(SALT付き)。未設定ならゲート無効。 */
  readonly VITE_GATE_HASH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
