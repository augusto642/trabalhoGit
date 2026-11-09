import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Headers de segurança (S7, 30/10/2026). Sem Content-Security-Policy
  // de propósito: o app usa scripts/estilos inline do Next e uma CSP
  // restritiva quebraria a hidratação — CSP é um passo futuro com
  // nonces, não um header jogado por cima. Os demais headers não mudam
  // comportamento do app: nosniff, frame só na mesma origem, referrer
  // mínimo e permissões de sensores negadas.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
