import { networkInterfaces } from "node:os";
import { ok, route } from "@/lib/http";
import { requireTeacher } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/join-url (signed-in teacher) → { base }: the address phones should open.
 * The teacher's page runs on http://127.0.0.1 (Chrome only allows the mic there),
 * which phones can't reach, so the QR code uses PUBLIC_BASE_URL or this laptop's Wi-Fi address.
 */
export const GET = route(async (req: Request) => {
  await requireTeacher();
  if (process.env.PUBLIC_BASE_URL) return ok({ base: process.env.PUBLIC_BASE_URL.replace(/\/+$/, "") });
  const url = new URL(req.url);
  const host = req.headers.get("host") ?? url.host;
  const [hostname, port] = host.split(":");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) return ok({ base: `${url.protocol}//${host}` });
  // Prefer the real Wi-Fi/Ethernet adapter over virtual ones (WSL, Docker, VPNs), then home/hotspot ranges.
  const virtual = /vethernet|wsl|docker|br-|veth|virtualbox|vmware|vbox|hyper-v|tailscale|zerotier|utun|tun|tap/i;
  const rank = (name: string, ip: string) =>
    (virtual.test(name) ? 10 : 0) + (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : ip.startsWith("172.") ? 2 : 3);
  const lan = Object.entries(networkInterfaces())
    .flatMap(([name, addrs]) => (addrs ?? []).filter((a) => a.family === "IPv4" && !a.internal).map((a) => ({ name, ip: a.address })))
    .sort((x, y) => rank(x.name, x.ip) - rank(y.name, y.ip))
    .map((a) => a.ip);
  return ok({ base: lan[0] ? `http://${lan[0]}${port ? `:${port}` : ""}` : `${url.protocol}//${host}` });
});
