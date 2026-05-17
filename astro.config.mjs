import { defineConfig } from "astro/config";

// Replace `site` with your custom subdomain once Cloudflare Access is wired up.
// While testing on the default GitHub Pages URL, set `base` to "/dashboard"
// and `site` to "https://<your-user>.github.io".
export default defineConfig({
  site: "https://dashboard.example.com",
  base: "/",
  trailingSlash: "ignore",
  build: {
    format: "directory",
  },
});
