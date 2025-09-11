"use client"

import { useTranslations } from "@/components/translations-context"
import { flow } from "@/lib/flow-tracker"

// FLOW SCOPE: ui.banner
// ORDER (coarse): 1:mount/useTranslations, 2:render
export const Banner = () => {
  const { t } = useTranslations();
  flow.event("ui.banner", "render");

  return (
    <div className="w-full bg-gradient-to-r from-gray-900 to-gray-700 py-2">
      <div className="container mx-auto px-4 text-center text-white text-sm">
        {t('header.banner')}
        <a 
          href="https://openai-realtime-blocks.vercel.app" 
          className="underline ml-2 hover:text-gray-200"
        >
          {t('header.bannerLink')}
        </a>
      </div>
    </div>
  );
};

export default Banner;
