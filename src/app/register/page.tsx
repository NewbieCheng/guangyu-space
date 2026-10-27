import { AuthPanel } from "@/modules/guangyu-space/components/auth-panel";
import { getTranslations } from "next-intl/server";

export const metadata = { title: "创建账号" };

export default async function RegisterPage() {
  const t = await getTranslations("product.guangyuSpace");
  return (
    <AuthPanel
      mode="register"
      brandCopy={{
        slogan: t("slogan"),
        introduction: t("authIntroduction"),
        createSpaceTitle: t("createSpaceTitle"),
      }}
    />
  );
}
