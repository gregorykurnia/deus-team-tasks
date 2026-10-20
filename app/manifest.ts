import type { MetadataRoute } from "next";

// The installed app (guide 6.9): its name, the bar colour, and the logo as supplied on its own navy square. The
// launch screen on Android is built from the background colour, the icon and the name. The maskable icon keeps the
// logo inside the circle that some devices crop to.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "DEUS Team Space",
    short_name: "DEUS Space",
    description: "Tasks, plan, companies, qualification notes, past clients and flows for the DEUS team.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f0f4fa",
    theme_color: "#eef3fb",
    icons: [
      { src: "/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
