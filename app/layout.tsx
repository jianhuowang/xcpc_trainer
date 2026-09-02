import type { Metadata } from "next";
import { trainerPageAccess } from "@/app/chatgpt-auth";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "XCPC Trainer",
  description:
    "A competition-first XCPC training system for upsolving, blind re-solving, and durable mastery.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const access = await trainerPageAccess();
  if (access.kind !== "allowed") {
    const misconfigured = access.kind === "misconfigured";
    return (
      <html lang="zh-CN">
        <body className="antialiased">
          <main className="mx-auto max-w-xl p-8">
            <h1 className="text-xl font-semibold">
              {misconfigured ? "XCPC Trainer 尚未完成配置" : "无权访问 XCPC Trainer"}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {misconfigured
                ? "请先在 Site 设置 TRAINER_OWNER_EMAIL。"
                : "当前 ChatGPT 账号不是此 Trainer 的所有者。"}
            </p>
          </main>
        </body>
      </html>
    );
  }

  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
