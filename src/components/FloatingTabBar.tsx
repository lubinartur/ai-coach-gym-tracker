"use client";

import { BarChart3, Dumbbell, Home, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", key: "home", label: "Home", Icon: Home, match: (p: string) => p === "/" },
  {
    href: "/exercises",
    key: "workout",
    label: "Workout",
    Icon: Dumbbell,
    match: (p: string) => p === "/exercises" || p.startsWith("/exercises/"),
  },
  {
    href: "/history",
    key: "progress",
    label: "Progress",
    Icon: BarChart3,
    match: (p: string) => p === "/history" || p.startsWith("/workout/"),
  },
  {
    href: "/settings",
    key: "settings",
    label: "Settings",
    Icon: Settings,
    match: (p: string) => p === "/settings" || p.startsWith("/settings/"),
  },
] as const;

export function FloatingTabBar() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Primary"
      className="fixed right-5 bottom-6 left-5 z-50 flex max-w-full flex-col overflow-hidden rounded-full border border-neutral-800 bg-neutral-900/90 shadow-xl backdrop-blur-md [padding-bottom:env(safe-area-inset-bottom,0px)]"
    >
      <div className="flex h-16 w-full min-h-[64px] items-center justify-between px-6">
        {tabs.map(({ href, key, label, Icon, match }) => {
          const active = match(pathname);
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
