import { beforeEach, describe, expect, it } from "vitest";
import { applyThemeMode, readThemeMode, resolveTheme, writeThemeMode } from "@/lib/theme";

function stubSystemDark(dark: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: dark,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
    stubSystemDark(false);
  });

  it("defaults to system when nothing is stored", () => {
    expect(readThemeMode()).toBe("system");
  });

  it("applies dark and persists the choice", () => {
    writeThemeMode("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(localStorage.getItem("dnsit-theme")).toBe("dark");
    expect(readThemeMode()).toBe("dark");
  });

  it("applies light and switches back", () => {
    writeThemeMode("dark");
    writeThemeMode("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("follows the system preference in system mode", () => {
    stubSystemDark(true);
    expect(resolveTheme("system")).toBe("dark");
    applyThemeMode("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    stubSystemDark(false);
    applyThemeMode("system");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("ignores explicit modes when resolving", () => {
    stubSystemDark(true);
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });
});
