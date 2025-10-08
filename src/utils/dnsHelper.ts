import dns from "node:dns";
import { promisify } from "util";

const dnsLookup = promisify(dns.lookup);

/**
 * Force IPv4 DNS resolution for a hostname
 * @param hostname The hostname to resolve
 * @returns The IPv4 address
 */
export async function resolveHostnameToIPv4(hostname: string): Promise<string> {
  try {
    console.log(`🔍 Resolving ${hostname} to IPv4...`);

    // Try to resolve using IPv4 only
    const result = await dnsLookup(hostname, 4);
    const address = typeof result === "string" ? result : result.address;
    console.log(`✅ Resolved ${hostname} to ${address}`);

    return address;
  } catch (error) {
    console.error(`❌ Failed to resolve ${hostname} to IPv4:`, error);

    // If it's a Supabase host, try common patterns
    if (hostname.includes("supabase.co")) {
      console.log("🔧 Attempting manual Supabase resolution...");

      // Try to get all addresses and filter for IPv4
      try {
        const addresses = await promisify(dns.resolve4)(hostname);
        if (addresses.length > 0) {
          console.log(`✅ Found IPv4 addresses: ${addresses.join(", ")}`);
          return addresses[0];
        }
      } catch (resolveError) {
        console.error("❌ Manual resolution failed:", resolveError);
      }
    }

    throw error;
  }
}

/**
 * Parse a DATABASE_URL and replace hostname with IPv4 if needed
 * @param databaseUrl The original database URL
 * @returns The database URL with IPv4 address
 */
export async function ensureIPv4DatabaseUrl(
  databaseUrl: string
): Promise<string> {
  try {
    const url = new URL(databaseUrl);

    // Check if the hostname is already an IPv4 address
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(url.hostname)) {
      console.log("✅ DATABASE_URL already uses IPv4");
      return databaseUrl;
    }

    // Resolve hostname to IPv4
    const ipv4Address = await resolveHostnameToIPv4(url.hostname);

    // Replace hostname with IPv4 address
    url.hostname = ipv4Address;
    const newUrl = url.toString();

    console.log(`🔄 Converted DATABASE_URL to use IPv4: ${url.hostname}`);
    return newUrl;
  } catch (error) {
    console.error("❌ Failed to ensure IPv4 DATABASE_URL:", error);
    return databaseUrl; // Return original URL as fallback
  }
}
