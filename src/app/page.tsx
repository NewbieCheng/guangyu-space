import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { BrandSlogan } from "@/modules/guangyu-space/components/brand-slogan";

export default async function HomePage() {
  const t = await getTranslations("product.guangyuSpace");

  return (
    <main className="gy-landing">
      <header className="gy-landing-header">
        <Link href="/" aria-label="光域空间首页"><Image src="/brand/guangyu-space-logo.png" alt="光域空间星环标志" width={2172} height={724} priority unoptimized /></Link>
        <nav><Link href="/login">登录</Link><Link className="gy-button gy-button-primary" href="/register">开始使用</Link></nav>
      </header>
      <section className="gy-hero">
        <p className="gy-eyebrow">{t("homeCategory")}</p>
        <h1><BrandSlogan text={t("slogan")} /></h1>
        <p className="gy-hero-copy">{t("homeIntroduction")}</p>
        <div className="gy-hero-actions"><Link className="gy-button gy-button-primary" href="/register">{t("createSpaceCta")}</Link><Link className="gy-text-link" href="/login">已有账号，直接登录</Link></div>
      </section>
      <section className="gy-feature-strip" aria-label="工作空间功能">
        <article><span>01</span><strong>经营关系</strong><p>客户、合作方与项目彼此关联</p></article>
        <article><span>02</span><strong>日常推进</strong><p>任务、沟通、项目日志有迹可循</p></article>
        <article><span>03</span><strong>收入视图</strong><p>订单与每笔实际收款分开记录</p></article>
        <article><span>04</span><strong>个人沉淀</strong><p>资料、经验、产品和复盘归自己</p></article>
      </section>
      <footer>光域空间 · {t("slogan")}</footer>
    </main>
  );
}
