// お店カード画像（ショーケース）の上限枚数。認証（is_verified）で+4・リンクバナー設置（banner_installed）で+4。
//   未認証×未設置: 0枚 / 未認証×設置: 4枚 / 認証×未設置: 4枚 / 認証×設置: 8枚（4列×2段）
// ⚠️ DB側ガード（x_showcase_verified_guard・migrations/20260711_x_profiles_banner_installed.sql）と同じ式。
//    変更する場合は必ず両方を揃えること。
export function shopShowcaseLimit(p: { is_verified: boolean; banner_installed: boolean }): number {
  return (p.is_verified ? 4 : 0) + (p.banner_installed ? 4 : 0);
}
