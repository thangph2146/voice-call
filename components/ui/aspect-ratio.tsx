"use client"

// FLOW SCOPE: ui.aspectRatio
// EVENTS: AspectRatio.render

import * as AspectRatioPrimitive from "@radix-ui/react-aspect-ratio"
import { flow } from "@/lib/flow-tracker"

const AspectRatio = (props: React.ComponentProps<typeof AspectRatioPrimitive.Root>) => {
	if (flow.isEnabled()) flow.event("ui.aspectRatio", "AspectRatio.render");
	return <AspectRatioPrimitive.Root {...props} />;
}

export { AspectRatio }
