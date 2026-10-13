/** @type {import('next').NextConfig} */
const nextConfig = {
  // Todo el sistema corre en el navegador: se exporta como sitio estático (carpeta out/)
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
