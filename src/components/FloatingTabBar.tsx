"use client";

import { BarChart3, Dumbbell, Home, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/i18n/LocaleContext";

const tabs = [
  { href: "/", key: "home", labelKey: "tab_home", Icon: Home, match: (p: string) => p === "/" },
  {
    href: "/exercises",
    key: "workout",
    labelKey: "tab_workout",
    Icon: Dumbbell,
    match: (p: string) => p === "/exercises" || p.startsWith("/exercises/"),
  },
  {
    href: "/history",
    key: "progress",
    labelKey: "tab_progress",
    Icon: BarChart3,
    match: (p: string) => p === "/history" || p.startsWith("/workout/"),
  },
  {
    href: "/settings",
    key: "settings",
    labelKey: "tab_settings",
    Icon: Settings,
    match: (p: string) => p === "/settings" || p.startsWith("/settings/"),
  },
] as const;

export function FloatingTabBar() {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label={t("primary_nav")}
      className="fixed bottom-0 left-1/2 z-50 w-[calc(100%-32px)] max-w-[430px] -translate-x-1/2 pb-[calc(env(safe-area-inset-bottom,0px)+8px)]"
    >
      <div className="flex h-20 w-full items-center justify-around overflow-hidden rounded-[32px] border border-neutral-800 bg-neutral-900/90 px-6 shadow-xl backdrop-blur-md">
        {tabs.map(({ href, key, labelKey, Icon, match }) => {
          const active = match(pathname);
          const label = t(labelKey);
          return (
            <Link
              key={key}
              href={href}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center"
              aria-label={label}
              aria-current={active ? "page" : undefined}
            >
              <Icon
                className={
                  active
                    ? "h-6 w-6 shrink-0 text-purple-500"
                    : "h-6 w-6 shrink-0 text-neutral-400"
                }
                strokeWidth={2}
                aria-hidden
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
