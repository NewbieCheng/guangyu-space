/**
 * Next.js Instrumentation — 服务端启动时执行一次
 *
 * 用于注册 Web 运行时遥测；独立 API／Worker 模式才加载模板模块与工具注册表。
 * build 期间不执行，因此可以安全 import 依赖 DB/Redis 的模块。
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initTelemetry, registerWebTelemetryShutdown } =
      await import("./server/telemetry");
    await initTelemetry("web");
    registerWebTelemetryShutdown();
    if (process.env.SERVICE_MODE !== "web") {
      const { initRuntime } = await import("./server/init");
      await initRuntime();
    }
  }
}
