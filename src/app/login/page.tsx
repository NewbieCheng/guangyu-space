import { AuthPanel } from "@/modules/guangyu-space/components/auth-panel";
import { getTranslations } from "next-intl/server";

export const metadata = { title: "登录" };

export default async function LoginPage() {
  const t = await getTranslations("product.guangyuSpace");
  return (
    <AuthPanel
      mode="login"
      brandCopy={{
        slogan: t("slogan"),
        introduction: t("authIntroduction"),
        createSpaceTitle: t("createSpaceTitle"),
      }}
    />
  );
}
