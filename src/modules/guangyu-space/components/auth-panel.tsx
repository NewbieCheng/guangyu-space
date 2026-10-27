"use client";

import { signIn } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { BrandSlogan } from "./brand-slogan";

type AuthBrandCopy = {
  slogan: string;
  introduction: string;
  createSpaceTitle: string;
};

export function AuthPanel({
  mode,
  brandCopy,
}: {
  mode: "login" | "register";
  brandCopy: AuthBrandCopy;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const registering = mode === "register";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    let keepBusyUntilNavigation = false;
    try {
      if (registering) {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(body.error ?? "注册暂时没有完成，请稍后再试。");
          return;
        }
      }

      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });
      if (result?.code === "rate-limit-unavailable") {
        setError(
          "登录服务暂时不可用，请稍后重试；若持续出现，请联系服务运营者。",
        );
        return;
      }
      if (result?.error) {
        setError("用户名或密码错误，或登录暂时不可用。请稍后再试。");
        return;
      }
      router.replace("/space");
      router.refresh();
      keepBusyUntilNavigation = true;
    } catch {
      setError("连接没有完成，请检查服务状态后重试。");
    } finally {
      if (!keepBusyUntilNavigation) setBusy(false);
    }
  }

  return (
    <main className="gy-auth-shell">
      <aside className="gy-auth-aside">
        <Link
          className="gy-auth-inverse-logo"
          href="/"
          aria-label="返回光域空间首页"
        >
          <Image
            src="/brand/guangyu-space-logo-inverse.png"
            alt="光域空间星环标志"
            width={1983}
            height={793}
            priority
            unoptimized
          />
        </Link>
        <blockquote><BrandSlogan text={brandCopy.slogan} /></blockquote>
        <small>{brandCopy.introduction}</small>
      </aside>
      <section className="gy-auth-main">
        <div className="gy-auth-card">
          <h1>{registering ? brandCopy.createSpaceTitle : "欢迎回来"}</h1>
          <p>
            {registering
              ? "注册后会为你创建一个空白的个人经营空间。"
              : "使用你的用户名和密码登录光域空间。"}
          </p>
          <form className="gy-form" onSubmit={submit}>
            <div className="gy-field">
              <label htmlFor="username">用户名</label>
              <input
                id="username"
                autoComplete="username"
                required
                minLength={3}
                maxLength={32}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="gy-field">
              <label htmlFor="password">密码</label>
              <input
                id="password"
                type="password"
                autoComplete={registering ? "new-password" : "current-password"}
                required
                minLength={registering ? 12 : 1}
                maxLength={256}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {registering ? <small>至少 12 个字符；区分大小写。</small> : null}
            </div>
            {error ? (
              <div role="alert" className="gy-form-error">
                {error}
              </div>
            ) : null}
            <button
              className="gy-button gy-button-primary"
              type="submit"
              disabled={busy}
            >
              {busy ? "正在处理…" : registering ? "创建账号并进入" : "登录"}
            </button>
          </form>
          <div className="gy-auth-footer">
            {registering ? (
              <>
                已有账号？ <Link href="/login">登录</Link>
              </>
            ) : (
              <>
                还没有账号？ <Link href="/register">创建个人经营簿</Link>
              </>
            )}
          </div>
          {!registering ? (
            <p className="gy-auth-footer">
              需要人工找回密码？请联系部署此服务的运营者。
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
