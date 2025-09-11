"use client";

import { toast } from "sonner";
import confetti from "canvas-confetti";
import { animate as framerAnimate } from "framer-motion";
import { useTranslations } from "@/components/translations-context";
import { flow } from "@/lib/flow-tracker";
import FirecrawlApp, { ScrapeResponse } from "@mendable/firecrawl-js";

export const useToolsFunctions = () => {
  const { t } = useTranslations();

  const timeFunction = () => {
    flow.step("tools", 1, "timeFunction");
    const now = new Date();
    return {
      success: true,
      time: now.toLocaleTimeString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      message:
        t("tools.time") +
        now.toLocaleTimeString() +
        " in " +
        Intl.DateTimeFormat().resolvedOptions().timeZone +
        " timezone.",
    };
  };

  const backgroundFunction = () => {
    flow.step("tools", 2, "backgroundFunction");
    try {
      const html = document.documentElement;
      const currentTheme = html.classList.contains("dark") ? "dark" : "light";
      const newTheme = currentTheme === "dark" ? "light" : "dark";

      html.classList.remove(currentTheme);
      html.classList.add(newTheme);

      toast(`Switched to ${newTheme} mode! 🌓`, {
        description: t("tools.switchTheme") + newTheme + ".",
      });

      const result = {
        success: true,
        theme: newTheme,
        message: t("tools.switchTheme") + newTheme + ".",
      };
      flow.event("tools", "background.success", { theme: newTheme });
      return result;
    } catch (error) {
  const detail = typeof error === 'object' && error !== null ? { message: (error as Error).message } : { message: String(error) };
  flow.event("tools", "background.error", detail);
      return {
        success: false,
        message: t("tools.themeFailed") + ": " + error,
      };
    }
  };

  const partyFunction = () => {
    flow.step("tools", 3, "partyFunction");
    try {
      const duration = 5 * 1000;
      const colors = [
        "#a786ff",
        "#fd8bbc",
        "#eca184",
        "#f8deb1",
        "#3b82f6",
        "#14b8a6",
        "#f97316",
        "#10b981",
        "#facc15",
      ];

      const confettiConfig = {
        particleCount: 30,
        spread: 100,
        startVelocity: 90,
        colors,
        gravity: 0.5,
      };

      const shootConfetti = (
        angle: number,
        origin: { x: number; y: number }
      ) => {
        confetti({
          ...confettiConfig,
          angle,
          origin,
        });
      };

      const animate = () => {
        const now = Date.now();
        const end = now + duration;

        const elements = document.querySelectorAll(
          "div, p, button, h1, h2, h3"
        );
        elements.forEach((element) => {
          framerAnimate(
            element,
            {
              scale: [1, 1.1, 1],
              rotate: [0, 5, -5, 0],
            },
            {
              duration: 0.5,
              repeat: 10,
              ease: "easeInOut",
            }
          );
        });

        const frame = () => {
          if (Date.now() > end) return;
          shootConfetti(60, { x: 0, y: 0.5 });
          shootConfetti(120, { x: 1, y: 0.5 });
          requestAnimationFrame(frame);
        };

        const mainElement = document.querySelector("main");
        if (mainElement) {
          mainElement.classList.remove(
            "bg-gradient-to-b",
            "from-gray-50",
            "to-white"
          );
          const originalBg = mainElement.style.backgroundColor;

          const changeColor = () => {
            const now = Date.now();
            const end = now + duration;

            const colorCycle = () => {
              if (Date.now() > end) {
                framerAnimate(
                  mainElement,
                  { backgroundColor: originalBg },
                  { duration: 0.5 }
                );
                return;
              }
              const newColor =
                colors[Math.floor(Math.random() * colors.length)];
              framerAnimate(
                mainElement,
                { backgroundColor: newColor },
                { duration: 0.2 }
              );
              setTimeout(colorCycle, 200);
            };

            colorCycle();
          };

          changeColor();
        }

        frame();
      };

      animate();
      toast.success(t("tools.partyMode.toast") + " 🎉", {
        description: t("tools.partyMode.description"),
      });
      flow.event("tools", "party.success");
      return { success: true, message: t("tools.partyMode.success") + " 🎉" };
    } catch (error) {
  const detail = typeof error === 'object' && error !== null ? { message: (error as Error).message } : { message: String(error) };
  flow.event("tools", "party.error", detail);
      return {
        success: false,
        message: t("tools.partyMode.failed") + ": " + error,
      };
    }
  };

  const launchWebsite = ({ url }: { url: string }) => {
    flow.step("tools", 4, "launchWebsite", { url });
    window.open(url, "_blank");
    toast(t("tools.launchWebsite") + " 🌐", {
      description:
        t("tools.launchWebsiteSuccess") +
        url +
        ", tell the user it's been launched.",
    });
    return {
      success: true,
      message: `Launched the site${url}, tell the user it's been launched.`,
    };
  };

  const copyToClipboard = ({ text }: { text: string }) => {
    flow.step("tools", 5, "copyToClipboard", { length: text.length });
    navigator.clipboard.writeText(text);
    toast(t("tools.clipboard.toast") + " 📋", {
      description: t("tools.clipboard.description"),
    });
    return {
      success: true,
      text,
      message: t("tools.clipboard.success"),
    };
  };

  const scrapeWebsite = async ({ url }: { url: string }) => {
    flow.step("tools", 6, "scrapeWebsite", { url });
    const apiKey = process.env.NEXT_PUBLIC_FIRECRAWL_API_KEY;
    try {
      const app = new FirecrawlApp({ apiKey: apiKey });
      const scrapeResult = (await app.scrapeUrl(url, {
        formats: ["markdown", "html"],
      })) as ScrapeResponse;

      if (!scrapeResult.success) {
        console.log(scrapeResult.error);
        return {
          success: false,
          message: `Failed to scrape: ${scrapeResult.error}`,
        };
      }

      toast.success(t("tools.scrapeWebsite.toast") + " 📋", {
        description: t("tools.scrapeWebsite.success"),
      });

      const result = {
        success: true,
        message:
          "Here is the scraped website content: " +
          JSON.stringify(scrapeResult.markdown) +
          "Summarize and explain it to the user now in a response.",
      };
      flow.event("tools", "scrape.success");
      return result;
    } catch (error) {
  const detail = typeof error === 'object' && error !== null ? { message: (error as Error).message } : { message: String(error) };
  flow.event("tools", "scrape.error", detail);
      return {
        success: false,
        message: `Error scraping website: ${error}`,
      };
    }
  };

  return {
    timeFunction,
    backgroundFunction,
    partyFunction,
    launchWebsite,
    copyToClipboard,
    scrapeWebsite,
  };
};
