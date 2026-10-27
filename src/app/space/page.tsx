import { redirect } from "next/navigation";
import { Workspace } from "@/modules/guangyu-space/components/workspace";
import { auth } from "@/server/auth";

export const metadata = { title: "我的经营簿" };

export default async function SpacePage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  return <Workspace username={session.user.username ?? "个人账号"} />;
}
